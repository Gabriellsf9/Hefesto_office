import {
  colunaDe, fluxoDaSala, fluxos, type Card, type CardEditavel, type Comentario, type Entrega, type FluxoId, type RoomId,
  type TipoComentario, fluxoPadrao } from "@empresa/shared";
import { agentById, roomById, salaDe } from "@empresa/org";
import { db, garantirColuna } from "./db.ts";
import { emit, focus } from "./bus.ts";

// Backlog central (PLANO.md, seção 4.2-B): nada é feito sem um card.
// Toda mudança de coluna vira um registro no histórico do card.

db.exec(`
  CREATE TABLE IF NOT EXISTS cards (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    fluxo       TEXT NOT NULL,
    coluna      TEXT NOT NULL,
    ordem       REAL NOT NULL,
    tipo        TEXT NOT NULL,
    titulo      TEXT NOT NULL,
    descricao   TEXT NOT NULL DEFAULT '',
    criterios   TEXT NOT NULL DEFAULT '',
    prioridade  TEXT NOT NULL DEFAULT 'P2',
    nivel       TEXT NOT NULL DEFAULT 'N1',
    sala        TEXT NOT NULL,
    dono        TEXT,
    validador   TEXT,
    em_validacao INTEGER NOT NULL DEFAULT 0,
    etiquetas   TEXT NOT NULL DEFAULT '[]',
    prazo       INTEGER,
    pai_id      INTEGER,
    bug_de      INTEGER,
    severidade  TEXT,
    devolucoes  INTEGER NOT NULL DEFAULT 0,
    bloqueado   INTEGER NOT NULL DEFAULT 0,
    projeto_id  INTEGER,
    custo_usd   REAL NOT NULL DEFAULT 0,
    demo        INTEGER NOT NULL DEFAULT 0,
    criado_em   INTEGER NOT NULL,
    atualizado_em INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS comentarios (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id INTEGER NOT NULL,
    autor   TEXT NOT NULL,
    tipo    TEXT NOT NULL,
    texto   TEXT NOT NULL,
    ts      INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS comentarios_card ON comentarios(card_id);
  CREATE TABLE IF NOT EXISTS entregas (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id  INTEGER NOT NULL,
    versao   INTEGER NOT NULL,
    autor    TEXT NOT NULL,
    resumo   TEXT NOT NULL,
    conteudo TEXT NOT NULL,
    ts       INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS entregas_card ON entregas(card_id);
`);
garantirColuna("cards", "depende_de", "INTEGER");

export class ErroCard extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

type Linha = Record<string, unknown>;

function deLinha(r: Linha): Card {
  return {
    id: r.id as number,
    chave: `EMP-${r.id}`,
    fluxo: r.fluxo as FluxoId,
    coluna: r.coluna as string,
    ordem: r.ordem as number,
    tipo: r.tipo as Card["tipo"],
    titulo: r.titulo as string,
    descricao: r.descricao as string,
    criterios: r.criterios as string,
    prioridade: r.prioridade as Card["prioridade"],
    nivel: r.nivel as Card["nivel"],
    sala: r.sala as RoomId,
    dono: (r.dono as string | null) ?? null,
    validador: (r.validador as string | null) ?? null,
    emValidacao: r.em_validacao === 1,
    etiquetas: JSON.parse(r.etiquetas as string) as string[],
    prazo: (r.prazo as number | null) ?? null,
    paiId: (r.pai_id as number | null) ?? null,
    bugDe: (r.bug_de as number | null) ?? null,
    dependeDe: (r.depende_de as number | null) ?? null,
    severidade: (r.severidade as Card["severidade"]) ?? null,
    devolucoes: r.devolucoes as number,
    bloqueado: r.bloqueado === 1,
    projetoId: (r.projeto_id as number | null) ?? null,
    custoUsd: r.custo_usd as number,
    demo: r.demo === 1,
    criadoEm: r.criado_em as number,
    atualizadoEm: r.atualizado_em as number,
  };
}

export function listarCards(): Card[] {
  return (db.prepare("SELECT * FROM cards ORDER BY ordem").all() as Linha[]).map(deLinha);
}

export function lerCard(id: number): Card {
  const r = db.prepare("SELECT * FROM cards WHERE id = ?").get(id) as Linha | undefined;
  if (!r) throw new ErroCard("Card não encontrado.", 404);
  return deLinha(r);
}

const publicar = (id: number) => {
  const card = lerCard(id);
  emit({ type: "card", card });
  return card;
};

/** Ordem para colocar um card no fim de uma coluna. */
function fimDaColuna(fluxo: FluxoId, coluna: string) {
  const r = db.prepare("SELECT MAX(ordem) AS m FROM cards WHERE fluxo = ? AND coluna = ?").get(fluxo, coluna) as { m: number | null };
  return (r.m ?? 0) + 1;
}

/* ---------- Validação dos campos ---------- */

const campos: Record<keyof CardEditavel, string> = {
  titulo: "titulo", descricao: "descricao", criterios: "criterios", tipo: "tipo", prioridade: "prioridade",
  nivel: "nivel", sala: "sala", dono: "dono", validador: "validador", etiquetas: "etiquetas", prazo: "prazo",
  paiId: "pai_id", severidade: "severidade", bloqueado: "bloqueado", projetoId: "projeto_id", dependeDe: "depende_de",
};

function validar(dados: CardEditavel) {
  if (dados.titulo !== undefined && !String(dados.titulo).trim()) throw new ErroCard("O título não pode ficar vazio.");
  if (dados.sala !== undefined && !roomById[dados.sala]) throw new ErroCard("Sala inválida.");
  for (const k of ["dono", "validador"] as const) {
    const v = dados[k];
    if (v && !agentById[v]) throw new ErroCard(`Agente inválido em ${k}.`);
  }
  if (dados.prioridade && !["P0", "P1", "P2", "P3"].includes(dados.prioridade)) throw new ErroCard("Prioridade inválida.");
  if (dados.nivel && !["N0", "N1", "N2", "N3"].includes(dados.nivel)) throw new ErroCard("Nível de autonomia inválido.");
  if (dados.severidade && !["S1", "S2", "S3", "S4"].includes(dados.severidade)) throw new ErroCard("Severidade inválida.");
  if (dados.etiquetas && (!Array.isArray(dados.etiquetas) || dados.etiquetas.some((e) => typeof e !== "string"))) {
    throw new ErroCard("Etiquetas inválidas.");
  }
}

function paraColuna(campo: keyof CardEditavel, v: unknown) {
  if (campo === "etiquetas") return JSON.stringify((v as string[]).map((e) => e.trim()).filter(Boolean).slice(0, 10));
  if (campo === "bloqueado") return v ? 1 : 0;
  if (typeof v === "string") return v.slice(0, campo === "titulo" ? 200 : 20000);
  return (v as number | null) ?? null;
}

/* ---------- Criação e edição ---------- */

export interface NovoCard extends CardEditavel {
  titulo: string;
  sala: RoomId;
  fluxo?: FluxoId;
  coluna?: string;
  bugDe?: number | null;
  demo?: boolean;
}

export function criarCard(dados: NovoCard, autor = "voce"): Card {
  validar(dados);
  const fluxo = dados.fluxo ?? fluxoPadrao(dados.sala);
  if (!fluxos[fluxo]) throw new ErroCard("Fluxo inválido.");
  const coluna = dados.coluna ?? fluxos[fluxo]!.colunas[0]!.id;
  if (!colunaDe(fluxo, coluna)) throw new ErroCard("Coluna inválida para este fluxo.");
  const agora = Date.now();
  const sala = dados.sala;
  const validador = dados.validador !== undefined ? dados.validador : salaDe(sala).validador;

  const r = db.prepare(
    `INSERT INTO cards (fluxo, coluna, ordem, tipo, titulo, descricao, criterios, prioridade, nivel, sala, dono, validador,
       etiquetas, prazo, pai_id, bug_de, severidade, projeto_id, demo, criado_em, atualizado_em, depende_de)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    fluxo, coluna, fimDaColuna(fluxo, coluna), dados.tipo ?? "tarefa", dados.titulo.trim().slice(0, 200),
    dados.descricao ?? "", dados.criterios ?? "", dados.prioridade ?? "P2", dados.nivel ?? "N1", sala,
    dados.dono ?? null, validador ?? null, JSON.stringify(dados.etiquetas ?? []), dados.prazo ?? null,
    dados.paiId ?? null, dados.bugDe ?? null, dados.severidade ?? null, dados.projetoId ?? null,
    dados.demo ? 1 : 0, agora, agora, dados.dependeDe ?? null,
  );
  const id = Number(r.lastInsertRowid);
  comentar(id, autor, "movimento", `Criou o card em "${colunaDe(fluxo, coluna)!.nome}"`);
  return publicar(id);
}

export function editarCard(id: number, dados: CardEditavel): Card {
  lerCard(id);
  validar(dados);
  const sets: string[] = [];
  const valores: unknown[] = [];
  for (const [k, v] of Object.entries(dados) as [keyof CardEditavel, unknown][]) {
    if (!(k in campos) || v === undefined) continue;
    sets.push(`${campos[k]} = ?`);
    valores.push(paraColuna(k, v));
  }
  if (sets.length) {
    db.prepare(`UPDATE cards SET ${sets.join(", ")}, atualizado_em = ? WHERE id = ?`).run(...(valores as never[]), Date.now(), id);
  }
  return publicar(id);
}

export function removerCard(id: number) {
  lerCard(id);
  db.prepare("DELETE FROM comentarios WHERE card_id = ?").run(id);
  db.prepare("DELETE FROM entregas WHERE card_id = ?").run(id);
  db.prepare("UPDATE cards SET depende_de = NULL WHERE depende_de = ?").run(id);
  db.prepare("DELETE FROM cards WHERE id = ?").run(id);
  emit({ type: "card.removido", id });
}

export function removerCardsDemo() {
  db.prepare("DELETE FROM comentarios WHERE card_id IN (SELECT id FROM cards WHERE demo = 1)").run();
  db.prepare("DELETE FROM entregas WHERE card_id IN (SELECT id FROM cards WHERE demo = 1)").run();
  db.prepare("DELETE FROM cards WHERE demo = 1").run();
  emit({ type: "cards", cards: listarCards() });
}

/* ---------- Movimentação ---------- */

export function mover(id: number, coluna: string, autor = "voce", ordem?: number): Card {
  const card = lerCard(id);
  const destino = colunaDe(card.fluxo, coluna);
  if (!destino) throw new ErroCard("Coluna inválida para este fluxo.");
  const novaOrdem = ordem ?? fimDaColuna(card.fluxo, coluna);
  // Saiu da validação (para qualquer lado): o badge "em validação" some.
  const emValidacao = destino.tipo === "validacao" ? card.emValidacao : false;
  db.prepare("UPDATE cards SET coluna = ?, ordem = ?, em_validacao = ?, atualizado_em = ? WHERE id = ?").run(
    coluna, novaOrdem, emValidacao ? 1 : 0, Date.now(), id,
  );
  if (coluna !== card.coluna) {
    const de = colunaDe(card.fluxo, card.coluna)?.nome ?? card.coluna;
    comentar(id, autor, "movimento", `Moveu de "${de}" para "${destino.nome}"`);
    if (autor !== "voce" && destino.sala) focus(destino.sala, autor);
  }
  return publicar(id);
}

export function marcarValidacao(id: number, emValidacao: boolean) {
  db.prepare("UPDATE cards SET em_validacao = ?, atualizado_em = ? WHERE id = ?").run(emValidacao ? 1 : 0, Date.now(), id);
  return publicar(id);
}

/** O validador (ou o QA) devolveu para o autor ajustar. */
export function registrarDevolucao(id: number, autor: string, motivo: string, coluna?: string): Card {
  const card = lerCard(id);
  db.prepare("UPDATE cards SET devolucoes = devolucoes + 1, em_validacao = 0, atualizado_em = ? WHERE id = ?").run(Date.now(), id);
  comentar(id, autor, "devolucao", motivo);
  return coluna && coluna !== card.coluna ? mover(id, coluna, autor) : publicar(id);
}

/* ---------- Aprovações do CEO ---------- */

const exigeAprovacao = (card: Card) => colunaDe(card.fluxo, card.coluna)?.tipo === "ceo";

/** Quem precisa reagir quando você aprova um card (ex.: raio-x vira Ficha do Projeto). */
export const aoAprovar: ((card: Card) => void)[] = [];

export function aprovar(id: number, comentario?: string): Card {
  const card = lerCard(id);
  if (!exigeAprovacao(card)) throw new ErroCard("Este card não está aguardando a sua aprovação.");
  comentar(id, "voce", "aprovacao", comentario?.trim() || "Aprovado.");
  const movido = mover(id, fluxos[card.fluxo]!.aprovarPara, "voce");
  for (const fn of aoAprovar) fn(movido);
  return movido;
}

/** Aprovação em lote: só para nível N1 (PLANO.md 4.2-E); N2 e N3 são item por item. */
export function aprovarLote(ids: number[]): Card[] {
  const cards = ids.map(lerCard);
  const fora = cards.filter((c) => c.nivel !== "N1" || !exigeAprovacao(c));
  if (fora.length) throw new ErroCard(`Só cards N1 aguardando você podem ser aprovados em lote (${fora.map((c) => c.chave).join(", ")}).`);
  return cards.map((c) => aprovar(c.id));
}

export function devolver(id: number, comentario: string): Card {
  const card = lerCard(id);
  if (!exigeAprovacao(card)) throw new ErroCard("Este card não está aguardando a sua aprovação.");
  if (!comentario?.trim()) throw new ErroCard("Diga o que precisa mudar ao devolver.");
  return registrarDevolucao(id, "voce", comentario.trim().slice(0, 5000), fluxos[card.fluxo]!.devolverPara);
}

/* ---------- Bugs ---------- */

export function abrirBug(
  deId: number,
  dados: { titulo: string; descricao?: string; severidade?: Card["severidade"]; dono?: string | null },
  autor = "voce",
): Card {
  const origem = lerCard(deId);
  if (origem.fluxo !== "software") throw new ErroCard("Bugs são abertos em cards de software.");
  const bug = criarCard(
    {
      titulo: dados.titulo,
      descricao: dados.descricao ?? "",
      tipo: "bug",
      sala: "desenvolvimento",
      fluxo: "software",
      coluna: "bug",
      prioridade: dados.severidade === "S1" ? "P0" : dados.severidade === "S2" ? "P1" : "P2",
      severidade: dados.severidade ?? "S3",
      nivel: "N0",
      dono: dados.dono ?? origem.dono,
      validador: "qa-lead",
      bugDe: origem.id,
      projetoId: origem.projetoId,
      demo: origem.demo,
    },
    autor,
  );
  comentar(origem.id, autor, "comentario", `Bug aberto: ${bug.chave} — ${bug.titulo}`);
  return bug;
}

/* ---------- Comentários e histórico ---------- */

/* ---------- Entregas ---------- */

export function registrarEntrega(cardId: number, autor: string, resumo: string, conteudo: string): Entrega {
  const r = db.prepare("SELECT COALESCE(MAX(versao), 0) AS v FROM entregas WHERE card_id = ?").get(cardId) as { v: number };
  const ts = Date.now();
  const ins = db.prepare("INSERT INTO entregas (card_id, versao, autor, resumo, conteudo, ts) VALUES (?, ?, ?, ?, ?, ?)").run(
    cardId, r.v + 1, autor, resumo, conteudo, ts,
  );
  const entrega: Entrega = { id: Number(ins.lastInsertRowid), cardId, versao: r.v + 1, autor, resumo, conteudo, ts };
  emit({ type: "entrega", entrega });
  return entrega;
}

export function listarEntregas(cardId: number): Entrega[] {
  return (db.prepare("SELECT * FROM entregas WHERE card_id = ? ORDER BY versao").all(cardId) as Linha[]).map((r) => ({
    id: r.id as number, cardId: r.card_id as number, versao: r.versao as number, autor: r.autor as string,
    resumo: r.resumo as string, conteudo: r.conteudo as string, ts: r.ts as number,
  }));
}

export const ultimaEntrega = (cardId: number): Entrega | undefined => listarEntregas(cardId).at(-1);

export function somarCusto(cardId: number, usd: number) {
  db.prepare("UPDATE cards SET custo_usd = custo_usd + ? WHERE id = ?").run(usd, cardId);
  publicar(cardId);
}

/** Comentário do CEO num card bloqueado (pergunta de um agente) desbloqueia o card. */
export function comentarComoCeo(cardId: number, texto: string): Comentario {
  const c = comentar(cardId, "voce", "comentario", texto);
  if (lerCard(cardId).bloqueado) {
    db.prepare("UPDATE cards SET bloqueado = 0, atualizado_em = ? WHERE id = ?").run(Date.now(), cardId);
    publicar(cardId);
  }
  return c;
}

export function comentar(cardId: number, autor: string, tipo: TipoComentario, texto: string): Comentario {
  const ts = Date.now();
  const r = db.prepare("INSERT INTO comentarios (card_id, autor, tipo, texto, ts) VALUES (?, ?, ?, ?, ?)").run(cardId, autor, tipo, texto, ts);
  const comentario: Comentario = { id: Number(r.lastInsertRowid), cardId, autor, tipo, texto, ts };
  emit({ type: "comentario", comentario });
  return comentario;
}

export function listarComentarios(cardId: number): Comentario[] {
  return (db.prepare("SELECT id, card_id, autor, tipo, texto, ts FROM comentarios WHERE card_id = ? ORDER BY id").all(cardId) as Linha[]).map(
    (r) => ({ id: r.id as number, cardId: r.card_id as number, autor: r.autor as string, tipo: r.tipo as TipoComentario, texto: r.texto as string, ts: r.ts as number }),
  );
}
