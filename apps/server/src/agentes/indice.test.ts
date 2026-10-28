import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, utimesSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { atualizarIndice, buscarNoIndice, consultaDe, trechosDe } from "./indice.ts";

test("índice: corta nas declarações e acha pelo nome quebrado em palavras (criarTicket ← 'criar ticket')", async () => {
  const raiz = mkdtempSync(join(tmpdir(), "indice-"));
  mkdirSync(join(raiz, "backend", "handlers"), { recursive: true });
  mkdirSync(join(raiz, "node_modules", "lib"), { recursive: true });
  const enchimento = Array.from({ length: 20 }, (_, i) => `  // linha ${i}`).join("\n");
  writeFileSync(join(raiz, "backend", "handlers", "tickets.go"), `package handlers\n\nfunc listarTickets() {\n${enchimento}\n}\n\nfunc criarTicket(w http.ResponseWriter) {\n  db.Insert("tickets")\n${enchimento}\n}\n`);
  writeFileSync(join(raiz, "backend", "boards.sql"), "CREATE TABLE channel_boards (id uuid primary key, workspace_id uuid);\n");
  writeFileSync(join(raiz, "node_modules", "lib", "criar.js"), "function criarTicket() {}\n");
  writeFileSync(join(raiz, ".env"), "SEGREDO=1\n");

  const achados = await buscarNoIndice(raiz, "onde o ticket é criado? criar ticket");
  assert.equal(achados[0]?.caminho, "backend/handlers/tickets.go");
  assert.match(achados[0]!.trecho, /func criarTicket/);
  assert.match(achados[0]!.trecho, /^\d+: /, "com o número da linha");
  assert.ok(!achados.some((a) => a.caminho.startsWith("node_modules") || a.caminho === ".env"), "ignora dependências e segredos");
  assert.equal((await buscarNoIndice(raiz, "tabela channel boards"))[0]?.caminho, "backend/boards.sql");

  // Atualiza só o que mudou e tira o que foi apagado.
  assert.equal(await atualizarIndice(raiz), 0, "nada mudou");
  writeFileSync(join(raiz, "backend", "boards.sql"), "CREATE TABLE sprints (id uuid);\n");
  utimesSync(join(raiz, "backend", "boards.sql"), new Date(), new Date(Date.now() + 5000));
  assert.equal(await atualizarIndice(raiz), 1);
  assert.equal((await buscarNoIndice(raiz, "channel")).length, 0);
  rmSync(join(raiz, "backend", "boards.sql"));
  await atualizarIndice(raiz);
  assert.equal((await buscarNoIndice(raiz, "sprints")).length, 0);
});

test("índice: trechos de até ~60 linhas e consulta sem palavras vazias", () => {
  const longo = Array.from({ length: 200 }, (_, i) => `x${i}`).join("\n");
  const ts = trechosDe(longo, "a.ts");
  assert.ok(ts.length >= 3 && ts.every((t) => t.fim - t.inicio < 61));
  assert.equal(consultaDe("onde fica o código de"), null);
  assert.equal(consultaDe("criarTicket"), '"criar"* OR "ticket"*');
});
