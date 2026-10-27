import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { Card, Previa } from "@empresa/shared";
import { emit } from "../bus.ts";
import { ErroCard } from "../tarefas.ts";
import { ErroEntrada, ferramenta, type Ferramenta } from "../agentes/loop.ts";
import { perfilSandbox, rodarComando } from "./comandos.ts";
import { worktreeDoCard } from "./workspace.ts";

// Prévia do app por card (pedido do CEO em 27/10/2026): sobe o app a partir da cópia isolada do card
// (git worktree), numa porta livre, dentro da mesma sandbox dos comandos da fábrica (sem internet, sem
// ler segredos, gravando só na cópia). O QA, o treinamento e o CEO testam o código novo antes do merge.
// Suporta Node (script dev/start; npm, pnpm, yarn ou bun), Django e Rails. Para depois de 60 min sem uso.


const previas = new Map<number, Previa & { proc?: ChildProcess; timer?: NodeJS.Timeout }>();
const MINUTOS_SEM_USO = 60;

const publica = (p: Previa): Previa => ({ cardId: p.cardId, status: p.status, url: p.url, comando: p.comando, log: p.log.slice(-60), erro: p.erro, desde: p.desde });
const avisar = (p: Previa) => emit({ type: "previa", previa: publica(p) });
export const lerPrevia = (cardId: number): Previa | null => {
  const p = previas.get(cardId);
  return p ? publica(p) : null;
};

function portaLivre(): Promise<number> {
  return new Promise((ok, falha) => {
    const s = createServer();
    s.once("error", falha);
    s.listen(0, "127.0.0.1", () => {
      const porta = (s.address() as { port: number }).port;
      s.close(() => ok(porta));
    });
  });
}

interface Plano {
  instalar?: string;
  prog: string;
  args: string[];
  env: Record<string, string>;
}

/** Descobre como rodar o app em modo de desenvolvimento. */
function planejar(pasta: string, porta: number): Plano {
  const pj = join(pasta, "package.json");
  if (existsSync(pj)) {
    const pkg = JSON.parse(readFileSync(pj, "utf8")) as { scripts?: Record<string, string> };
    const script = pkg.scripts?.dev ? "dev" : pkg.scripts?.start ? "start" : null;
    if (!script) throw new ErroCard('O package.json não tem script "dev" nem "start".');
    const pm = existsSync(join(pasta, "pnpm-lock.yaml")) ? "pnpm" : existsSync(join(pasta, "yarn.lock")) ? "yarn" : existsSync(join(pasta, "bun.lockb")) || existsSync(join(pasta, "bun.lock")) ? "bun" : "npm";
    const corpo = pkg.scripts![script]!;
    // Vite, Next, Astro, Nuxt e companhia aceitam --port; o resto costuma ler PORT.
    const aceitaPorta = /\b(vite|next|astro|nuxt|nuxi|remix|svelte-kit|webpack(-dev-server| serve)|ng serve|vue-cli-service)\b/.test(corpo);
    const extra = aceitaPorta ? [...(pm === "npm" ? ["--"] : []), "--port", String(porta), ...(/\bvite\b/.test(corpo) ? ["--strictPort", "--host", "127.0.0.1"] : [])] : [];
    return {
      instalar: existsSync(join(pasta, "node_modules")) ? undefined : `${pm} install`,
      prog: pm,
      args: ["run", script, ...extra],
      env: { PORT: String(porta), HOST: "127.0.0.1", BROWSER: "none", NODE_ENV: "development" },
    };
  }
  if (existsSync(join(pasta, "manage.py"))) return { prog: "python3", args: ["manage.py", "runserver", `127.0.0.1:${porta}`, "--noreload"], env: {} };
  if (existsSync(join(pasta, "bin", "rails"))) return { prog: "bundle", args: ["exec", "rails", "server", "-p", String(porta), "-b", "127.0.0.1"], env: {} };
  throw new ErroCard("Prévia automática ainda não sabe rodar este tipo de projeto (suporta Node, Django e Rails).");
}

function registrarLog(p: Previa, texto: string) {
  for (const l of texto.split("\n")) if (l.trim()) p.log.push(l.replace(/\x1b\[[0-9;]*m/g, "").slice(0, 300));
  if (p.log.length > 300) p.log.splice(0, p.log.length - 300);
}

function programarParada(cardId: number) {
  const p = previas.get(cardId);
  if (!p) return;
  clearTimeout(p.timer);
  p.timer = setTimeout(() => void pararPrevia(cardId, "parada depois de 60 min sem uso"), MINUTOS_SEM_USO * 60_000);
  p.timer.unref();
}

export async function iniciarPrevia(card: Card): Promise<Previa> {
  const wt = worktreeDoCard(card);
  if (!wt) throw new ErroCard("Este card não tem cópia isolada do projeto (só cards de código num projeto com git).");
  const atual = previas.get(card.id);
  if (atual && ["instalando", "iniciando", "no-ar"].includes(atual.status)) {
    programarParada(card.id);
    return publica(atual);
  }
  const porta = await portaLivre();
  const plano = planejar(wt.caminho, porta);
  const p: Previa & { proc?: ChildProcess; timer?: NodeJS.Timeout } = { cardId: card.id, status: plano.instalar ? "instalando" : "iniciando", url: null, comando: [plano.prog, ...plano.args].join(" "), log: [], erro: null, desde: Date.now() };
  previas.set(card.id, p);
  avisar(p);
  void (async () => {
    try {
      if (plano.instalar) {
        registrarLog(p, `$ ${plano.instalar}`);
        const r = await rodarComando(wt.caminho, plano.instalar);
        registrarLog(p, r.saida.slice(-4000));
        if (r.codigo !== 0) throw new Error(`A instalação das dependências falhou (código ${r.codigo}).`);
        p.status = "iniciando";
        avisar(p);
      }
      registrarLog(p, `$ ${p.comando}`);
      // Mesma sandbox dos comandos: sem internet (só localhost), sem ler segredos, gravando só na cópia.
      const proc = spawn("/usr/bin/sandbox-exec", ["-p", perfilSandbox(wt.caminho, false), plano.prog, ...plano.args], {
        cwd: wt.caminho,
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: homedir(), TMPDIR: tmpdir(), LANG: "pt_BR.UTF-8", FORCE_COLOR: "0", NO_COLOR: "1", ...plano.env },
      });
      p.proc = proc;
      proc.stdout!.on("data", (b: Buffer) => registrarLog(p, b.toString()));
      proc.stderr!.on("data", (b: Buffer) => registrarLog(p, b.toString()));
      proc.once("exit", (codigo) => {
        if (p.status === "parada") return;
        p.status = "erro";
        p.erro = `O app parou (código ${codigo ?? "?"}). Veja o log.`;
        p.url = null;
        avisar(p);
      });
      const url = `http://127.0.0.1:${porta}`;
      const ate = Date.now() + 120_000;
      while (Date.now() < ate && p.status === "iniciando") {
        const ok = await fetch(url, { signal: AbortSignal.timeout(2000) }).then(() => true).catch(() => false);
        if (ok) {
          p.status = "no-ar";
          p.url = url;
          avisar(p);
          programarParada(card.id);
          return;
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
      if (p.status === "iniciando") throw new Error("O app não respondeu em 2 minutos.");
    } catch (e) {
      p.status = "erro";
      p.erro = e instanceof Error ? e.message : String(e);
      matar(p);
      avisar(p);
    }
  })();
  return publica(p);
}

function matar(p: { proc?: ChildProcess }) {
  const pid = p.proc?.pid;
  if (!pid) return;
  try {
    process.kill(-pid, "SIGTERM"); // o grupo inteiro (o servidor de desenvolvimento e os filhos)
  } catch {}
  setTimeout(() => { try { process.kill(-pid, "SIGKILL"); } catch {} }, 3000).unref();
}

export async function pararPrevia(cardId: number, motivo = "parada"): Promise<Previa | null> {
  const p = previas.get(cardId);
  if (!p) return null;
  p.status = "parada";
  p.url = null;
  registrarLog(p, `(${motivo})`);
  clearTimeout(p.timer);
  matar(p);
  avisar(p);
  return publica(p);
}

export function pararTodasPrevias() {
  for (const id of previas.keys()) void pararPrevia(id, "servidor encerrado");
}

/** Endereço da prévia no ar (para o navegador e os prints usarem o código novo). */
export const urlDaPrevia = (cardId: number, card?: Card): string | null => {
  const ids = [cardId, card?.bugDe, card?.paiId].filter((x): x is number => typeof x === "number");
  for (const id of ids) {
    const p = previas.get(id);
    if (p?.status === "no-ar" && p.url) {
      programarParada(id);
      return p.url;
    }
  }
  return null;
};

/** Ferramenta para QA, devs e treinamento: subir a prévia do código deste card e testar. */
export function ferramentaPrevia(card: Card): Ferramenta {
  return ferramenta(
    "previa_do_app",
    "Sobe o app a partir da cópia isolada deste card (o código novo, antes do merge) numa porta local e devolve o endereço para abrir no navegador ou no celular de teste. Ações: iniciar (instala as dependências se faltar e espera responder), status, parar.",
    { acao: { type: "string", enum: ["iniciar", "status", "parar"] } },
    ["acao"],
    async (e) => {
      if (e.acao === "parar") {
        await pararPrevia(card.id);
        return { texto: "Prévia parada." };
      }
      if (e.acao === "iniciar") await iniciarPrevia(card);
      const ate = Date.now() + 180_000;
      let p = lerPrevia(card.id);
      while (e.acao === "iniciar" && p && ["instalando", "iniciando"].includes(p.status) && Date.now() < ate) {
        await new Promise((r) => setTimeout(r, 1500));
        p = lerPrevia(card.id);
      }
      if (!p) throw new ErroEntrada("Nenhuma prévia deste card. Use acao iniciar.");
      if (p.status === "no-ar") return { texto: `Prévia no ar em ${p.url} (código da branch deste card). Abra com o navegador (é endereço de teste: interação completa).` };
      throw new ErroEntrada(`Prévia: ${p.status}${p.erro ? ` — ${p.erro}` : ""}\nÚltimas linhas do log:\n${p.log.slice(-25).join("\n")}`);
    },
  );
}
