import type { Conversa, MensagemConversa } from "@empresa/shared";
import { agentById } from "@empresa/org";
import { db } from "./db.ts";
import { emit } from "./bus.ts";
import { clienteClaude } from "./custo.ts";
import { modeloDoAgente, provedorDe } from "./provedores.ts";
import { fichaDoProjeto } from "./projetos.ts";
import { criarCard, ErroCard } from "./tarefas.ts";
import { ferramentaMemoria } from "./memoria.ts";
import { ferramenta, ferramentasDeProjeto, ferramentasWeb, rodarAgente, texto, type Ferramenta } from "./agentes/loop.ts";
import { ferramentaDePesquisa } from "./agentes/pesquisa.ts";
import { sistemaAutor } from "./agentes/prompts.ts";

// Conversa direta (como no app do Claude): você conversa com qualquer agente, no modelo que escolher (Claude, Gemini
// ou local), com histórico e as ferramentas de leitura do projeto, pesquisa e web. Mandar mensagem enquanto ele
// trabalha entra na próxima rodada, sem reiniciar. Trabalho grande vira card com criar_card.

db.exec(`CREATE TABLE IF NOT EXISTS conversas (
  id INTEGER PRIMARY KEY AUTOINCREMENT, agente TEXT NOT NULL, modelo TEXT, projeto_id INTEGER, titulo TEXT NOT NULL,
  criado_em INTEGER NOT NULL, atualizado_em INTEGER NOT NULL
)`);
db.exec(`CREATE TABLE IF NOT EXISTS conversa_msgs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, conversa_id INTEGER NOT NULL, papel TEXT NOT NULL, texto TEXT NOT NULL, ts INTEGER NOT NULL,
  modelo TEXT, custo_usd REAL
)`);
db.exec("CREATE INDEX IF NOT EXISTS conversa_msgs_conversa ON conversa_msgs (conversa_id)");

/** Mensagens anteriores que vão junto a cada pergunta (as mais recentes), e o tamanho máximo delas. */
const HISTORICO_MSGS = 16;
const HISTORICO_MAX = 24_000;

const rodando = new Map<number, { controle: AbortController; fila: string[] }>();

type LinhaConversa = { id: number; agente: string; modelo: string | null; projeto_id: number | null; titulo: string; criado_em: number; atualizado_em: number };
const deConversa = (r: LinhaConversa): Conversa => ({
  id: r.id, agente: r.agente, modelo: r.modelo, projetoId: r.projeto_id, titulo: r.titulo, criadoEm: r.criado_em, atualizadoEm: r.atualizado_em, rodando: rodando.has(r.id),
});
type LinhaMsg = { id: number; conversa_id: number; papel: "voce" | "agente"; texto: string; ts: number; modelo: string | null; custo_usd: number | null };
const deMsg = (r: LinhaMsg): MensagemConversa => ({ id: r.id, conversaId: r.conversa_id, papel: r.papel, texto: r.texto, ts: r.ts, modelo: r.modelo, custoUsd: r.custo_usd ?? 0 });

export const listarConversas = (): Conversa[] => (db.prepare("SELECT * FROM conversas ORDER BY atualizado_em DESC LIMIT 100").all() as LinhaConversa[]).map(deConversa);
export function lerConversa(id: number): Conversa {
  const r = db.prepare("SELECT * FROM conversas WHERE id = ?").get(id) as LinhaConversa | undefined;
  if (!r) throw new ErroCard("Conversa não encontrada.");
  return deConversa(r);
}
export const listarMensagens = (id: number): MensagemConversa[] =>
  (db.prepare("SELECT * FROM conversa_msgs WHERE conversa_id = ? ORDER BY id").all(id) as LinhaMsg[]).map(deMsg);

export function criarConversa(d: { agente?: string; modelo?: string | null; projetoId?: number | null; titulo?: string }): Conversa {
  const agente = d.agente && agentById[d.agente] ? d.agente : "chief-of-staff";
  const agora = Date.now();
  const r = db
    .prepare("INSERT INTO conversas (agente, modelo, projeto_id, titulo, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?)")
    .run(agente, d.modelo?.trim() || null, d.projetoId ?? null, (d.titulo?.trim() || `Conversa com ${agentById[agente]!.nome}`).slice(0, 120), agora, agora);
  return lerConversa(Number(r.lastInsertRowid));
}

export function editarConversa(id: number, d: { agente?: string; modelo?: string | null; titulo?: string; projetoId?: number | null }): Conversa {
  const c = lerConversa(id);
  const agente = d.agente && agentById[d.agente] ? d.agente : c.agente;
  // Trocou de agente numa conversa ainda com o título padrão: o título acompanha.
  const titulo = d.titulo?.trim() ? d.titulo.trim().slice(0, 120) : agente !== c.agente && c.titulo === `Conversa com ${agentById[c.agente]?.nome}` ? `Conversa com ${agentById[agente]!.nome}` : c.titulo;
  db.prepare("UPDATE conversas SET agente = ?, modelo = ?, titulo = ?, projeto_id = ?, atualizado_em = ? WHERE id = ?").run(
    agente,
    d.modelo !== undefined ? d.modelo?.trim() || null : c.modelo,
    titulo,
    d.projetoId !== undefined ? d.projetoId : c.projetoId,
    Date.now(),
    id,
  );
  return lerConversa(id);
}

export function apagarConversa(id: number) {
  rodando.get(id)?.controle.abort("conversa apagada");
  db.prepare("DELETE FROM conversa_msgs WHERE conversa_id = ?").run(id);
  db.prepare("DELETE FROM conversas WHERE id = ?").run(id);
}

function registrar(conversaId: number, papel: "voce" | "agente", texto_: string, extra: { modelo?: string | null; custoUsd?: number } = {}): MensagemConversa {
  const ts = Date.now();
  const r = db.prepare("INSERT INTO conversa_msgs (conversa_id, papel, texto, ts, modelo, custo_usd) VALUES (?, ?, ?, ?, ?, ?)").run(conversaId, papel, texto_, ts, extra.modelo ?? null, extra.custoUsd ?? 0);
  db.prepare("UPDATE conversas SET atualizado_em = ? WHERE id = ?").run(ts, conversaId);
  const m: MensagemConversa = { id: Number(r.lastInsertRowid), conversaId, papel, texto: texto_, ts, modelo: extra.modelo ?? null, custoUsd: extra.custoUsd ?? 0 };
  emit({ type: "conversa.mensagem", mensagem: m });
  return m;
}

/** A conversa até aqui, das mais recentes para trás, até caber no limite. */
export function historicoEmTexto(msgs: MensagemConversa[], nomeDoAgente: string): string {
  const linhas: string[] = [];
  let total = 0;
  for (const m of msgs.slice(-HISTORICO_MSGS).reverse()) {
    const l = `[${m.papel === "voce" ? "CEO" : nomeDoAgente}]: ${m.texto}`;
    if (total + l.length > HISTORICO_MAX) break;
    linhas.unshift(l);
    total += l.length;
  }
  return linhas.join("\n\n");
}

function ferramentasDaConversa(c: Conversa, sinal: AbortSignal, modelo: string): Ferramenta[] {
  const agente = agentById[c.agente]!;
  const projeto = fichaDoProjeto(c.projetoId);
  const local = provedorDe(modelo).provedor === "ollama";
  const out: Ferramenta[] = [ferramentaMemoria, ...ferramentasWeb];
  if (projeto) {
    out.push(...ferramentasDeProjeto(projeto.caminho, { enxuto: local }));
    const pesquisa = ferramentaDePesquisa(projeto.caminho, { agenteId: agente.id, sinal });
    if (pesquisa) out.push(pesquisa);
  }
  out.push(
    ferramenta(
      "criar_card",
      "Transforma um trabalho grande desta conversa num card (vai para o board e segue o fluxo normal, com validação). Use quando o CEO pedir para fazer algo que precisa mexer no projeto ou levar mais que alguns minutos.",
      {
        titulo: { type: "string" },
        descricao: { type: "string", description: "Contexto suficiente para o dono trabalhar sozinho (inclua o que foi decidido nesta conversa)" },
        criterios: { type: "string", description: "Critérios de aceite verificáveis" },
      },
      ["titulo", "descricao"],
      (e) => {
        const novo = criarCard(
          {
            titulo: texto(e, "titulo", 200), descricao: texto(e, "descricao", 20_000), criterios: typeof e.criterios === "string" ? e.criterios.slice(0, 5000) : "",
            sala: agente.sala, dono: agente.id, projetoId: c.projetoId, nivel: "N1", prioridade: "P2",
          },
          agente.id,
        );
        return { texto: `Card ${novo.chave} criado no board (${novo.titulo}).` };
      },
    ),
  );
  return out;
}

/**
 * Mensagem do CEO numa conversa. Se o agente já está respondendo, a mensagem entra na próxima rodada dele
 * (sem reiniciar); senão, ele começa a responder agora (em segundo plano: a resposta chega por evento).
 */
export function enviarMensagem(id: number, texto_: string): MensagemConversa {
  const c = lerConversa(id);
  const msg = registrar(id, "voce", texto_);
  const ativa = rodando.get(id);
  if (ativa) {
    ativa.fila.push(texto_);
    return msg;
  }
  void responder(c);
  return msg;
}

export function pararConversa(id: number) {
  rodando.get(id)?.controle.abort("parado pelo CEO");
}

async function responder(c: Conversa) {
  const agente = agentById[c.agente]!;
  const modelo = c.modelo || modeloDoAgente(agente, "autor");
  const controle = new AbortController();
  const estado = { controle, fila: [] as string[] };
  rodando.set(c.id, estado);
  emit({ type: "conversa.estado", conversaId: c.id, rodando: true });
  try {
    const msgs = listarMensagens(c.id);
    const ultima = msgs.at(-1)!;
    const antes = historicoEmTexto(msgs.slice(0, -1), agente.nome);
    const projeto = fichaDoProjeto(c.projetoId);
    const r = await rodarAgente({
      client: clienteClaude(),
      modelo,
      agenteId: agente.id,
      sinal: controle.signal,
      sistema: `${sistemaAutor(agente)}

## Conversa direta com o CEO
Aqui não é um card: é uma conversa, como num chat. Responda direto, em português do Brasil, com Markdown quando ajudar. Use as ferramentas para conferir fatos no projeto e na web antes de afirmar. Se o CEO pedir um trabalho que precisa mexer no projeto ou levar mais que alguns minutos, proponha e use criar_card.${projeto ? `\nProjeto desta conversa: ${projeto.nome}.` : ""}`,
      mensagem: `${antes ? `## Conversa até aqui\n${antes}\n\n` : ""}## Mensagem do CEO\n${ultima.texto}`,
      ferramentas: ferramentasDaConversa(c, controle.signal, modelo),
      exigeFerramenta: false,
      lembrete: "Responda ao CEO.",
      maxRodadas: 24,
      orientacoes: () => estado.fila.splice(0),
      onTexto: (t) => emit({ type: "conversa.parcial", conversaId: c.id, texto: t }),
    });
    registrar(c.id, "agente", r.texto.trim() || "(sem resposta)", { modelo, custoUsd: r.custoUsd });
  } catch (e) {
    const parado = controle.signal.aborted;
    registrar(c.id, "agente", parado ? "(parado)" : `Não consegui responder: ${e instanceof Error ? e.message : String(e)}`, { modelo });
  } finally {
    rodando.delete(c.id);
    emit({ type: "conversa.estado", conversaId: c.id, rodando: false });
    // Chegou mensagem nos últimos instantes, depois da última rodada: responde a ela agora.
    if (estado.fila.length && !controle.signal.aborted) void responder(lerConversa(c.id));
  }
}
