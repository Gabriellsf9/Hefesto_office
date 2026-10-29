import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NADA_A_TESTAR, comandoDeTestes, verificacoesDaPasta, verificarPasta } from "./testes.ts";

const pasta = (arquivos: Record<string, string>) => {
  const p = mkdtempSync(join(tmpdir(), "stack-"));
  for (const [f, c] of Object.entries(arquivos)) {
    mkdirSync(join(p, f, ".."), { recursive: true });
    writeFileSync(join(p, f), c);
  }
  return p;
};

test("verificações de qualquer stack, cada uma com a imagem oficial para rodar quando a ferramenta não está aqui", () => {
  const py = verificacoesDaPasta(pasta({ "requirements.txt": "flask\n", "tests/test_app.py": "def test_x(): pass\n" }))!;
  assert.deepEqual([py.instalar, py.etapas, py.imagem], ["pip install -q -r requirements.txt pytest", ["python -m pytest -q"], "python:3.13-slim"]);
  assert.deepEqual(verificacoesDaPasta(pasta({ "pyproject.toml": "[project]\nname='x'\n" }))!.etapas, ["python -m compileall -q ."], "sem testes: ao menos compila");
  assert.equal(verificacoesDaPasta(pasta({ "pom.xml": "<project/>" }))!.imagem, "maven:3-eclipse-temurin-21");
  assert.deepEqual(verificacoesDaPasta(pasta({ "build.gradle.kts": "", gradlew: "" }))!.etapas, ["./gradlew test --no-daemon -q"]);
  assert.deepEqual(verificacoesDaPasta(pasta({ "composer.json": "{}", "phpunit.xml": "" }))!.etapas, ["vendor/bin/phpunit"]);
  assert.deepEqual(verificacoesDaPasta(pasta({ Gemfile: "", "spec/a_spec.rb": "" }))!.etapas, ["bundle exec rspec"]);
  assert.equal(verificacoesDaPasta(pasta({ "App.csproj": "<Project/>" }))!.imagem, "mcr.microsoft.com/dotnet/sdk:9.0");
  assert.equal(verificacoesDaPasta(pasta({ "go.mod": "module x\n" }))!.imagem, "golang:1.26");
  assert.equal(verificacoesDaPasta(pasta({ "README.md": "# x" })), null);
});

test("monorepo de stacks diferentes: cada subprojeto com a sua verificação", () => {
  const subs = comandoDeTestes(pasta({ "api/requirements.txt": "", "api/test_api.py": "", "web/package.json": JSON.stringify({ scripts: { test: "vitest" } }) }))!;
  assert.deepEqual(subs.map((s) => [s.dir, s.imagem]).sort(), [["api", "python:3.13-slim"], ["web", "node:22"]]);
});

test("monorepo: mudança só em docs/ não roda os testes de nenhum subprojeto", async () => {
  const p = pasta({ "api/requirements.txt": "", "api/test_api.py": "", "web/package.json": JSON.stringify({ scripts: { test: "vitest" } }), "docs/prototipos/a.html": "<p>" });
  const r = await verificarPasta(p, ["docs/prototipos/a.html", "docs/notas.md"]);
  assert.deepEqual(r, { comando: NADA_A_TESTAR, passou: true, saida: "", ms: 0, pulados: [] });
});
