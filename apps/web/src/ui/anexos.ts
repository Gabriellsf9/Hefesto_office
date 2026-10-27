import { api } from "../api.ts";

// Imagens anexadas no chat: reduz no navegador (até 1600 px) e envia ao servidor local.

const LADO_MAX = 1600;

function lerComoDataUrl(arquivo: Blob): Promise<string> {
  return new Promise((ok, erro) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => erro(new Error("Não consegui ler a imagem."));
    r.readAsDataURL(arquivo);
  });
}

/** Imagem grande vira JPEG de até 1600 px (menos custo e dentro do limite da IA); pequena vai como está. */
async function preparar(arquivo: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(arquivo.type)) throw new Error("Use PNG, JPG, WEBP ou GIF.");
  const original = await lerComoDataUrl(arquivo);
  if (arquivo.type === "image/gif") return original;
  const img = new Image();
  img.src = original;
  await img.decode();
  const escala = Math.min(1, LADO_MAX / Math.max(img.width, img.height));
  if (escala === 1 && arquivo.size <= 3 * 1024 * 1024) return original;
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * escala);
  c.height = Math.round(img.height * escala);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.85);
}

export async function enviarImagem(arquivo: File): Promise<string> {
  const dados = await preparar(arquivo);
  const { url } = await api<{ url: string }>("/api/imagens", "POST", { dados });
  return url;
}

/** Arquivos de imagem de um colar (⌘V) ou de um arrastar e soltar. */
export function imagensDe(lista: DataTransferItemList | FileList | null | undefined): File[] {
  if (!lista) return [];
  const arquivos = "length" in lista && lista instanceof FileList ? [...lista] : [...(lista as DataTransferItemList)].map((i) => (i.kind === "file" ? i.getAsFile() : null));
  return arquivos.filter((f): f is File => !!f && f.type.startsWith("image/"));
}

/* ---------- Documentos (PDF, Word, Excel, PowerPoint, CSV, texto) ---------- */

export const EXT_DOCUMENTO = /\.(pdf|docx|doc|rtf|xlsx|pptx|csv|txt|md|json)$/i;

export async function enviarDocumento(arquivo: File): Promise<{ url: string; nome: string }> {
  if (!EXT_DOCUMENTO.test(arquivo.name)) throw new Error("Use PDF, Word, Excel, PowerPoint, CSV, TXT, Markdown ou JSON.");
  if (arquivo.size > 15 * 1024 * 1024) throw new Error("Arquivo grande demais (máximo 15 MB).");
  const dados = await lerComoDataUrl(arquivo);
  return api<{ url: string; nome: string }>("/api/arquivos", "POST", { nome: arquivo.name, dados });
}

/** Todos os arquivos de um colar ou arrastar (imagens e documentos). */
export function arquivosDe(lista: DataTransferItemList | FileList | null | undefined): File[] {
  if (!lista) return [];
  const arquivos = "length" in lista && lista instanceof FileList ? [...lista] : [...(lista as DataTransferItemList)].map((i) => (i.kind === "file" ? i.getAsFile() : null));
  return arquivos.filter((f): f is File => !!f && (f.type.startsWith("image/") || EXT_DOCUMENTO.test(f.name)));
}

/** Links de arquivos citados num texto em Markdown (entregas): [nome](/api/midia/...arquivos/...). */
export function arquivosCitados(texto: string): { url: string; nome: string }[] {
  const vistos = new Set<string>();
  return [...texto.matchAll(/\[([^\]]+)\]\((\/api\/midia\/(?:arquivos\/[a-f0-9-]{36}\.[a-z]+|\d+\/arquivos\/[^)\s]+))\)/g)]
    .filter((m) => !vistos.has(m[2]!) && vistos.add(m[2]!))
    .map((m) => ({ nome: m[1]!, url: m[2]! }));
}
