import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

// Ferramentas de comparação para o validador e para o motor:
// - o que mudou entre duas versões de uma entrega (diff de linhas, pelo git, que existe no Mac e no Docker);
// - se duas devoluções seguidas dizem praticamente a mesma coisa (autor e validador andando em círculo).

const run = promisify(execFile);

/** Diff unificado entre duas versões de texto (só as linhas mudadas, com 1 de contexto). Vazio se iguais. */
export async function diferencaDeTexto(antes: string, depois: string, max = 12_000): Promise<string> {
  if (antes === depois) return "";
  const pasta = mkdtempSync(join(tmpdir(), "hefesto-diff-"));
  try {
    writeFileSync(join(pasta, "anterior.md"), antes);
    writeFileSync(join(pasta, "atual.md"), depois);
    const r = await run("git", ["diff", "--no-index", "--no-color", "-U1", "anterior.md", "atual.md"], { cwd: pasta, maxBuffer: 20 * 1024 * 1024 }).catch(
      // git diff --no-index sai com código 1 quando há diferença: a saída vem no erro.
      (e: { stdout?: string }) => ({ stdout: e.stdout ?? "" }),
    );
    const linhas = r.stdout.split("\n").filter((l) => !l.startsWith("diff --git") && !l.startsWith("index ") && !l.startsWith("--- ") && !l.startsWith("+++ "));
    const texto = linhas.join("\n").trim();
    return texto.length > max ? `${texto.slice(0, max)}\n…(diferença cortada)` : texto;
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
}

const palavras = (t: string) =>
  new Set(
    t
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .split(/[^a-z0-9]+/)
      .filter((p) => p.length > 3),
  );

/** Semelhança entre dois textos (0 a 1), pelas palavras em comum. */
export function semelhanca(a: string, b: string): number {
  const x = palavras(a);
  const y = palavras(b);
  if (!x.size || !y.size) return 0;
  let comum = 0;
  for (const p of x) if (y.has(p)) comum++;
  return comum / (x.size + y.size - comum);
}
