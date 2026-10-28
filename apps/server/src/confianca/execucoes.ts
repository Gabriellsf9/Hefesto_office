import { randomUUID } from "node:crypto";
import { db } from "../db.ts";
import { redigir } from "./varredura.ts";

// Replay: cada passo dos agentes num card (o que escreveram e cada ferramenta, com a entrada e o resultado),
// para você rever depois exatamente o que foi feito e em que ordem. Segredos conhecidos saem mascarados.

db.exec(`CREATE TABLE IF NOT EXISTS passos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  card_id INTEGER NOT NULL,
  execucao TEXT NOT NULL,
  agente TEXT,
  modelo TEXT NOT NULL,
  rodada INTEGER NOT NULL,
  tipo TEXT NOT NULL,
  nome TEXT,
  entrada TEXT,
  saida TEXT,
  erro INTEGER NOT NULL DEFAULT 0,
  ms INTEGER NOT NULL DEFAULT 0
)`);
db.exec("CREATE INDEX IF NOT EXISTS passos_card ON passos (card_id, id)");

export interface ContextoPasso {
  cardId: number;
  execucao: string;
  agente: string | null;
  modelo: string;
}

export const novaExecucao = (cardId: number | undefined, agente: string | undefined, modelo: string): ContextoPasso | null =>
  cardId ? { cardId, execucao: randomUUID(), agente: agente ?? null, modelo } : null;

const LIMITE = 6000;
const corte = (s: string) => (s.length > LIMITE ? `${s.slice(0, LIMITE)}\n…(${s.length - LIMITE} caracteres a mais)` : s);

export function registrarPasso(
  c: ContextoPasso | null,
  p: { rodada: number; tipo: "texto" | "ferramenta"; nome?: string; entrada?: unknown; saida?: string; erro?: boolean; ms?: number },
) {
  if (!c) return;
  try {
    const entrada = p.entrada === undefined ? null : corte(redigir(typeof p.entrada === "string" ? p.entrada : JSON.stringify(p.entrada, null, 1)));
    db.prepare("INSERT INTO passos (ts, card_id, execucao, agente, modelo, rodada, tipo, nome, entrada, saida, erro, ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
      Date.now(),
      c.cardId,
      c.execucao,
      c.agente,
      c.modelo,
      p.rodada,
      p.tipo,
      p.nome ?? null,
      entrada,
      p.saida === undefined ? null : corte(redigir(p.saida)),
      p.erro ? 1 : 0,
      p.ms ?? 0,
    );
  } catch (e) {
    console.error("Replay: não consegui guardar o passo:", e);
  }
}

export interface Passo {
  id: number;
  ts: number;
  rodada: number;
  tipo: "texto" | "ferramenta";
  nome: string | null;
  entrada: string | null;
  saida: string | null;
  erro: boolean;
  ms: number;
}

export interface Execucao {
  id: string;
  agente: string | null;
  modelo: string;
  inicio: number;
  fim: number;
  passos: Passo[];
}

/** As execuções de um card, na ordem, com os passos de cada uma. */
export function execucoesDoCard(cardId: number): Execucao[] {
  const linhas = db.prepare("SELECT * FROM passos WHERE card_id = ? ORDER BY id").all(cardId) as Record<string, string | number | null>[];
  const porId = new Map<string, Execucao>();
  for (const r of linhas) {
    const id = r.execucao as string;
    let e = porId.get(id);
    if (!e) porId.set(id, (e = { id, agente: (r.agente as string | null) ?? null, modelo: r.modelo as string, inicio: r.ts as number, fim: r.ts as number, passos: [] }));
    e.fim = r.ts as number;
    e.passos.push({
      id: r.id as number,
      ts: r.ts as number,
      rodada: r.rodada as number,
      tipo: r.tipo as Passo["tipo"],
      nome: (r.nome as string | null) ?? null,
      entrada: (r.entrada as string | null) ?? null,
      saida: (r.saida as string | null) ?? null,
      erro: r.erro === 1,
      ms: r.ms as number,
    });
  }
  return [...porId.values()];
}

/** Passos de cards apagados ou muito antigos (mais de 90 dias) saem, para o banco não crescer sem fim. */
export function limparPassosAntigos() {
  db.prepare("DELETE FROM passos WHERE ts < ? OR card_id NOT IN (SELECT id FROM cards)").run(Date.now() - 90 * 24 * 3600_000);
}
