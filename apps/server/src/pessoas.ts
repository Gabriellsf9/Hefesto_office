import { randomBytes } from "node:crypto";
import { db } from "./db.ts";

// Pessoas do time: gente de verdade que pode ser dona de um card (o motor não roda cards delas).
// Elas são avisadas pelo chat do Telegram pareado (pareie um grupo do time para todos verem);
// não há login delas no Hefesto: o painel continua só no seu Mac.

db.exec(`CREATE TABLE IF NOT EXISTS pessoas (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  papel TEXT NOT NULL DEFAULT '',
  telegram TEXT NOT NULL DEFAULT '',
  criado_em INTEGER NOT NULL
)`);

export interface Pessoa {
  id: string;
  nome: string;
  papel: string;
  /** @usuario no Telegram, para a menção no grupo pareado. */
  telegram: string;
}

export const PREFIXO_PESSOA = "pessoa:";
export const ehPessoa = (id: string | null | undefined): boolean => !!id && id.startsWith(PREFIXO_PESSOA) && !!db.prepare("SELECT 1 FROM pessoas WHERE id = ?").get(id);
export const listarPessoas = () => db.prepare("SELECT id, nome, papel, telegram FROM pessoas ORDER BY nome").all() as unknown as Pessoa[];
export const lerPessoa = (id: string) => (db.prepare("SELECT id, nome, papel, telegram FROM pessoas WHERE id = ?").get(id) as Pessoa | undefined) ?? null;

export function salvarPessoa(p: { id?: string; nome: string; papel?: string; telegram?: string }): Pessoa {
  const nome = String(p.nome ?? "").trim().slice(0, 80);
  if (!nome) throw new Error("Dê o nome da pessoa.");
  const telegram = String(p.telegram ?? "").trim().replace(/^@/, "").slice(0, 40);
  if (telegram && !/^[A-Za-z0-9_]{5,32}$/.test(telegram)) throw new Error("Usuário do Telegram inválido.");
  const id = p.id && p.id.startsWith(PREFIXO_PESSOA) ? p.id : `${PREFIXO_PESSOA}${randomBytes(4).toString("hex")}`;
  db.prepare("INSERT INTO pessoas (id, nome, papel, telegram, criado_em) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET nome = excluded.nome, papel = excluded.papel, telegram = excluded.telegram").run(
    id,
    nome,
    String(p.papel ?? "").trim().slice(0, 80),
    telegram,
    Date.now(),
  );
  return lerPessoa(id)!;
}

/** Remove a pessoa. Quem chama confere antes se ela ainda é dona de cards abertos. */
export function removerPessoa(id: string) {
  db.prepare("DELETE FROM pessoas WHERE id = ?").run(id);
}
