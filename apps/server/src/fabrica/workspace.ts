import { execFile } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { colunaDe, type Card, type CodigoDoCard } from "@empresa/shared";
import { agentById } from "@empresa/org";
import { db } from "../db.ts";
import { DATA_DIR } from "../paths.ts";
import { comentar, ErroCard, lerCard } from "../tarefas.ts";

// Cópias isoladas dos projetos (Fase 4, PLANO.md seção 4.4): cada card de código ganha
// um git worktree em data/workspace numa branch própria (empresa/emp-12-login).
// A sua pasta original só muda pelo merge, que é um clique seu.

const git = promisify(execFile);

db.exec(`
  CREATE TABLE IF NOT EXISTS worktrees (
    card_id     INTEGER PRIMARY KEY,
    projeto_id  INTEGER NOT NULL,
    repo        TEXT NOT NULL,
    caminho     TEXT NOT NULL,
    branch      TEXT NOT NULL,
    base        TEXT NOT NULL,
    status      TEXT NOT NULL,
    criado_em   INTEGER NOT NULL
  );
`);

type Linha = { card_id: number; projeto_id: number; repo: string; caminho: string; branch: string; base: string; status: string; criado_em: number };

export interface Worktree {
  cardId: number;
  repo: string;
  caminho: string;
  branch: string;
  base: string;
  status: "ativo" | "mesclado" | "descartado";
}

const deLinha = (r: Linha): Worktree => ({ cardId: r.card_id, repo: r.repo, caminho: r.caminho, branch: r.branch, base: r.base, status: r.status as Worktree["status"] });

export async function g(cwd: string, ...args: string[]) {
  const r = await git("git", ["-C", cwd, ...args], { maxBuffer: 50 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
  return r.stdout.trim();
}

const slug = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "trabalho";

/**
 * O worktree deste card, de um card de origem (bug → história) ou do card pai, subindo a cadeia:
 * o apoio de um apoio (EMP-30 → EMP-26 → EMP-11) trabalha na cópia de quem tem uma.
 */
export function worktreeDoCard(card: Card): Worktree | null {
  const vistos = new Set<number>();
  let nivel: Card[] = [card];
  for (let profundidade = 0; nivel.length && profundidade < 6; profundidade++) {
    const acima: Card[] = [];
    for (const c of nivel) {
      if (vistos.has(c.id)) continue;
      vistos.add(c.id);
      const r = db.prepare("SELECT * FROM worktrees WHERE card_id = ? AND status = 'ativo'").get(c.id) as Linha | undefined;
      if (r) return deLinha(r);
      for (const id of [c.bugDe, c.paiId]) {
        if (typeof id !== "number" || vistos.has(id)) continue;
        try {
          acima.push(lerCard(id));
        } catch {
          // card de origem apagado
        }
      }
    }
    nivel = acima;
  }
  return null;
}

/**
 * Sobra de uma criação interrompida (servidor caiu no meio do "worktree add"): a branch existe e a pasta
 * pode estar registrada no git, travada, sem o registro no banco. Tira a pasta e devolve a base da branch,
 * para recriar a cópia nela sem perder commits.
 */
async function sobraDeCriacao(repo: string, branch: string, caminho: string, base: string): Promise<string | null> {
  const existe = await g(repo, "rev-parse", "--verify", "--quiet", `refs/heads/${branch}`).then(() => true, () => false);
  await g(repo, "worktree", "unlock", caminho).catch(() => {});
  await g(repo, "worktree", "remove", "--force", "--force", caminho).catch(() => {});
  rmSync(caminho, { recursive: true, force: true });
  await g(repo, "worktree", "prune").catch(() => {});
  if (!existe) return null;
  return g(repo, "merge-base", base, branch).catch(() => base);
}

export function registroDoCard(cardId: number): Worktree | null {
  const r = db.prepare("SELECT * FROM worktrees WHERE card_id = ?").get(cardId) as Linha | undefined;
  return r ? deLinha(r) : null;
}

/** Cria (ou reaproveita) a cópia isolada do projeto para este card. */
export async function garantirWorktree(card: Card, repo: string, projetoId: number): Promise<Worktree> {
  const existente = worktreeDoCard(card);
  if (existente) return existente;
  try {
    await g(repo, "rev-parse", "--is-inside-work-tree");
  } catch {
    throw new ErroCard("O projeto não usa git: a fábrica precisa de git para trabalhar numa cópia isolada. Rode `git init` e faça o primeiro commit na pasta do projeto.");
  }
  let base: string;
  try {
    base = await g(repo, "rev-parse", "HEAD");
  } catch {
    throw new ErroCard("O repositório ainda não tem nenhum commit. Faça o primeiro commit e tente de novo.");
  }
  // No Docker as cópias ficam em /workspace (os agentes escrevem ali; nunca em /data).
  const pasta = join(process.env.EMPRESA_WORKSPACE_DIR ?? join(DATA_DIR, "workspace"), String(projetoId));
  mkdirSync(pasta, { recursive: true });
  const caminho = join(pasta, card.chave);
  const branch = `empresa/${card.chave.toLowerCase()}-${slug(card.titulo)}`;
  const baseDaSobra = await sobraDeCriacao(repo, branch, caminho, base);
  if (baseDaSobra) {
    await g(repo, "worktree", "add", caminho, branch);
    base = baseDaSobra;
  } else await g(repo, "worktree", "add", "-b", branch, caminho, base);
  db.prepare("INSERT OR REPLACE INTO worktrees (card_id, projeto_id, repo, caminho, branch, base, status, criado_em) VALUES (?, ?, ?, ?, ?, ?, 'ativo', ?)")
    .run(card.id, projetoId, repo, caminho, branch, base, Date.now());
  comentar(card.id, "devops", "comentario", `Cópia isolada criada na branch \`${branch}\`. A sua pasta original não muda até você fazer o merge.`);
  return worktreeDoCard(card)!;
}

/** Commit do que o agente mudou (feito pelo servidor, com o nome do agente como autor). */
export async function commitar(wt: Worktree, autorId: string, mensagem: string): Promise<string | null> {
  await g(wt.caminho, "add", "-A");
  const mudou = await g(wt.caminho, "status", "--porcelain");
  if (!mudou) return null;
  const a = agentById[autorId];
  const nome = a ? `${a.nome} (${a.cargo})` : "Hefesto";
  await git("git", ["-C", wt.caminho, "-c", `user.name=${nome}`, "-c", `user.email=${autorId}@hefesto.local`, "commit", "-q", "-m", mensagem], {
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  return g(wt.caminho, "rev-parse", "--short", "HEAD");
}

const MAX_PATCH = 60_000;

export async function codigoDoCard(card: Card): Promise<CodigoDoCard | null> {
  const wt = worktreeDoCard(card) ?? registroDoCard(card.id);
  if (!wt) return null;
  if (wt.status !== "ativo") return { branch: wt.branch, status: wt.status, arquivos: [], stat: "", patch: "", commits: [] };
  const intervalo = `${wt.base}..HEAD`;
  const [stat, patch, nomes, log] = await Promise.all([
    g(wt.caminho, "diff", "--stat", intervalo),
    g(wt.caminho, "diff", intervalo),
    g(wt.caminho, "diff", "--name-status", intervalo),
    g(wt.caminho, "log", "--format=%h%x09%an%x09%s", intervalo),
  ]);
  return {
    branch: wt.branch,
    status: wt.status,
    arquivos: nomes ? nomes.split("\n").map((l) => { const [s, ...p] = l.split("\t"); return { status: s!, caminho: p.join("\t") }; }) : [],
    stat,
    patch: patch.length > MAX_PATCH ? `${patch.slice(0, MAX_PATCH)}\n… (diff cortado; veja a branch no git)` : patch,
    commits: log ? log.split("\n").map((l) => { const [hash, autor, msg] = l.split("\t"); return { hash: hash!, autor: autor!, mensagem: msg! }; }) : [],
  };
}

/** Merge da branch do card no branch atual do seu projeto. Só com a sua pasta sem mudanças pendentes. */
export async function mesclar(cardId: number): Promise<{ branchDestino: string; commit: string }> {
  const card = lerCard(cardId);
  const wt = worktreeDoCard(card);
  if (!wt || wt.cardId !== card.id) throw new ErroCard("Este card não tem código para mesclar.");
  if (card.coluna !== "concluido") throw new ErroCard("Aprove o card antes de fazer o merge.");
  const pendente = await g(wt.repo, "status", "--porcelain", "--untracked-files=no");
  if (pendente) throw new ErroCard("A sua pasta do projeto tem mudanças não commitadas. Faça commit ou stash delas e tente de novo.");
  const destino = await g(wt.repo, "rev-parse", "--abbrev-ref", "HEAD");
  if (destino === "HEAD") throw new ErroCard("O seu projeto está em detached HEAD. Mude para uma branch antes do merge.");
  try {
    // O merge é decisão do CEO: sai no nome dele quando a identidade está configurada (GIT_COMMITTER_* no contêiner).
    const ceo = { nome: process.env.GIT_COMMITTER_NAME || "Hefesto", email: process.env.GIT_COMMITTER_EMAIL || "ceo@hefesto.local" };
    await git("git", ["-C", wt.repo, "-c", `user.name=${ceo.nome}`, "-c", `user.email=${ceo.email}`, "merge", "--no-ff", "-m", `${card.chave}: ${card.titulo} (Hefesto)`, wt.branch], {
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
  } catch (e) {
    await g(wt.repo, "merge", "--abort").catch(() => {});
    throw new ErroCard(`O merge teve conflito e foi desfeito; a sua pasta ficou como estava. Detalhe: ${e instanceof Error ? e.message.split("\n").slice(0, 3).join(" ") : String(e)}`);
  }
  const commit = await g(wt.repo, "rev-parse", "--short", "HEAD");
  await g(wt.repo, "worktree", "remove", "--force", wt.caminho).catch(() => {});
  db.prepare("UPDATE worktrees SET status = 'mesclado' WHERE card_id = ?").run(card.id);
  comentar(card.id, "voce", "comentario", `Merge feito em \`${destino}\` (${commit}). A branch \`${wt.branch}\` continua no repositório, se quiser apagar.`);
  return { branchDestino: destino, commit };
}

/** Descarta a cópia isolada e a branch (o código não entra no projeto). */
export async function descartar(cardId: number) {
  const card = lerCard(cardId);
  const wt = worktreeDoCard(card);
  if (!wt || wt.cardId !== card.id) throw new ErroCard("Este card não tem cópia isolada ativa.");
  await g(wt.repo, "worktree", "remove", "--force", wt.caminho).catch(() => {});
  await g(wt.repo, "branch", "-D", wt.branch).catch(() => {});
  db.prepare("UPDATE worktrees SET status = 'descartado' WHERE card_id = ?").run(card.id);
  comentar(card.id, "voce", "comentario", `Código descartado: a branch \`${wt.branch}\` e a cópia isolada foram apagadas.`);
}

/**
 * Limpeza: tira a pasta da cópia isolada de cards apagados ou perdidos há mais de um dia.
 * A branch fica (nada de código se perde); só some a pasta de trabalho e o registro dela no git.
 */
export async function limparCopiasAntigas(): Promise<number> {
  const ativas = db.prepare("SELECT * FROM worktrees WHERE status = 'ativo'").all() as Linha[];
  let limpas = 0;
  for (const r of ativas) {
    const wt = deLinha(r);
    let abandonada = false;
    try {
      const card = lerCard(wt.cardId);
      abandonada = colunaDe(card.fluxo, card.coluna)?.tipo === "perdido" && Date.now() - card.atualizadoEm > 24 * 3600_000;
    } catch {
      abandonada = true; // card apagado
    }
    if (!abandonada) continue;
    await g(wt.repo, "worktree", "remove", "--force", wt.caminho).catch(() => {});
    await g(wt.repo, "worktree", "prune").catch(() => {});
    db.prepare("UPDATE worktrees SET status = 'arquivado' WHERE card_id = ?").run(wt.cardId);
    limpas++;
  }
  return limpas;
}

/**
 * No Docker com sandbox, as cópias ficam em /workspace (onde os agentes podem escrever). Cópias antigas
 * criadas em /data/workspace são movidas para lá ao iniciar (git worktree move) e recebem permissão de grupo.
 */
export async function migrarCopiasParaWorkspace(): Promise<number> {
  const destinoRaiz = process.env.EMPRESA_WORKSPACE_DIR;
  if (!destinoRaiz) return 0;
  const antiga = join(DATA_DIR, "workspace");
  let movidas = 0;
  for (const r of db.prepare("SELECT * FROM worktrees WHERE status = 'ativo'").all() as Linha[]) {
    const wt = deLinha(r);
    if (!wt.caminho.startsWith(antiga + "/")) continue;
    const novo = join(destinoRaiz, wt.caminho.slice(antiga.length + 1));
    try {
      mkdirSync(join(novo, ".."), { recursive: true });
      // Entre volumes diferentes o "worktree move" não funciona: copia, avisa o git do novo lugar e apaga a antiga.
      await git("cp", ["-a", wt.caminho, novo]);
      await g(wt.repo, "worktree", "repair", novo);
      await git("rm", ["-rf", wt.caminho]);
      await g(wt.repo, "worktree", "prune").catch(() => {});
      // A cópia mantém o grupo antigo: passa para o grupo dos agentes (trabalho), com escrita e setgid nas pastas.
      await git("chgrp", ["-R", "trabalho", novo]).catch(() => {});
      await git("chmod", ["-R", "g+rwX", novo]);
      await git("find", [novo, "-type", "d", "-exec", "chmod", "g+s", "{}", "+"]).catch(() => {});
      db.prepare("UPDATE worktrees SET caminho = ? WHERE card_id = ?").run(novo, wt.cardId);
      movidas++;
    } catch (e) {
      console.error(`Não consegui mover a cópia do card ${wt.cardId}:`, e);
    }
  }
  return movidas;
}
