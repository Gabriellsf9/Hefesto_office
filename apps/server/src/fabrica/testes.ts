import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { comentar, ErroCard, lerCard } from "../tarefas.ts";
import { podeRodarComandos } from "../plataforma.ts";
import { rodarComando, type ResultadoComando } from "./comandos.ts";
import { worktreeDoCard } from "./workspace.ts";

// Merge assistido: antes do código chegar ao CEO (e quando ele clica em "Rodar testes"), o servidor
// descobre o comando de testes do projeto e roda na cópia do card, na sandbox. O resultado vai para o card.

/**
 * Verificações do projeto, na ordem em que rodam (para na primeira que falhar): tipos, lint e testes.
 * Descobertas pelo que existe na pasta; null se não houver nenhuma.
 */
export function comandoDeTestes(pasta: string): { instalar: string | null; etapas: string[] } | null {
  const tem = (f: string) => existsSync(join(pasta, f));
  if (tem("package.json")) {
    let scripts: Record<string, string> = {};
    try {
      scripts = (JSON.parse(readFileSync(join(pasta, "package.json"), "utf8")) as { scripts?: Record<string, string> }).scripts ?? {};
    } catch {
      return null;
    }
    const pm = tem("pnpm-lock.yaml") ? "pnpm" : tem("yarn.lock") ? "yarn" : tem("bun.lockb") || tem("bun.lock") ? "bun" : "npm";
    const rodar = (s: string) => (pm === "npm" ? (s === "test" ? "npm test" : `npm run ${s}`) : `${pm} ${s}`);
    const etapas: string[] = [];
    const tipos = ["typecheck", "type-check", "check-types", "tsc"].find((s) => scripts[s]);
    if (tipos) etapas.push(rodar(tipos));
    else if (tem("tsconfig.json")) etapas.push("npx tsc --noEmit");
    if (scripts.lint) etapas.push(rodar("lint"));
    if (scripts.test && !/no test specified/.test(scripts.test)) etapas.push(rodar("test"));
    if (!etapas.length) return null;
    const instalar = tem("node_modules") ? null : pm === "npm" ? (tem("package-lock.json") ? "npm ci" : "npm install") : `${pm} install`;
    return { instalar, etapas };
  }
  if (tem("pyproject.toml") || tem("pytest.ini") || tem("setup.cfg")) return { instalar: null, etapas: ["pytest -q"] };
  if (tem("go.mod")) return { instalar: null, etapas: ["go vet ./...", "go test ./..."] };
  if (tem("Cargo.toml")) return { instalar: null, etapas: ["cargo check", "cargo test"] };
  return null;
}

export interface ResultadoTestes {
  comando: string;
  passou: boolean;
  saida: string;
  ms: number;
}

/** Roda as verificações (instala se preciso, depois tipos → lint → testes) numa pasta, parando na primeira falha. */
export async function verificarPasta(pasta: string): Promise<ResultadoTestes | null> {
  const cmd = comandoDeTestes(pasta);
  if (!cmd) return null;
  let r: ResultadoComando = { codigo: 0, saida: "", ms: 0, rede: false };
  let comando = "";
  for (const c of [...(cmd.instalar ? [cmd.instalar] : []), ...cmd.etapas]) {
    const x = await rodarComando(pasta, c);
    r = { ...x, ms: r.ms + x.ms };
    comando = c;
    if (x.codigo !== 0) break;
  }
  const passou = r.codigo === 0;
  return { comando: passou ? cmd.etapas.join(" → ") : comando, passou, saida: r.saida, ms: r.ms };
}

/** Roda os testes do projeto na cópia isolada do card e registra o resultado no card. */
export async function testarCard(cardId: number, autor = "devops"): Promise<ResultadoTestes> {
  if (!podeRodarComandos()) throw new ErroCard("Os testes precisam da sandbox (no Mac, ou no Docker com a sandbox ligada).");
  const card = lerCard(cardId);
  const wt = worktreeDoCard(card);
  if (!wt) throw new ErroCard("Este card não tem cópia isolada do projeto.");
  const cmd = comandoDeTestes(wt.caminho);
  if (!cmd) throw new ErroCard("Não achei verificações no projeto (typecheck, lint ou test no package.json, pytest, go ou cargo).");
  // Instala (se preciso) e roda tipos → lint → testes, parando na primeira falha.
  let r: ResultadoComando = { codigo: 0, saida: "", ms: 0, rede: false };
  let comando = "";
  for (const c of [...(cmd.instalar ? [cmd.instalar] : []), ...cmd.etapas]) {
    const x = await rodarComando(wt.caminho, c);
    r = { ...x, ms: r.ms + x.ms };
    comando = c;
    if (x.codigo !== 0) break;
  }
  const passou = r.codigo === 0;
  if (passou) comando = cmd.etapas.join(" → ");
  comentar(
    card.id,
    autor,
    "comentario",
    `${passou ? "✅ Verificações passaram" : "❌ Verificação falhou"} na branch \`${wt.branch}\` (\`${comando}\`, ${(r.ms / 1000).toFixed(0)} s).\n\n\`\`\`\n${r.saida.slice(-3000)}\n\`\`\``,
  );
  return { comando, passou, saida: r.saida, ms: r.ms };
}
