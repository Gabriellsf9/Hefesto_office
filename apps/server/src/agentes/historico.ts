import { execFile } from "node:child_process";
import { ehSegredo } from "./arquivos.ts";

// Histórico do git de um arquivo (como o git log/blame que o Claude Code e o Codex rodam): por que o código está
// assim, quem mudou e quando. Só leitura, dentro do repositório do projeto.

const git = (raiz: string, args: string[]) =>
  new Promise<string>((ok, falha) =>
    execFile("git", ["-C", raiz, ...args], { timeout: 20_000, maxBuffer: 5 * 1024 * 1024 }, (err, stdout, stderr) => (err ? falha(new Error(String(stderr || err.message).trim())) : ok(String(stdout)))),
  );

export async function historicoGit(raiz: string, caminho: string, linha?: number): Promise<string> {
  const rel = caminho.trim().replace(/^\.?\/+/, "");
  if (!rel || rel.split(/[\/]/).includes("..")) throw new Error("Use um caminho relativo dentro do projeto.");
  if (ehSegredo(rel)) throw new Error("Arquivo de segredo: sem histórico.");
  const log = await git(raiz, ["log", "-n", "12", "--follow", "--date=short", "--format=%h %ad %an: %s", "--", rel]).catch((e: Error) => `(sem log: ${e.message})`);
  let blame = "";
  if (linha && linha > 0) {
    const de = Math.max(1, linha - 3);
    blame = await git(raiz, ["blame", "--date=short", "-L", `${de},${linha + 3}`, "--", rel]).catch((e: Error) => `(sem blame: ${e.message})`);
  }
  return [`## Commits que mexeram em ${rel}`, log.trim() || "(nenhum: arquivo novo ou fora do git)", blame ? `\n## Quem escreveu as linhas ${Math.max(1, linha! - 3)}–${linha! + 3}\n${blame.trim()}` : ""].join("\n");
}
