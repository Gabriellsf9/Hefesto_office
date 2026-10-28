import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
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
