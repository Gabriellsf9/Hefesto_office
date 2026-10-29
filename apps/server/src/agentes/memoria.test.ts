import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { setSetting } from "../db.ts";
import { escolhas } from "../provedores.ts";
import { examinar, type Fotografia } from "../vigia.ts";
import { ferramenta, rodarAgente } from "./loop.ts";
import { informarMemoriaLivre, leituraDeMemoria, modeloMenor, rebaixamentosRecentes, verificarMemoria } from "./memoria.ts";

const TAGS = { models: [
  { name: "grande:20b", size: 14e9, capabilities: ["completion", "tools"] },
  { name: "medio:9b", size: 6.6e9, capabilities: ["completion", "tools"] },
  { name: "sem-ferramentas:3b", size: 2e9, capabilities: ["completion"] },
  { name: "pequeno:2b", size: 1.5e9, capabilities: ["completion", "tools"] },
] };

/** O que o Ollama falso diz ter carregado (/api/ps). */
let carregados: { name: string; size: number }[] = [{ name: "grande:20b", size: 14e9 }];

/** Ollama falso: recusa "grande" por falta de memória; o resto responde entregando. */
async function ollamaFalso() {
  const pedidos: { url: string; corpo: Record<string, unknown> }[] = [];
  const s = createServer((req, res) => {
    let corpo = "";
    req.on("data", (c) => (corpo += c));
    req.on("end", () => {
      const j = corpo ? (JSON.parse(corpo) as Record<string, unknown>) : {};
      pedidos.push({ url: req.url ?? "", corpo: j });
      if (req.url === "/api/tags") return void res.end(JSON.stringify(TAGS));
      if (req.url === "/api/version") return void res.end(JSON.stringify({ version: "0.12.0" }));
      if (req.url === "/api/show") return void res.end(JSON.stringify({ capabilities: ["completion", "tools"] }));
      if (req.url === "/api/ps") return void res.end(JSON.stringify({ models: carregados }));
      if (req.url === "/api/generate") return void res.end("{}");
      if (j.model === "grande:20b") {
        res.statusCode = 500;
        return void res.end(JSON.stringify({ error: "model requires more system memory (13.9 GiB) than is available (4.1 GiB)" }));
      }
      res.end(`${JSON.stringify({ message: { content: "", tool_calls: [{ function: { name: "entregar", arguments: { conteudo: "ok" } } }] } })}\n${JSON.stringify({ done: true, prompt_eval_count: 10, eval_count: 5 })}\n`);
    });
  });
  await new Promise<void>((ok) => s.listen(0, "127.0.0.1", ok));
  setSetting("provedores", JSON.stringify({ ollama: { url: `http://127.0.0.1:${(s.address() as AddressInfo).port}`, contexto: 16_384 } }));
    // Fecha as conexões e espera o servidor fechar: com o fetch ainda conectado, o Node no Windows aborta na saída.
  const fechar = () => new Promise<void>((ok) => {
    s.closeAllConnections();
    s.close(() => setTimeout(ok, 100)); // e dá tempo para o lado do fetch ver o fechamento
  });
  return { pedidos, fechar };
}

test("modelo menor: o maior entre os menores que chamam ferramentas", () => {
  const lista = TAGS.models.map((m) => ({ nome: m.name, tamanhoGb: m.size / 1e9, ferramentas: m.capabilities.includes("tools") }));
  assert.equal(modeloMenor("grande:20b", lista), "medio:9b");
  assert.equal(modeloMenor("medio:9b", lista), "pequeno:2b", "pula o que não chama ferramentas");
  assert.equal(modeloMenor("pequeno:2b", lista), null);
  // Entre os menores, prefere um que algum agente já usa (mesmo que não seja o maior).
  assert.equal(modeloMenor("grande:20b", [...lista, { nome: "antigo:14b", tamanhoGb: 9, ferramentas: true }], new Set(["medio:9b"])), "medio:9b");
  assert.equal(modeloMenor("grande:20b", [...lista, { nome: "antigo:14b", tamanhoGb: 8, ferramentas: true }]), "antigo:14b", "sem nenhum em uso: o maior");
  // Com mais de 60% do tamanho não conta como menor: o gpt-oss (14 GB) caiu num 14b de 12,7 GB carregado.
  assert.equal(modeloMenor("grande:20b", [...lista, { nome: "antigo:14b", tamanhoGb: 9, ferramentas: true }]), "medio:9b");
  // No empate de tamanho, a versão -hefesto.
  assert.equal(modeloMenor("grande:20b", [...lista, { nome: "medio-hefesto:9b", tamanhoGb: 6.6, ferramentas: true }]), "medio-hefesto:9b");
});

test("sem memória para o modelo: o agente passa para o menor, o trabalho termina e a vigia avisa", async () => {
  const o = await ollamaFalso();
  setSetting("modelos_agentes", JSON.stringify({ "dev-backend": "ollama:grande:20b" }));
  try {
    const r = await rodarAgente({
      modelo: "ollama:grande:20b", agenteId: "dev-backend", sistema: "s", mensagem: "m", lembrete: "Entregue.",
      ferramentas: [ferramenta("entregar", "E.", { conteudo: { type: "string" } }, ["conteudo"], () => ({ texto: "ok", fim: true }))],
    });
    assert.equal(r.terminou, true);
    assert.equal(escolhas()["dev-backend"], "ollama:medio:9b");
    assert.ok(o.pedidos.some((p) => p.url === "/api/chat" && p.corpo.model === "medio:9b"), "repetiu no menor");
    const reb = rebaixamentosRecentes(Date.now() - 60_000).at(-1)!;
    assert.deepEqual([reb.de, reb.para, reb.agentes], ["grande:20b", "medio:9b", ["dev-backend"]]);
    const achados = examinar({ agora: Date.now(), emAndamento: [], falhas: [], chamadasLentas: [], gastoHoje: 0, orcamento: 10, fila: { naFila: 0, pausado: false, semOrcamento: false }, filaParadaDesde: null, chaveDoCard: String, ultimoPasso: () => null, ferramentasDaExecucao: () => [], rebaixamentos: [reb] } as Fotografia);
    assert.match(achados.find((a) => a.tipo === "memoria")!.texto, /Rafael passou de grande:20b para medio:9b/);
  } finally {
    await o.fechar();
    setSetting("modelos_agentes", "{}");
  }
});

test("prevenção: memória baixa em três leituras seguidas troca os agentes do modelo carregado e o descarrega", async () => {
  const o = await ollamaFalso();
  setSetting("modelos_agentes", JSON.stringify({ "dev-backend": "ollama:grande:20b", "dev-frontend": "ollama:grande:20b", designer: "ollama:medio:9b" }));
  try {
    assert.equal(await verificarMemoria(0.9), null, "uma leitura baixa só não basta");
    assert.equal(await verificarMemoria(5), null, "voltou ao normal: zera");
    assert.equal(await verificarMemoria(0.9), null);
    assert.equal(await verificarMemoria(0.85), null, "duas ainda não (um pico passageiro, como o build de uma atualização)");
    assert.equal(await verificarMemoria(0.8), "medio:9b");
    const e = escolhas();
    assert.equal(e["dev-backend"], "ollama:medio:9b");
    assert.equal(e["dev-frontend"], "ollama:medio:9b");
    assert.equal(e.designer, "ollama:medio:9b", "quem já estava no menor continua");
    assert.ok(o.pedidos.some((p) => p.url === "/api/generate" && p.corpo.model === "grande:20b" && p.corpo.keep_alive === 0), "descarregou o grande");
  } finally {
    await o.fechar();
    setSetting("modelos_agentes", "{}");
    setSetting("provedores", "{}");
  }
});

test("leitura do computador: a informada pelo script vale por 90 s e tem prioridade", () => {
  assert.throws(() => informarMemoriaLivre(Number.NaN), /inválida/);
  informarMemoriaLivre(3.25);
  assert.deepEqual(leituraDeMemoria(), { livreGb: 3.25, fonte: "computador" });
});

test("volta sozinho: com memória sobrando por 30 minutos seguidos, os agentes que ainda estão no menor voltam ao original", async () => {
  const { FOLGA_PARA_VOLTAR_MS, rebaixar } = await import("./memoria.ts");
  const o = await ollamaFalso();
  setSetting("modelos_agentes", JSON.stringify({ copywriter: "ollama:grande:20b", rh: "ollama:grande:20b" }));
  try {
    carregados = [{ name: "medio:9b", size: 6.6e9 }];
    rebaixar("grande:20b", "medio:9b", "teste de volta");
    // O CEO trocou o rh à mão depois: ele fica como está.
    setSetting("modelos_agentes", JSON.stringify({ ...escolhas(), rh: "ollama:pequeno:2b" }));
    const t0 = Date.now();
    assert.equal(await verificarMemoria(30, t0), null, "começa a contar a folga");
    assert.equal(await verificarMemoria(5, t0 + 60_000), null, "folga curta (5 GB < 14 - 6,6 que o menor devolve + 2,5): zera");
    assert.equal(await verificarMemoria(30, t0 + 120_000), null);
    assert.equal(await verificarMemoria(30, t0 + 120_000 + FOLGA_PARA_VOLTAR_MS - 1000), null, "ainda não deu 30 min");
    assert.equal(await verificarMemoria(30, t0 + 120_000 + FOLGA_PARA_VOLTAR_MS), "grande:20b");
    assert.equal(escolhas().copywriter, "ollama:grande:20b", "voltou");
    assert.equal(escolhas().rh, "ollama:pequeno:2b", "o que o CEO trocou fica");
    assert.ok(!rebaixamentosRecentes(t0 - 60_000).some((r) => r.motivo === "teste de volta"), "o alerta some");
  } finally {
    await o.fechar();
    setSetting("modelos_agentes", "{}");
    setSetting("provedores", "{}");
  }
});

test("volta sozinho: cada troca pendente conta a sua folga; a que cabe volta mesmo com outra maior pendente", async () => {
  const { FOLGA_PARA_VOLTAR_MS, rebaixar } = await import("./memoria.ts");
  const o = await ollamaFalso();
  setSetting("modelos_agentes", JSON.stringify({ copywriter: "ollama:medio:9b", "dev-backend": "ollama:grande:20b" }));
  try {
    carregados = [];
    rebaixar("medio:9b", "pequeno:2b", "teste antiga"); // copywriter: 9b → 2b (precisa de ~9,1 GB)
    rebaixar("grande:20b", "medio:9b", "teste recente"); // dev-backend: 20b → 9b (precisa de ~16,5 GB)
    const t0 = Date.now() + 10 * 60_000;
    // 10 GB livres: cabe a volta do 9b, não a do 20b.
    assert.equal(await verificarMemoria(10, t0), null);
    assert.equal(await verificarMemoria(10, t0 + FOLGA_PARA_VOLTAR_MS), "medio:9b", "a mais antiga (que cabe) voltou");
    assert.equal(escolhas().copywriter, "ollama:medio:9b");
    assert.equal(escolhas()["dev-backend"], "ollama:medio:9b", "a do 20b continua pendente");
  } finally {
    await o.fechar();
    setSetting("modelos_agentes", "{}");
    setSetting("provedores", "{}");
    carregados = [{ name: "grande:20b", size: 14e9 }];
  }
});

test("volta sozinho: com o original ainda carregado (outros agentes o usam), a volta não custa memória", async () => {
  const { FOLGA_PARA_VOLTAR_MS, rebaixar } = await import("./memoria.ts");
  const o = await ollamaFalso();
  setSetting("modelos_agentes", JSON.stringify({ seo: "ollama:grande:20b" }));
  try {
    carregados = [{ name: "grande:20b", size: 14e9 }];
    rebaixar("grande:20b", "medio:9b", "teste carregado");
    const t0 = Date.now() + 20 * 60_000;
    assert.equal(await verificarMemoria(3, t0), null, "3 GB livres bastam (1,5 + 1)");
    assert.equal(await verificarMemoria(3, t0 + FOLGA_PARA_VOLTAR_MS), "grande:20b");
    assert.equal(escolhas().seo, "ollama:grande:20b");
  } finally {
    await o.fechar();
    setSetting("modelos_agentes", "{}");
    setSetting("provedores", "{}");
  }
});
