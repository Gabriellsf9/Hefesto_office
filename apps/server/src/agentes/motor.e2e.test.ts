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
