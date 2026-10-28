import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { DATA_DIR } from "./paths.ts";
import { ErroCard } from "./tarefas.ts";

// Imagens que o CEO envia no chat (prints de bug, referências de design, fotos de documento).
// Ficam em data/midia/chat; a Helena e os agentes enxergam (visão do Claude) e os cards criados a
// partir da mensagem levam as imagens junto, para quem trabalha e quem valida.

export const PASTA_IMAGENS = join(DATA_DIR, "midia", "chat");
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_POR_MENSAGEM = 6;
const TIPOS: Record<string, { ext: string; media: "image/png" | "image/jpeg" | "image/webp" | "image/gif"; magica: (b: Buffer) => boolean }> = {
  "image/png": { ext: "png", media: "image/png", magica: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  "image/jpeg": { ext: "jpg", media: "image/jpeg", magica: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  "image/webp": { ext: "webp", media: "image/webp", magica: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
  "image/gif": { ext: "gif", media: "image/gif", magica: (b) => b.subarray(0, 6).toString("latin1").startsWith("GIF8") },
};
const POR_EXT = Object.fromEntries(Object.values(TIPOS).map((t) => [t.ext, t]));

/** Endereço de uma imagem do chat (o mesmo usado no Markdown dos cards). */
export const RE_IMAGEM = /\/api\/midia\/chat\/([a-f0-9-]{36}\.(?:png|jpg|webp|gif))/g;
/** Prints e imagens que os agentes salvaram num card (telas desenhadas, capturas do app). */
const RE_IMAGEM_DE_CARD = /\/api\/midia\/(\d+)\/([a-z0-9-]+\.(?:png|jpg))/g;
export const nomeValido = (n: string) => /^[a-f0-9-]{36}\.(png|jpg|webp|gif)$/.test(n);

/** Arquivo no disco de um endereço de imagem (do chat ou de um card), ou null se não for um dos dois. */
function caminhoDaImagem(url: string): string | null {
  const chat = /^\/api\/midia\/chat\/([a-f0-9-]{36}\.(?:png|jpg|webp|gif))$/.exec(url);
  if (chat) return join(PASTA_IMAGENS, chat[1]!);
  const card = /^\/api\/midia\/(\d+)\/([a-z0-9-]+\.(?:png|jpg))$/.exec(url);
  return card ? join(DATA_DIR, "midia", card[1]!, card[2]!) : null;
}

/** Recebe a imagem como data URL (base64), confere tipo e tamanho de verdade e grava. */
export function salvarImagem(dataUrl: unknown): { url: string } {
  if (typeof dataUrl !== "string") throw new ErroCard("Envie a imagem como data URL.");
  const m = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw new ErroCard("Formato não suportado: use PNG, JPG, WEBP ou GIF.");
  const tipo = TIPOS[m[1]!]!;
  const bytes = Buffer.from(m[2]!, "base64");
  if (bytes.length > MAX_BYTES) throw new ErroCard("Imagem grande demais (máximo 5 MB).");
  if (!tipo.magica(bytes)) throw new ErroCard("O arquivo não é uma imagem válida.");
  mkdirSync(PASTA_IMAGENS, { recursive: true });
  const nome = `${randomUUID()}.${tipo.ext}`;
  writeFileSync(join(PASTA_IMAGENS, nome), bytes);
  return { url: `/api/midia/chat/${nome}` };
}

/** Só endereços de imagens que existem de verdade (o que vier do navegador é conferido). */
export function filtrarImagens(urls: unknown): string[] {
  if (!Array.isArray(urls)) return [];
  return [...new Set(urls.filter((u): u is string => typeof u === "string"))]
    .filter((u) => {
      const caminho = caminhoDaImagem(u);
      return !!caminho && existsSync(caminho);
    })
    .slice(0, MAX_POR_MENSAGEM);
}

/** Imagens citadas num texto (descrição de card, entrega): do chat e as que os agentes salvaram nos cards. */
export function imagensDoTexto(texto: string): string[] {
  return filtrarImagens([
    ...[...texto.matchAll(RE_IMAGEM)].map((m) => `/api/midia/chat/${m[1]}`),
    ...[...texto.matchAll(RE_IMAGEM_DE_CARD)].map((m) => `/api/midia/${m[1]}/${m[2]}`),
  ]);
}

/** Blocos de imagem para a API (visão), lidos do disco. */
export function blocosDeImagem(urls: string[]): Anthropic.Beta.BetaImageBlockParam[] {
  return filtrarImagens(urls).map((u) => {
    const tipo = POR_EXT[u.split(".").pop()!]!;
    return { type: "image", source: { type: "base64", media_type: tipo.media, data: readFileSync(caminhoDaImagem(u)!).toString("base64") } };
  });
}

/** Markdown para anexar as imagens à descrição de um card. */
export const imagensEmMarkdown = (urls: string[]) => (urls.length ? `\n\n## Imagens enviadas pelo CEO\n${urls.map((u, i) => `![Imagem ${i + 1}](${u})`).join("\n")}` : "");
