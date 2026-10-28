import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setSetting } from "../db.ts";
import { saveApiKey } from "../secrets.ts";
import { marcarForaDoAr, marcarNoAr } from "../provedores.ts";
import { ferramentaDePesquisa, modeloDePesquisa } from "./pesquisa.ts";

test("pesquisa delegada: Haiku com o Claude no ar; com o Claude fora, o modelo local que você já usa; sem nenhum, sem ferramenta", () => {
  setSetting("modelos_agentes", "{}");
  assert.equal(modeloDePesquisa(), null, "sem chave e sem modelo escolhido: nada");
  setSetting("modelos_agentes", JSON.stringify({ "dev-backend": "ollama:qwen-teste" }));
  assert.equal(modeloDePesquisa(), "ollama:qwen-teste");
  saveApiKey("sk-ant-teste-falsa"); // só no banco temporário dos testes
  assert.equal(modeloDePesquisa(), "claude-haiku-5-5");
  marcarForaDoAr("claude", Date.now() + 60_000);
  assert.equal(modeloDePesquisa(), "ollama:qwen-teste");
  marcarNoAr("claude");
  setSetting("modelo_pesquisa", "ollama:qwen-teste");
  assert.equal(modeloDePesquisa(), "ollama:qwen-teste", "a sua escolha vale primeiro");
});

test("pesquisa delegada: o pesquisador lê o projeto no próprio contexto e o autor recebe só a resposta", async () => {
  const raiz = mkdtempSync(join(tmpdir(), "pesquisa-"));
  writeFileSync(join(raiz, "tickets.go"), "package x\n\nfunc criarTicket() {}\n");
  let n = 0;
  const servidor = createServer((req, res) => {
    if (req.url === "/api/show") return void res.end(JSON.stringify({ capabilities: ["completion", "tools"] }));
    req.resume();
    req.on("end", () => {
      const chamada = n++ === 0
        ? { name: "buscar_no_indice", arguments: { pergunta: "criar ticket" } }
        : { name: "responder", arguments: { resposta: "criarTicket fica em tickets.go:3." } };
      res.end(`${JSON.stringify({ message: { content: "", tool_calls: [{ function: chamada }] } })}\n${JSON.stringify({ done: true, prompt_eval_count: 100, eval_count: 10 })}\n`);
    });
  });
  await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
  setSetting("provedores", JSON.stringify({ ollama: { url: `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`, contexto: 16_384 } }));
  setSetting("modelo_pesquisa", "ollama:qwen-teste");
  try {
    const f = ferramentaDePesquisa(raiz, { agenteId: "dev-backend" })!;
    const r = await f.executar!({ pergunta: "Onde o ticket é criado?" });
    assert.match(r.texto, /criarTicket fica em tickets\.go:3\./);
    assert.match(r.texto, /pesquisado por ollama:qwen-teste/);
  } finally {
    servidor.close();
    setSetting("provedores", "{}");
  }
});
