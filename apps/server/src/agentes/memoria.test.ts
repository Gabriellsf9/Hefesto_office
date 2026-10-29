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
      if (req.url === "/api/ps") return void res.end(JSON.stringify({ models: [{ name: "grande:20b", size: 14e9 }] }));
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

test("prevenção: memória baixa em duas leituras seguidas troca os agentes do modelo carregado e o descarrega", async () => {
  const o = await ollamaFalso();
  setSetting("modelos_agentes", JSON.stringify({ "dev-backend": "ollama:grande:20b", "dev-frontend": "ollama:grande:20b", designer: "ollama:medio:9b" }));
  try {
    assert.equal(await verificarMemoria(0.9), null, "uma leitura baixa só não basta");
    assert.equal(await verificarMemoria(5), null, "voltou ao normal: zera");
    assert.equal(await verificarMemoria(0.9), null);
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
