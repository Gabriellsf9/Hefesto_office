import { test } from "node:test";
import assert from "node:assert/strict";
import { comentar, criarCard, registrarEntrega } from "../tarefas.ts";
import { agentById } from "@empresa/org";
import { mensagemAdvogado, sistemaAdvogado, sistemaAutor, sistemaValidador } from "./prompts.ts";

test("advogado e validador trazem todos os pontos de uma vez, e todos têm as regras contra alucinação", () => {
  const advogado = sistemaAdvogado(agentById["chief-of-staff"]!, "produto");
  assert.doesNotMatch(advogado, /de 3 a 6 pontos/, "o advogado não tem limite de questionamentos");
  assert.match(advogado, /TODOS os questionamentos relevantes de uma vez/);
  const validador = sistemaValidador(agentById["arquiteto"]!, "produto");
  assert.match(validador, /liste TODOS os motivos de uma vez/);
  assert.match(validador, /Confira as afirmações/);
  assert.match(validador, /entrega está sólida, os riscos residuais que ele citou não são motivo para devolver/);
  assert.match(validador, /partiu do que já existe no código/);
  assert.match(sistemaAutor(agentById["ui-designer"]!), /toda tela ou estado de tela que você propõe vai com o print/);
  for (const p of [advogado, validador, sistemaAutor(agentById["pm"]!)]) assert.match(p, /Nunca invente nomes de arquivos/);
});

test("advogado do diabo: na 2ª versão vê o que já questionou e só cobra o que ficou sem resposta", () => {
  const card = criarCard({ titulo: "Histórias de teste", sala: "produto", prioridade: "P0", dono: "pm", validador: "arquiteto" });
  registrarEntrega(card.id, "pm", "v1", "Primeira versão das histórias.");
  assert.doesNotMatch(mensagemAdvogado(card), /versões anteriores/, "a 1ª versão não tem histórico para conferir");

  comentar(card.id, "chief-of-staff", "critica", "1. Por que o MVP inclui sincronização bidirecional?");
  comentar(card.id, "arquiteto", "devolucao", "Responda ao questionamento 1.");
  registrarEntrega(card.id, "pm", "v2", "Segunda versão, sem sincronização no MVP.");

  const msg = mensagemAdvogado(card);
  assert.match(msg, /versões anteriores/);
  assert.match(msg, /sincronização bidirecional/, "a crítica anterior vai junto");
  assert.match(msg, /continuam sem resposta/);
  assert.match(msg, /versão 2/);
});
