import { test } from "node:test";
import assert from "node:assert/strict";
import { rodarAgente, ferramenta } from "./loop.ts";
import { resumoChamadas } from "../chamadas.ts";
import { setSetting } from "../db.ts";
import { saveApiKey } from "../secrets.ts";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

// Ollama de mentira, num servidor HTTP de verdade (o chat não passa pelo fetch): /api/show diz que chama
// ferramentas; /api/chat responde em streaming com uma chamada à ferramenta final.
async function ollamaFalso() {
  const servidor = createServer((req, res) => {
    if (req.url === "/api/show") return void res.end(JSON.stringify({ capabilities: ["completion", "tools"] }));
    if (req.url === "/api/chat") {
      const linhas = [
        { message: { content: "", tool_calls: [{ function: { name: "entregar", arguments: { conteudo: "pronto" } } }] } },
        { done: true, done_reason: "stop", prompt_eval_count: 120, eval_count: 30 },
      ];
      return void res.end(linhas.map((l) => JSON.stringify(l)).join("\n") + "\n");
    }
    res.statusCode = 404;
    res.end();
  });
  await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
  const { port } = servidor.address() as AddressInfo;
  setSetting("provedores", JSON.stringify({ ollama: { url: `http://127.0.0.1:${port}`, contexto: 16_384 } }));
  return () => {
    servidor.close();
    setSetting("provedores", "{}");
  };
}

test("trabalho que não cabe no contexto do modelo local vai para o Claude, em vez de o Ollama cortar as instruções", async () => {
  saveApiKey("sk-ant-teste-falsa"); // só no banco temporário dos testes
  setSetting("provedores", JSON.stringify({ ollama: { url: "http://127.0.0.1:11434", contexto: 4096 } }));
  const original = globalThis.fetch;
  const chamados: string[] = [];
  globalThis.fetch = (async (entrada: string | URL | Request) => {
    const url = String(entrada instanceof Request ? entrada.url : entrada);
    chamados.push(url);
    if (url.endsWith("/api/show")) return Response.json({ capabilities: ["completion", "tools"] });
    throw new Error("rede desligada no teste");
  }) as typeof fetch;
  try {
    await assert.rejects(
      rodarAgente({
        modelo: "ollama:modelo-teste",
        agenteId: "ux-writer",
        sistema: "regras ".repeat(50000), // ~350 mil caracteres: não cabe nem no maior contexto local (32 mil tokens)
        mensagem: "faça",
        ferramentas: [ferramenta("entregar", "Entrega.", { conteudo: { type: "string" } }, ["conteudo"], () => ({ texto: "ok", fim: true }))],
        lembrete: "Chame entregar.",
        fallback: false,
      }),
    );
    assert.ok(!chamados.some((u) => u.endsWith("/api/chat")), "o Ollama não pode receber um prompt que ele vai cortar");
    assert.ok(chamados.some((u) => u.includes("anthropic")), "o trabalho seguiu para o Claude");
  } finally {
    globalThis.fetch = original;
    setSetting("provedores", "{}");
  }
});

test("sombra no modelo local: se não couber, para (não gasta no Claude)", async () => {
  const restaurar = await ollamaFalso();
  try {
    await assert.rejects(
      rodarAgente({
        modelo: "ollama:modelo-teste",
        agenteId: "pm",
        sistema: "regras ".repeat(60_000),
        mensagem: "faça",
        ferramentas: [ferramenta("entregar", "Entrega.", { conteudo: { type: "string" } }, ["conteudo"], () => ({ texto: "ok", fim: true }))],
        lembrete: "Chame entregar.",
        contexto: 65_536,
        semReserva: true,
      }),
      /Não cabe no contexto do modelo local/,
    );
  } finally {
    restaurar();
  }
});

test("chamadas a modelos fora do Claude entram no rastreamento (Operação → Chamadas)", async () => {
  const restaurar = await ollamaFalso();
  try {
    const r = await rodarAgente({
      modelo: "ollama:modelo-teste",
      agenteId: "copywriter",
      sistema: "teste",
      mensagem: "faça",
      ferramentas: [ferramenta("entregar", "Entrega.", { conteudo: { type: "string" } }, ["conteudo"], () => ({ texto: "ok", fim: true }))],
      lembrete: "Chame entregar.",
    });
    assert.equal(r.terminou, true);
    const ch = resumoChamadas().chamadas.find((c) => c.modelo === "ollama:modelo-teste");
    assert.ok(ch, "a chamada ao Ollama precisa aparecer no rastreamento");
    assert.equal(ch.agente, "copywriter");
    assert.equal(ch.entrada, 120);
    assert.equal(ch.saida, 30);
    assert.equal(ch.parada, "tool_use");
    assert.equal(ch.usd, 0);
  } finally {
    restaurar();
  }
});

test("não cabe no local e o Claude está fora do ar: espera (passageiro), sem chamar o Claude em loop", async () => {
  const { marcarForaDoAr } = await import("../provedores.ts");
  const { ErroNaoCabe } = await import("./compat.ts");
  saveApiKey("sk-ant-teste-falsa");
  marcarForaDoAr("claude", Date.now() + 60_000);
  const original = globalThis.fetch;
  const chamados: string[] = [];
  globalThis.fetch = (async (entrada: string | URL | Request) => {
    const url = String(entrada instanceof Request ? entrada.url : entrada);
    chamados.push(url);
    if (url.endsWith("/api/show")) return Response.json({ capabilities: ["completion", "tools"] });
    throw new Error("rede desligada no teste");
  }) as typeof fetch;
  try {
    const erro = await rodarAgente({
      modelo: "ollama:modelo-teste",
      agenteId: "dev-backend",
      sistema: "regras ".repeat(50000),
      mensagem: "faça",
      ferramentas: [ferramenta("entregar", "Entrega.", { conteudo: { type: "string" } }, ["conteudo"], () => ({ texto: "ok", fim: true }))],
      lembrete: "Chame entregar.",
    }).catch((e: unknown) => e);
    assert.ok(erro instanceof ErroNaoCabe, "só este card espera (não derruba o provedor local)");
    assert.ok(!chamados.some((u) => u.includes("anthropic")), "não bate no Claude fora do ar");
  } finally {
    globalThis.fetch = original;
  }
});

test("calibração de caracteres por token: usa a contagem real, mas nunca passa de 4 nem fica abaixo de 3", async () => {
  const { calibrarCaracteresPorToken } = await import("./compat.ts");
  assert.equal(calibrarCaracteresPorToken(335_000, 90_000, 3), 335_000 / 90_000, "medido (3,7) dentro da faixa");
  assert.equal(calibrarCaracteresPorToken(335_000, 20_000, 3), 4, "contagem baixa (cache) não deixa subestimar o tamanho");
  assert.equal(calibrarCaracteresPorToken(30_000, 15_000, 3.5), 3, "nunca abaixo de 3");
  assert.equal(calibrarCaracteresPorToken(9_000, 1_500, 3.2), 3.2, "resposta pequena demais: mantém o fator anterior");
});

test("modelo local: a conversa é salva a cada passo e a retomada continua dela (não recomeça do zero)", async () => {
  const recebidos: { messages: { role: string; content: string }[] }[] = [];
  const servidor = createServer((req, res) => {
    if (req.url === "/api/show") return void res.end(JSON.stringify({ capabilities: ["completion", "tools"] }));
    let corpo = "";
    req.on("data", (c) => (corpo += c));
    req.on("end", () => {
      recebidos.push(JSON.parse(corpo));
      // 1ª chamada: lê um arquivo (não termina); depois: entrega.
      const chamada = recebidos.length === 1 ? { name: "ler", arguments: { caminho: "a.go" } } : { name: "entregar", arguments: { conteudo: "ok" } };
      res.end(`${JSON.stringify({ message: { content: "", tool_calls: [{ function: chamada }] } })}\n${JSON.stringify({ done: true, prompt_eval_count: 100, eval_count: 10 })}\n`);
    });
  });
  await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
  setSetting("provedores", JSON.stringify({ ollama: { url: `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`, contexto: 16_384 } }));
  let salva: unknown[] = [];
  const ferramentas = [
    ferramenta("ler", "Lê.", { caminho: { type: "string" } }, ["caminho"], () => ({ texto: "conteúdo de a.go" })),
    ferramenta("entregar", "Entrega.", { conteudo: { type: "string" } }, ["conteudo"], () => ({ texto: "ok", fim: true })),
  ];
  try {
    // 1ª execução: interrompida depois do primeiro passo (como num reinício).
    const sinal = new AbortController();
    await rodarAgente({ modelo: "ollama:modelo-teste", agenteId: "dev-backend", sistema: "regras", mensagem: "faça", ferramentas, lembrete: "Entregue.", sinal: sinal.signal, aoRodada: (m) => { salva = m; sinal.abort("reinício"); } }).catch(() => {});
    assert.ok(salva.length >= 3, "a conversa do primeiro passo foi salva");
    // 2ª execução: retoma a conversa salva.
    const r = await rodarAgente({ modelo: "ollama:modelo-teste", agenteId: "dev-backend", sistema: "regras", mensagem: "faça", ferramentas, lembrete: "Entregue.", retomar: salva as never });
    assert.equal(r.terminou, true);
    const ultima = recebidos.at(-1)!.messages;
    assert.ok(ultima.some((m) => m.role === "tool" && String(m.content).includes("conteúdo de a.go")), "continuou com o que já tinha lido");
    assert.equal(ultima.filter((m) => m.role === "system").length, 1, "não duplicou o início da conversa");
  } finally {
    servidor.close();
    setSetting("provedores", "{}");
  }
});

test("conversa salva que já não cabe no contexto local (de quando ia além da placa) recomeça a partir do card", async () => {
  const recebidos: { messages: { role: string; content: string }[]; options: { num_ctx: number } }[] = [];
  const servidor = createServer((req, res) => {
    if (req.url === "/api/show") return void res.end(JSON.stringify({ capabilities: ["completion", "tools"] }));
    let corpo = "";
    req.on("data", (c) => (corpo += c));
    req.on("end", () => {
      recebidos.push(JSON.parse(corpo));
      res.end(`${JSON.stringify({ message: { content: "", tool_calls: [{ function: { name: "entregar", arguments: { conteudo: "ok" } } }] } })}\n${JSON.stringify({ done: true, prompt_eval_count: 100, eval_count: 10 })}\n`);
    });
  });
  await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
  setSetting("provedores", JSON.stringify({ ollama: { url: `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`, contexto: 16_384 } }));
  const salva = [
    { role: "system", content: "regras" },
    { role: "user", content: "faça" },
    { role: "assistant", content: "rascunho ".repeat(20_000) }, // ~180 mil caracteres: só cabia em 64 mil tokens
  ];
  try {
    const r = await rodarAgente({
      modelo: "ollama:modelo-teste", agenteId: "dev-backend", sistema: "regras", mensagem: "faça", lembrete: "Entregue.", retomar: salva as never,
      ferramentas: [ferramenta("entregar", "Entrega.", { conteudo: { type: "string" } }, ["conteudo"], () => ({ texto: "ok", fim: true }))],
    });
    assert.equal(r.terminou, true);
    assert.equal(recebidos.length, 1);
    assert.ok(recebidos[0]!.options.num_ctx <= 32_768, "nunca passa do contexto que cabe na placa");
    assert.deepEqual(recebidos[0]!.messages.map((m) => m.role), ["system", "user"], "recomeçou do card");
  } finally {
    servidor.close();
    setSetting("provedores", "{}");
  }
});

test("resultado de ferramenta maior que o contexto local (ex.: mapa do projeto inteiro) é cortado no que cabe, em vez de travar o card", async () => {
  const recebidos: { messages: { role: string; content: string }[] }[] = [];
  const servidor = createServer((req, res) => {
    if (req.url === "/api/show") return void res.end(JSON.stringify({ capabilities: ["completion", "tools"] }));
    let corpo = "";
    req.on("data", (c) => (corpo += c));
    req.on("end", () => {
      recebidos.push(JSON.parse(corpo));
      const chamada = recebidos.length === 1 ? { name: "mapa", arguments: {} } : { name: "entregar", arguments: { conteudo: "ok" } };
      res.end(`${JSON.stringify({ message: { content: "", tool_calls: [{ function: chamada }] } })}\n${JSON.stringify({ done: true, prompt_eval_count: 100, eval_count: 10 })}\n`);
    });
  });
  await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
  setSetting("provedores", JSON.stringify({ ollama: { url: `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`, contexto: 16_384 } }));
  try {
    const r = await rodarAgente({
      modelo: "ollama:modelo-teste", agenteId: "dev-backend", sistema: "regras", mensagem: "faça", lembrete: "Entregue.", fallback: false,
      ferramentas: [
        ferramenta("mapa", "Mapa.", {}, [], () => ({ texto: "func x() ".repeat(20_000) })), // 180 mil caracteres: passa de 32 mil tokens
        ferramenta("entregar", "Entrega.", { conteudo: { type: "string" } }, ["conteudo"], () => ({ texto: "ok", fim: true })),
      ],
    });
    assert.equal(r.terminou, true, "seguiu trabalhando no modelo local");
    const tool = recebidos[1]!.messages.find((m) => m.role === "tool")!;
    assert.ok(tool.content.length < 100_000, "o mapa foi cortado");
    assert.match(tool.content, /Peça algo mais específico/);
  } finally {
    servidor.close();
    setSetting("provedores", "{}");
  }
});

test("modelo local que para sem ferramenta, volta a trabalhar e para de novo não perde a vez (lembretes contam só as paradas seguidas)", async () => {
  let n = 0;
  // texto solto, ferramenta, texto solto, ferramenta, texto solto, entregar
  const roteiro = ["texto", "ler", "texto", "ler", "texto", "entregar"];
  const servidor = createServer((req, res) => {
    if (req.url === "/api/show") return void res.end(JSON.stringify({ capabilities: ["completion", "tools"] }));
    req.resume();
    req.on("end", () => {
      const passo = roteiro[Math.min(n++, roteiro.length - 1)]!;
      const msg = passo === "texto" ? { content: "Agora vou procurar os handlers." } : { content: "", tool_calls: [{ function: { name: passo, arguments: passo === "ler" ? {} : { conteudo: "ok" } } }] };
      res.end(`${JSON.stringify({ message: msg })}\n${JSON.stringify({ done: true, prompt_eval_count: 100, eval_count: 10 })}\n`);
    });
  });
  await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
  setSetting("provedores", JSON.stringify({ ollama: { url: `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`, contexto: 16_384 } }));
  try {
    const r = await rodarAgente({
      modelo: "ollama:modelo-teste", agenteId: "dev-backend", sistema: "regras", mensagem: "faça", lembrete: "Entregue.",
      ferramentas: [
        ferramenta("ler", "Lê.", {}, [], () => ({ texto: "conteúdo" })),
        ferramenta("entregar", "Entrega.", { conteudo: { type: "string" } }, ["conteudo"], () => ({ texto: "ok", fim: true })),
      ],
    });
    assert.equal(r.terminou, true, "entregou depois de três paradas soltas");
  } finally {
    servidor.close();
    setSetting("provedores", "{}");
  }
});

test("conversa longa no modelo local: a parte antiga vira um resumo (compactação) e o agente segue com as últimas rodadas inteiras", async () => {
  const recebidos: { messages: { role: string; content: string }[]; tools?: unknown[] }[] = [];
  let leituras = 0;
  const servidor = createServer((req, res) => {
    if (req.url === "/api/show") return void res.end(JSON.stringify({ capabilities: ["completion", "tools"] }));
    let corpo = "";
    req.on("data", (c) => (corpo += c));
    req.on("end", () => {
      const pedido = JSON.parse(corpo);
      recebidos.push(pedido);
      const fim = `\n${JSON.stringify({ done: true, prompt_eval_count: 100, eval_count: 10 })}\n`;
      // Pedido de resumo (sem ferramentas): devolve o resumo.
      if (!pedido.tools) return void res.end(JSON.stringify({ message: { content: "- Li os arquivos a0 a a5 de backend/; a função criarTicket fica em tickets.go.\n- Falta escrever o handler e entregar." } }) + fim);
      const compactada = pedido.messages.some((m: { content: string }) => String(m.content).includes("Resumo do que você já fez"));
      const chamada = compactada || leituras >= 12 ? { name: "entregar", arguments: { conteudo: "ok" } } : { name: "ler", arguments: { caminho: `a${leituras++}.go` } };
      res.end(JSON.stringify({ message: { content: "", tool_calls: [{ function: chamada }] } }) + fim);
    });
  });
  await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
  setSetting("provedores", JSON.stringify({ ollama: { url: `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`, contexto: 16_384 } }));
  try {
    const r = await rodarAgente({
      modelo: "ollama:modelo-teste", agenteId: "dev-backend", sistema: "regras", mensagem: "faça", lembrete: "Entregue.", maxRodadas: 20,
      ferramentas: [
        ferramenta("ler", "Lê.", { caminho: { type: "string" } }, ["caminho"], (e) => ({ texto: `conteúdo de ${String(e.caminho)}: ${"x".repeat(5000)}` })),
        ferramenta("entregar", "Entrega.", { conteudo: { type: "string" } }, ["conteudo"], () => ({ texto: "ok", fim: true })),
      ],
    });
    assert.equal(r.terminou, true);
    assert.ok(recebidos.some((p) => !p.tools), "pediu um resumo");
    const depois = recebidos.at(-1)!.messages;
    assert.equal(depois[0]!.role, "system");
    assert.equal(depois[1]!.content, "faça", "o pedido original fica");
    assert.match(String(depois[2]!.content), /criarTicket fica em tickets\.go/, "o resumo entra no lugar da parte antiga");
    assert.ok(depois.filter((m) => m.role === "tool").length <= 3, "só as últimas rodadas ficam inteiras");
  } finally {
    servidor.close();
    setSetting("provedores", "{}");
  }
});
