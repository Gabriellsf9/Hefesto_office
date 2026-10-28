import { test } from "node:test";
import assert from "node:assert/strict";
import { comentar, comentarComoCeo, criarCard, liberarGasto } from "./tarefas.ts";
import { configurarAprendizado, falhasDoCard, modeloMaisBarato } from "./aprendizado.ts";

test("teste sombra: com um modelo local configurado, é ele que refaz o card", () => {
  assert.equal(modeloMaisBarato("claude-sonnet-5-5"), "claude-haiku-5-5", "sem configuração: um degrau abaixo");
  configurarAprendizado({ sombraLocal: "ollama:gpt-oss-hefesto:20b" });
  assert.equal(modeloMaisBarato("claude-sonnet-5-5"), "ollama:gpt-oss-hefesto:20b");
  assert.equal(modeloMaisBarato("claude-opus-5-5"), "ollama:gpt-oss-hefesto:20b");
  configurarAprendizado({ sombraLocal: "claude-opus-5-5" });
  assert.equal(modeloMaisBarato("claude-sonnet-5-5"), "claude-haiku-5-5", "só aceita modelo local");
});

test("liberar gasto não zera as contagens de rodadas e falhas; um comentário de verdade do CEO zera", () => {
  const card = criarCard({ titulo: "Histórias", sala: "produto", dono: "pm", validador: "arquiteto" });
  comentar(card.id, "arquiteto", "devolucao", "Falta o critério X.");
  comentar(card.id, "arquiteto", "devolucao", "Falta o critério Y.");
  liberarGasto(card.id);
  assert.equal(falhasDoCard(card.id), 2, "o clique em Liberar mais não é decisão sobre o trabalho");

  comentarComoCeo(card.id, "Pode seguir sem o critério Y.");
  assert.equal(falhasDoCard(card.id), 0, "a orientação do CEO recomeça a contagem");
});
