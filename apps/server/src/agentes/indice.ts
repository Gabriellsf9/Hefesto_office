import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { db } from "../db.ts";
import { IGNORAR, ehSegredo } from "./arquivos.ts";

// Índice do código: cada arquivo vira trechos (cortados nas declarações de topo), guardados numa busca de texto
// (SQLite FTS5) com os nomes de funções e tipos quebrados em palavras. O agente pergunta "onde o ticket é criado"
// e recebe os 6–8 trechos certos com arquivo:linha, em vez de ler o mapa do projeto inteiro (que nem cabe no
// modelo local). Atualiza sozinho: só relê os arquivos que mudaram desde a última busca.

db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS indice_codigo USING fts5(
  simbolos, palavras, texto, raiz UNINDEXED, caminho UNINDEXED, inicio UNINDEXED, fim UNINDEXED,
  tokenize = 'unicode61 remove_diacritics 2'
)`);
db.exec("CREATE TABLE IF NOT EXISTS indice_arquivos (raiz TEXT NOT NULL, caminho TEXT NOT NULL, mtime INTEGER NOT NULL, PRIMARY KEY (raiz, caminho))");
db.exec("CREATE TABLE IF NOT EXISTS indice_trechos (fts_id INTEGER PRIMARY KEY, raiz TEXT NOT NULL, caminho TEXT NOT NULL)");
db.exec("CREATE INDEX IF NOT EXISTS indice_trechos_arquivo ON indice_trechos (raiz, caminho)");

const EXT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|py|go|rs|java|kt|swift|rb|php|cs|sql|prisma|graphql|vue|svelte|css|scss|md|yml|yaml|toml)$/i;
const MAX_ARQUIVO = 300_000;
const MAX_ARQUIVOS = 8000;
const LINHAS_POR_TRECHO = 60;
/** Linha que abre uma declaração de topo (onde vale cortar um trecho). */
const DECLARACAO = /^(export\s+)?(default\s+)?(async\s+)?(function|class|interface|type|enum|const|let|def|func|struct|impl|fn|pub\s+fn|module|CREATE|ALTER|model|##?\s)/;
const NOME = /(?:function|class|interface|type|enum|const|let|def|func|struct|fn|model)\s+(?:\([^)]*\)\s*)?([A-Za-z_][\w$]*)|CREATE\s+(?:TABLE|INDEX|FUNCTION|VIEW|POLICY)\s+(?:IF\s+NOT\s+EXISTS\s+)?("?[\w.]+"?)|^#+\s+(.+)$/i;

/** "criarTicketDoBoard" → "criar Ticket Do Board"; "user_id" → "user id": a busca acha por palavra. */
export const palavras = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_$.\-/]+/g, " ");

interface Trecho {
  inicio: number;
  fim: number;
  simbolos: string;
  palavras: string;
  texto: string;
}

/** Corta o arquivo em trechos de até ~60 linhas, de preferência no começo de uma declaração. */
export function trechosDe(conteudo: string, caminho: string): Trecho[] {
  const linhas = conteudo.split("\n");
  const out: Trecho[] = [];
  let ini = 0;
  const fechar = (fim: number) => {
    if (fim <= ini) return;
    const pedaco = linhas.slice(ini, fim);
    const nomes = pedaco.flatMap((l) => {
      const m = NOME.exec(l.trim());
      return m ? [(m[1] ?? m[2] ?? m[3] ?? "").replace(/"/g, "")] : [];
    });
    out.push({ inicio: ini + 1, fim, simbolos: `${palavras(caminho)} ${nomes.map((n) => `${n} ${palavras(n)}`).join(" ")}`, palavras: palavras(pedaco.join(" ")), texto: pedaco.join("\n") });
    ini = fim;
  };
  for (let i = 1; i < linhas.length; i++) {
    const tamanho = i - ini;
    if ((tamanho >= 15 && DECLARACAO.test(linhas[i]!)) || tamanho >= LINHAS_POR_TRECHO) fechar(i);
  }
  fechar(linhas.length);
  return out;
}

async function arquivosDo(base: string): Promise<{ abs: string; rel: string; mtime: number; size: number }[]> {
  const out: { abs: string; rel: string; mtime: number; size: number }[] = [];
  const andar = async (pasta: string, nivel: number) => {
    if (nivel > 10 || out.length >= MAX_ARQUIVOS) return;
    for (const it of await readdir(pasta, { withFileTypes: true }).catch(() => [])) {
      if (IGNORAR.has(it.name) || (it.name.startsWith(".") && it.name !== ".github")) continue;
      const abs = join(pasta, it.name);
      if (it.isDirectory()) await andar(abs, nivel + 1);
      else if (EXT.test(it.name) && !ehSegredo(it.name) && !/\.min\.(js|css)$|\.d\.ts$|lock\./.test(it.name)) {
        const info = await stat(abs).catch(() => null);
        if (info && info.size <= MAX_ARQUIVO) out.push({ abs, rel: relative(base, abs).split(sep).join("/"), mtime: Math.floor(info.mtimeMs), size: info.size });
      }
    }
  };
  await andar(base, 0);
  return out;
}

/** Relê só o que mudou (e tira do índice o que foi apagado). Devolve quantos arquivos foram (re)indexados. */
export async function atualizarIndice(raiz: string): Promise<number> {
  const base = await realpath(raiz);
  const atuais = await arquivosDo(base);
  const salvos = new Map((db.prepare("SELECT caminho, mtime FROM indice_arquivos WHERE raiz = ?").all(base) as { caminho: string; mtime: number }[]).map((r) => [r.caminho, r.mtime]));
  const vistos = new Set(atuais.map((a) => a.rel));
  const mudaram = atuais.filter((a) => salvos.get(a.rel) !== a.mtime);
  const ins = db.prepare("INSERT INTO indice_codigo (simbolos, palavras, texto, raiz, caminho, inicio, fim) VALUES (?, ?, ?, ?, ?, ?, ?)");
  const liga = db.prepare("INSERT INTO indice_trechos (fts_id, raiz, caminho) VALUES (?, ?, ?)");
  const marca = db.prepare("INSERT OR REPLACE INTO indice_arquivos (raiz, caminho, mtime) VALUES (?, ?, ?)");
  let n = 0;
  // Em lotes: lê os arquivos (assíncrono) e grava o lote numa transação só, sem esperar nada no meio dela.
  for (let i = 0; i < mudaram.length; i += LOTE) {
    const lote = await Promise.all(mudaram.slice(i, i + LOTE).map(async (a) => ({ a, conteudo: await readFile(a.abs, "utf8").catch(() => null) })));
    db.exec("BEGIN");
    try {
      for (const { a, conteudo } of lote) {
        if (conteudo === null || conteudo.includes("\u0000")) continue;
        if (salvos.has(a.rel)) tirarDoIndice(base, a.rel);
        for (const t of trechosDe(conteudo, a.rel)) liga.run(Number(ins.run(t.simbolos, t.palavras, t.texto, base, a.rel, t.inicio, t.fim).lastInsertRowid), base, a.rel);
        marca.run(base, a.rel, a.mtime);
        n++;
      }
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
  for (const caminho of salvos.keys()) {
    if (vistos.has(caminho)) continue;
    tirarDoIndice(base, caminho);
    db.prepare("DELETE FROM indice_arquivos WHERE raiz = ? AND caminho = ?").run(base, caminho);
  }
  return n;
}

const LOTE = 200;

/** Apaga os trechos de um arquivo pelo id (apagar pela coluna sem índice varria a tabela inteira a cada arquivo). */
function tirarDoIndice(base: string, caminho: string) {
  db.prepare("DELETE FROM indice_codigo WHERE rowid IN (SELECT fts_id FROM indice_trechos WHERE raiz = ? AND caminho = ?)").run(base, caminho);
  db.prepare("DELETE FROM indice_trechos WHERE raiz = ? AND caminho = ?").run(base, caminho);
}

/** Palavras da pergunta viram uma busca "qualquer uma delas", ordenada pela relevância (BM25, nomes valem mais). */
export function consultaDe(pergunta: string): string | null {
  const termos = [...new Set(palavras(pergunta).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").match(/[a-z0-9]{3,}/g) ?? [])]
    .filter((t) => !PARADAS.has(t))
    .slice(0, 12);
  return termos.length ? termos.map((t) => `"${t}"*`).join(" OR ") : null;
}
const PARADAS = new Set(["que", "onde", "como", "qual", "quais", "para", "por", "com", "dos", "das", "uma", "uns", "sao", "esta", "isso", "the", "and", "for", "with", "where", "how", "what", "fica", "ficam", "faz", "feito", "codigo"]);

export interface Achado {
  caminho: string;
  inicio: number;
  fim: number;
  trecho: string;
}

/** Busca no índice da raiz (atualizando antes). Os trechos voltam com as linhas originais, até `max` caracteres no total. */
export async function buscarNoIndice(raiz: string, pergunta: string, limite = 8, max = 8000): Promise<Achado[]> {
  const consulta = consultaDe(pergunta);
  if (!consulta) return [];
  await atualizarIndice(raiz);
  const base = await realpath(raiz);
  const linhas = db
    .prepare("SELECT caminho, inicio, fim, texto FROM indice_codigo WHERE indice_codigo MATCH ? AND raiz = ? ORDER BY bm25(indice_codigo, 4.0, 1.0, 1.0) LIMIT ?")
    .all(consulta, base, limite) as { caminho: string; inicio: number; fim: number; texto: string }[];
  const out: Achado[] = [];
  let total = 0;
  for (const l of linhas) {
    const original = l.texto.split("\n");
    const corpo = original.slice(0, 30).map((t, i) => `${l.inicio + i}: ${t}`).join("\n") + (original.length > 30 ? "\n…" : "");
    if (total + corpo.length > max && out.length) break;
    total += corpo.length;
    out.push({ caminho: l.caminho, inicio: l.inicio, fim: l.fim, trecho: corpo });
  }
  return out;
}

export const formatarAchados = (achados: Achado[]) =>
  achados.length
    ? achados.map((a) => `## ${a.caminho}:${a.inicio}-${a.fim}\n${a.trecho}`).join("\n\n") + "\n\nPara ver mais, use ler_arquivo com inicio e fim."
    : "Nada encontrado no índice. Tente outras palavras (nomes de função, de tabela, de tela) ou buscar_no_codigo com o texto exato.";
