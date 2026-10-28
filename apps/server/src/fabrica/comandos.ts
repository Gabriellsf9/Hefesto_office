import { execFile } from "node:child_process";
import { realpathSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename } from "node:path";
import { DATA_DIR } from "../paths.ts";
import { comoAgente, NO_MAC, podeRodarComandos, SO_NO_MAC } from "../plataforma.ts";
import { nuvemAtiva, rodarNaNuvem } from "./nuvem.ts";

// Comandos dos agentes na fábrica de software (Fase 4): testes, build, lint e instalação
// de dependências, rodando DENTRO da cópia isolada do projeto (git worktree).
//
// Camadas de proteção:
// 1. Sem shell: o comando é dividido em argumentos e roda com execFile (nada de ; && | > $()).
// 2. Lista de programas permitidos (ferramentas de desenvolvimento; nada de rm, curl, ssh, sudo, osascript…).
// 3. Sandbox do macOS (sandbox-exec): só grava na cópia isolada e em pastas temporárias e de cache;
//    não lê chaves (~/.ssh, ~/.aws, chaveiro…) nem os dados do Hefesto; sem rede, exceto
//    localhost e a instalação de dependências.
// 4. Tempo máximo e saída limitada.

const TEMPO_MAX_MS = 5 * 60_000;
const SAIDA_MAX = 12_000;

const PERMITIDOS = new Set([
  "npm", "pnpm", "yarn", "bun", "npx", "node", "tsc", "eslint", "prettier", "vitest", "jest", "playwright", "k6",
  "python", "python3", "pytest", "pip", "pip3", "uv", "poetry",
  "go", "cargo", "rustc", "mvn", "./mvnw", "gradle", "./gradlew", "dotnet",
  "php", "composer", "ruby", "bundle", "rspec", "rake", "rails", "mix", "elixir",
  "flutter", "dart", "swift", "xcodebuild", "make", "git", "ls", "cat", "wc",
]);

/** git só para leitura (o commit é feito pelo servidor). */
const GIT_LEITURA = new Set(["status", "diff", "log", "show", "branch", "rev-parse"]);

/** Comandos que baixam dependências: os únicos com rede liberada (além de localhost). */
function ehInstalacao(prog: string, args: string[]): boolean {
  const sub = args[0] ?? "";
  if (["npm", "pnpm", "yarn", "bun"].includes(prog)) return ["install", "i", "ci", "add"].includes(sub) || (prog === "yarn" && args.length === 0);
  if (["pip", "pip3"].includes(prog)) return sub === "install";
  if (["python", "python3"].includes(prog)) return args[0] === "-m" && args[1] === "pip" && args[2] === "install";
  if (prog === "uv") return ["sync", "pip", "add"].includes(sub);
  if (prog === "poetry") return ["install", "add"].includes(sub);
  if (prog === "bundle") return sub === "install";
  if (prog === "composer") return ["install", "require"].includes(sub);
  if (prog === "go") return sub === "mod" || sub === "get";
  if (prog === "cargo") return ["fetch", "add"].includes(sub);
  if (prog === "dotnet") return sub === "restore";
  if (prog === "flutter" || prog === "dart") return sub === "pub";
  if (prog === "mix") return sub === "deps.get";
  return false;
}

export class ErroComando extends Error {}

/** Divide o comando em argumentos (aspas simples e duplas), recusando qualquer recurso de shell. */
export function dividir(comando: string): string[] {
  const c = comando.trim();
  if (!c) throw new ErroComando("Comando vazio.");
  if (/[;&|<>`$\\\n\r]/.test(c)) throw new ErroComando("Use um comando simples, sem ; && | > < $ ` ou \\ (não há shell).");
  const out: string[] = [];
  let atual = "";
  let aspas: string | null = null;
  for (const ch of c) {
    if (aspas) {
      if (ch === aspas) aspas = null;
      else atual += ch;
    } else if (ch === '"' || ch === "'") aspas = ch;
    else if (ch === " " || ch === "\t") {
      if (atual) out.push(atual);
      atual = "";
    } else atual += ch;
  }
  if (aspas) throw new ErroComando("Aspas sem fechar.");
  if (atual) out.push(atual);
  return out;
}

function esc(p: string) {
  return p.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function real(p: string) {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}

/** Perfil da sandbox do macOS para um comando dentro de `pasta`. */
export function perfilSandbox(pasta: string, rede: boolean): string {
  const h = homedir();
  const graveis = [
    real(pasta), real(tmpdir()), "/private/tmp", "/private/var/folders", "/dev",
    `${h}/Library/Caches`, `${h}/.npm`, `${h}/.cache`, `${h}/Library/pnpm`, `${h}/.pnpm-store`, `${h}/.yarn`, `${h}/.bun`,
    `${h}/.cargo/registry`, `${h}/go/pkg`, `${h}/.m2`, `${h}/.gradle`, `${h}/.nuget`, `${h}/.composer`, `${h}/.gem`, `${h}/.pub-cache`,
    `${h}/Library/Developer`, `${h}/.local/share`,
  ];
  const segredos = [
    `${h}/.ssh`, `${h}/.aws`, `${h}/.gnupg`, `${h}/.config/gh`, `${h}/.config/gcloud`, `${h}/.azure`, `${h}/.kube`, `${h}/.docker`,
    `${h}/Library/Keychains`, `${h}/Library/Application Support/Google/Chrome`, `${h}/Library/Cookies`, `${h}/Library/Mail`,
    `${h}/Library/Messages`, real(DATA_DIR),
  ];
  const arquivosSecretos = [`${h}/.netrc`, `${h}/.npmrc`, `${h}/.pypirc`, `${h}/.git-credentials`];
  return [
    "(version 1)",
    "(allow default)",
    rede ? "" : '(deny network-outbound)(allow network-outbound (remote ip "localhost:*"))(allow network-outbound (remote unix-socket))',
    "(deny file-write*)",
    `(allow file-write* ${graveis.map((p) => `(subpath "${esc(p)}")`).join(" ")})`,
    // Bloqueia o conteúdo (não os metadados: o node precisa consultar as pastas acima da cópia para resolver caminhos).
    `(deny file-read-data ${segredos.map((p) => `(subpath "${esc(p)}")`).join(" ")} ${arquivosSecretos.map((p) => `(literal "${esc(p)}")`).join(" ")})`,
    // A cópia isolada fica dentro dos dados do Hefesto: libera só ela (a regra mais nova vale).
    `(allow file-read-data (subpath "${esc(real(pasta))}"))`,
  ].join("");
}

export interface ResultadoComando {
  codigo: number | null;
  saida: string;
  ms: number;
  rede: boolean;
}

/** Roda um comando permitido dentro da pasta (cópia isolada), na sandbox. */
/**
 * Argumento que aponta para fora da cópia do projeto (caminho absoluto ou ".."). O "./..." do Go (todos os pacotes
 * abaixo da pasta) não sai do projeto: não é o ".." de subir pasta.
 */
export function argumentoForaDoProjeto(prog: string, x: string): boolean {
  // Cada pasta começa com letra ou número: "..", "." e ".oculta" não passam como segmento.
  if (prog === "go" && /^(\.\/)?(\w[\w.-]*\/)*\.\.\.$/.test(x)) return false;
  return x.startsWith("/") || x.includes("..");
}

export async function rodarComando(pasta: string, comando: string): Promise<ResultadoComando> {
  // Só com sandbox: a do macOS ou a Linux do contêiner (sem ela, leriam os dados do próprio servidor).
  if (!podeRodarComandos() && !nuvemAtiva()) throw new ErroComando(SO_NO_MAC);
  const args = dividir(comando);
  const prog = args.shift()!;
  if (prog.includes("/") && !prog.startsWith("./")) throw new ErroComando("Use o nome do programa, não um caminho.");
  if (!PERMITIDOS.has(prog)) {
    throw new ErroComando(`"${basename(prog)}" não está na lista de programas permitidos (testes, build, lint e dependências: npm, pnpm, node, pytest, go, cargo, mvn, gradle, dotnet, php, bundle, flutter, make…).`);
  }
  if (prog === "git" && !GIT_LEITURA.has(args[0] ?? "")) throw new ErroComando("git só para leitura (status, diff, log, show). O commit é feito pelo servidor.");
  if (args.some((x) => argumentoForaDoProjeto(prog, x))) throw new ErroComando("Use só caminhos relativos dentro do projeto (sem / no início e sem ..).");
  const rede = ehInstalacao(prog, args);
  // Sandbox na nuvem ligada (por você): o mesmo comando, já conferido acima, roda no executor remoto.
  if (nuvemAtiva()) {
    try {
      return await rodarNaNuvem(pasta, [prog, ...args], rede, TEMPO_MAX_MS);
    } catch (e) {
      throw new ErroComando((e as Error).message);
    }
  }
  const inicio = Date.now();
  const env = {
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    HOME: homedir(),
    LANG: "pt_BR.UTF-8",
    TMPDIR: tmpdir(),
    CI: "1",
    FORCE_COLOR: "0",
    NO_COLOR: "1",
  };
  return new Promise((resolve) => {
    // Mac: sandbox-exec com o perfil. Docker: o mesmo comando como o usuário "agente" (sem rede, sem /data).
    const exe = NO_MAC ? { prog: "/usr/bin/sandbox-exec", args: ["-p", perfilSandbox(pasta, rede), prog, ...args] } : comoAgente(prog, args, rede, env);
    execFile(
      exe.prog,
      exe.args,
      { cwd: pasta, env, timeout: TEMPO_MAX_MS, maxBuffer: 20 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const tudo = `${stdout}${stderr ? `\n${stderr}` : ""}`.trim();
        const saida = tudo.length > SAIDA_MAX ? `…(cortado)\n${tudo.slice(-SAIDA_MAX)}` : tudo;
        const e = err as (NodeJS.ErrnoException & { code?: number | string; killed?: boolean }) | null;
        const codigo = e ? (typeof e.code === "number" ? e.code : e.killed ? null : 1) : 0;
        resolve({ codigo, saida: e?.killed ? `${saida}\n(parado: passou de ${TEMPO_MAX_MS / 60000} minutos)` : saida, ms: Date.now() - inicio, rede });
      },
    );
  });
}
