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

test("card parado porque a resposta não coube no que restava: Liberar mais soma um limite (não só destrava)", async () => {
  const { editarCard, lerCard, tetoDoCard, somarCusto, destravarCardsNoTeto, listarCards } = await import("./tarefas.ts");
  const card = criarCard({ titulo: "Modelagem", sala: "dados", dono: "dba", validador: "arquiteto" });
  somarCusto(card.id, 2.6); // sobra US$ 0,40 de US$ 3: menos que uma resposta inteira
  editarCard(card.id, { bloqueado: true, etiquetas: ["limite-de-gasto"] });
  assert.equal(destravarCardsNoTeto(listarCards()), 0, "não destrava sozinho sem folga (seria cortado de novo)");
  const teto = tetoDoCard(lerCard(card.id));
  liberarGasto(card.id);
  assert.ok(tetoDoCard(lerCard(card.id)) > teto, "somou mais um limite");
  assert.equal(lerCard(card.id).bloqueado, false);
});

test("escada de modelos com o Claude fora do ar: card que já falhou vai para a reserva, não para o Claude", async () => {
  const { setSetting } = await import("./db.ts");
  const { salvarSegredo, saveApiKey } = await import("./secrets.ts");
  const { marcarForaDoAr } = await import("./provedores.ts");
  const { modeloEscalonado } = await import("./aprendizado.ts");
  const { agentById } = await import("@empresa/org");
  saveApiKey("sk-ant-teste-falsa");
  salvarSegredo("gemini_api_key", "chave-gemini-falsa");
  setSetting("modelos_agentes", JSON.stringify({ "head-marketing": "gemini:gemini-3.8-flash" }));
  const card = criarCard({ titulo: "Backend", sala: "desenvolvimento", dono: "dev-backend", validador: "reviewer-1" });
  comentar(card.id, "reviewer-1", "devolucao", "Falta X.");
  comentar(card.id, "reviewer-1", "devolucao", "Falta Y.");
  marcarForaDoAr("claude", Date.now() + 60_000);
  const { modelo } = modeloEscalonado(agentById["dev-backend"]!, "autor", card);
  assert.equal(modelo, "gemini:gemini-3.8-flash");
});
