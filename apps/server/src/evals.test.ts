import { test } from "node:test";
import assert from "node:assert/strict";
import { fluxoPadrao, fluxos } from "@empresa/shared";
import { criarCard, registrarEntrega } from "./tarefas.ts";
import { importarCasos, listarCasos } from "./evals.ts";

test("avaliações: card concluído com entrega vira caso real (uma vez só); card em andamento ou sem entrega, não", () => {
  const fluxo = fluxoPadrao("produto");
  const feito = fluxos[fluxo]!.colunas.find((c) => c.tipo === "feito")!.id;
  const pronto = criarCard({ titulo: "Histórias de login", sala: "produto", dono: "pm", coluna: feito, criterios: "Gherkin; fora de escopo" });
  registrarEntrega(pronto.id, "pm", "Histórias", "Dado que... ".repeat(40));
  const semEntrega = criarCard({ titulo: "Sem entrega", sala: "produto", dono: "pm", coluna: feito });
  const andando = criarCard({ titulo: "Em andamento", sala: "produto", dono: "pm" });
  registrarEntrega(andando.id, "pm", "x", "y".repeat(400));

  const casos = importarCasos();
  const ids = casos.map((c) => c.cardId);
  assert.ok(ids.includes(pronto.id));
  assert.ok(!ids.includes(semEntrega.id) && !ids.includes(andando.id));
  const caso = casos.find((c) => c.cardId === pronto.id)!;
  assert.match(caso.mensagem, /Critérios de aceite\nGherkin; fora de escopo/);
  assert.match(caso.referencia, /^Dado que/);
  importarCasos();
  assert.equal(listarCasos().filter((c) => c.cardId === pronto.id).length, 1, "não duplica");
});
