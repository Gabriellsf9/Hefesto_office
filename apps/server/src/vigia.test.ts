import { test } from "node:test";
import assert from "node:assert/strict";
import { CHAMADA_LENTA_MS, FILA_PARADA_MS, SEM_PROGRESSO_MS, examinar, listarAlertas, sincronizar, type Fotografia } from "./vigia.ts";

const agora = 10_000_000_000;
function foto(f: Partial<Fotografia>): Fotografia {
  return {
    agora, emAndamento: [], ultimoPasso: () => null, ferramentasDaExecucao: () => [], falhas: [], chamadasLentas: [],
    gastoHoje: 0, orcamento: 60, fila: { naFila: 0, pausado: false, semOrcamento: false }, filaParadaDesde: null,
    chaveDoCard: (id) => `EMP-${id}`,
    ...f,
  };
}

test("vigia: card rodando sem passo novo há muito tempo vira alerta; com passo recente, não", () => {
  const desde = agora - 60 * 60_000;
  const parado = examinar(foto({ emAndamento: [{ cardId: 3, agenteId: "ui-designer", desde }], ultimoPasso: () => agora - SEM_PROGRESSO_MS - 1 }));
  assert.deepEqual(parado.map((a) => a.tipo), ["card-sem-progresso"]);
  assert.match(parado[0]!.texto, /EMP-3 está rodando \(ui-designer\) há 60 min/);
  const andando = examinar(foto({ emAndamento: [{ cardId: 3, agenteId: "ui-designer", desde }], ultimoPasso: () => agora - 60_000 }));
  assert.equal(andando.length, 0);
});

test("vigia: a mesma falha 3 vezes (números diferentes contam como iguais), loop de ferramenta e chamada lenta", () => {
  const achados = examinar(foto({
    falhas: [
      { cardId: 7, texto: "Não consegui concluir agora: não cabe (~31000 tokens)" },
      { cardId: 7, texto: "Não consegui concluir agora: não cabe (~32500 tokens)" },
      { cardId: 7, texto: "Não consegui concluir agora:  não cabe (~30100 tokens)" },
      { cardId: 8, texto: "Não consegui concluir agora: outra coisa" },
    ],
    emAndamento: [{ cardId: 7, agenteId: "dev-backend", desde: agora - 60_000 }],
    ultimoPasso: () => agora,
    ferramentasDaExecucao: () => Array.from({ length: 4 }, () => ({ nome: "mapa_do_codigo", entrada: "{}" })),
    chamadasLentas: [{ id: 534, cardId: 3, agente: "ui-designer", modelo: "ollama:qwen3.5-hefesto:9b", ms: CHAMADA_LENTA_MS * 2.6 }],
  }));
  assert.deepEqual(achados.map((a) => a.tipo).sort(), ["chamada-lenta", "erro-repetido", "loop-de-ferramenta"]);
  assert.match(achados.find((a) => a.tipo === "chamada-lenta")!.texto, /levou 26 min no EMP-3/);
});

test("vigia: gasto a partir de 80% do orçamento e fila parada há 15 minutos", () => {
  const achados = examinar(foto({ gastoHoje: 50, filaParadaDesde: agora - FILA_PARADA_MS, fila: { naFila: 4, pausado: false, semOrcamento: false } }));
  assert.deepEqual(achados.map((a) => a.tipo).sort(), ["fila-parada", "gasto-do-dia"]);
  assert.equal(examinar(foto({ gastoHoje: 20, filaParadaDesde: agora - 60_000 })).length, 0);
});

test("vigia: avisa uma vez, resolve sozinho quando some e não reabre o mesmo alerta", () => {
  const a = { chave: "lenta:1", tipo: "chamada-lenta" as const, cardId: 3, texto: "lenta" };
  assert.equal(sincronizar([a], agora).length, 1, "novo: avisa");
  assert.equal(sincronizar([a], agora + 60_000).length, 0, "continua aberto: não avisa de novo");
  assert.equal(listarAlertas().filter((x) => x.chave === "lenta:1").length, 1);
  sincronizar([], agora + 120_000);
  assert.equal(listarAlertas().filter((x) => x.chave === "lenta:1").length, 0, "condição sumiu: resolvido");
  assert.equal(sincronizar([a], agora + 180_000).length, 0, "a mesma ocorrência não reabre");
});
