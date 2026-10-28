import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listarCards } from "./tarefas.ts";
import { fichaDoProjeto } from "./projetos.ts";
import { vincularPasta } from "./projetoNovo.ts";

test("projeto novo de qualquer stack: perfil automático na ficha (linguagem e como verificar) e card de raio-x", async () => {
  const pasta = mkdtempSync(join(tmpdir(), "api-python-"));
  mkdirSync(join(pasta, "tests"));
  writeFileSync(join(pasta, "requirements.txt"), "fastapi\n");
  writeFileSync(join(pasta, "app.py"), "def soma(a, b):\n    return a + b\n");
  writeFileSync(join(pasta, "tests", "test_app.py"), "from app import soma\n\ndef test_soma():\n    assert soma(1, 1) == 2\n");
  const p = await vincularPasta(pasta);
  const ficha = fichaDoProjeto(p.id)!.ficha!;
  assert.match(ficha, /perfil automático/);
  assert.match(ficha, /Python 2/);
  assert.match(ficha, /python -m pytest -q/);
  assert.match(ficha, /python:3\.13-slim/);
  assert.equal(listarCards().filter((c) => c.projetoId === p.id && c.etiquetas.includes("raio-x")).length, 1);
  // Vincular de novo a mesma pasta não abre outro raio-x.
  await vincularPasta(pasta);
  assert.equal(listarCards().filter((c) => c.projetoId === p.id && c.etiquetas.includes("raio-x")).length, 1);
});
