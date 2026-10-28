import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { arquivoDaCopia, pedidoLocal } from "./copiaHttp.ts";

test("cópia por HTTP: serve arquivos do projeto (pasta → index.html); nunca fora da cópia, .git ou segredos", async () => {
  const raiz = mkdtempSync(join(tmpdir(), "copia-"));
  mkdirSync(join(raiz, "docs", "prototipos"), { recursive: true });
  mkdirSync(join(raiz, ".git"));
  writeFileSync(join(raiz, "docs", "prototipos", "emp-3.html"), "<html></html>");
  writeFileSync(join(raiz, "docs", "index.html"), "<html>docs</html>");
  writeFileSync(join(raiz, ".env"), "SEGREDO=1");
  writeFileSync(join(raiz, ".git", "config"), "x");
  assert.equal((await arquivoDaCopia(raiz, "docs/prototipos/emp-3.html"))?.tipo, "text/html; charset=utf-8");
  assert.match((await arquivoDaCopia(raiz, "docs"))!.caminho, /index\.html$/);
  assert.equal(await arquivoDaCopia(raiz, ".env"), null);
  assert.equal(await arquivoDaCopia(raiz, ".git/config"), null);
  assert.equal(await arquivoDaCopia(raiz, "../../etc/passwd"), null);
  assert.equal(await arquivoDaCopia(raiz, "docs/nao-existe.html"), null);
  assert.equal(pedidoLocal("127.0.0.1"), true);
  assert.equal(pedidoLocal("172.18.0.1"), false, "o navegador do CEO (pela porta do Docker) não acessa");
});
