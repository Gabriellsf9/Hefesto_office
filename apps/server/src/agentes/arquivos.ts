import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { basename, join, relative, sep } from "node:path";

// Leitura do projeto do CEO pelos agentes (raio-x, contexto de tarefas).
// Somente leitura, presa à pasta do projeto, e sem tocar em arquivos de segredo.

const IGNORAR = new Set([
  "node_modules", ".git", "dist", "build", ".next", ".nuxt", "out", "target", "vendor", ".venv", "venv", "__pycache__",
  ".turbo", ".cache", "coverage", ".idea", ".vscode", "Pods", ".gradle", ".dart_tool",
]);

const SEGREDO = /^\.env|\.(pem|key|p12|pfx|keystore|jks)$|^id_(rsa|ed25519|ecdsa|dsa)|^credentials|secret|^\.npmrc$|^\.netrc$|^\.pgpass$/i;

export const ehSegredo = (nome: string) => SEGREDO.test(basename(nome));

const MAX_LEITURA = 120_000;

export class ErroArquivo extends Error {}

/** Resolve um caminho relativo garantindo que ele fica dentro da raiz do projeto. */
async function dentro(raiz: string, rel: string) {
  const base = await realpath(raiz);
  let alvo: string;
  try {
    alvo = await realpath(join(base, rel || "."));
  } catch {
    throw new ErroArquivo(`Não existe: ${rel}`);
  }
  if (alvo !== base && !alvo.startsWith(base + sep)) throw new ErroArquivo("Caminho fora do projeto.");
  return { base, alvo };
}

export async function listarArquivos(raiz: string, rel = ".", profundidade = 2): Promise<string> {
  const { base, alvo } = await dentro(raiz, rel);
  const linhas: string[] = [];
  const andar = async (dir: string, nivel: number) => {
    if (linhas.length >= 400) return;
    const itens = (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
    for (const it of itens) {
      if (linhas.length >= 400) {
        linhas.push("… (lista cortada em 400 itens)");
        return;
      }
      if (IGNORAR.has(it.name)) continue;
      const caminho = join(dir, it.name);
      const recuo = "  ".repeat(nivel);
      if (it.isDirectory()) {
        linhas.push(`${recuo}${it.name}/`);
        if (nivel + 1 < profundidade) await andar(caminho, nivel + 1);
      } else {
        linhas.push(`${recuo}${it.name}${ehSegredo(it.name) ? "  (segredo: não pode ser lido)" : ""}`);
      }
    }
  };
  await andar(alvo, 0);
  return `${relative(base, alvo) || "."}/\n${linhas.join("\n")}`;
}

export async function lerArquivo(raiz: string, rel: string, inicio?: number, fim?: number): Promise<string> {
  if (ehSegredo(rel)) throw new ErroArquivo("Arquivo de segredo: os agentes não podem ler. Peça ao CEO se for realmente necessário.");
  const { alvo } = await dentro(raiz, rel);
  const info = await stat(alvo);
  if (!info.isFile()) throw new ErroArquivo("Não é um arquivo.");
  const buf = await readFile(alvo);
  if (buf.subarray(0, 8000).includes(0)) throw new ErroArquivo("Arquivo binário.");
  const todas = buf.toString("utf8").split("\n");
  const a = Math.max(1, inicio ?? 1);
  const b = Math.min(todas.length, fim ?? todas.length);
  let saida = "";
  for (let i = a; i <= b; i++) {
    const linha = `${i}\t${todas[i - 1]}\n`;
    if (saida.length + linha.length > MAX_LEITURA) {
      saida += `… (cortado na linha ${i - 1} de ${todas.length}; peça um intervalo com inicio/fim)`;
      break;
    }
    saida += linha;
  }
  return saida || "(arquivo vazio)";
}

export async function buscarNoCodigo(raiz: string, texto: string): Promise<string> {
  const base = await realpath(raiz);
  const q = texto.toLowerCase();
  const achados: string[] = [];
  let arquivos = 0;
  const andar = async (dir: string) => {
    for (const it of await readdir(dir, { withFileTypes: true })) {
      if (achados.length >= 100 || arquivos >= 4000) return;
      if (IGNORAR.has(it.name)) continue;
      const caminho = join(dir, it.name);
      if (it.isDirectory()) await andar(caminho);
      else if (it.isFile() && !ehSegredo(it.name)) {
        arquivos++;
        const info = await stat(caminho);
        if (info.size > 500_000) continue;
        const buf = await readFile(caminho);
        if (buf.subarray(0, 8000).includes(0)) continue;
        buf.toString("utf8").split("\n").forEach((linha, i) => {
          if (achados.length < 100 && linha.toLowerCase().includes(q)) {
            achados.push(`${relative(base, caminho)}:${i + 1}: ${linha.trim().slice(0, 200)}`);
          }
        });
      }
    }
  };
  await andar(base);
  return achados.length ? achados.join("\n") : "Nada encontrado.";
}
