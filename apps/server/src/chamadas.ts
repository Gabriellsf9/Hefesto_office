import { db } from "./db.ts";

// Rastreamento de cada chamada à IA: quem chamou, em que card, que modelo, tokens (incluindo o que veio
// do cache), custo, tempo e por que parou. Serve para achar desperdício com precisão (Operação → Chamadas).

db.exec(`CREATE TABLE IF NOT EXISTS chamadas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  card_id INTEGER,
  agente TEXT,
  modelo TEXT NOT NULL,
  rodada INTEGER NOT NULL,
  entrada INTEGER NOT NULL,
  saida INTEGER NOT NULL,
  cache_escrita INTEGER NOT NULL,
  cache_leitura INTEGER NOT NULL,
  usd REAL NOT NULL,
  ms INTEGER NOT NULL,
  parada TEXT
)`);
db.exec("CREATE INDEX IF NOT EXISTS chamadas_ts ON chamadas (ts)");
db.exec("CREATE INDEX IF NOT EXISTS chamadas_card ON chamadas (card_id)");

export interface Chamada {
  id: number;
  ts: number;
  cardId: number | null;
  agente: string | null;
  modelo: string;
  rodada: number;
  entrada: number;
  saida: number;
  cacheEscrita: number;
  cacheLeitura: number;
  usd: number;
  ms: number;
  parada: string | null;
}

export function registrarChamada(c: Omit<Chamada, "id" | "ts">) {
  db.prepare(
    "INSERT INTO chamadas (ts, card_id, agente, modelo, rodada, entrada, saida, cache_escrita, cache_leitura, usd, ms, parada) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(Date.now(), c.cardId, c.agente, c.modelo, c.rodada, c.entrada, c.saida, c.cacheEscrita, c.cacheLeitura, c.usd, c.ms, c.parada);
}

type Linha = Record<string, number | string | null>;
const deLinha = (r: Linha): Chamada => ({
  id: r.id as number,
  ts: r.ts as number,
  cardId: (r.card_id as number | null) ?? null,
  agente: (r.agente as string | null) ?? null,
  modelo: r.modelo as string,
  rodada: r.rodada as number,
  entrada: r.entrada as number,
  saida: r.saida as number,
  cacheEscrita: r.cache_escrita as number,
  cacheLeitura: r.cache_leitura as number,
  usd: r.usd as number,
  ms: r.ms as number,
  parada: (r.parada as string | null) ?? null,
});

export interface ResumoChamadas {
  chamadas: Chamada[];
  /** Totais do período: custo, tokens e quanto da entrada veio do cache (0 a 1). */
  total: { chamadas: number; usd: number; entrada: number; saida: number; cacheLeitura: number; taxaCache: number };
  porAgente: { agente: string; chamadas: number; usd: number; taxaCache: number }[];
  porModelo: { modelo: string; chamadas: number; usd: number }[];
  /** Os cards mais caros do período. */
  porCard: { cardId: number; chamadas: number; usd: number }[];
}

/** Resumo das últimas horas (padrão: 24 h) e as chamadas mais recentes. */
export function resumoChamadas(horas = 24, limite = 200): ResumoChamadas {
  const desde = Date.now() - horas * 3600_000;
  const linhas = db.prepare("SELECT * FROM chamadas WHERE ts >= ? ORDER BY id DESC").all(desde) as Linha[];
  const todas = linhas.map(deLinha);
  // Taxa de cache: quanto da entrada total (nova + escrita + lida) foi lida do cache.
  const taxa = (cs: Chamada[]) => {
    const lida = cs.reduce((t, c) => t + c.cacheLeitura, 0);
    const tudo = cs.reduce((t, c) => t + c.entrada + c.cacheEscrita + c.cacheLeitura, 0);
    return tudo ? lida / tudo : 0;
  };
  const agrupar = <K extends string | number>(chave: (c: Chamada) => K | null) => {
    const m = new Map<K, Chamada[]>();
    for (const c of todas) {
      const k = chave(c);
      if (k === null) continue;
      m.set(k, [...(m.get(k) ?? []), c]);
    }
    return [...m.entries()];
  };
  const soma = (cs: Chamada[]) => cs.reduce((t, c) => t + c.usd, 0);
  return {
    chamadas: todas.slice(0, limite),
    total: {
      chamadas: todas.length,
      usd: soma(todas),
      entrada: todas.reduce((t, c) => t + c.entrada, 0),
      saida: todas.reduce((t, c) => t + c.saida, 0),
      cacheLeitura: todas.reduce((t, c) => t + c.cacheLeitura, 0),
      taxaCache: taxa(todas),
    },
    porAgente: agrupar((c) => c.agente ?? "—")
      .map(([agente, cs]) => ({ agente, chamadas: cs.length, usd: soma(cs), taxaCache: taxa(cs) }))
      .sort((a, b) => b.usd - a.usd),
    porModelo: agrupar((c) => c.modelo)
      .map(([modelo, cs]) => ({ modelo, chamadas: cs.length, usd: soma(cs) }))
      .sort((a, b) => b.usd - a.usd),
    porCard: agrupar((c) => c.cardId)
      .map(([cardId, cs]) => ({ cardId, chamadas: cs.length, usd: soma(cs) }))
      .sort((a, b) => b.usd - a.usd)
      .slice(0, 15),
  };
}

/** Estimativa de custo de um card novo, pelo histórico de cards parecidos (mesma sala e tipo) já concluídos. */
export function estimativaDeCusto(sala: string, tipo: string): { min: number; tipico: number; max: number; amostras: number } | null {
  const linhas = db
    .prepare("SELECT custo_usd FROM cards WHERE sala = ? AND tipo = ? AND custo_usd > 0 AND demo = 0 ORDER BY id DESC LIMIT 40")
    .all(sala, tipo) as { custo_usd: number }[];
  if (linhas.length < 3) return null;
  const v = linhas.map((l) => l.custo_usd).sort((a, b) => a - b);
  const q = (p: number) => v[Math.min(v.length - 1, Math.floor(p * (v.length - 1)))]!;
  return { min: q(0.2), tipico: q(0.5), max: q(0.8), amostras: v.length };
}
