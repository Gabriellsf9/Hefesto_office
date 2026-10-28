import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { Card, TrabalhoEmAndamento } from "@empresa/shared";
import { esperaParente, prontoParaExecutar } from "./motor.ts";

let proximo = 1;
function card(c: Partial<Card>): Card {
  return {
    id: proximo++, chave: "EMP-0", fluxo: "software", coluna: "a-fazer", ordem: 1, tipo: "tarefa", titulo: "t", descricao: "", criterios: "",
    prioridade: "P1", nivel: "N1", sala: "desenvolvimento", dono: "dev-frontend", validador: "reviewer-1", emValidacao: false, etiquetas: [],
    prazo: null, paiId: null, bugDe: null, dependeDe: null, dependencias: [], severidade: null, devolucoes: 0, bloqueado: false,
    projetoId: null, custoUsd: 0, demo: false, criadoEm: 0, atualizadoEm: 0,
    ...c,
  } as Card;
}
const mapa = (...cs: Card[]) => new Map(cs.map((c) => [c.id, c]));
const rodando = (cardId: number, tipo: "executar" | "validar" = "executar"): TrabalhoEmAndamento => ({ cardId, agenteId: "x", tipo, desde: 0 });

describe("prontoParaExecutar", () => {
  test("card do QA devolvido para Em QA volta para o dono (EMP-18)", () => {
    const c = card({ sala: "qa", coluna: "em-qa", dono: "qa-e2e", validador: "po", devolucoes: 1 });
    assert.equal(prontoParaExecutar(c, mapa(c)), true);
  });

  test("card do pentest devolvido para Segurança volta para o dono", () => {
    const c = card({ sala: "seguranca", coluna: "seguranca", dono: "pentester", validador: "cto" });
    assert.equal(prontoParaExecutar(c, mapa(c)), true);
  });

  test("card do QA que está em validação continua com o validador", () => {
    const c = card({ sala: "qa", coluna: "em-qa", dono: "qa-e2e", emValidacao: true });
    assert.equal(prontoParaExecutar(c, mapa(c)), false);
  });

  test("card de dev numa coluna de validação de outra sala não é executado", () => {
    const c = card({ sala: "desenvolvimento", coluna: "em-qa" });
    assert.equal(prontoParaExecutar(c, mapa(c)), false);
  });

  test("card de dev em Em dev segue como antes", () => {
    const c = card({ coluna: "em-dev" });
    assert.equal(prontoParaExecutar(c, mapa(c)), true);
  });
});

describe("esperaParente", () => {
  const pai = card({ coluna: "em-dev" });
  const filho = card({ coluna: "em-dev", paiId: pai.id });
  const outro = card({ coluna: "em-dev" });
  const porId = mapa(pai, filho, outro);

  test("apoio espera a rodada do pai", () => {
    assert.equal(esperaParente(filho, porId, [rodando(pai.id)]), true);
  });

  test("pai espera a rodada do apoio (os dois mexem na mesma cópia)", () => {
    assert.equal(esperaParente(pai, porId, [rodando(filho.id)]), true);
  });

  test("validação do parente não segura ninguém", () => {
    assert.equal(esperaParente(filho, porId, [rodando(pai.id, "validar")]), false);
  });

  test("cards sem parentesco rodam juntos", () => {
    assert.equal(esperaParente(outro, porId, [rodando(pai.id), rodando(filho.id)]), false);
  });
});
