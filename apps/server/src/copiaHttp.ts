import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { basename, extname, join, normalize, sep } from "node:path";
import { ehSegredo } from "./agentes/arquivos.ts";

// Arquivos da cópia do projeto de um card, por HTTP e só para o navegador dos agentes (mesma máquina): um protótipo
// HTML, um relatório ou o build estático abre no navegador sem precisar subir servidor. Os caminhos relativos do
// HTML (css, js, imagens) resolvem dentro da mesma cópia. Arquivos de segredo nunca saem.

const TIPOS: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".htm": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp",
  ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8", ".pdf": "application/pdf",
};

/** Só o navegador dos agentes, que roda na mesma máquina do servidor. */
export const pedidoLocal = (ip: string) => ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";

/** O arquivo pedido dentro da raiz da cópia, ou null (fora da cópia, segredo, pasta ou inexistente). Pasta → index.html. */
export async function arquivoDaCopia(raiz: string, rel: string): Promise<{ caminho: string; tipo: string } | null> {
  const limpo = normalize(decodeURIComponent(rel || "index.html")).replace(/^[\\/]+/, "");
  const partes = limpo.split(/[\\/]/);
  if (partes.includes("..") || partes.includes(".git")) return null;
  const base = await realpath(raiz).catch(() => null);
  if (!base) return null;
  let alvo = await realpath(join(base, limpo)).catch(() => null);
  if (!alvo || (alvo !== base && !alvo.startsWith(base + sep))) return null;
  if ((await stat(alvo)).isDirectory()) alvo = join(alvo, "index.html");
  if (ehSegredo(basename(alvo))) return null;
  const info = await stat(alvo).catch(() => null);
  if (!info?.isFile()) return null;
  return { caminho: alvo, tipo: TIPOS[extname(alvo).toLowerCase()] ?? "application/octet-stream" };
}

export const lerArquivoDaCopia = (caminho: string) => createReadStream(caminho);
