import { createHash } from "node:crypto";
import type Anthropic from "@anthropic-ai/sdk";
import type { Agent, Card, PedidoMcp } from "@empresa/shared";
import { agentById } from "@empresa/org";
import { db } from "../db.ts";
import { emit, postChat, postFeed } from "../bus.ts";
import { comentar, ErroCard } from "../tarefas.ts";
import { ErroEntrada, type Ferramenta, type ResultadoFerramenta } from "../agentes/loop.ts";
import { chamarFerramenta, ferramentasParaSala } from "./conectores.ts";

// Ferramentas dos conectores para os agentes, com aprovação:
// - política "auto" (o que só lê, por padrão): roda na hora e o resultado volta para o agente;
// - política "aprovar" (o que age: enviar, criar, alterar, cobrar…): vira um pedido em Aprovações;
//   aprovado, o servidor executa e o resultado entra no card (e no chat).
// Toda chamada fica registrada.

db.exec(`
  CREATE TABLE IF NOT EXISTS mcp_pedidos (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    servidor_id  INTEGER NOT NULL,
    servidor     TEXT NOT NULL,
    ferramenta   TEXT NOT NULL,
    args         TEXT NOT NULL,
    card_id      INTEGER,
    agente_id    TEXT NOT NULL,
    motivo       TEXT NOT NULL,
    status       TEXT NOT NULL,
    resultado    TEXT,
    criado_em    INTEGER NOT NULL,
    decidido_em  INTEGER
  );
`);

type Linha = {
  id: number; servidor_id: number; servidor: string; ferramenta: string; args: string; card_id: number | null; agente_id: string; motivo: string;
  status: PedidoMcp["status"]; resultado: string | null; criado_em: number; decidido_em: number | null;
};
const deLinha = (r: Linha): PedidoMcp => ({
  id: r.id, servidorId: r.servidor_id, servidor: r.servidor, ferramenta: r.ferramenta, args: JSON.parse(r.args), cardId: r.card_id, agenteId: r.agente_id,
  motivo: r.motivo, status: r.status, resultado: r.resultado, criadoEm: r.criado_em, decididoEm: r.decidido_em,
});

/** Pedidos pendentes primeiro, depois os 50 mais recentes decididos. */
export function listarPedidos(): PedidoMcp[] {
  const pend = db.prepare("SELECT * FROM mcp_pedidos WHERE status = 'pendente' ORDER BY id").all() as Linha[];
  const resto = db.prepare("SELECT * FROM mcp_pedidos WHERE status != 'pendente' ORDER BY id DESC LIMIT 50").all() as Linha[];
  return [...pend, ...resto].map(deLinha);
}
const lerPedido = (id: number): PedidoMcp => {
  const r = db.prepare("SELECT * FROM mcp_pedidos WHERE id = ?").get(id) as Linha | undefined;
  if (!r) throw new ErroCard("Pedido não encontrado.", 404);
  return deLinha(r);
};
const avisar = (p: PedidoMcp) => emit({ type: "mcp.pedido", pedido: p });

function registrar(d: Omit<PedidoMcp, "id" | "decididoEm">): PedidoMcp {
  const r = db
    .prepare("INSERT INTO mcp_pedidos (servidor_id, servidor, ferramenta, args, card_id, agente_id, motivo, status, resultado, criado_em, decidido_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(d.servidorId, d.servidor, d.ferramenta, JSON.stringify(d.args), d.cardId, d.agenteId, d.motivo, d.status, d.resultado, d.criadoEm, d.status === "pendente" ? null : Date.now());
  const p = lerPedido(Number(r.lastInsertRowid));
  avisar(p);
  return p;
}

/** Resultado da ação aprovada vai para o card (ou para o chat, se veio de uma conversa). */
function entregarResultado(p: PedidoMcp, texto: string) {
  const a = agentById[p.agenteId];
  if (p.cardId) comentar(p.cardId, p.agenteId, "comentario", `Ação aprovada pelo CEO e executada (${p.servidor} · ${p.ferramenta}):\n\n${texto.slice(0, 4000)}`);
  else postChat(p.agenteId, `Fiz o que você aprovou (${p.servidor} · ${p.ferramenta}):\n${texto.slice(0, 2000)}`);
  if (a) postFeed(a.sala, a.id, `${a.nome} executou ${p.ferramenta} (${p.servidor}) com a sua aprovação`);
}

/** Pedidos sendo executados agora (dois cliques seguidos em "aprovar" não executam duas vezes). */
const executando = new Set<number>();

export async function aprovarPedido(id: number): Promise<PedidoMcp> {
  const p = lerPedido(id);
  if (p.status !== "pendente" || executando.has(id)) throw new ErroCard("Este pedido já foi decidido.");
  executando.add(id);
  try {
    return await executarAprovado(p);
  } finally {
    executando.delete(id);
  }
}

/**
 * Executores especiais (servidorId negativo): terminal do Mac, sessão de controle do Mac…
 * Reaproveitam o mesmo fluxo de pedido, aprovação, registro e resultado no card.
 */
type Executor = (args: Record<string, unknown>, p: PedidoMcp) => Promise<{ texto: string; erro?: boolean }>;
const executores = new Map<number, Executor>();
export const registrarExecutor = (servidorId: number, fn: Executor) => executores.set(servidorId, fn);

/** Cria um pedido de aprovação (usado pelos executores especiais). */
export function pedirAprovacao(d: { servidorId: number; servidor: string; ferramenta: string; args: Record<string, unknown>; cardId: number | null; agenteId: string; motivo: string }): PedidoMcp {
  const p = registrar({ ...d, status: "pendente", resultado: null, criadoEm: Date.now() });
  if (d.cardId) comentar(d.cardId, d.agenteId, "comentario", `Pedi aprovação para ${d.servidor} · ${d.ferramenta}${d.motivo ? `: ${d.motivo}` : ""}`);
  postChat(d.agenteId, `Preciso da sua aprovação: ${d.servidor} · ${d.ferramenta}${d.motivo ? ` — ${d.motivo}` : ""}. Está em Aprovações.`);
  return p;
}

/** Registra no histórico algo que rodou sem precisar de aprovação. */
export const registrarExecucao = (d: { servidorId: number; servidor: string; ferramenta: string; args: Record<string, unknown>; cardId: number | null; agenteId: string; resultado: string; erro: boolean }) =>
  registrar({ ...d, motivo: "(automático)", status: d.erro ? "erro" : "executado", resultado: d.resultado.slice(0, 20_000), criadoEm: Date.now() });

async function executarAprovado(p: PedidoMcp): Promise<PedidoMcp> {
  const id = p.id;
  const especial = executores.get(p.servidorId);
  let status: PedidoMcp["status"] = "executado";
  let resultado: string;
  try {
    const r = especial ? await especial(p.args, p) : await chamarFerramenta(p.servidorId, p.ferramenta, p.args);
    resultado = r.texto;
    if (r.erro) status = "erro";
  } catch (e) {
    status = "erro";
    resultado = e instanceof Error ? e.message : String(e);
  }
  db.prepare("UPDATE mcp_pedidos SET status = ?, resultado = ?, decidido_em = ? WHERE id = ?").run(status, resultado.slice(0, 20_000), Date.now(), id);
  const atual = lerPedido(id);
  avisar(atual);
  entregarResultado(atual, status === "erro" ? `Deu erro: ${resultado}` : resultado);
  return atual;
}

export function recusarPedido(id: number, motivo: string): PedidoMcp {
  const p = lerPedido(id);
  if (p.status !== "pendente" || executando.has(id)) throw new ErroCard("Este pedido já foi decidido.");
  const texto = motivo.trim() || "Recusado.";
  db.prepare("UPDATE mcp_pedidos SET status = 'recusado', resultado = ?, decidido_em = ? WHERE id = ?").run(texto, Date.now(), id);
  if (p.cardId) comentar(p.cardId, "voce", "comentario", `Recusei ${p.servidor} · ${p.ferramenta}: ${texto}`);
  const atual = lerPedido(id);
  avisar(atual);
  return atual;
}

/* ---------- Ferramentas dos agentes ---------- */

/** Nome válido para a API (letras, números, _ e -; até 64 caracteres), estável por servidor e ferramenta. */
function nomeDaFerramenta(servidor: string, ferramenta: string): string {
  const limpo = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  const nome = `mcp_${limpo(servidor).toLowerCase()}_${limpo(ferramenta)}`;
  if (nome.length <= 64) return nome;
  const h = createHash("sha1").update(nome).digest("hex").slice(0, 6);
  return `${nome.slice(0, 57)}_${h}`;
}

const MOTIVO = "motivo_para_o_ceo";

/** Ferramentas dos conectores liberados para a sala do agente. */
export function ferramentasDeConectores(agente: Agent, card: Card | null): Ferramenta[] {
  const vistos = new Set<string>();
  return ferramentasParaSala(agente.sala).flatMap(({ servidorId, servidor, ferramenta: t, politica }) => {
    const nome = nomeDaFerramenta(servidor, t.name);
    if (vistos.has(nome)) return [];
    vistos.add(nome);
    const esquema = (t.inputSchema ?? { type: "object" }) as { type?: string; properties?: Record<string, unknown>; required?: string[] };
    const propriedades = { ...(esquema.properties ?? {}) };
    if (politica === "aprovar") {
      propriedades[MOTIVO] = { type: "string", description: "Por que fazer isso agora (o CEO lê antes de aprovar)." };
    }
    const def: Anthropic.Beta.BetaTool = {
      name: nome,
      description: `[Conector ${servidor}${politica === "aprovar" ? " · pede aprovação do CEO antes de executar" : ""}] ${(t.description ?? t.name).slice(0, 900)}`,
      eager_input_streaming: true,
      input_schema: { ...(esquema as Record<string, unknown>), type: "object", properties: propriedades, required: [...(esquema.required ?? []), ...(politica === "aprovar" ? [MOTIVO] : [])] },
    };
    const executar = async (e: Record<string, unknown>): Promise<ResultadoFerramenta> => {
      // A entrada chega em streaming (sem validação do servidor da API): confere o básico antes de agir.
      if (!e || typeof e !== "object" || Array.isArray(e)) throw new ErroEntrada("Entrada inválida: envie um objeto.");
      const faltando = (esquema.required ?? []).filter((k) => e[k] === undefined);
      if (faltando.length) throw new ErroEntrada(`Faltam campos obrigatórios: ${faltando.join(", ")}.`);
      const { [MOTIVO]: motivoBruto, ...args } = e;
      const motivo = typeof motivoBruto === "string" ? motivoBruto.trim().slice(0, 1000) : "";
      if (politica === "aprovar") {
        const p = registrar({ servidorId, servidor, ferramenta: t.name, args, cardId: card?.id ?? null, agenteId: agente.id, motivo, status: "pendente", resultado: null, criadoEm: Date.now() });
        if (card) comentar(card.id, agente.id, "comentario", `Pedi aprovação para ${servidor} · ${t.name}${motivo ? `: ${motivo}` : ""}`);
        postChat(agente.id, `Preciso da sua aprovação: ${servidor} · ${t.name}${motivo ? ` — ${motivo}` : ""}. Está em Aprovações.`);
        return { texto: `Pedido #${p.id} enviado ao CEO (está em Aprovações). A ação NÃO foi executada ainda: quando ele aprovar, o servidor executa e o resultado aparece nos comentários do card. Siga com o resto do trabalho e diga na entrega o que depende dessa aprovação.` };
      }
      const r = await chamarFerramenta(servidorId, t.name, args).catch((err: Error) => ({ texto: `Erro no conector: ${err.message}`, erro: true, imagem: undefined }));
      registrar({ servidorId, servidor, ferramenta: t.name, args, cardId: card?.id ?? null, agenteId: agente.id, motivo: "(leitura automática)", status: r.erro ? "erro" : "executado", resultado: r.texto.slice(0, 20_000), criadoEm: Date.now() });
      return { texto: r.texto, erro: r.erro, imagem: r.imagem };
    };
    return [{ def, executar }];
  });
}
