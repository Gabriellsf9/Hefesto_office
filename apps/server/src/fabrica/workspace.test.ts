import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { criarCard } from "../tarefas.ts";
import { garantirCopiaDeReferencia, garantirWorktree, worktreeDoCard } from "./workspace.ts";

const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();

function repoNovo() {
  const repo = mkdtempSync(join(tmpdir(), "hefesto-repo-"));
  git(repo, "init", "-q", "-b", "main");
  writeFileSync(join(repo, "a.txt"), "um\n");
  git(repo, "add", "-A");
  git(repo, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "inicio");
  return repo;
}

const novoCard = (titulo: string, paiId: number | null = null) =>
  criarCard({ titulo, sala: "desenvolvimento", fluxo: "software", coluna: "em-dev", dono: "dev-frontend", paiId });

describe("garantirWorktree", () => {
  test("cria a cópia numa branch nova", async () => {
    const repo = repoNovo();
    const c = novoCard("Primeira cópia");
    const wt = await garantirWorktree(c, repo, 1);
    assert.ok(existsSync(join(wt.caminho, "a.txt")));
    assert.match(git(repo, "branch", "--list", wt.branch), /empresa\//);
  });

  test("recupera a sobra de uma criação interrompida, sem perder os commits da branch (EMP-30)", async () => {
    const repo = repoNovo();
    const c = novoCard("Alinhar versões do tiptap");
    const branch = `empresa/${c.chave.toLowerCase()}-alinhar-versoes-do-tiptap`;
    const caminho = join(process.env.EMPRESA_WORKSPACE_DIR!, "1", c.chave);
    // Estado depois da queda: branch criada (com um commit), pasta registrada e travada, nada no banco.
    git(repo, "worktree", "add", "-b", branch, caminho, "HEAD");
    writeFileSync(join(caminho, "b.txt"), "dois\n");
    git(caminho, "add", "-A");
    git(caminho, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "trabalho salvo");
    git(repo, "worktree", "lock", caminho);
    const base = git(repo, "rev-parse", "main");

    const wt = await garantirWorktree(c, repo, 1);
    assert.equal(wt.branch, branch);
    assert.equal(wt.base, base);
    assert.ok(existsSync(join(wt.caminho, "b.txt")), "o commit da branch continua na cópia");
    assert.doesNotMatch(git(repo, "worktree", "list"), /locked/);
  });

  test("branch que sobrou sem pasta nenhuma também é reaproveitada", async () => {
    const repo = repoNovo();
    const c = novoCard("Só a branch sobrou");
    git(repo, "branch", `empresa/${c.chave.toLowerCase()}-so-a-branch-sobrou`);
    const wt = await garantirWorktree(c, repo, 1);
    assert.ok(existsSync(join(wt.caminho, "a.txt")));
  });
});

describe("worktreeDoCard", () => {
  test("o apoio de um apoio usa a cópia de quem tem uma (EMP-30 → EMP-26 → EMP-11)", async () => {
    const repo = repoNovo();
    const avo = novoCard("Schema nativo");
    const wt = await garantirWorktree(avo, repo, 1);
    const pai = novoCard("Gate do npm ci", avo.id);
    const neto = novoCard("Alinhar tiptap", pai.id);
    assert.equal(worktreeDoCard(neto)?.caminho, wt.caminho);
    assert.equal((await garantirWorktree(neto, repo, 1)).cardId, avo.id, "não cria uma cópia nova a partir do HEAD");
  });

  test("card sem cópia em toda a cadeia não tem cópia", () => {
    const sozinho = novoCard("Sozinho");
    assert.equal(worktreeDoCard(novoCard("Filho", sozinho.id)), null);
  });
});

describe("pasta do projeto que guarda o repositório numa subpasta", () => {
  test("a cópia do card usa o repositório da subpasta (ex.: Parliamo/Parliamo)", async () => {
    const repo = repoNovo();
    const pasta = mkdtempSync(join(tmpdir(), "hefesto-projeto-"));
    renameSync(repo, join(pasta, "App"));
    writeFileSync(join(pasta, "solto.sql"), "select 1;\n");
    const wt = await garantirWorktree(novoCard("Repositório na subpasta"), pasta, 7);
    assert.equal(wt.repo, join(pasta, "App"));
    assert.ok(existsSync(join(wt.caminho, "a.txt")));
  });

  test("cópia de referência: uma por projeto, no HEAD, sem branch de card", async () => {
    const repo = repoNovo();
    const a = await garantirCopiaDeReferencia(novoCard("Design A"), repo, 8);
    const b = await garantirCopiaDeReferencia(novoCard("Design B"), repo, 8);
    assert.equal(a.caminho, b.caminho, "os cards do projeto compartilham a mesma cópia");
    assert.ok(existsSync(join(a.caminho, "a.txt")));
    assert.equal(a.base, git(repo, "rev-parse", "HEAD"));
    assert.doesNotMatch(git(repo, "branch", "--list"), /empresa\//, "não cria branch");
  });
});
