import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { agentById } from "@empresa/org";
import { setSetting } from "./db.ts";
import { salvarSegredo, saveApiKey } from "./secrets.ts";
import { marcarForaDoAr, modeloDoAgente } from "./provedores.ts";
import { modeloPara } from "./custo.ts";

test("provedor fora do ar: o agente passa sozinho para a reserva e volta ao escolhido quando ele se recupera", () => {
  mock.timers.enable({ apis: ["Date"], now: 1_000_000 });
  try {
    // Chaves falsas, só no banco temporário dos testes.
    saveApiKey("sk-ant-teste-falsa");
    salvarSegredo("gemini_api_key", "chave-gemini-falsa");
    setSetting("modelos_agentes", JSON.stringify({ "ui-designer": "gemini:gemini-3.8-flash", copywriter: "ollama:qwen3.5-hefesto:9b" }));
    const lucas = agentById["ui-designer"]!;
    const camila = agentById["pm"]!;

    assert.equal(modeloDoAgente(lucas, "autor"), "gemini:gemini-3.8-flash");

    // Gemini sobrecarregado: o Lucas segue no Claude dele.
    marcarForaDoAr("gemini", Date.now() + 60_000);
    assert.equal(modeloDoAgente(lucas, "autor"), modeloPara(lucas.modelo, "autor"));

    // Claude também fora: quem é do Claude vai para o modelo local que você escolheu (o Gemini está fora).
    marcarForaDoAr("claude", Date.now() + 30_000);
    assert.equal(modeloDoAgente(camila, "autor"), "ollama:qwen3.5-hefesto:9b");

    // Passou a espera: cada um volta ao seu modelo, sem ninguém mexer.
    mock.timers.tick(61_000);
    assert.equal(modeloDoAgente(lucas, "autor"), "gemini:gemini-3.8-flash");
    assert.equal(modeloDoAgente(camila, "autor"), modeloPara(camila.modelo, "autor"));
  } finally {
    mock.timers.reset();
  }
});

test("provedor fora do ar fica salvo: um reinício não esquece (e não bate de novo no Claude sem crédito); chave nova volta na hora", async () => {
  const { recarregarForaDoAr, provedorForaDoAr, marcarNoAr } = await import("./provedores.ts");
  marcarForaDoAr("claude", Date.now() + 30 * 60_000);
  recarregarForaDoAr(); // como se o servidor tivesse reiniciado
  assert.equal(provedorForaDoAr("claude"), true);
  marcarNoAr("claude");
  recarregarForaDoAr();
  assert.equal(provedorForaDoAr("claude"), false);
});
