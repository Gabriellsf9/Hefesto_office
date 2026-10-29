import { existsSync, readdirSync, readFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { comentar, ErroCard, lerCard } from "../tarefas.ts";
import { podeVerificar } from "./nuvem.ts";
import { rodarComando, type ResultadoComando } from "./comandos.ts";
import { g, worktreeDoCard } from "./workspace.ts";
import { ambienteAtivo, rodarNaImagem } from "./ambiente.ts";

// Merge assistido: antes do código chegar ao CEO (e quando ele clica em "Rodar testes"), o servidor
// descobre o comando de testes do projeto e roda na cópia do card, na sandbox. O resultado vai para o card.

/** O que verificar numa pasta e em que imagem oficial rodar quando a ferramenta não está instalada aqui. */
interface Verificacoes {
  instalar: string | null;
  etapas: string[];
  /** Imagem da linguagem (Docker dos agentes) para quando o Hefesto não tem a ferramenta (ex.: Python, Java). */
  imagem?: string;
}

/** Verificações de UMA pasta (tipos → lint → testes), pelo que existe nela; null se não houver nenhuma. */
export function verificacoesDaPasta(pasta: string): Verificacoes | null {
  const tem = (f: string) => existsSync(join(pasta, f));
  const arquivos = (() => {
    try {
      return readdirSync(pasta);
    } catch {
      return [];
    }
  })();
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
    return { instalar, etapas, imagem: "node:22" };
  }
  if (tem("pyproject.toml") || tem("requirements.txt") || tem("setup.py") || tem("pytest.ini") || tem("setup.cfg")) {
    const instalar = tem("requirements.txt") ? "pip install -q -r requirements.txt pytest" : tem("pyproject.toml") || tem("setup.py") ? "pip install -q -e . pytest" : "pip install -q pytest";
    // Sem testes, o pytest sai com erro: aí confere ao menos que tudo compila.
    const temTestes = tem("tests") || tem("test") || arquivos.some((f) => /^test_.*\.py$|_test\.py$/.test(f));
    return { instalar, etapas: [temTestes ? "python -m pytest -q" : "python -m compileall -q ."], imagem: "python:3.13-slim" };
  }
  // Os módulos do Go baixam antes (com rede), como o npm ci: a verificação roda sem rede.
  if (tem("go.mod")) return { instalar: "go mod download", etapas: ["go vet ./...", "go test ./..."], imagem: "golang:1.26" };
  if (tem("Cargo.toml")) return { instalar: null, etapas: ["cargo check", "cargo test"], imagem: "rust:1" };
  if (tem("pom.xml")) return { instalar: null, etapas: [tem("mvnw") ? "./mvnw -q -B test" : "mvn -q -B test"], imagem: "maven:3-eclipse-temurin-21" };
  if (tem("build.gradle") || tem("build.gradle.kts")) return { instalar: null, etapas: [tem("gradlew") ? "./gradlew test --no-daemon -q" : "gradle test --no-daemon -q"], imagem: "gradle:jdk21" };
  if (tem("composer.json")) {
    const phpunit = tem("phpunit.xml") || tem("phpunit.xml.dist");
    return { instalar: "composer install --no-interaction --no-progress", etapas: [phpunit ? "vendor/bin/phpunit" : "composer validate --no-check-publish"], imagem: "composer:2" };
  }
  if (tem("Gemfile")) return { instalar: "bundle install --quiet", etapas: [tem("spec") ? "bundle exec rspec" : "bundle exec rake test"], imagem: "ruby:3.3" };
  if (arquivos.some((f) => /\.(sln|csproj|fsproj)$/.test(f))) return { instalar: null, etapas: ["dotnet test"], imagem: "mcr.microsoft.com/dotnet/sdk:9.0" };
  return null;
}

export interface Subprojeto extends Verificacoes {
  /** Pasta relativa ("." para a raiz). */
  dir: string;
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

/** Resultado de quando a mudança não toca código de nenhum subprojeto. */
export const NADA_A_TESTAR = "nada a testar";

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
export async function verificarPasta(pasta: string, mudados?: string[], ignorar: Set<string> = new Set()): Promise<ResultadoTestes | null> {
  let subs = comandoDeTestes(pasta);
  if (!subs) return null;
  if (mudados && !(subs.length === 1 && subs[0]!.dir === ".")) {
    const tocados = subs.filter((sub) => mudados.some((m) => m.startsWith(`${sub.dir}/`)));
    // A mudança não toca nenhum subprojeto (só docs/, protótipos, notas): não há o que testar. Antes rodava os
    // testes de todos, e um teste instável do backend devolvia um card de protótipo.
    if (!tocados.length && mudados.length) return { comando: NADA_A_TESTAR, passou: true, saida: "", ms: 0, pulados: [] };
    if (tocados.length) subs = tocados;
  }
  let ms = 0;
  const feitos: string[] = [];
  const pulados: string[] = [];
  for (const sub of subs) {
    const cwd = sub.dir === "." ? pasta : join(pasta, sub.dir);
    let continuar = false;
    for (const c of [...(sub.instalar ? [sub.instalar] : []), ...sub.etapas]) {
      let r = await rodarComando(cwd, c);
      ms += r.ms;
      // Conflito de peer dependencies no npm: faz como os CIs costumam fazer (npm ci --legacy-peer-deps).
      if (r.codigo !== 0 && /^npm (ci|install)$/.test(c) && /ERESOLVE|Could not resolve dependency/.test(r.saida)) {
        r = await rodarComando(cwd, `${c} --legacy-peer-deps`);
        ms += r.ms;
      }
      const rotulo = sub.dir === "." ? c : `${sub.dir}: ${c}`;
      if (r.codigo === 0 || ignorar.has(rotulo)) continue;
      if (semFerramenta(r)) {
        // A linguagem não está instalada aqui: roda a sequência inteira na imagem oficial dela, no Docker dos agentes.
        const naImagem = sub.imagem && ambienteAtivo() ? await verificarNaImagem(sub, cwd, ignorar) : null;
        if (naImagem) {
          ms += naImagem.ms;
          if (!naImagem.passou) return { comando: naImagem.comando, passou: false, saida: naImagem.saida, ms, pulados };
          feitos.push(...sub.etapas.map((e) => `${sub.dir === "." ? e : `${sub.dir}: ${e}`} (em ${sub.imagem})`));
          continuar = true;
          break;
        }
        pulados.push(`${rotulo} (ferramenta não instalada aqui)`);
        break;
      }
      // Teste instável (tempo, banco, rede): repete uma vez antes de culpar o card, como os CIs fazem.
      if (!/^(npm|pnpm|yarn|bun) (ci|install)|^(pip|poetry|bundle|composer|go mod) /.test(c)) {
        const deNovo = await rodarComando(cwd, c);
        ms += deNovo.ms;
        if (deNovo.codigo === 0) {
          pulados.push(`${rotulo} falhou e passou ao repetir (teste instável do projeto)`);
          continue;
        }
      }
      return { comando: rotulo, passou: false, saida: r.saida, ms, pulados };
    }
    if (continuar) continue;
    feitos.push(...sub.etapas.map((e) => (sub.dir === "." ? e : `${sub.dir}: ${e}`)));
  }
  return { comando: feitos.join(" → ") || "(nada verificado)", passou: true, saida: "", ms, pulados };
}

/**
 * A sequência (instalar → etapas) num contêiner da imagem da linguagem, parando na primeira falha. Cada etapa
 * escreve um marcador antes de rodar, para saber qual falhou.
 */
async function verificarNaImagem(sub: Subprojeto, cwd: string, ignorar: Set<string>): Promise<{ comando: string; passou: boolean; saida: string; ms: number }> {
  const rotulo = (c: string) => (sub.dir === "." ? c : `${sub.dir}: ${c}`);
  const passos = [...(sub.instalar ? [sub.instalar] : []), ...sub.etapas];
  // Etapa que já falhava antes (pré-existente) não para a sequência.
  const script = passos.map((c) => `echo "::etapa:: ${c}"; ${ignorar.has(rotulo(c)) ? `${c} || true` : `${c} || exit $?`}`).join("\n");
  const r = await rodarNaImagem(sub.imagem!, cwd, `${sub.imagem!.startsWith("node:") ? "corepack enable 2>/dev/null; " : ""}${script}`);
  if (r.codigo === 0) return { comando: passos.map(rotulo).join(" → "), passou: true, saida: "", ms: r.ms };
  const ultima = [...r.saida.matchAll(/::etapa:: (.+)/g)].at(-1)?.[1] ?? passos[0]!;
  return { comando: `${rotulo(ultima)} (em ${sub.imagem})`, passou: false, saida: r.saida, ms: r.ms };
}

/**
 * Verifica uma cópia (a do card ou a de uma tentativa do melhor de N). Falha que já existia na versão base
 * (o projeto já estava assim) não é culpa do card: anota como pré-existente e segue para as próximas etapas.
 */
export async function verificarCopia(wt: { repo: string; caminho: string; base: string }, mudados: string[]) {
  const preExistentes = new Set<string>();
  let r = await verificarPasta(wt.caminho, mudados);
  for (let i = 0; r && !r.passou && i < 4 && (await falhaPreExistente(wt, r.comando)); i++) {
    preExistentes.add(r.comando);
    r = await verificarPasta(wt.caminho, mudados, preExistentes);
  }
  return { r, preExistentes };
}

/** Roda os testes do projeto na cópia isolada do card e registra o resultado no card. */
export async function testarCard(cardId: number, autor = "devops"): Promise<ResultadoTestes> {
  if (!podeVerificar()) throw new ErroCard("Os testes precisam da sandbox (no Mac, ou no Docker com a sandbox ligada).");
  const card = lerCard(cardId);
  const wt = worktreeDoCard(card);
  if (!wt) throw new ErroCard("Este card não tem cópia isolada do projeto.");
  // Num monorepo, verifica só os subprojetos que a branch mudou.
  const mudados = (await g(wt.caminho, "diff", "--name-only", `${wt.base}..HEAD`).catch(() => "")).split("\n").filter(Boolean);
  const { r, preExistentes } = await verificarCopia(wt, mudados);
  if (!r) throw new ErroCard("Não achei verificações no projeto (Node, Python, Go, Rust, Java, PHP, Ruby ou .NET), nem na raiz nem nas pastas de primeiro nível.");
  const pulados =
    (r.pulados?.length ? `\n\nNão deu para verificar aqui: ${r.pulados.join("; ")}.` : "") +
    (preExistentes.size ? `\n\n⚠️ Já falhava antes desta mudança (problema do projeto, não deste card): ${[...preExistentes].map((c) => `\`${c}\``).join(", ")}.` : "");
  if (r.comando === NADA_A_TESTAR) {
    comentar(card.id, autor, "comentario", `✅ Verificações passaram: nada a testar, a mudança não toca código de nenhum subprojeto (${mudados.slice(0, 5).join(", ")}${mudados.length > 5 ? "…" : ""}).`);
    return r;
  }
  comentar(
    card.id,
    autor,
    "comentario",
    `${r.passou ? "✅ Verificações passaram" : "❌ Verificação falhou"} na branch \`${wt.branch}\` (\`${r.comando}\`, ${(r.ms / 1000).toFixed(0)} s).${pulados}${r.passou ? "" : `\n\n\`\`\`\n${r.saida.slice(-3000)}\n\`\`\``}`,
  );
  return r;
}

/**
 * A mesma etapa também falha na versão base (antes da mudança do card)? Roda numa cópia temporária da base,
 * reaproveitando o node_modules da cópia do card (sem reinstalar), e apaga a cópia no fim.
 */
async function falhaPreExistente(wt: { repo: string; caminho: string; base: string }, rotulo: string): Promise<boolean> {
  const m = /^(?:(.+?): )?(.+)$/.exec(rotulo);
  const dir = m?.[1] ?? ".";
  const comando = m?.[2] ?? rotulo;
  if (/^(npm|pnpm|yarn|bun) (ci|install)/.test(comando)) return false; // instalação: não compara
  const base = `${wt.caminho}-base`;
  try {
    await g(wt.repo, "worktree", "add", "--detach", base, wt.base);
    const nm = join(wt.caminho, dir, "node_modules");
    if (existsSync(nm)) symlinkSync(nm, join(base, dir, "node_modules"), "dir");
    const r = await rodarComando(dir === "." ? base : join(base, dir), comando);
    return r.codigo !== 0;
  } catch {
    return false;
  } finally {
    await g(wt.repo, "worktree", "remove", "--force", base).catch(() => {});
  }
}
