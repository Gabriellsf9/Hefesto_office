import type { Card, ConfigCritica, ItemConhecimento, RoomId, TipoConhecimento } from "@empresa/shared";
import { agentById, roomById, nomeDaSala } from "@empresa/org";
import { db, getSetting, setSetting } from "./db.ts";
import { emit, postFeed } from "./bus.ts";
import { clienteClaude } from "./custo.ts";
import { aoAprovar, ErroCard, listarComentarios, ultimaEntrega } from "./tarefas.ts";
import { ferramenta, rodarAgente, texto } from "./agentes/loop.ts";

// Conhecimento da casa (Fase 2f): padrões, guias, modelos e lições de cada área.
// Só o que o CEO aprovou entra nos prompts; o resto fica como proposta.

db.exec(`
  CREATE TABLE IF NOT EXISTS conhecimento (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    sala          TEXT NOT NULL,
    tipo          TEXT NOT NULL,
    titulo        TEXT NOT NULL,
    conteudo      TEXT NOT NULL,
    aprovado      INTEGER NOT NULL DEFAULT 0,
    origem_card   INTEGER,
    autor         TEXT NOT NULL,
    criado_em     INTEGER NOT NULL,
    atualizado_em INTEGER NOT NULL
  );
`);

const TIPOS: TipoConhecimento[] = ["padrao", "guia", "modelo", "licao"];
/** Limite do que entra no prompt de uma área (o resto continua na base, só não vai para o contexto). */
const MAX_NO_PROMPT = 9000;

type Linha = {
  id: number; sala: string; tipo: string; titulo: string; conteudo: string; aprovado: number; origem_card: number | null; autor: string;
  criado_em: number; atualizado_em: number;
};
const deLinha = (r: Linha): ItemConhecimento => ({
  id: r.id, sala: r.sala as RoomId, tipo: r.tipo as TipoConhecimento, titulo: r.titulo, conteudo: r.conteudo, aprovado: r.aprovado === 1,
  origemCardId: r.origem_card, autor: r.autor, criadoEm: r.criado_em, atualizadoEm: r.atualizado_em,
});

export function listarConhecimento(): ItemConhecimento[] {
  return (db.prepare("SELECT * FROM conhecimento ORDER BY aprovado, atualizado_em DESC").all() as Linha[]).map(deLinha);
}

function lerItem(id: number): ItemConhecimento {
  const r = db.prepare("SELECT * FROM conhecimento WHERE id = ?").get(id) as Linha | undefined;
  if (!r) throw new ErroCard("Item de conhecimento não encontrado.", 404);
  return deLinha(r);
}

const publicar = () => emit({ type: "conhecimento", itens: listarConhecimento() });

function validar(d: { sala?: unknown; tipo?: unknown; titulo?: unknown; conteudo?: unknown }) {
  if (typeof d.sala !== "string" || !roomById[d.sala as RoomId]) throw new ErroCard("Sala inválida.");
  if (typeof d.tipo !== "string" || !TIPOS.includes(d.tipo as TipoConhecimento)) throw new ErroCard("Tipo inválido.");
  if (typeof d.titulo !== "string" || !d.titulo.trim()) throw new ErroCard("Escreva o título.");
  if (typeof d.conteudo !== "string" || !d.conteudo.trim()) throw new ErroCard("Escreva o conteúdo.");
  return { sala: d.sala as RoomId, tipo: d.tipo as TipoConhecimento, titulo: d.titulo.trim().slice(0, 200), conteudo: d.conteudo.trim().slice(0, 20_000) };
}

/** O CEO cria direto como aprovado; agentes e lições extraídas entram como proposta. */
export function criarConhecimento(
  dados: { sala: unknown; tipo: unknown; titulo: unknown; conteudo: unknown },
  autor = "voce",
  origemCardId: number | null = null,
): ItemConhecimento {
  const v = validar(dados);
  const agora = Date.now();
  const r = db
    .prepare("INSERT INTO conhecimento (sala, tipo, titulo, conteudo, aprovado, origem_card, autor, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(v.sala, v.tipo, v.titulo, v.conteudo, autor === "voce" ? 1 : 0, origemCardId, autor, agora, agora);
  publicar();
  return lerItem(Number(r.lastInsertRowid));
}

export function editarConhecimento(id: number, dados: { sala?: unknown; tipo?: unknown; titulo?: unknown; conteudo?: unknown }): ItemConhecimento {
  const atual = lerItem(id);
  const v = validar({ ...atual, ...Object.fromEntries(Object.entries(dados).filter(([, x]) => x !== undefined)) });
  db.prepare("UPDATE conhecimento SET sala = ?, tipo = ?, titulo = ?, conteudo = ?, atualizado_em = ? WHERE id = ?")
    .run(v.sala, v.tipo, v.titulo, v.conteudo, Date.now(), id);
  publicar();
  return lerItem(id);
}

export function aprovarConhecimento(id: number): ItemConhecimento {
  lerItem(id);
  db.prepare("UPDATE conhecimento SET aprovado = 1, atualizado_em = ? WHERE id = ?").run(Date.now(), id);
  publicar();
  return lerItem(id);
}

export function excluirConhecimento(id: number) {
  lerItem(id);
  db.prepare("DELETE FROM conhecimento WHERE id = ?").run(id);
  publicar();
}

/** Conhecimento aprovado de uma área, pronto para o prompt (padrões e guias primeiro, depois as lições mais novas). */
export function conhecimentoDaSala(sala: RoomId): string {
  const itens = (db.prepare("SELECT * FROM conhecimento WHERE sala = ? AND aprovado = 1 ORDER BY CASE tipo WHEN 'licao' THEN 1 ELSE 0 END, atualizado_em DESC").all(sala) as Linha[]).map(deLinha);
  let total = 0;
  const partes: string[] = [];
  for (const it of itens) {
    const bloco = `### ${it.tipo === "licao" ? "Lição" : it.tipo === "modelo" ? "Modelo" : it.tipo === "guia" ? "Guia" : "Padrão"}: ${it.titulo}\n${it.conteudo}`;
    if (total + bloco.length > MAX_NO_PROMPT) break;
    partes.push(bloco);
    total += bloco.length;
  }
  return partes.join("\n\n");
}

/* ---------- Configuração do olhar crítico ---------- */

export function configCritica(): ConfigCritica {
  const ligado = (k: string) => (getSetting(`critica_${k}`) ?? "1") === "1";
  return { autocritica: ligado("autocritica"), advogado: ligado("advogado"), licoes: ligado("licoes") };
}

export function configurarCritica(c: Partial<ConfigCritica>): ConfigCritica {
  for (const k of ["autocritica", "advogado", "licoes"] as const) {
    if (typeof c[k] === "boolean") setSetting(`critica_${k}`, c[k] ? "1" : "0");
  }
  const config = configCritica();
  emit({ type: "critica", config });
  return config;
}

/* ---------- Lições aprendidas ---------- */

const MODELO_LICOES = "claude-haiku-5-5";

/**
 * Card concluído depois de devoluções ou de comentários do CEO: um resumo rápido
 * transforma o que foi corrigido numa regra geral para a área, como proposta.
 */
export async function extrairLicao(card: Card) {
  if (card.demo || !configCritica().licoes) return;
  const coms = listarComentarios(card.id);
  const devolucoes = coms.filter((c) => c.tipo === "devolucao");
  const doCeo = coms.filter((c) => c.autor === "voce" && (c.tipo === "comentario" || c.tipo === "devolucao"));
  if (!devolucoes.length && !doCeo.length) return;
  const client = clienteClaude();
  if (!client) return;

  const nome = (id: string) => (id === "voce" ? "CEO" : (agentById[id]?.nome ?? id));
  const debate = [...devolucoes, ...doCeo.filter((c) => c.tipo !== "devolucao")]
    .sort((a, b) => a.ts - b.ts)
    .map((c) => `- ${nome(c.autor)} ${c.tipo === "devolucao" ? "devolveu" : "comentou"}: ${c.texto.slice(0, 3000)}`)
    .join("\n");
  const final = ultimaEntrega(card.id);

  let proposta: { titulo: string; licao: string } | null = null;
  await rodarAgente({
    client,
    modelo: MODELO_LICOES,
    fallback: false,
    esforco: "low",
    sistema: `Você registra as lições aprendidas da área ${nomeDaSala(card.sala)} do Hefesto. Português do Brasil.
A partir das devoluções e dos comentários do CEO num trabalho já concluído, escreva UMA lição geral que evite o mesmo problema nos próximos trabalhos da área: uma regra clara e acionável (2 a 5 tópicos curtos), sem citar este card, este cliente ou detalhes que só valem aqui.
Se os comentários forem só gosto pessoal, detalhes pontuais ou não ensinarem nada reutilizável, chame nenhuma_licao.`,
    mensagem: `# ${card.chave} — ${card.titulo}\n\n## Descrição\n${card.descricao.slice(0, 4000) || "(sem descrição)"}\n\n## O que foi apontado\n${debate}\n\n## Versão final aprovada (trecho)\n${(final?.conteudo ?? "").slice(0, 4000)}`,
    ferramentas: [
      ferramenta(
        "registrar_licao",
        "Registra a lição para o CEO aprovar.",
        { titulo: { type: "string", description: "Até 80 caracteres, dizendo a regra" }, licao: { type: "string", description: "A regra em 2 a 5 tópicos curtos" } },
        ["titulo", "licao"],
        (e) => {
          proposta = { titulo: texto(e, "titulo", 120), licao: texto(e, "licao", 3000) };
          return { texto: "Lição registrada.", fim: true };
        },
      ),
      ferramenta("nenhuma_licao", "Não há lição reutilizável neste caso.", {}, [], () => ({ texto: "Ok.", fim: true })),
    ],
    exigeFerramenta: false,
    lembrete: "",
    maxRodadas: 2,
  });

  const p = proposta as { titulo: string; licao: string } | null;
  if (!p) return;
  const lider = Object.values(agentById).find((a) => a.sala === card.sala && a.lider) ?? Object.values(agentById).find((a) => a.sala === card.sala);
  const item = criarConhecimento({ sala: card.sala, tipo: "licao", titulo: p.titulo, conteudo: p.licao }, lider?.id ?? "chief-of-staff", card.id);
  postFeed(card.sala, item.autor, `Lição aprendida com o ${card.chave} aguardando sua aprovação: ${item.titulo}`);
}

// Aprovado pelo CEO: vale tirar a lição (os N0 chamam extrairLicao direto do motor).
aoAprovar.push((card) => void extrairLicao(card).catch((e) => console.error("Falha ao extrair lição:", e)));
