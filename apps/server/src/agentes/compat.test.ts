import { test } from "node:test";
import assert from "node:assert/strict";
import { rodarAgente, ferramenta } from "./loop.ts";
import { resumoChamadas } from "../chamadas.ts";
import { setSetting } from "../db.ts";
import { saveApiKey } from "../secrets.ts";

// Ollama de mentira: /api/show diz que chama ferramentas; /api/chat responde em streaming
// com uma chamada à ferramenta final.
function ollamaFalso() {
  const original = globalThis.fetch;
  globalThis.fetch = (async (entrada: string | URL | Request) => {
    const url = String(entrada);
    if (url.endsWith("/api/show")) return Response.json({ capabilities: ["completion", "tools"] });
    if (url.endsWith("/api/chat")) {
      const linhas = [
        { message: { content: "", tool_calls: [{ function: { name: "entregar", arguments: { conteudo: "pronto" } } }] } },
        { done: true, done_reason: "stop", prompt_eval_count: 120, eval_count: 30 },
      ];
      return new Response(linhas.map((l) => JSON.stringify(l)).join("\n") + "\n");
    }
    throw new Error(`fetch inesperado: ${url}`);
  }) as typeof fetch;
  return () => void (globalThis.fetch = original);
}

test("trabalho que não cabe no contexto do modelo local vai para o Claude, em vez de o Ollama cortar as instruções", async () => {
  saveApiKey("sk-ant-teste-falsa"); // só no banco temporário dos testes
  setSetting("provedores", JSON.stringify({ ollama: { url: "http://127.0.0.1:11434", contexto: 4096 } }));
  const original = globalThis.fetch;
  const chamados: string[] = [];
  globalThis.fetch = (async (entrada: string | URL | Request) => {
    const url = String(entrada instanceof Request ? entrada.url : entrada);
    chamados.push(url);
    if (url.endsWith("/api/show")) return Response.json({ capabilities: ["completion", "tools"] });
    throw new Error("rede desligada no teste");
  }) as typeof fetch;
  try {
    await assert.rejects(
      rodarAgente({
        modelo: "ollama:modelo-teste",
        agenteId: "ux-writer",
        sistema: "regras ".repeat(15000), // ~105 mil caracteres: não cabe nem no contexto ampliado (32 mil tokens)
        mensagem: "faça",
        ferramentas: [ferramenta("entregar", "Entrega.", { conteudo: { type: "string" } }, ["conteudo"], () => ({ texto: "ok", fim: true }))],
        lembrete: "Chame entregar.",
        fallback: false,
      }),
    );
    assert.ok(!chamados.some((u) => u.endsWith("/api/chat")), "o Ollama não pode receber um prompt que ele vai cortar");
    assert.ok(chamados.some((u) => u.includes("anthropic")), "o trabalho seguiu para o Claude");
  } finally {
    globalThis.fetch = original;
    setSetting("provedores", "{}");
  }
});

test("sombra no modelo local: se não couber, para (não gasta no Claude)", async () => {
  const restaurar = ollamaFalso();
  try {
    await assert.rejects(
      rodarAgente({
        modelo: "ollama:modelo-teste",
        agenteId: "pm",
        sistema: "regras ".repeat(60_000),
        mensagem: "faça",
        ferramentas: [ferramenta("entregar", "Entrega.", { conteudo: { type: "string" } }, ["conteudo"], () => ({ texto: "ok", fim: true }))],
        lembrete: "Chame entregar.",
        contexto: 65_536,
        semReserva: true,
      }),
      /Não cabe no contexto do modelo local/,
    );
  } finally {
    restaurar();
  }
});

test("chamadas a modelos fora do Claude entram no rastreamento (Operação → Chamadas)", async () => {
  const restaurar = ollamaFalso();
  try {
    const r = await rodarAgente({
      modelo: "ollama:modelo-teste",
      agenteId: "copywriter",
      sistema: "teste",
      mensagem: "faça",
      ferramentas: [ferramenta("entregar", "Entrega.", { conteudo: { type: "string" } }, ["conteudo"], () => ({ texto: "ok", fim: true }))],
      lembrete: "Chame entregar.",
    });
    assert.equal(r.terminou, true);
    const ch = resumoChamadas().chamadas.find((c) => c.modelo === "ollama:modelo-teste");
    assert.ok(ch, "a chamada ao Ollama precisa aparecer no rastreamento");
    assert.equal(ch.agente, "copywriter");
    assert.equal(ch.entrada, 120);
    assert.equal(ch.saida, 30);
    assert.equal(ch.parada, "tool_use");
    assert.equal(ch.usd, 0);
  } finally {
    restaurar();
  }
});

test("não cabe no local e o Claude está fora do ar: espera (passageiro), sem chamar o Claude em loop", async () => {
  const { marcarForaDoAr } = await import("../provedores.ts");
  const { ErroProvedor } = await import("./compat.ts");
  saveApiKey("sk-ant-teste-falsa");
  marcarForaDoAr("claude", Date.now() + 60_000);
  const original = globalThis.fetch;
  const chamados: string[] = [];
  globalThis.fetch = (async (entrada: string | URL | Request) => {
    const url = String(entrada instanceof Request ? entrada.url : entrada);
    chamados.push(url);
    if (url.endsWith("/api/show")) return Response.json({ capabilities: ["completion", "tools"] });
    throw new Error("rede desligada no teste");
  }) as typeof fetch;
  try {
    const erro = await rodarAgente({
      modelo: "ollama:modelo-teste",
      agenteId: "dev-backend",
      sistema: "regras ".repeat(15000),
      mensagem: "faça",
      ferramentas: [ferramenta("entregar", "Entrega.", { conteudo: { type: "string" } }, ["conteudo"], () => ({ texto: "ok", fim: true }))],
      lembrete: "Chame entregar.",
    }).catch((e: unknown) => e);
    assert.ok(erro instanceof ErroProvedor && erro.passageiro, "erro passageiro: o card espera");
    assert.ok(!chamados.some((u) => u.includes("anthropic")), "não bate no Claude fora do ar");
  } finally {
    globalThis.fetch = original;
  }
});
