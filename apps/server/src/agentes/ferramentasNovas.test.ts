import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buscarNoCodigo, regexDoPadrao } from "./arquivos.ts";
import { historicoGit } from "./historico.ts";
import { ferramentasDeEscrita } from "../fabrica/ferramentas.ts";
import { imagemDoProjeto } from "../fabrica/estacao.ts";

test("busca: expressão regular e padrão de arquivos (como o Grep e o Glob do Claude Code)", async () => {
  const raiz = mkdtempSync(join(tmpdir(), "busca-"));
  mkdirSync(join(raiz, "backend", "handlers"), { recursive: true });
  mkdirSync(join(raiz, "web"));
  writeFileSync(join(raiz, "backend", "handlers", "tickets.go"), "func CreateTicket() {}\nfunc ListTickets() {}\n");
  writeFileSync(join(raiz, "web", "tickets.ts"), "export function createTicket() {}\n");
  const so = await buscarNoCodigo(raiz, "func \\w+Ticket\\(", 100, { regex: true });
  assert.match(so, /tickets\.go:1: func CreateTicket/);
  assert.doesNotMatch(so, /ListTickets/, "Ticket( não casa Tickets(: só o que a regex pede");
  const soGo = await buscarNoCodigo(raiz, "ticket", 100, { arquivos: "*.go" });
  assert.match(soGo, /tickets\.go/);
  assert.doesNotMatch(soGo, /tickets\.ts/);
  assert.ok(regexDoPadrao("backend/**/*.go").test("backend/handlers/tickets.go"));
  assert.ok(!regexDoPadrao("backend/**/*.go").test("web/tickets.ts"));
  assert.equal((await buscarNoCodigo(raiz, "func", 1)).split("\n").length, 1, "o limite agora vale");
});

test("editar_arquivo em lote: várias trocas numa chamada; se uma falha, nada é gravado", async () => {
  const raiz = mkdtempSync(join(tmpdir(), "edicao-"));
  writeFileSync(join(raiz, "a.ts"), "const a = 1;\nconst b = 2;\n");
  const editar = ferramentasDeEscrita({ cardId: 1, repo: raiz, caminho: raiz, branch: "x", base: "x", status: "ativo" }).find((t) => "name" in t.def && t.def.name === "editar_arquivo")!;
  await editar.executar!({ caminho: "a.ts", edicoes: [{ trecho_antigo: "a = 1", trecho_novo: "a = 10" }, { trecho_antigo: "b = 2", trecho_novo: "b = 20" }] });
  assert.equal(readFileSync(join(raiz, "a.ts"), "utf8"), "const a = 10;\nconst b = 20;\n");
  await assert.rejects(async () => editar.executar!({ caminho: "a.ts", edicoes: [{ trecho_antigo: "a = 10", trecho_novo: "a = 0" }, { trecho_antigo: "nao existe", trecho_novo: "x" }] }), /edição 2/);
  assert.equal(readFileSync(join(raiz, "a.ts"), "utf8"), "const a = 10;\nconst b = 20;\n", "a primeira troca não ficou gravada");
});

test("histórico do git: commits do arquivo e quem escreveu a linha", async () => {
  const raiz = mkdtempSync(join(tmpdir(), "git-"));
  const g = (...a: string[]) => execFileSync("git", ["-C", raiz, ...a], { stdio: "pipe" });
  g("init", "-q");
  writeFileSync(join(raiz, "x.go"), "package x\n\nfunc A() {}\n");
  g("add", ".");
  g("-c", "user.name=Ana", "-c", "user.email=ana@x", "commit", "-q", "-m", "Cria a função A");
  const h = await historicoGit(raiz, "x.go", 3);
  assert.match(h, /Ana: Cria a função A/);
  assert.match(h, /Quem escreveu as linhas/);
  await assert.rejects(historicoGit(raiz, "../fora.go"), /relativo/);
});

test("estação: escolhe a imagem da linguagem do projeto", () => {
  const raiz = mkdtempSync(join(tmpdir(), "estacao-"));
  writeFileSync(join(raiz, "go.mod"), "module x\n");
  assert.equal(imagemDoProjeto(raiz), "golang:1.26");
  assert.equal(imagemDoProjeto(mkdtempSync(join(tmpdir(), "vazio-"))), "node:22");
});

test("lista de tarefas do agente: salva, volta na mensagem do card e aceita só status válidos", async () => {
  const { ferramentaDeTarefas, tarefasEmTexto, lerTarefasDoAgente } = await import("./tarefasDoAgente.ts");
  const f = ferramentaDeTarefas(4242);
  await f.executar!({ tarefas: [{ texto: "Ler o handler", status: "feita" }, { texto: "Escrever o teste", status: "fazendo" }, { texto: "Rodar", status: "qualquer" }] });
  assert.deepEqual(lerTarefasDoAgente(4242).map((i) => i.status), ["feita", "fazendo", "pendente"]);
  assert.match(tarefasEmTexto(4242), /\[x\] Ler o handler[\s\S]*\[~\] Escrever o teste[\s\S]*\[ \] Rodar/);
  assert.equal(tarefasEmTexto(999_999), "", "card sem lista: nada");
});

test("instruções do projeto: AGENTS.md e CLAUDE.md, também quando o repositório está numa subpasta; cortadas no limite", async () => {
  const { instrucoesDoProjeto } = await import("./instrucoesProjeto.ts");
  const pasta = mkdtempSync(join(tmpdir(), "instr-"));
  mkdirSync(join(pasta, "App", ".git"), { recursive: true });
  writeFileSync(join(pasta, "App", "AGENTS.md"), "Use pnpm. Nunca edite migrações antigas.");
  writeFileSync(join(pasta, "App", "CLAUDE.md"), "x".repeat(5000));
  const t = instrucoesDoProjeto(pasta, 3000);
  assert.match(t, /### AGENTS\.md\nUse pnpm\. Nunca edite migrações antigas\./);
  assert.match(t, /### CLAUDE\.md/);
  assert.match(t, /cortado: leia o arquivo inteiro/);
  assert.ok(t.length < 3400);
  assert.equal(instrucoesDoProjeto(mkdtempSync(join(tmpdir(), "sem-"))), "");
});
