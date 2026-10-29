import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { setTimeout as esperar } from "node:timers/promises";
import { agents } from "@empresa/org";
import { colunaDe, colunaDeEntrada, fluxoPadrao } from "@empresa/shared";
import { setSetting } from "../db.ts";
import { criarCard, lerCard, listarComentarios, listarEntregas, repassadosEm } from "../tarefas.ts";
import { encerrarMotor, estadoMotor, iniciarMotor } from "./motor.ts";

// O motor de verdade, do começo ao fim, com um Ollama de mentira: o autor entrega (rascunho → autocrítica →
// entrega), o validador aprova e o card N0 termina sozinho. Pega quebras entre as peças que os testes de
// unidade não veem (fila, repasse, validação, colunas).

test("motor de ponta a ponta: card N0 no modelo local vai da fila ao concluído (entrega, autocrítica e validação)", async () => {
  const chamadas: string[] = [];
  const servidor = createServer((req, res) => {
    if (req.url === "/api/show") return void res.end(JSON.stringify({ capabilities: ["completion", "tools"] }));
    let corpo = "";
    req.on("data", (c) => (corpo += c));
    req.on("end", () => {
      const pedido = JSON.parse(corpo) as { tools?: { function: { name: string } }[] };
      const nomes = new Set((pedido.tools ?? []).map((t) => t.function.name));
      const chamada = nomes.has("entregar")
        ? { name: "entregar", arguments: { resumo: "Histórias prontas", conteudo: `# Histórias\n${"Dado um usuário, quando ele entra, então vê o painel. ".repeat(12)}`, autocritica: "Conferi cada critério." } }
        : nomes.has("aprovar")
          ? { name: "aprovar", arguments: { parecer: "Confere com os critérios de aceite." } }
          : null;
      chamadas.push(chamada?.name ?? "texto");
      const msg = chamada ? { content: "", tool_calls: [{ function: chamada }] } : { content: "ok" };
      res.end(`${JSON.stringify({ message: msg })}\n${JSON.stringify({ done: true, prompt_eval_count: 100, eval_count: 10 })}\n`);
    });
  });
  await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
  setSetting("provedores", JSON.stringify({ ollama: { url: `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`, contexto: 16_384 } }));
  setSetting("modelos_agentes", JSON.stringify(Object.fromEntries(agents.map((a) => [a.id, "ollama:modelo-teste"]))));
  try {
    const card = criarCard({ titulo: "Histórias do login", sala: "produto", dono: "pm", nivel: "N0", criterios: "Gherkin", coluna: colunaDeEntrada(fluxoPadrao("produto")) });
    iniciarMotor();
    let atual = lerCard(card.id);
    for (let i = 0; i < 300 && colunaDe(atual.fluxo, atual.coluna)?.tipo !== "feito"; i++) {
      // Sem a animação da entrega em mãos no escritório 3D (12 s por repasse).
      repassadosEm.clear();
      await esperar(100);
      atual = lerCard(card.id);
    }
    assert.equal(colunaDe(atual.fluxo, atual.coluna)?.tipo, "feito", `terminou na coluna ${atual.coluna}; chamadas: ${chamadas.join(", ")}`);
    assert.equal(listarEntregas(card.id).length, 1);
    assert.ok(chamadas.filter((c) => c === "entregar").length >= 2, "rascunho e entrega final (autocrítica)");
    assert.ok(chamadas.includes("aprovar"), "o validador aprovou");
    assert.ok(listarComentarios(card.id).some((c) => c.tipo === "autocritica"));
  } finally {
    await encerrarMotor(5000);
    assert.equal(estadoMotor().emAndamento.length, 0);
    servidor.close();
    setSetting("provedores", "{}");
    setSetting("modelos_agentes", "{}");
  }
});

test("ensaio de falha: o Gemini do agente está sem cota e a reserva é o modelo local; o card conclui no local e o local nunca fica 'fora do ar'", async () => {
  const { salvarSegredo } = await import("../secrets.ts");
  const { provedorForaDoAr } = await import("../provedores.ts");
  const chamadasLocais: string[] = [];
  const servidor = createServer((req, res) => {
    if (req.url === "/api/show") return void res.end(JSON.stringify({ capabilities: ["completion", "tools"] }));
    let corpo = "";
    req.on("data", (c) => (corpo += c));
    req.on("end", () => {
      const nomes = new Set(((JSON.parse(corpo) as { tools?: { function: { name: string } }[] }).tools ?? []).map((t) => t.function.name));
      const chamada = nomes.has("entregar")
        ? { name: "entregar", arguments: { resumo: "Pronto", conteudo: `# Entrega\n${"Conteúdo da entrega com os critérios atendidos. ".repeat(12)}`, autocritica: "Conferi." } }
        : nomes.has("aprovar") ? { name: "aprovar", arguments: { parecer: "Ok." } } : null;
      chamadasLocais.push(chamada?.name ?? "texto");
      res.end(`${JSON.stringify({ message: chamada ? { content: "", tool_calls: [{ function: chamada }] } : { content: "ok" } })}\n${JSON.stringify({ done: true, prompt_eval_count: 100, eval_count: 10 })}\n`);
    });
  });
  await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
  setSetting("provedores", JSON.stringify({ ollama: { url: `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`, contexto: 16_384 } }));
  // Quem escreve está no Gemini (sem cota); todos os outros no local, que também é a reserva.
  setSetting("modelos_agentes", JSON.stringify({ ...Object.fromEntries(agents.map((a) => [a.id, "ollama:modelo-teste"])), pm: "gemini:gemini-teste", po: "gemini:gemini-teste" }));
  salvarSegredo("gemini_api_key", "chave-gemini-falsa"); // só no banco temporário dos testes
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ error: { message: "You exceeded your current quota" } }), { status: 429 })) as typeof fetch;
  try {
    // Dois cards no Gemini falhando juntos: a segunda falha chega com o agente já apontando para a reserva (o bug).
    const card = criarCard({ titulo: "Histórias do cadastro", sala: "produto", dono: "pm", nivel: "N0", criterios: "Gherkin", coluna: colunaDeEntrada(fluxoPadrao("produto")) });
    const outro = criarCard({ titulo: "Critérios do login", sala: "produto", dono: "po", nivel: "N0", criterios: "Gherkin", coluna: colunaDeEntrada(fluxoPadrao("produto")) });
    iniciarMotor();
    let atual = lerCard(card.id);
    const feito = (c: typeof atual) => colunaDe(c.fluxo, c.coluna)?.tipo === "feito";
    for (let i = 0; i < 400 && !(feito(atual) && feito(lerCard(outro.id))); i++) {
      repassadosEm.clear();
      assert.equal(provedorForaDoAr("ollama"), false, "o modelo local (a reserva) nunca pode ser marcado fora do ar pela falha do Gemini");
      await esperar(100);
      atual = lerCard(card.id);
    }
    assert.equal(colunaDe(atual.fluxo, atual.coluna)?.tipo, "feito", `terminou em ${atual.coluna}; locais: ${chamadasLocais.join(", ")}`);
    assert.ok(feito(lerCard(outro.id)), "o segundo card também concluiu");
    assert.equal(provedorForaDoAr("gemini"), true, "o Gemini sem cota fica fora");
    assert.ok(chamadasLocais.includes("entregar"), "a entrega saiu do modelo local");
  } finally {
    globalThis.fetch = original;
    await encerrarMotor(5000);
    servidor.close();
    setSetting("provedores", "{}");
    setSetting("modelos_agentes", "{}");
  }
});

test("reinício entre a entrega e a revisão: o motor segue da verificação, sem o autor refazer o trabalho", async () => {
  const { registrarEntrega } = await import("../tarefas.ts");
  const { marcarEntregue } = await import("./motor.ts");
  const chamadas: string[] = [];
  const servidor = createServer((req, res) => {
    if (req.url === "/api/show") return void res.end(JSON.stringify({ capabilities: ["completion", "tools"] }));
    let corpo = "";
    req.on("data", (c) => (corpo += c));
    req.on("end", () => {
      const nomes = new Set(((JSON.parse(corpo) as { tools?: { function: { name: string } }[] }).tools ?? []).map((t) => t.function.name));
      const chamada = nomes.has("entregar")
        ? { name: "entregar", arguments: { resumo: "De novo", conteudo: `# Refeito\n${"Texto refeito. ".repeat(40)}`, autocritica: "Conferi." } }
        : nomes.has("aprovar") ? { name: "aprovar", arguments: { parecer: "Confere." } } : null;
      chamadas.push(chamada?.name ?? "texto");
      res.end(`${JSON.stringify({ message: chamada ? { content: "", tool_calls: [{ function: chamada }] } : { content: "ok" } })}\n${JSON.stringify({ done: true, prompt_eval_count: 100, eval_count: 10 })}\n`);
    });
  });
  await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
  setSetting("provedores", JSON.stringify({ ollama: { url: `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`, contexto: 16_384 } }));
  setSetting("modelos_agentes", JSON.stringify(Object.fromEntries(agents.map((a) => [a.id, "ollama:modelo-teste"]))));
  try {
    // O estado em que a queda deixou o card: entrega v1 gravada, ainda na coluna de trabalho, verificação pendente.
    const fluxo = fluxoPadrao("produto");
    const card = criarCard({ titulo: "Critérios do cadastro", sala: "produto", dono: "pm", nivel: "N0", criterios: "Gherkin", coluna: colunaDeEntrada(fluxo) });
    registrarEntrega(card.id, "pm", "Critérios prontos", `# Critérios\n${"Dado, quando, então. ".repeat(30)}`);
    marcarEntregue(card.id);
    iniciarMotor();
    let atual = lerCard(card.id);
    for (let i = 0; i < 300 && colunaDe(atual.fluxo, atual.coluna)?.tipo !== "feito"; i++) {
      repassadosEm.clear();
      await esperar(100);
      atual = lerCard(card.id);
    }
    assert.equal(colunaDe(atual.fluxo, atual.coluna)?.tipo, "feito", `terminou na coluna ${atual.coluna}; chamadas: ${chamadas.join(", ")}`);
    assert.ok(!chamadas.includes("entregar"), `o autor não foi chamado de novo (chamadas: ${chamadas.join(", ")})`);
    assert.equal(listarEntregas(card.id).length, 1, "nenhuma versão refeita");
  } finally {
    await encerrarMotor(5000);
    servidor.close();
    setSetting("provedores", "{}");
    setSetting("modelos_agentes", "{}");
  }
});
