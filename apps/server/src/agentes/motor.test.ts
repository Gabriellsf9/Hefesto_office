import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { Card, TrabalhoEmAndamento } from "@empresa/shared";
import { descricaoDaParte, esperaParente, prontoParaExecutar } from "./motor.ts";

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

  test("partes do mesmo card rodam uma de cada vez (dividem a cópia)", () => {
    const p1 = card({ coluna: "em-dev", paiId: pai.id, etiquetas: ["pedido", "parte"] });
    const p2 = card({ coluna: "em-dev", paiId: pai.id, etiquetas: ["pedido", "parte"] });
    const m = mapa(pai, p1, p2);
    assert.equal(esperaParente(p2, m, [rodando(p1.id)]), true);
    assert.equal(esperaParente(p2, m, [rodando(p1.id, "validar")]), false);
  });

  test("cards sem parentesco rodam juntos", () => {
    assert.equal(esperaParente(outro, porId, [rodando(pai.id), rodando(filho.id)]), false);
  });
});

describe("o validador julga com o registro do sistema", () => {
  test("lista o que o autor consultou na versão atual (ex.: viu os prints com ver_imagem)", async () => {
    const { criarCard, registrarEntrega } = await import("../tarefas.ts");
    const { novaExecucao, registrarPasso } = await import("../confianca/execucoes.ts");
    const { consultasDoAutor } = await import("./motor.ts");
    const card = criarCard({ titulo: "Protótipo", sala: "design", dono: "ui-designer", validador: "pm" });
    registrarEntrega(card.id, "ui-designer", "v1", "primeira");
    const run = novaExecucao(card.id, "ui-designer", "claude-sonnet-5-5");
    registrarPasso(run, { rodada: 0, tipo: "ferramenta", nome: "ver_imagem", entrada: { caminho: "frontend/public/site/vibra/mural.webp" }, saida: "Imagem" });
    registrarPasso(run, { rodada: 1, tipo: "ferramenta", nome: "ler_arquivo", entrada: { caminho: "frontend/app/globals.css" }, saida: "..." });
    registrarPasso(run, { rodada: 2, tipo: "ferramenta", nome: "entregar", entrada: { conteudo: "x" }, saida: "ok" });
    registrarEntrega(card.id, "ui-designer", "v2", "segunda");
    const lista = consultasDoAutor(card);
    assert.match(lista, /ver_imagem: frontend\/public\/site\/vibra\/mural\.webp/);
    assert.match(lista, /ler_arquivo: frontend\/app\/globals\.css/);
    assert.doesNotMatch(lista, /entregar/, "só consultas e verificações");
  });
});

describe("conta da Anthropic sem crédito", () => {
  test("é reconhecido (não é falha do card) e não confunde com outros 400", async () => {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const { semCreditoNaAnthropic } = await import("./motor.ts");
    const corpo = (message: string) => ({ type: "error", error: { type: "invalid_request_error", message } });
    const semCredito = Anthropic.APIError.generate(400, corpo("Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."), undefined, new Headers());
    const outro400 = Anthropic.APIError.generate(400, corpo("messages.1: tool use without result"), undefined, new Headers());
    assert.equal(semCreditoNaAnthropic(semCredito), true);
    assert.equal(semCreditoNaAnthropic(outro400), false);
    assert.equal(semCreditoNaAnthropic(new Error("credit balance is too low")), false, "só erro da API da Anthropic");
  });
});

test("parte criada pelo modelo local leva o contexto e os critérios do card principal (a descrição dele costuma vir curta)", () => {
  const pai = card({ chave: "EMP-7", titulo: "Backend de cards", descricao: "Gestão nativa de cards, sem Yondra.", criterios: "CRUD de tickets com RN-33." });
  const d = descricaoDaParte("Parte 4: eventos de card", pai, "1. EMP-14: queries\n2. EMP-15: eventos");
  assert.match(d, /^Parte 4: eventos de card/);
  assert.match(d, /Contexto do card principal \(EMP-7\)\nGestão nativa de cards, sem Yondra\./);
  assert.match(d, /CRUD de tickets com RN-33/);
  assert.match(d, /2\. EMP-15: eventos/);
});

test("modo plano: sem plano, propor; com plano proposto, executar com os ajustes que o CEO comentou depois dele", async () => {
  const { estadoDoPlano, ETIQUETA_PLANO } = await import("./motor.ts");
  const { criarCard, comentar } = await import("../tarefas.ts");
  const c = criarCard({ titulo: "Tela de integrações", sala: "design", dono: "ui-designer", etiquetas: [ETIQUETA_PLANO] });
  assert.deepEqual(estadoDoPlano(c), { fase: "propor" });
  comentar(c.id, "voce", "comentario", "comentário antigo, antes do plano");
  comentar(c.id, "ui-designer", "comentario", "📋 Plano proposto\n1. Ler a tela atual\n2. Desenhar a nova");
  comentar(c.id, "voce", "comentario", "Use o mesmo menu lateral.");
  assert.deepEqual(estadoDoPlano(c), { fase: "executar", plano: "1. Ler a tela atual\n2. Desenhar a nova", ajustes: ["Use o mesmo menu lateral."] });
  assert.equal(estadoDoPlano(criarCard({ titulo: "Sem plano", sala: "design", dono: "ui-designer" })), null);
});
