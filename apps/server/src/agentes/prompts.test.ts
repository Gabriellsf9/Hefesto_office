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

test("autor refazendo: a entrega anterior gigante vai em trecho (o resto por ler_card), mas a pequena vai inteira", async () => {
  const { trechoDaEntregaAnterior } = await import("./prompts.ts");
  const card = criarCard({ titulo: "Protótipo", sala: "design", dono: "ui-designer", validador: "pm" });
  assert.equal(trechoDaEntregaAnterior(card, "curta"), "curta");
  const grande = "x".repeat(78_000);
  const trecho = trechoDaEntregaAnterior(card, grande);
  assert.ok(trecho.length < 21_000, "não reenvia os 78 mil caracteres a cada passo");
  assert.match(trecho, new RegExp(`ler_card ${card.chave} com a_partir_de: 20000`));
  assert.match(trecho, /entregue o conteúdo completo/);
});

test("autor no modelo local: mensagem enxuta e, em card grande, a orientação de dividir em partes logo no início", async () => {
  const { mensagemExecutar } = await import("./prompts.ts");
  const card = criarCard({ titulo: "Protótipo de 5 telas", sala: "design", dono: "ui-designer", validador: "pm" });
  registrarEntrega(card.id, "ui-designer", "v1", "x".repeat(78_000));
  const nuvem = mensagemExecutar(card);
  const local = mensagemExecutar(card, { local: true, podeDividir: true });
  assert.ok(local.length < nuvem.length - 10_000, "a entrega anterior vai num trecho bem menor");
  assert.match(local, /a_partir_de: 6000/);
  assert.match(local, /dividir_em_partes AGORA/);
  assert.doesNotMatch(nuvem, /dividir_em_partes/, "na nuvem não há divisão");
  assert.doesNotMatch(mensagemExecutar(card, { local: true }), /dividir_em_partes/, "card que já foi dividido (ou é parte) não recebe a orientação");
});

test("card dividido: o autor volta com o resultado das partes e junta sem copiar tudo de novo", async () => {
  const { mensagemExecutar, ETIQUETA_PARTE } = await import("./prompts.ts");
  const pai = criarCard({ titulo: "Backend de cards", sala: "desenvolvimento", dono: "dev-backend", validador: "reviewer-1" });
  const parte = criarCard({ titulo: "parte 1/2: endpoints", sala: "desenvolvimento", dono: "dev-backend", paiId: pai.id, etiquetas: ["pedido", ETIQUETA_PARTE] });
  registrarEntrega(parte.id, "dev-backend", "Endpoints prontos", "detalhes ".repeat(2000));
  const msg = mensagemExecutar(pai, { local: true });
  assert.match(msg, /As partes em que você dividiu este card/);
  assert.match(msg, new RegExp(parte.chave));
  assert.match(msg, /Não copie de novo/);
  assert.doesNotMatch(msg, /Pedidos que você fez a outras áreas/, "parte não é pedido a outra área");
});

test("Helena sabe quem trabalha no modelo local e cria cards pequenos para eles", async () => {
  const { capacidadeDosExecutores } = await import("./prompts.ts");
  const { setSetting } = await import("../db.ts");
  setSetting("modelos_agentes", "{}");
  assert.equal(capacidadeDosExecutores(), "", "ninguém no local: nada a dizer");
  setSetting("modelos_agentes", JSON.stringify({ "dev-backend": "ollama:qwen3.5-hefesto:9b" }));
  const t = capacidadeDosExecutores();
  assert.match(t, /\(dev-backend\)/);
  assert.match(t, /uma tela, um endpoint/);
  setSetting("modelos_agentes", "{}");
});
