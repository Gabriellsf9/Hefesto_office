import { realpathSync } from "node:fs";
import { join, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import pg from "pg";
import type { ConexaoBanco } from "@empresa/shared";
import { db } from "../db.ts";
import { apagarSegredo, lerSegredo, salvarSegredo } from "../secrets.ts";
import { ErroCard } from "../tarefas.ts";
import { ErroEntrada, ferramenta, texto, type Ferramenta } from "../agentes/loop.ts";

// Dados & Banco de Dados (Fase 6): consultas SÓ DE LEITURA no banco do projeto.
// - SQLite: arquivo dentro do projeto, aberto em modo somente leitura.
// - Postgres: conexão guardada cifrada; cada consulta roda numa transação READ ONLY com tempo máximo.
// Só SELECT, WITH e EXPLAIN; e-mails, CPFs e telefones saem mascarados (os resultados vão para a IA).

db.exec(`
  CREATE TABLE IF NOT EXISTS conexoes (
    projeto_id INTEGER PRIMARY KEY,
    tipo       TEXT NOT NULL,
    caminho    TEXT,
    resumo     TEXT NOT NULL,
    criado_em  INTEGER NOT NULL
  );
`);

const MAX_LINHAS = 100;
const TEMPO_MAX_MS = 15_000;
const segredo = (projetoId: number) => `banco_projeto_${projetoId}`;

export function conexaoDoProjeto(projetoId: number | null): ConexaoBanco | null {
  if (projetoId === null) return null;
  const r = db.prepare("SELECT tipo, caminho, resumo FROM conexoes WHERE projeto_id = ?").get(projetoId) as
    | { tipo: ConexaoBanco["tipo"]; caminho: string | null; resumo: string }
    | undefined;
  return r ? { tipo: r.tipo, resumo: r.resumo } : null;
}

/** Configura a conexão (o CEO). A URL do Postgres fica cifrada; a tela só vê o resumo (host e banco). */
export function configurarConexao(projetoId: number, raizProjeto: string, d: { tipo?: string; caminho?: string; url?: string }): ConexaoBanco {
  if (d.tipo === "sqlite") {
    const rel = (d.caminho ?? "").trim();
    if (!rel) throw new ErroCard("Informe o caminho do arquivo SQLite dentro do projeto.");
    let alvo: string;
    try {
      alvo = realpathSync(join(raizProjeto, rel));
    } catch {
      throw new ErroCard("Arquivo SQLite não encontrado dentro do projeto.");
    }
    const base = realpathSync(raizProjeto);
    if (!alvo.startsWith(base + sep)) throw new ErroCard("O arquivo precisa estar dentro do projeto.");
    db.prepare("INSERT OR REPLACE INTO conexoes (projeto_id, tipo, caminho, resumo, criado_em) VALUES (?, 'sqlite', ?, ?, ?)").run(projetoId, alvo, `SQLite · ${rel}`, Date.now());
    apagarSegredo(segredo(projetoId));
  } else if (d.tipo === "postgres") {
    const url = (d.url ?? "").trim();
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      throw new ErroCard("URL inválida. Formato: postgres://usuario:senha@host:5432/banco");
    }
    if (!["postgres:", "postgresql:"].includes(u.protocol)) throw new ErroCard("A URL precisa começar com postgres://");
    salvarSegredo(segredo(projetoId), url);
    db.prepare("INSERT OR REPLACE INTO conexoes (projeto_id, tipo, caminho, resumo, criado_em) VALUES (?, 'postgres', NULL, ?, ?)").run(projetoId, `Postgres · ${u.hostname}${u.pathname}`, Date.now());
  } else throw new ErroCard("Tipo de banco inválido (sqlite ou postgres).");
  return conexaoDoProjeto(projetoId)!;
}

export function removerConexao(projetoId: number) {
  db.prepare("DELETE FROM conexoes WHERE projeto_id = ?").run(projetoId);
  apagarSegredo(segredo(projetoId));
}

/* ---------- Segurança da consulta ---------- */

/** Só uma instrução, e só leitura (SELECT, WITH… SELECT, EXPLAIN de SELECT). */
export function validarSql(sql: string): string {
  const limpo = sql
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .trim()
    .replace(/;\s*$/, "");
  if (!limpo) throw new ErroEntrada("SQL vazio.");
  if (limpo.includes(";")) throw new ErroEntrada("Uma instrução por vez (sem ;).");
  if (!/^(select|with|explain)\b/i.test(limpo)) throw new ErroEntrada("Só consultas de leitura: SELECT, WITH ou EXPLAIN.");
  if (/\b(insert|update|delete|merge|drop|alter|create|truncate|grant|revoke|copy|vacuum|attach|detach|pragma|call|lock|refresh|reindex|cluster|listen|notify)\b/i.test(limpo.replace(/'[^']*'/g, "''"))) {
    throw new ErroEntrada("A consulta tem um comando que altera dados ou configuração. Só leitura é permitida.");
  }
  return limpo;
}

/** Mascara dados pessoais comuns antes de mandar o resultado para a IA (LGPD). */
export function mascarar(v: unknown): string {
  if (v === null || v === undefined) return "∅";
  let s = v instanceof Date ? v.toISOString() : typeof v === "object" ? JSON.stringify(v) : String(v);
  s = s.replace(/([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, "$1***@$2");
  s = s.replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "***.***.***-**");
  s = s.replace(/\(?\b\d{2}\)?\s?9?\d{4}-?\d{4}\b/g, "(**) *****-****");
  return s.length > 200 ? `${s.slice(0, 200)}…` : s;
}

function emTabela(colunas: string[], linhas: Record<string, unknown>[], total: number): string {
  if (!colunas.length) return "(sem colunas)";
  const cab = `| ${colunas.join(" | ")} |\n| ${colunas.map(() => "---").join(" | ")} |`;
  const corpo = linhas.map((l) => `| ${colunas.map((c) => mascarar(l[c]).replace(/\|/g, "\\|").replace(/\n/g, " ")).join(" | ")} |`).join("\n");
  return `${cab}\n${corpo}${total > linhas.length ? `\n\n(${total} linhas; mostrando ${linhas.length})` : `\n\n(${total} linha${total === 1 ? "" : "s"})`}`;
}

export async function consultar(projetoId: number, sqlBruto: string): Promise<string> {
  const sql = validarSql(sqlBruto);
  const r = db.prepare("SELECT tipo, caminho FROM conexoes WHERE projeto_id = ?").get(projetoId) as { tipo: string; caminho: string | null } | undefined;
  if (!r) throw new ErroEntrada("Este projeto não tem banco configurado.");
  if (r.tipo === "sqlite") {
    const banco = new DatabaseSync(r.caminho!, { readOnly: true });
    try {
      const linhas = banco.prepare(sql).all() as Record<string, unknown>[];
      return emTabela(linhas[0] ? Object.keys(linhas[0]) : [], linhas.slice(0, MAX_LINHAS), linhas.length);
    } catch (e) {
      throw new ErroEntrada(`Erro do banco: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      banco.close();
    }
  }
  const url = lerSegredo(segredo(projetoId));
  if (!url) throw new ErroEntrada("Conexão do Postgres não encontrada; configure de novo.");
  const cliente = new pg.Client({ connectionString: url, statement_timeout: TEMPO_MAX_MS, query_timeout: TEMPO_MAX_MS + 2000, connectionTimeoutMillis: 8000 });
  try {
    await cliente.connect();
    await cliente.query("BEGIN READ ONLY");
    const res = await cliente.query(sql);
    await cliente.query("ROLLBACK");
    return emTabela(res.fields.map((f) => f.name), res.rows.slice(0, MAX_LINHAS), res.rowCount ?? res.rows.length);
  } catch (e) {
    throw new ErroEntrada(`Erro do banco: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    await cliente.end().catch(() => {});
  }
}

/** Ferramenta para o time de Dados (DBA, Engenharia, Análise, Product Analytics). */
export function ferramentaDeBanco(projetoId: number): Ferramenta {
  const c = conexaoDoProjeto(projetoId);
  return ferramenta(
    "consultar_banco",
    `Consulta SÓ DE LEITURA no banco do projeto (${c?.resumo ?? "banco"}): SELECT, WITH ou EXPLAIN, uma instrução por vez, até ${MAX_LINHAS} linhas, ${TEMPO_MAX_MS / 1000} s no máximo. E-mails, CPFs e telefones chegam mascarados. Para mudar dados ou estrutura, escreva a migração na entrega (com rollback): quem aplica é o CEO.`,
    { sql: { type: "string" } },
    ["sql"],
    async (e) => ({ texto: await consultar(projetoId, texto(e, "sql", 20_000)) }),
  );
}
