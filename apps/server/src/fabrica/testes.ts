import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { comentar, ErroCard, lerCard } from "../tarefas.ts";
import { podeRodarComandos } from "../plataforma.ts";
import { rodarComando, type ResultadoComando } from "./comandos.ts";
import { g, worktreeDoCard } from "./workspace.ts";

// Merge assistido: antes do código chegar ao CEO (e quando ele clica em "Rodar testes"), o servidor
// descobre o comando de testes do projeto e roda na cópia do card, na sandbox. O resultado vai para o card.

/** Verificações de UMA pasta (tipos → lint → testes), pelo que existe nela; null se não houver nenhuma. */
function verificacoesDaPasta(pasta: string): { instalar: string | null; etapas: string[] } | null {
  const tem = (f: string) => existsSync(join(pasta, f));
  if (tem("package.json")) {
    let scripts: Record<string, string> = {};
    try {
      scripts = (JSON.parse(readFileSync(join(pasta, "package.json"), "utf8")) as { scripts?: Record<string, string> }).scripts ?? {};
    } catch {
      return null;
    }
    const pm = tem("pnpm-lock.yaml") ? "pnpm" : tem("yarn.lock") ? "yarn" : tem("bun.lockb") || tem("bun.lock") ? "bun" : "npm";
    const rodar = (sc: string) => (pm === "npm" ? (sc === "test" ? "npm test" : `npm run ${sc}`) : `${pm} ${sc}`);
    const etapas: string[] = [];
    const tipos = ["typecheck", "type-check", "check-types", "tsc"].find((sc) => scripts[sc]);
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

export interface Subprojeto {
  /** Pasta relativa ("." para a raiz). */
  dir: string;
  instalar: string | null;
  etapas: string[];
}

const IGNORAR_SUB = new Set(["node_modules", "dist", "build", "docs", "scripts", "infra", "deploy", "vendor", "coverage"]);

/**
 * Verificações do projeto: as da raiz ou, num monorepo (raiz sem verificações), as de cada subprojeto
 * de primeiro nível (frontend/, backend/…). Null se não houver nenhuma.
 */
export function comandoDeTestes(pasta: string): Subprojeto[] | null {
  const raiz = verificacoesDaPasta(pasta);
  if (raiz) return [{ dir: ".", ...raiz }];
  const subs: Subprojeto[] = [];
  for (const it of readdirSync(pasta, { withFileTypes: true })) {
    if (!it.isDirectory() || it.name.startsWith(".") || IGNORAR_SUB.has(it.name)) continue;
    const v = verificacoesDaPasta(join(pasta, it.name));
    if (v) subs.push({ dir: it.name, ...v });
  }
  return subs.length ? subs : null;
}

export interface ResultadoTestes {
  comando: string;
  passou: boolean;
  saida: string;
  ms: number;
  /** Subprojetos que não deu para verificar (ferramenta não instalada, ex.: Go no contêiner). */
  pulados?: string[];
}

/** Programa não existe neste ambiente (ex.: go no contêiner): não é falha do agente. */
const semFerramenta = (r: ResultadoComando) => r.codigo === 127 || (r.codigo !== 0 && r.saida.length < 400 && /No such file or directory|command not found|not found|não está na lista/i.test(r.saida));

/**
 * Roda as verificações numa pasta: instala se preciso, depois tipos → lint → testes, parando na primeira falha.
 * Num monorepo, só nos subprojetos que a mudança tocou (mudados = arquivos alterados, relativos à raiz).
 */
export async function verificarPasta(pasta: string, mudados?: string[]): Promise<ResultadoTestes | null> {
  let subs = comandoDeTestes(pasta);
  if (!subs) return null;
  if (mudados && !(subs.length === 1 && subs[0]!.dir === ".")) {
    const tocados = subs.filter((sub) => mudados.some((m) => m.startsWith(`${sub.dir}/`)));
    if (tocados.length) subs = tocados;
  }
  let ms = 0;
  const feitos: string[] = [];
  const pulados: string[] = [];
  for (const sub of subs) {
    const cwd = sub.dir === "." ? pasta : join(pasta, sub.dir);
    for (const c of [...(sub.instalar ? [sub.instalar] : []), ...sub.etapas]) {
      const r = await rodarComando(cwd, c);
      ms += r.ms;
      const rotulo = sub.dir === "." ? c : `${sub.dir}: ${c}`;
      if (r.codigo === 0) continue;
      if (semFerramenta(r)) {
        pulados.push(`${rotulo} (ferramenta não instalada aqui)`);
        break;
      }
      return { comando: rotulo, passou: false, saida: r.saida, ms, pulados };
    }
    feitos.push(...sub.etapas.map((e) => (sub.dir === "." ? e : `${sub.dir}: ${e}`)));
  }
  return { comando: feitos.join(" → ") || "(nada verificado)", passou: true, saida: "", ms, pulados };
}

/** Roda os testes do projeto na cópia isolada do card e registra o resultado no card. */
export async function testarCard(cardId: number, autor = "devops"): Promise<ResultadoTestes> {
  if (!podeRodarComandos()) throw new ErroCard("Os testes precisam da sandbox (no Mac, ou no Docker com a sandbox ligada).");
  const card = lerCard(cardId);
  const wt = worktreeDoCard(card);
  if (!wt) throw new ErroCard("Este card não tem cópia isolada do projeto.");
  // Num monorepo, verifica só os subprojetos que a branch mudou.
  const mudados = (await g(wt.caminho, "diff", "--name-only", `${wt.base}..HEAD`).catch(() => "")).split("\n").filter(Boolean);
  const r = await verificarPasta(wt.caminho, mudados);
  if (!r) throw new ErroCard("Não achei verificações no projeto (typecheck, lint ou test no package.json, pytest, go ou cargo), nem na raiz nem nas pastas de primeiro nível.");
  const pulados = r.pulados?.length ? `\n\nNão deu para verificar aqui: ${r.pulados.join("; ")}.` : "";
  comentar(
    card.id,
    autor,
    "comentario",
    `${r.passou ? "✅ Verificações passaram" : "❌ Verificação falhou"} na branch \`${wt.branch}\` (\`${r.comando}\`, ${(r.ms / 1000).toFixed(0)} s).${pulados}${r.passou ? "" : `\n\n\`\`\`\n${r.saida.slice(-3000)}\n\`\`\``}`,
  );
  return r;
}
