import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ferramentasDeEscrita } from "./ferramentas.ts";

const escrever = async (raiz: string, caminho: string, envDeTeste: boolean) => {
  const f = ferramentasDeEscrita({ cardId: 1, repo: raiz, caminho: raiz, branch: "x", base: "x", status: "ativo" }, { envDeTeste }).find(
    (t) => "name" in t.def && t.def.name === "escrever_arquivo",
  )!;
  return await f.executar!({ caminho, conteudo: "CHAVE=teste\n" });
};

test("escrita: .env de teste só na cópia de referência; chaves continuam barradas", async () => {
  const raiz = mkdtempSync(join(tmpdir(), "copia-"));
  await assert.rejects(escrever(raiz, "infra/teste/.env", false), /Arquivo de segredo/, "na cópia do card (que vira commit), não");
  const ok = await escrever(raiz, "infra/teste/.env.teste-design", true);
  assert.match(ok.texto, /Gravado/);
  await assert.rejects(escrever(raiz, "infra/teste/id_rsa", true), /Arquivo de segredo/, "chave privada nunca");
  await assert.rejects(escrever(raiz, "certs/servidor.pem", true), /Arquivo de segredo/);
  await assert.rejects(escrever(raiz, "certs/xenv.key", true), /Arquivo de segredo/, "só nomes que começam com .env");
});

test("escrever_arquivo com anexar: escreve um arquivo grande em partes (cria na primeira, acrescenta nas seguintes)", async () => {
  const raiz = mkdtempSync(join(tmpdir(), "copia-"));
  const f = ferramentasDeEscrita({ cardId: 1, repo: raiz, caminho: raiz, branch: "x", base: "x", status: "ativo" }).find((t) => "name" in t.def && t.def.name === "escrever_arquivo")!;
  await f.executar!({ caminho: "proto/index.html", conteudo: "<html>\n<body>", anexar: true });
  await f.executar!({ caminho: "proto/index.html", conteudo: "<main>parte 2</main>\n", anexar: true });
  const r = await f.executar!({ caminho: "proto/index.html", conteudo: "</body>\n</html>\n", anexar: true });
  assert.match(r.texto, /Anexado: proto\/index\.html \(\d+ linhas no total\)/);
  assert.equal(readFileSync(join(raiz, "proto/index.html"), "utf8"), "<html>\n<body>\n<main>parte 2</main>\n</body>\n</html>\n");
  // Sem anexar, continua substituindo o arquivo inteiro.
  await f.executar!({ caminho: "proto/index.html", conteudo: "novo\n" });
  assert.equal(readFileSync(join(raiz, "proto/index.html"), "utf8"), "novo\n");
});

test("escrever_arquivo sem anexar que encolhe muito um arquivo existente avisa (quase sempre era para anexar)", async () => {
  const raiz = mkdtempSync(join(tmpdir(), "copia-"));
  const f = ferramentasDeEscrita({ cardId: 1, repo: raiz, caminho: raiz, branch: "x", base: "x", status: "ativo" }).find((t) => "name" in t.def && t.def.name === "escrever_arquivo")!;
  await f.executar!({ caminho: "p.html", conteudo: "<html>\n".repeat(89) });
  const r = await f.executar!({ caminho: "p.html", conteudo: "<script>\n".repeat(30) });
  assert.match(r.texto, /ATENÇÃO: o arquivo tinha 90 linhas e foi substituído inteiro/);
  // Reescrever do mesmo tamanho (uma nova versão do arquivo) não avisa.
  const r2 = await f.executar!({ caminho: "p.html", conteudo: "<div>\n".repeat(30) });
  assert.doesNotMatch(r2.texto, /ATENÇÃO/);
});

test("escrever_arquivo não troca um arquivo grande por menos da metade (o router.go de 3529 linhas virou 15)", async () => {
  const raiz = mkdtempSync(join(tmpdir(), "copia-"));
  const f = ferramentasDeEscrita({ cardId: 1, repo: raiz, caminho: raiz, branch: "x", base: "x", status: "ativo" }).find((t) => "name" in t.def && t.def.name === "escrever_arquivo")!;
  const grande = "linha\n".repeat(400);
  await f.executar!({ caminho: "router.go", conteudo: grande });
  await assert.rejects(async () => f.executar!({ caminho: "router.go", conteudo: "package router\n".repeat(15) }), /Não gravei: router.go tem 401 linhas/);
  assert.equal(readFileSync(join(raiz, "router.go"), "utf8"), grande, "nada foi gravado");
  // Anexar e reescrever do mesmo porte continuam valendo.
  await f.executar!({ caminho: "router.go", conteudo: "fim\n", anexar: true });
  await f.executar!({ caminho: "router.go", conteudo: "nova\n".repeat(300) });
  assert.equal(readFileSync(join(raiz, "router.go"), "utf8"), "nova\n".repeat(300));
});
