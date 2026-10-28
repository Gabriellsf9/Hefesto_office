import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buscarNoCodigo, lerImagem, listarArquivos } from "./arquivos.ts";
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

test("ver_imagem: o agente vê os prints do projeto, sem sair da pasta dele", async () => {
  const raiz = mkdtempSync(join(tmpdir(), "projeto-"));
  mkdirSync(join(raiz, "public", "site"), { recursive: true });
  writeFileSync(join(raiz, "public", "site", "mural-claro.webp"), Buffer.from("RIFF0000WEBPVP8 "));
  const img = await lerImagem(raiz, "public/site/mural-claro.webp");
  assert.equal(img.media, "image/webp");
  assert.ok(img.base64.length > 0);
  await assert.rejects(lerImagem(raiz, "../fora.png"), /Não existe|fora do projeto/);
  writeFileSync(join(raiz, "notas.txt"), "texto");
  await assert.rejects(lerImagem(raiz, "notas.txt"), /Só imagens/);
});

test("a saída de uma chamada cabe no que resta do limite do card", () => {
  // Opus: US$ 20 por milhão de tokens de saída. Sobrando US$ 0,40, cabem 20 mil tokens.
  assert.equal(maxTokensQueCabe("claude-opus-5-5", 0.4), 20000);
  assert.equal(maxTokensQueCabe("claude-opus-5-5", 0.01), 8000, "piso para o agente ainda conseguir trabalhar");
  assert.equal(maxTokensQueCabe("claude-sonnet-5-5", 50), 64000, "sem passar do máximo da API");
  assert.equal(maxTokensQueCabe("claude-opus-5-5", Infinity), 64000, "sem card, vale o máximo");
});
