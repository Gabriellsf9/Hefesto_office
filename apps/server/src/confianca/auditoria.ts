import { createHash } from "node:crypto";
import { db } from "../db.ts";
import { redigir } from "./varredura.ts";

// Log de auditoria à prova de adulteração: cada registro guarda o hash do anterior (uma corrente).
// Mudar, apagar ou inserir um registro no meio quebra a corrente, e a verificação mostra onde.
// Registra as suas ações (tudo o que muda algo pela API) e as dos agentes que contam: entregas,
// aprovações, devoluções, merges, comandos e envios.

db.exec(`CREATE TABLE IF NOT EXISTS auditoria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  ator TEXT NOT NULL,
  acao TEXT NOT NULL,
  alvo TEXT,
  detalhe TEXT,
  anterior TEXT NOT NULL,
  hash TEXT NOT NULL
)`);

const GENESE = "0".repeat(64);

export interface RegistroAuditoria {
  id: number;
  ts: number;
  ator: string;
  acao: string;
  alvo: string | null;
  detalhe: string | null;
  anterior: string;
  hash: string;
}

const calcular = (r: Omit<RegistroAuditoria, "id" | "hash">) =>
  createHash("sha256").update(JSON.stringify([r.anterior, r.ts, r.ator, r.acao, r.alvo, r.detalhe])).digest("hex");

export function auditar(ator: string, acao: string, alvo?: string | number | null, detalhe?: string | null) {
  try {
    const ultimo = db.prepare("SELECT hash FROM auditoria ORDER BY id DESC LIMIT 1").get() as { hash: string } | undefined;
    const r = {
      ts: Date.now(),
      ator: ator.slice(0, 80),
      acao: acao.slice(0, 120),
      alvo: alvo === undefined || alvo === null ? null : String(alvo).slice(0, 200),
      detalhe: detalhe ? redigir(detalhe).slice(0, 2000) : null,
      anterior: ultimo?.hash ?? GENESE,
    };
    db.prepare("INSERT INTO auditoria (ts, ator, acao, alvo, detalhe, anterior, hash) VALUES (?, ?, ?, ?, ?, ?, ?)").run(r.ts, r.ator, r.acao, r.alvo, r.detalhe, r.anterior, calcular(r));
  } catch (e) {
    console.error("Auditoria: não consegui registrar:", e);
  }
}

export function listarAuditoria(o: { limite?: number; ator?: string; antesDe?: number } = {}): RegistroAuditoria[] {
  const lim = Math.min(500, Math.max(1, o.limite ?? 100));
  const onde: string[] = [];
  const args: (string | number)[] = [];
  if (o.ator) (onde.push("ator = ?"), args.push(o.ator));
  if (o.antesDe) (onde.push("id < ?"), args.push(o.antesDe));
  return db.prepare(`SELECT * FROM auditoria ${onde.length ? `WHERE ${onde.join(" AND ")}` : ""} ORDER BY id DESC LIMIT ?`).all(...args, lim) as unknown as RegistroAuditoria[];
}

/** Confere a corrente inteira. Devolve onde quebrou (o primeiro registro adulterado), se quebrou. */
export function verificarAuditoria(): { ok: boolean; registros: number; quebraEm: number | null; motivo: string | null } {
  let anterior = GENESE;
  let n = 0;
  for (const r of db.prepare("SELECT * FROM auditoria ORDER BY id").iterate() as Iterable<RegistroAuditoria>) {
    n++;
    if (r.anterior !== anterior) return { ok: false, registros: n, quebraEm: r.id, motivo: "o registro anterior foi apagado ou trocado" };
    if (calcular(r) !== r.hash) return { ok: false, registros: n, quebraEm: r.id, motivo: "o conteúdo deste registro foi alterado" };
    anterior = r.hash;
  }
  return { ok: true, registros: n, quebraEm: null, motivo: null };
}

/* ---------- Ações do CEO pela API ---------- */

/** Rotas que mudam algo e o que registrar delas. Corpo nunca vai inteiro: só campos seguros. */
const CAMPOS_SEGUROS = new Set(["coluna", "dono", "nivel", "prioridade", "titulo", "bloqueado", "pausado", "modoCusto", "orcamentoDiarioUsd", "maxSimultaneos", "limiteCardUsd", "limiteCodigoUsd", "ativo", "sombraPct", "localPrimeiro", "abAutomatico", "agente", "modelo", "orcamentoUsd", "autocritica", "advogado", "licoes", "atacante", "vereditoCeo", "decisao"]);
const ROTA_SECRETA = /\/(chave|key|github|telegram|whatsapp|segredos?|provedores|oauth|conexao|producao\/?$|nuvem)/i;

export function auditarRequisicao(metodo: string, url: string, status: number, corpo: unknown) {
  if (metodo === "GET" || metodo === "HEAD" || metodo === "OPTIONS" || status >= 400) return;
  const caminho = url.split("?")[0]!;
  // Barulho que não muda nada de importante (presença, digitação).
  if (/^\/api\/(presenca|digitando|ping)/.test(caminho)) return;
  let detalhe: string | null = null;
  if (!ROTA_SECRETA.test(caminho) && corpo && typeof corpo === "object" && !Array.isArray(corpo)) {
    const campos = Object.entries(corpo as Record<string, unknown>).filter(([k, v]) => CAMPOS_SEGUROS.has(k) && (typeof v !== "object" || v === null));
    if (campos.length) detalhe = campos.map(([k, v]) => `${k}=${String(v).slice(0, 80)}`).join(", ");
    else if (typeof (corpo as { texto?: unknown }).texto === "string") detalhe = `texto: ${String((corpo as { texto: string }).texto).slice(0, 300)}`;
  } else if (ROTA_SECRETA.test(caminho)) detalhe = "(conteúdo não registrado: configuração com segredo)";
  auditar("voce", `${metodo} ${caminho}`, /\/(\d+)(?:\/|$)/.exec(caminho)?.[1] ?? null, detalhe);
}
