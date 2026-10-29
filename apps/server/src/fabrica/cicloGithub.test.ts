import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { colunaDe } from "@empresa/shared";
import { db } from "../db.ts";
import { salvarSegredo } from "../secrets.ts";
import { criarCard, lerCard, listarCards, listarComentarios } from "../tarefas.ts";
import { registrarPrDoCard, sincronizarGithub } from "./cicloGithub.ts";

test("ciclo do GitHub: issue com a etiqueta vira card (uma vez só); revisão pedindo mudança e CI vermelho devolvem o card", async () => {
  // Repositório do projeto com o origin no GitHub.
  const repo = mkdtempSync(join(tmpdir(), "gh-repo-"));
  execFileSync("git", ["-C", repo, "init", "-q"]);
  execFileSync("git", ["-C", repo, "remote", "add", "origin", "https://github.com/dono/app.git"]);
  writeFileSync(join(repo, "a.txt"), "x");
  const projetoId = Number(db.prepare("INSERT INTO projetos (nome, caminho, git, branch, sinais, criado_em) VALUES ('app', ?, 1, NULL, '[]', 0)").run(repo).lastInsertRowid);

  const comentariosNoGithub: string[] = [];
  // Horário fixo das revisões (um GitHub de verdade não muda o horário de um comentário entre uma consulta e outra).
  const quando = new Date(Date.now() + 1000).toISOString();
  const servidor = createServer((req, res) => {
    const url = req.url ?? "";
    let corpo = "";
    req.on("data", (c) => (corpo += c));
    req.on("end", () => {
      const json = (v: unknown) => res.end(JSON.stringify(v));
      if (url.startsWith("/repos/dono/app/issues?")) return json([{ number: 7, title: "Erro ao salvar ticket", body: "Ao salvar dá 500.", html_url: "https://github.com/dono/app/issues/7", labels: [{ name: "hefesto" }, { name: "bug" }] }]);
      if (url === "/repos/dono/app/issues/7/comments") {
        comentariosNoGithub.push(JSON.parse(corpo).body);
        return json({});
      }
      if (url === "/repos/dono/app/pulls/12") return json({ state: "open", merged: false, head: { sha: "abc1234567" } });
      if (url === "/repos/dono/app/pulls/12/reviews") return json([{ id: 1, state: "CHANGES_REQUESTED", body: "Falta validar o workspace.", user: { login: "revisora" }, submitted_at: quando }]);
      if (url === "/repos/dono/app/pulls/12/comments") return json([{ id: 2, body: "Use o helper de auth.", path: "handlers/t.go", line: 40, user: { login: "revisora" }, created_at: quando }]);
      if (url === "/repos/dono/app/commits/abc1234567/check-runs") return json({ check_runs: [{ name: "go test", status: "completed", conclusion: "failure" }] });
      res.statusCode = 404;
      res.end("{}");
    });
  });
  await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
  process.env.GITHUB_API_URL = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  salvarSegredo("github_token", "ghp_tokendetestefalso1234567890"); // só no banco temporário dos testes
  try {
    // Card de código concluído, com PR aberto.
    const card = criarCard({ titulo: "Handler de tickets", sala: "desenvolvimento", fluxo: "software", coluna: "concluido", dono: "dev-backend", projetoId });
    registrarPrDoCard(card.id, "dono", "app", 12);

    const r = await sincronizarGithub();
    assert.equal(r.issues, 1);
    const novo = listarCards().find((c) => c.titulo.startsWith("#7 Erro ao salvar ticket"))!;
    assert.equal(novo.tipo, "bug");
    assert.equal(novo.projetoId, projetoId);
    assert.match(comentariosNoGithub[0]!, new RegExp(`Virou o card ${novo.chave}`));

    // Revisão e CI vermelho: o card volta para o trabalho, com as devoluções.
    const depois = lerCard(card.id);
    assert.notEqual(colunaDe(depois.fluxo, depois.coluna)?.tipo, "feito");
    const devolucoes = listarComentarios(card.id).filter((c) => c.tipo === "devolucao").map((c) => c.texto);
    assert.ok(devolucoes.some((t) => /revisora pediu mudanças: Falta validar o workspace/.test(t) && /handlers\/t\.go:40/.test(t)));
    assert.ok(devolucoes.some((t) => /CI do PR #12 falhou.*go test/.test(t)));

    // Rodar de novo não duplica nada.
    const r2 = await sincronizarGithub();
    assert.equal(r2.issues, 0);
    assert.equal(listarComentarios(card.id).filter((c) => c.tipo === "devolucao").length, devolucoes.length);
  } finally {
    servidor.close();
    delete process.env.GITHUB_API_URL;
  }
});
