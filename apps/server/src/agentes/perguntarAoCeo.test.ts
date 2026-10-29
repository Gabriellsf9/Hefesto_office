import { test } from "node:test";
import assert from "node:assert/strict";
import { agentById } from "@empresa/org";
import { colunaDeEntrada, fluxoPadrao } from "@empresa/shared";
import { criarCard, lerCard, listarComentarios } from "../tarefas.ts";
import { ferramentaPerguntarAoCeo } from "./motor.ts";

test("perguntar_ao_ceo: a primeira chamada só lembra de decidir pelo projeto; insistindo, pausa o card", async () => {
  const card = criarCard({ titulo: "Handlers de tickets", sala: "produto", dono: "pm", nivel: "N0", criterios: "CRUD", coluna: colunaDeEntrada(fluxoPadrao("produto")) });
  const f = ferramentaPerguntarAoCeo(card, agentById.pm!);

  const r1 = await f.executar!({ pergunta: "Que status HTTP devo retornar?" });
  assert.equal(r1.erro, true);
  assert.notEqual(r1.fim, true);
  assert.match(r1.texto, /Premissa/);
  assert.equal(lerCard(card.id).bloqueado, false);
  assert.equal(listarComentarios(card.id).filter((c) => c.texto.includes("Pergunta para o CEO")).length, 0);

  const r2 = await f.executar!({ pergunta: "O plano grátis terá limite de boards?" });
  assert.equal(r2.fim, true);
  assert.equal(lerCard(card.id).bloqueado, true);
  assert.ok(listarComentarios(card.id).some((c) => c.texto.includes("O plano grátis terá limite de boards?")));
});
