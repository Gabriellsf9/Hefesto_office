import { test } from "node:test";
import assert from "node:assert/strict";
import { colunaDeEntrada, fluxoPadrao } from "@empresa/shared";
import { cancelarCard, comentarComoCeo, criarCard, editarCard, ETIQUETA_AGUARDA_OK, lerCard, listarCards } from "../tarefas.ts";
import { escopoDoObjetivo, ETIQUETA_PEDIDO } from "./motor.ts";

const novo = (titulo: string, sala: "design" | "devops" | "desenvolvimento", paiId?: number) =>
  criarCard({ titulo, sala, dono: null, nivel: "N1", coluna: colunaDeEntrada(fluxoPadrao(sala)), paiId, etiquetas: paiId ? [ETIQUETA_PEDIDO] : [] });

test("escopo do objetivo: raiz, derivados em qualquer nível e áreas já envolvidas", () => {
  const raiz = novo("Protótipo", "design");
  const parte = novo("Parte 1", "design", raiz.id);
  const devops = novo("Ambiente para prints", "devops", raiz.id);
  const subparte = novo("Compose", "devops", devops.id);

  const e = escopoDoObjetivo(lerCard(subparte.id), listarCards());
  assert.equal(e.raiz.id, raiz.id);
  assert.equal(e.derivados, 3);
  assert.ok(e.salas.has("devops"), "a área de um card da árvore conta");
  assert.ok(e.salas.has("desenvolvimento"), "as áreas das colunas do fluxo de software contam");
  assert.ok(!e.salas.has("marketing"));

  // Cancelado não conta.
  cancelarCard(devops.id, "voce", "fora do escopo");
  const depois = escopoDoObjetivo(lerCard(parte.id), listarCards());
  assert.equal(depois.derivados, 1);
  assert.ok(!depois.salas.has("devops"));
});

test("cancelar: leva junto os filhos abertos, guarda o histórico e não mexe no que já terminou", () => {
  const raiz = novo("Objetivo", "design");
  const filho = novo("Pedido", "devops", raiz.id);
  const neto = novo("Parte do pedido", "devops", filho.id);
  const irmao = novo("Outra parte", "design", raiz.id);
  editarCard(neto.id, { bloqueado: true });

  const ids = cancelarCard(filho.id, "voce", "não é essencial");
  assert.deepEqual(ids.sort(), [filho.id, neto.id].sort());
  for (const id of ids) {
    const c = lerCard(id);
    assert.equal(c.coluna, "cancelado");
    assert.equal(c.bloqueado, false);
  }
  assert.equal(lerCard(irmao.id).coluna, irmao.coluna, "o irmão segue");
  assert.equal(lerCard(raiz.id).coluna, raiz.coluna, "o pai segue");
  assert.deepEqual(cancelarCard(filho.id, "voce", "de novo"), [], "cancelado não cancela de novo");
});

test("comentar num pedido que espera o OK libera e tira a etiqueta", () => {
  const raiz = novo("Objetivo", "design");
  const pedido = criarCard({ titulo: "Pedido", sala: "devops", nivel: "N1", coluna: colunaDeEntrada(fluxoPadrao("devops")), paiId: raiz.id, etiquetas: [ETIQUETA_PEDIDO, ETIQUETA_AGUARDA_OK] });
  editarCard(pedido.id, { bloqueado: true });
  comentarComoCeo(pedido.id, "Pode fazer.");
  const c = lerCard(pedido.id);
  assert.equal(c.bloqueado, false);
  assert.deepEqual(c.etiquetas, [ETIQUETA_PEDIDO]);
});
