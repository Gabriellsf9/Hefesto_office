import {
  colunaDe, fluxoDaSala, fluxos, type Card, type CardEditavel, type Comentario, type Entrega, type FluxoId, type RoomId,
  type TipoComentario, fluxoPadrao, colunaDeTrabalho, salaDoCodigo, ehCardDeCodigo } from "@empresa/shared";
import { agentById, etapaDoCodigoDe, etapasDoCodigoDe, roomById, salaDe } from "@empresa/org";
import { db, garantirColuna, getSetting, setSetting } from "./db.ts";
import { limitePorCard, limitePorCardDeCodigo } from "./custo.ts";
import { ehPessoa } from "./pessoas.ts";
import { emit, focus, postFeed } from "./bus.ts";

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
garantirColuna("cards", "dependencias", "TEXT");

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
    dependencias: r.dependencias ? (JSON.parse(r.dependencias as string) as number[]) : [],
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
  paiId: "pai_id", severidade: "severidade", bloqueado: "bloqueado", projetoId: "projeto_id", dependeDe: "depende_de", dependencias: "dependencias",
};

function validar(dados: CardEditavel) {
  if (dados.titulo !== undefined && !String(dados.titulo).trim()) throw new ErroCard("O título não pode ficar vazio.");
  if (dados.sala !== undefined && !roomById[dados.sala]) throw new ErroCard("Sala inválida.");
  for (const k of ["dono", "validador"] as const) {
    const v = dados[k];
    // Dono pode ser uma pessoa do time (o motor não roda o card dela); validador é sempre agente.
    if (v && !agentById[v] && !(k === "dono" && ehPessoa(v))) throw new ErroCard(`Agente inválido em ${k}.`);
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
  if (campo === "dependencias") return JSON.stringify([...new Set((Array.isArray(v) ? v : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 12));
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

/**
 * Cards que um agente acabou de passar para outro (id → quando pode começar): o motor espera a entrega
 * em mãos no 3D. Vários de uma vez (a Helena distribuindo) são entregues em sequência, mesa a mesa.
 */
export const repassadosEm = new Map<number, number>();
const ultimaEntregaDe = new Map<string, number>();
const ESPERA_ENTREGA_MS = 12_000;
const ENTRE_ENTREGAS_MS = 15_000;

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
       etiquetas, prazo, pai_id, bug_de, severidade, projeto_id, demo, criado_em, atualizado_em, depende_de, dependencias)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    fluxo, coluna, fimDaColuna(fluxo, coluna), dados.tipo ?? "tarefa", dados.titulo.trim().slice(0, 200),
    dados.descricao ?? "", dados.criterios ?? "", dados.prioridade ?? "P2", dados.nivel ?? "N1", sala,
    dados.dono ?? null, validador ?? null, JSON.stringify(dados.etiquetas ?? []), dados.prazo ?? null,
    dados.paiId ?? null, dados.bugDe ?? null, dados.severidade ?? null, dados.projetoId ?? null,
    dados.demo ? 1 : 0, agora, agora, dados.dependeDe ?? null, paraColuna("dependencias", dados.dependencias ?? []),
  );
  const id = Number(r.lastInsertRowid);
  comentar(id, autor, "movimento", `Criou o card em "${colunaDe(fluxo, coluna)!.nome}"`);
  const card = publicar(id);
  if (agentById[autor] && card.dono && card.dono !== autor && !card.demo) {
    const liberaEm = Math.max(Date.now() + ESPERA_ENTREGA_MS, (ultimaEntregaDe.get(autor) ?? 0) + ENTRE_ENTREGAS_MS);
    ultimaEntregaDe.set(autor, liberaEm);
    repassadosEm.set(id, liberaEm);
    emit({ type: "repasse", de: autor, para: card.dono, cardId: id, motivo: "pedido" });
  }
  return card;
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
  for (const r of db.prepare("SELECT id, dependencias FROM cards WHERE dependencias LIKE ?").all(`%${id}%`) as { id: number; dependencias: string }[]) {
    const lista = (JSON.parse(r.dependencias) as number[]).filter((d) => d !== id);
    db.prepare("UPDATE cards SET dependencias = ? WHERE id = ?").run(JSON.stringify(lista), r.id);
  }
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

export const exigeAprovacao = (card: Card) => colunaDe(card.fluxo, card.coluna)?.tipo === "ceo";

/** Quem precisa reagir quando você aprova um card (ex.: raio-x vira Ficha do Projeto). */
export const aoAprovar: ((card: Card) => void)[] = [];

export function aprovar(id: number, comentario?: string, autor = "voce"): Card {
  const card = lerCard(id);
  if (!exigeAprovacao(card)) throw new ErroCard("Este card não está aguardando a sua aprovação.");
  comentar(id, autor, "aprovacao", comentario?.trim() || "Aprovado.");
  const movido = mover(id, fluxos[card.fluxo]!.aprovarPara, autor);
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

export function devolver(id: number, comentario: string, autor = "voce"): Card {
  const card = lerCard(id);
  if (!exigeAprovacao(card)) throw new ErroCard("Este card não está aguardando a sua aprovação.");
  if (!comentario?.trim()) throw new ErroCard("Diga o que precisa mudar ao devolver.");
  // Código devolvido pelo CEO volta a passar por todas as etapas (review, performance, segurança, QA).
  const etapa = etapaDoCodigoDe(card);
  if (etapa !== null && etapa > 0) editarCard(id, { validador: etapasDoCodigoDe(card.fluxo, card.dono)[0]!.validador });
  // Volta para a coluna escolhida no fluxo; se ela é de outra área (Produto não vai parar em "Em dev"), para a de trabalho do card.
  const escolhida = fluxos[card.fluxo]!.devolverPara;
  const sala = colunaDe(card.fluxo, escolhida)?.sala;
  const destino = sala && sala !== card.sala ? colunaDeTrabalho(card.fluxo, card.sala) : escolhida;
  return registrarDevolucao(id, autor, comentario.trim().slice(0, 5000), destino);
}

/* ---------- Bugs ---------- */

export function abrirBug(
  deId: number,
  dados: { titulo: string; descricao?: string; severidade?: Card["severidade"]; dono?: string | null },
  autor = "voce",
): Card {
  const origem = lerCard(deId);
  const salaCodigo = salaDoCodigo(origem.fluxo);
  if (!salaCodigo) throw new ErroCard("Bugs são abertos em cards de software.");
  const dono = dados.dono ?? origem.dono;
  // Quem confere a correção é a última etapa do código (o QA), como no fluxo normal.
  const qa = etapasDoCodigoDe(origem.fluxo, dono).at(-1)?.validador ?? salaDe(salaCodigo).validador;
  const bug = criarCard(
    {
      titulo: dados.titulo,
      descricao: dados.descricao ?? "",
      tipo: "bug",
      sala: salaCodigo,
      fluxo: origem.fluxo,
      coluna: colunaDe(origem.fluxo, "bug") ? "bug" : colunaDeTrabalho(origem.fluxo, salaCodigo),
      prioridade: dados.severidade === "S1" ? "P0" : dados.severidade === "S2" ? "P1" : "P2",
      severidade: dados.severidade ?? "S3",
      nivel: "N0",
      dono,
      validador: qa,
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
  const antes = lerCard(cardId).custoUsd;
  db.prepare("UPDATE cards SET custo_usd = custo_usd + ? WHERE id = ?").run(usd, cardId);
  const card = publicar(cardId);
  // Aviso antes de parar: cruzou 80% do que o card pode gastar.
  const teto = tetoDoCard(card);
  if (antes < teto * 0.8 && card.custoUsd >= teto * 0.8 && card.custoUsd < teto) {
    comentar(cardId, card.dono ?? "chief-of-staff", "comentario", `Aviso de gasto: este card já custou US$ ${card.custoUsd.toFixed(2)} de US$ ${teto.toFixed(2)} (80%). No limite eu paro e espero você liberar mais.`);
    postFeed(card.sala, card.dono ?? "chief-of-staff", `${card.chave} chegou a 80% do limite de gasto (US$ ${card.custoUsd.toFixed(2)} de ${teto.toFixed(2)})`);
  }
}

/** Etiqueta do card parado pelo limite de gasto (aparece na Caixa de entrada com o botão Liberar). */
export const ETIQUETA_LIMITE = "limite-de-gasto";
/** Comentários do piloto automático (decisões no lugar do CEO) começam assim. */
export const PREFIXO_PILOTO = "🤖 Piloto automático";

/** Card que mexe no código (cópia isolada própria): tem o limite de código, maior. */
function temCopiaPropria(id: number) {
  try {
    return !!db.prepare("SELECT 1 FROM worktrees WHERE card_id = ? AND status = 'ativo'").get(id);
  } catch {
    return false; // tabela da fábrica ainda não criada
  }
}

/** Limite de gasto do tipo do card (geral ou código). */
export const limiteDoCard = (card: Card) => (ehCardDeCodigo(card) || temCopiaPropria(card.id) ? limitePorCardDeCodigo() : limitePorCard());

/** Teto atual do card: o limite do tipo dele mais o que você já liberou. */
export const tetoDoCard = (card: Card) => limiteDoCard(card) + Number(getSetting(`card_${card.id}_liberado_usd`) ?? 0);

/**
 * Comentário do CEO que é decisão sobre o trabalho (recomeça contagens de rodadas e falhas). Liberar gasto
 * fica registrado em nome do CEO, mas não é decisão: senão um clique em "Liberar mais" zera o consenso.
 */
export const decisaoDoCeo = (c: Comentario) => c.autor === "voce" && !/^(Liberou mais US\$|O teto deste card agora é US\$)/.test(c.texto);

/** Folga mínima para uma resposta inteira do modelo mais caro (64 mil tokens de saída no Opus custam ~US$ 1,30). */
const FOLGA_MINIMA_USD = 1.5;

/** Libera mais um limite para o card parado (botão Liberar, comentário ou Telegram) e ele continua de onde parou. */
export function liberarGasto(id: number, autor = "voce"): Card {
  const card = lerCard(id);
  // O limite já subiu desde que o card parou (Configurações): só destrava, sem somar mais um limite.
  // Já cabe no teto (você subiu o limite): só destrava. Com folga pequena demais para uma resposta inteira
  // (o agente parou porque a resposta não coube), soma mais um limite.
  if (card.etiquetas.includes(ETIQUETA_LIMITE) && tetoDoCard(card) - card.custoUsd >= FOLGA_MINIMA_USD) return destravarDentroDoTeto(card, autor);
  const lim = limiteDoCard(card);
  const extra = Number(getSetting(`card_${id}_liberado_usd`) ?? 0);
  setSetting(`card_${id}_liberado_usd`, String(Math.max(extra, card.custoUsd - lim) + lim));
  db.prepare("UPDATE cards SET bloqueado = 0, etiquetas = ?, atualizado_em = ? WHERE id = ?").run(JSON.stringify(card.etiquetas.filter((e) => e !== ETIQUETA_LIMITE)), Date.now(), id);
  comentar(id, autor, "comentario", `Liberou mais US$ ${lim.toFixed(2)} para este card (novo teto: US$ ${(Math.max(extra, card.custoUsd - lim) + 2 * lim).toFixed(2)}).`);
  return publicar(id);
}

function destravarDentroDoTeto(card: Card, autor: string): Card {
  db.prepare("UPDATE cards SET bloqueado = 0, etiquetas = ?, atualizado_em = ? WHERE id = ?").run(JSON.stringify(card.etiquetas.filter((e) => e !== ETIQUETA_LIMITE)), Date.now(), card.id);
  comentar(card.id, autor, "comentario", `O teto deste card agora é US$ ${tetoDoCard(card).toFixed(2)} (gastou US$ ${card.custoUsd.toFixed(2)}): continua de onde parou.`);
  return publicar(card.id);
}

/** Cards parados no limite de gasto que voltaram a caber no teto (você subiu o limite): destrava sozinho. */
export function destravarCardsNoTeto(cards: Card[]): number {
  // Só com folga para uma resposta inteira: senão o agente seria cortado de novo, gastando uma chamada a cada volta.
  const voltaram = cards.filter((c) => c.bloqueado && c.etiquetas.includes(ETIQUETA_LIMITE) && tetoDoCard(c) - c.custoUsd >= FOLGA_MINIMA_USD);
  for (const c of voltaram) destravarDentroDoTeto(c, "devops");
  return voltaram.length;
}

/** O card já gastou o que podia: o limite do tipo dele, mais o que você liberou. */
export function cardPassouDoLimite(id: number): boolean {
  const card = lerCard(id);
  return card.custoUsd >= tetoDoCard(card);
}

/** Comentário do CEO num card bloqueado (pergunta de um agente) desbloqueia o card. */
export function comentarComoCeo(cardId: number, texto: string): Comentario {
  const c = comentar(cardId, "voce", "comentario", texto);
  const card = lerCard(cardId);
  if (card.bloqueado) {
    // Parado pelo limite de gasto: comentar também libera mais um limite (como o botão Liberar).
    if (card.etiquetas.includes(ETIQUETA_LIMITE) || cardPassouDoLimite(cardId)) liberarGasto(cardId);
    else {
      db.prepare("UPDATE cards SET bloqueado = 0, atualizado_em = ? WHERE id = ?").run(Date.now(), cardId);
      publicar(cardId);
    }
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

/** Devoluções recebidas por um agente em outros cards (memória do agente), as mais recentes primeiro. */
export function listarDevolucoesDoAgente(agente: string, excetoCard: number, limite = 5): { chave: string; texto: string }[] {
  const linhas = db
    .prepare(
      `SELECT c.card_id AS id, c.texto AS texto FROM comentarios c JOIN cards k ON k.id = c.card_id
       WHERE c.tipo = 'devolucao' AND k.dono = ? AND c.card_id <> ? AND c.autor <> ? AND k.demo = 0 ORDER BY c.id DESC LIMIT ?`,
    )
    .all(agente, excetoCard, agente, limite) as { id: number; texto: string }[];
  return linhas.map((l) => ({ chave: `EMP-${l.id}`, texto: l.texto }));
}

export function listarComentarios(cardId: number): Comentario[] {
  return (db.prepare("SELECT id, card_id, autor, tipo, texto, ts FROM comentarios WHERE card_id = ? ORDER BY id").all(cardId) as Linha[]).map(
    (r) => ({ id: r.id as number, cardId: r.card_id as number, autor: r.autor as string, tipo: r.tipo as TipoComentario, texto: r.texto as string, ts: r.ts as number }),
  );
}
