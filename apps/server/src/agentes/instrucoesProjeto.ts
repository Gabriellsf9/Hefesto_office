import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Instruções que o próprio projeto deixa para agentes de IA (AGENTS.md, CLAUDE.md, .github/copilot-instructions.md),
// como o Claude Code e o Codex leem: convenções, comandos, o que não fazer. Vão para o autor e para o validador de todo
// card do projeto. Procura na pasta vinculada e, se o repositório estiver numa subpasta (o Parliamo), lá dentro.

const ARQUIVOS = ["AGENTS.md", "CLAUDE.md", ".github/copilot-instructions.md"];

const cache = new Map<string, { chave: string; texto: string }>();

/** Pastas candidatas: a vinculada e, se ela não é um repositório, as subpastas de primeiro nível que são. */
function raizesDe(pasta: string): string[] {
  if (existsSync(join(pasta, ".git"))) return [pasta];
  try {
    const subs = readdirSync(pasta, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith(".") && existsSync(join(pasta, d.name, ".git")))
      .map((d) => join(pasta, d.name));
    return [pasta, ...subs];
  } catch {
    return [pasta];
  }
}

/** Os arquivos de instrução encontrados, na ordem de ARQUIVOS, com o nome relativo. */
export function arquivosDeInstrucao(pasta: string): { nome: string; texto: string }[] {
  const achados: { nome: string; texto: string; mtime: number }[] = [];
  for (const raiz of raizesDe(pasta)) {
    for (const nome of ARQUIVOS) {
      const caminho = join(raiz, nome);
      try {
        const info = statSync(caminho);
        if (!info.isFile() || info.size > 200_000) continue;
        achados.push({ nome, texto: "", mtime: info.mtimeMs });
        achados[achados.length - 1]!.texto = readFileSync(caminho, "utf8");
      } catch {
        // não existe
      }
    }
  }
  return achados.map(({ nome, texto }) => ({ nome, texto }));
}

/** Bloco para a mensagem do card, cortado em `max` caracteres no total (o modelo local recebe menos). */
export function instrucoesDoProjeto(pasta: string | null | undefined, max = 12_000): string {
  if (!pasta) return "";
  const arquivos = arquivosDeInstrucao(pasta);
  if (!arquivos.length) return "";
  const chave = `${max}:${arquivos.map((a) => `${a.nome}:${a.texto.length}`).join("|")}`;
  const salvo = cache.get(pasta);
  if (salvo?.chave === chave) return salvo.texto;
  let resto = max;
  const partes: string[] = [];
  // Projetos costumam repetir as mesmas regras no AGENTS.md e no CLAUDE.md (no Parliamo, 71 de 123 linhas): a linha
  // que já veio num arquivo anterior não entra de novo (economiza contexto, que no modelo local é curto).
  const vistas = new Set<string>();
  for (const a of arquivos) {
    if (resto <= 200) break;
    const linhas = a.texto.split("\n");
    const novas = linhas.filter((l) => l.trim().length <= 20 || !vistas.has(l.trim()));
    for (const l of linhas) if (l.trim().length > 20) vistas.add(l.trim());
    const texto = novas.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    if (!novas.some((l) => l.trim().length > 20)) continue; // só repetia o anterior (sobraram títulos)
    const trecho = texto.slice(0, resto);
    const repetidas = linhas.length - novas.length;
    partes.push(`### ${a.nome}${repetidas ? ` (sem as ${repetidas} linhas iguais às de cima)` : ""}\n${trecho}${texto.length > resto ? `\n…(cortado: leia o arquivo inteiro com ler_arquivo ${a.nome})` : ""}`);
    resto -= trecho.length;
  }
  const texto = `## Instruções do próprio projeto para agentes (siga como regra do projeto)\n${partes.join("\n\n")}`;
  cache.set(pasta, { chave, texto });
  return texto;
}
