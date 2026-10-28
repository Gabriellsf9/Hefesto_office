import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buscarNoCodigo, listarArquivos } from "./arquivos.ts";
import { maxTokensQueCabe } from "../custo.ts";

test("busca e listagem ignoram as cópias do projeto que ferramentas de IA guardam em .claude/worktrees", async () => {
  const raiz = mkdtempSync(join(tmpdir(), "projeto-"));
  mkdirSync(join(raiz, "src"));
  writeFileSync(join(raiz, "src", "app.ts"), "export function criarCard() {}\n");
  const copia = join(raiz, ".claude", "worktrees", "branch-velha", "src");
  mkdirSync(copia, { recursive: true });
  writeFileSync(join(copia, "app.ts"), "export function criarCard() { /* versão antiga */ }\n");

  const achados = await buscarNoCodigo(raiz, "criarCard");
  assert.match(achados, /src[\\/]app\.ts/);
  assert.doesNotMatch(achados, /worktrees/, "a cópia antiga não pode aparecer na busca");
  assert.doesNotMatch(await listarArquivos(raiz, ".", 4), /worktrees/);
});

test("a saída de uma chamada cabe no que resta do limite do card", () => {
  // Opus: US$ 20 por milhão de tokens de saída. Sobrando US$ 0,40, cabem 20 mil tokens.
  assert.equal(maxTokensQueCabe("claude-opus-5-5", 0.4), 20000);
  assert.equal(maxTokensQueCabe("claude-opus-5-5", 0.01), 8000, "piso para o agente ainda conseguir trabalhar");
  assert.equal(maxTokensQueCabe("claude-sonnet-5-5", 50), 64000, "sem passar do máximo da API");
  assert.equal(maxTokensQueCabe("claude-opus-5-5", Infinity), 64000, "sem card, vale o máximo");
});
