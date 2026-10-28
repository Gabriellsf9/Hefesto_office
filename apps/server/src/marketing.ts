import { canaisPeca, type Card, type CanalPeca, type Peca, type ResultadosPeca } from "@empresa/shared";
import { db, getSetting, setSetting } from "./db.ts";
import { emit, postChat } from "./bus.ts";
import { comentar, ErroCard, lerCard, listarCards, mover } from "./tarefas.ts";
import { ErroEntrada, ferramenta, texto, type Ferramenta } from "./agentes/loop.ts";

// Marketing (Fase 5): cada card de conteúdo vira uma peça pronta para publicar, com canal,
// data, texto final, hashtags, CTA, roteiro visual e variações A/B. Calendário editorial na
// board; o CEO publica (copiar ou abrir o LinkedIn com o texto) e anota os resultados.
// Publicação automática pelas APIs oficiais depende das contas do CEO (fica para quando ele conectar).

db.exec(`
  CREATE TABLE IF NOT EXISTS pecas (
    card_id        INTEGER PRIMARY KEY,
    canal          TEXT NOT NULL,
    formato        TEXT NOT NULL,
    data_pub       INTEGER,
    titulo         TEXT NOT NULL,
    texto          TEXT NOT NULL,
    hashtags       TEXT NOT NULL,
    cta            TEXT NOT NULL,
    roteiro        TEXT NOT NULL,
    variacoes      TEXT NOT NULL,
    publicado_em   INTEGER,
    link           TEXT,
    resultados     TEXT NOT NULL,
    atualizado_em  INTEGER NOT NULL
  );
`);

const CANAIS = canaisPeca.map((c) => c.id);

type Linha = {
  card_id: number; canal: string; formato: string; data_pub: number | null; titulo: string; texto: string; hashtags: string; cta: string; roteiro: string;
  variacoes: string; publicado_em: number | null; link: string | null; resultados: string; atualizado_em: number;
};
const deLinha = (r: Linha): Peca => ({
  cardId: r.card_id, canal: r.canal as CanalPeca, formato: r.formato, dataPublicacao: r.data_pub, titulo: r.titulo, texto: r.texto, hashtags: JSON.parse(r.hashtags),
  cta: r.cta, roteiroVisual: r.roteiro, variacoes: JSON.parse(r.variacoes), publicadoEm: r.publicado_em, link: r.link, resultados: JSON.parse(r.resultados),
  atualizadoEm: r.atualizado_em,
});

export function listarPecas(): Peca[] {
  const existentes = new Set(listarCards().map((c) => c.id));
  return (db.prepare("SELECT * FROM pecas ORDER BY data_pub").all() as Linha[]).map(deLinha).filter((p) => existentes.has(p.cardId));
}

export function lerPeca(cardId: number): Peca | null {
  const r = db.prepare("SELECT * FROM pecas WHERE card_id = ?").get(cardId) as Linha | undefined;
  return r ? deLinha(r) : null;
}

function gravar(p: Peca) {
  db.prepare(
    `INSERT INTO pecas (card_id, canal, formato, data_pub, titulo, texto, hashtags, cta, roteiro, variacoes, publicado_em, link, resultados, atualizado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(card_id) DO UPDATE SET canal = excluded.canal, formato = excluded.formato, data_pub = excluded.data_pub, titulo = excluded.titulo,
       texto = excluded.texto, hashtags = excluded.hashtags, cta = excluded.cta, roteiro = excluded.roteiro, variacoes = excluded.variacoes,
       publicado_em = excluded.publicado_em, link = excluded.link, resultados = excluded.resultados, atualizado_em = excluded.atualizado_em`,
  ).run(p.cardId, p.canal, p.formato, p.dataPublicacao, p.titulo, p.texto, JSON.stringify(p.hashtags), p.cta, p.roteiroVisual, JSON.stringify(p.variacoes),
    p.publicadoEm, p.link, JSON.stringify(p.resultados), p.atualizadoEm);
  emit({ type: "peca", peca: p });
}

/** Data em ISO (2026-11-03 ou 2026-11-03T18:30) para milissegundos. */
function lerData(v: unknown): number | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const t = Date.parse(v.length === 10 ? `${v}T09:00:00` : v);
  return Number.isFinite(t) ? t : null;
}

const lista = (v: unknown, max: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim().slice(0, 500)).slice(0, max) : []);

/** Salva a peça do card (pelo agente ou pelo CEO). */
export function salvarPeca(card: Card, e: Record<string, unknown>): Peca {
  const canal = String(e.canal ?? "") as CanalPeca;
  if (!CANAIS.includes(canal)) throw new ErroEntrada(`Canal inválido. Use: ${CANAIS.join(", ")}.`);
  const anterior = lerPeca(card.id);
  const p: Peca = {
    cardId: card.id,
    canal,
    formato: typeof e.formato === "string" ? e.formato.trim().slice(0, 60) : (anterior?.formato ?? "post"),
    dataPublicacao: lerData(e.data_publicacao) ?? anterior?.dataPublicacao ?? card.prazo ?? null,
    titulo: typeof e.titulo === "string" && e.titulo.trim() ? e.titulo.trim().slice(0, 200) : (anterior?.titulo ?? card.titulo),
    texto: texto(e, "texto", 20_000),
    hashtags: lista(e.hashtags, 30).map((h) => (h.startsWith("#") ? h : `#${h}`).replace(/\s+/g, "")),
    cta: typeof e.cta === "string" ? e.cta.trim().slice(0, 300) : "",
    roteiroVisual: typeof e.roteiro_visual === "string" ? e.roteiro_visual.trim().slice(0, 5000) : "",
    variacoes: lista(e.variacoes, 5),
    publicadoEm: anterior?.publicadoEm ?? null,
    link: anterior?.link ?? null,
    resultados: anterior?.resultados ?? {},
    atualizadoEm: Date.now(),
  };
  gravar(p);
  return p;
}

/** Edição pelo CEO (data, texto, hashtags…). */
export function editarPeca(cardId: number, d: Record<string, unknown>): Peca {
  const p = lerPeca(cardId);
  if (!p) throw new ErroCard("Este card não tem peça.", 404);
  const novo: Peca = { ...p, atualizadoEm: Date.now() };
  if (d.dataPublicacao !== undefined) novo.dataPublicacao = typeof d.dataPublicacao === "number" ? d.dataPublicacao : lerData(d.dataPublicacao);
  if (typeof d.texto === "string" && d.texto.trim()) novo.texto = d.texto.slice(0, 20_000);
  if (Array.isArray(d.hashtags)) novo.hashtags = lista(d.hashtags, 30);
  if (typeof d.cta === "string") novo.cta = d.cta.slice(0, 300);
  if (d.resultados && typeof d.resultados === "object") {
    const r = d.resultados as Record<string, unknown>;
    const n = (k: keyof ResultadosPeca) => (typeof r[k] === "number" && Number.isFinite(r[k]) && (r[k] as number) >= 0 ? Math.round(r[k] as number) : p.resultados[k]);
    novo.resultados = { impressoes: n("impressoes"), cliques: n("cliques"), comentarios: n("comentarios"), conversoes: n("conversoes") };
  }
  gravar(novo);
  return novo;
}

/** O CEO publicou: guarda o link e move o card para Publicado. */
export function marcarPublicado(cardId: number, link: string | null): Card {
  const p = lerPeca(cardId);
  if (!p) throw new ErroCard("Este card não tem peça.", 404);
  const card = lerCard(cardId);
  if (card.coluna !== "agendado") throw new ErroCard("A peça precisa estar aprovada (Agendado) antes de ser marcada como publicada.");
  const limpo = link?.trim() || null;
  if (limpo && !/^https?:\/\//.test(limpo)) throw new ErroCard("O link precisa começar com http:// ou https://.");
  gravar({ ...p, publicadoEm: Date.now(), link: limpo, atualizadoEm: Date.now() });
  comentar(cardId, "voce", "comentario", `Publicado${limpo ? `: ${limpo}` : "."}`);
  return mover(cardId, "publicado", "voce");
}

const textoPublicavel = (p: Peca) => `${p.texto}${p.hashtags.length ? `\n\n${p.hashtags.join(" ")}` : ""}`;

/** Peça em Markdown para o prompt do validador e para a entrega. */
export function contextoDaPeca(cardId: number): string {
  const p = lerPeca(cardId);
  if (!p) return "";
  return `## Peça salva
- Canal: ${p.canal} · Formato: ${p.formato} · Publicar em: ${p.dataPublicacao ? new Date(p.dataPublicacao).toLocaleString("pt-BR") : "(sem data)"}
- CTA: ${p.cta || "(sem CTA)"}

### Texto final
${textoPublicavel(p)}

### Roteiro visual
${p.roteiroVisual || "(nenhum)"}
${p.variacoes.length ? `\n### Variações para teste A/B\n${p.variacoes.map((v) => `- ${v}`).join("\n")}` : ""}`;
}

/** Ferramenta dos autores de conteúdo do Marketing. */
export function ferramentasDeMarketing(card: Card): Ferramenta[] {
  if (card.fluxo !== "marketing" || card.tipo !== "conteudo") return [];
  return [
    ferramenta(
      "salvar_peca",
      "Salva a peça pronta para publicar (vira um item do calendário editorial). Use antes de entregar. Não termina a sua vez.",
      {
        canal: { type: "string", enum: CANAIS },
        formato: { type: "string", description: "Ex.: carrossel, reels, post, artigo, newsletter, anúncio" },
        data_publicacao: { type: "string", description: "Data sugerida em ISO (2026-11-03T18:30)" },
        titulo: { type: "string" },
        texto: { type: "string", description: "Texto final, pronto para colar" },
        hashtags: { type: "array", items: { type: "string" } },
        cta: { type: "string" },
        roteiro_visual: { type: "string", description: "O que a imagem ou o vídeo mostra, tela por tela ou slide por slide" },
        variacoes: { type: "array", items: { type: "string" }, description: "Ganchos ou textos alternativos para teste A/B" },
      },
      ["canal", "formato", "texto"],
      (e) => {
        const p = salvarPeca(lerCard(card.id), e);
        return { texto: `Peça salva (${p.canal}, ${p.dataPublicacao ? new Date(p.dataPublicacao).toLocaleDateString("pt-BR") : "sem data"}). Agora entregue.` };
      },
    ),
  ];
}

export function conferirEntregaDePeca(card: Card) {
  if (card.fluxo === "marketing" && card.tipo === "conteudo" && !lerPeca(card.id)) {
    throw new ErroEntrada("Antes de entregar, salve a peça com salvar_peca (canal, formato, texto final e data).");
  }
}

/* ---------- Lembrete de publicação ---------- */

// Dia no fuso local (no Brasil, depois das 21h o dia em UTC já é o seguinte).
const hoje = (d = new Date()) => d.toLocaleDateString("sv-SE");

/** A partir das 8h, a Helena avisa no chat (uma vez por peça) o que está agendado para hoje e ainda não foi publicado. */
export function lembrarPublicacoes(agora = new Date()) {
  if (agora.getHours() < 8) return;
  const dia = hoje(agora);
  const chave = `marketing_lembrados_${dia}`;
  const jaLembrados = new Set<number>(JSON.parse(getSetting(chave) ?? "[]"));
  const cards = new Map(listarCards().map((c) => [c.id, c]));
  const deHoje = listarPecas().filter(
    (p) => p.dataPublicacao && hoje(new Date(p.dataPublicacao)) === dia && !p.publicadoEm && cards.get(p.cardId)?.coluna === "agendado" && !jaLembrados.has(p.cardId),
  );
  if (!deHoje.length) return;
  setSetting(chave, JSON.stringify([...jaLembrados, ...deHoje.map((p) => p.cardId)]));
  postChat(
    "chief-of-staff",
    `Hoje tem ${deHoje.length === 1 ? "um post agendado" : `${deHoje.length} posts agendados`}: ${deHoje
      .map((p) => `${cards.get(p.cardId)!.chave} (${p.canal}, ${new Date(p.dataPublicacao!).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })})`)
      .join(", ")}. Abra o card para copiar o texto e marcar como publicado.`,
  );
}

let timer: NodeJS.Timeout | null = null;
export function iniciarLembretesDeMarketing() {
  if (timer) return;
  lembrarPublicacoes();
  timer = setInterval(lembrarPublicacoes, 10 * 60_000);
}
