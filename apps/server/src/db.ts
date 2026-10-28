import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import type { ChatMessage, FeedItem } from "@empresa/shared";
import { DATA_DIR } from "./paths.ts";

export const db = new DatabaseSync(join(DATA_DIR, "empresa.db"));

db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS feed (
    id       TEXT PRIMARY KEY,
    ts       INTEGER NOT NULL,
    sala     TEXT NOT NULL,
    agente_id TEXT,
    texto    TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS chat (
    id    TEXT PRIMARY KEY,
    ts    INTEGER NOT NULL,
    de    TEXT NOT NULL,
    texto TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS livro (
    secao         TEXT PRIMARY KEY,
    conteudo      TEXT NOT NULL,
    atualizado_em INTEGER NOT NULL,
    revisada      INTEGER NOT NULL DEFAULT 0
  );
  -- Histórico da entrevista exatamente como foi enviado à API (só cresce, nunca é editado).
  CREATE TABLE IF NOT EXISTS onboarding_msgs (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    ts       INTEGER NOT NULL,
    papel    TEXT NOT NULL,
    conteudo TEXT NOT NULL,
    texto    TEXT NOT NULL,
    visivel  INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS uso (
    dia TEXT PRIMARY KEY,
    usd REAL NOT NULL
  );
`);

export function getSetting(key: string): string | null {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string) {
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

export function deleteSetting(key: string) {
  db.prepare("DELETE FROM settings WHERE key = ?").run(key);
}

export function insertFeed(item: FeedItem) {
  db.prepare("INSERT INTO feed (id, ts, sala, agente_id, texto) VALUES (?, ?, ?, ?, ?)").run(
    item.id, item.ts, item.sala, item.agenteId, item.texto,
  );
}

export function recentFeed(limit = 200): FeedItem[] {
  const rows = db.prepare("SELECT id, ts, sala, agente_id, texto FROM feed ORDER BY ts DESC LIMIT ?").all(limit) as {
    id: string; ts: number; sala: FeedItem["sala"]; agente_id: string | null; texto: string;
  }[];
  return rows.reverse().map((r) => ({ id: r.id, ts: r.ts, sala: r.sala, agenteId: r.agente_id, texto: r.texto }));
}

export function insertChat(m: ChatMessage) {
  db.prepare("INSERT INTO chat (id, ts, de, texto, imagens, arquivos, opcoes, recomendacao) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
    m.id, m.ts, m.de, m.texto, m.imagens?.length ? JSON.stringify(m.imagens) : null, m.arquivos?.length ? JSON.stringify(m.arquivos) : null, m.opcoes?.length ? JSON.stringify(m.opcoes) : null,
    m.recomendacao ? JSON.stringify(m.recomendacao) : null,
  );
}

export function recentChat(limit = 100): ChatMessage[] {
  const rows = db.prepare("SELECT id, ts, de, texto, imagens, arquivos, opcoes, recomendacao FROM chat ORDER BY ts DESC LIMIT ?").all(limit) as {
    id: string; ts: number; de: string; texto: string; imagens: string | null; arquivos: string | null; opcoes: string | null; recomendacao: string | null;
  }[];
  return rows.reverse().map((r) => ({
    id: r.id, ts: r.ts, de: r.de, texto: r.texto,
    ...(r.imagens ? { imagens: JSON.parse(r.imagens) as string[] } : {}),
    ...(r.arquivos ? { arquivos: JSON.parse(r.arquivos) as { url: string; nome: string }[] } : {}),
    ...(r.opcoes ? { opcoes: JSON.parse(r.opcoes) as string[] } : {}),
    ...(r.recomendacao ? { recomendacao: JSON.parse(r.recomendacao) as { opcao: number; motivo: string } } : {}),
  }));
}

/** Adiciona uma coluna a uma tabela existente, se ainda não existir (migração simples). */
export function garantirColuna(tabela: string, coluna: string, definicao: string) {
  const cols = db.prepare(`PRAGMA table_info(${tabela})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === coluna)) db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${definicao}`);
}

// Imagens anexadas no chat (endereços), adicionadas depois da criação da tabela.
garantirColuna("chat", "imagens", "TEXT");
garantirColuna("chat", "arquivos", "TEXT");
garantirColuna("chat", "opcoes", "TEXT");
garantirColuna("chat", "recomendacao", "TEXT");
