import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { setTimeout as esperar } from "node:timers/promises";
import { setSetting } from "./db.ts";
import { criarConversa, enviarMensagem, historicoEmTexto, listarMensagens, lerConversa } from "./conversas.ts";

test("conversa direta: o agente responde no modelo escolhido, com o histórico das mensagens anteriores", async () => {
  const pedidos: { messages: { role: string; content: string }[] }[] = [];
  const servidor = createServer((req, res) => {
    if (req.url === "/api/show") return void res.end(JSON.stringify({ capabilities: ["completion", "tools"] }));
    let corpo = "";
    req.on("data", (c) => (corpo += c));
    req.on("end", () => {
      pedidos.push(JSON.parse(corpo));
      res.end(`${JSON.stringify({ message: { content: `Resposta ${pedidos.length}` } })}\n${JSON.stringify({ done: true, prompt_eval_count: 50, eval_count: 5 })}\n`);
    });
  });
  await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
  setSetting("provedores", JSON.stringify({ ollama: { url: `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`, contexto: 16_384 } }));
  try {
    const c = criarConversa({ agente: "dev-backend", modelo: "ollama:modelo-teste" });
    const espera = async (n: number) => {
      for (let i = 0; i < 100 && (listarMensagens(c.id).length < n || lerConversa(c.id).rodando); i++) await esperar(20);
    };
    enviarMensagem(c.id, "Como funciona o login?");
    await espera(2);
    enviarMensagem(c.id, "E o logout?");
    await espera(4);
    const msgs = listarMensagens(c.id);
    assert.deepEqual(msgs.map((m) => [m.papel, m.texto]), [["voce", "Como funciona o login?"], ["agente", "Resposta 1"], ["voce", "E o logout?"], ["agente", "Resposta 2"]]);
    assert.equal(msgs[1]!.modelo, "ollama:modelo-teste");
    const segunda = pedidos[1]!.messages.find((m) => m.role === "user")!.content;
    assert.match(segunda, /Conversa até aqui[\s\S]*Como funciona o login\?[\s\S]*Resposta 1[\s\S]*Mensagem do CEO\nE o logout\?/);
  } finally {
    servidor.close();
    setSetting("provedores", "{}");
  }
});

test("histórico: as mensagens mais recentes primeiro até caber no limite", () => {
  const m = (id: number, papel: "voce" | "agente", texto: string) => ({ id, conversaId: 1, papel, texto, ts: id });
  const h = historicoEmTexto([m(1, "voce", "a".repeat(30_000)), m(2, "agente", "oi"), m(3, "voce", "tudo bem?")], "Rafael");
  assert.equal(h, "[Rafael]: oi\n\n[CEO]: tudo bem?", "a mensagem gigante e antiga fica de fora");
});

test("conversa: artifact salvo vira marcador e arquivo servível; anexos só do próprio Hefesto", async () => {
  const { salvarArtifact, caminhoDoArtifact, criarConversa, listarMensagens, enviarMensagem, pararConversa } = await import("./conversas.ts");
  const c = criarConversa({ agente: "pm" });
  const marcador = salvarArtifact(c.id, "Gráfico | vendas", "<html><body>oi</body></html>");
  assert.match(marcador, /^\[\[artifact:\/api\/conversas\/\d+\/artifacts\/1\.html\|Gráfico {3}vendas\]\]$/);
  assert.ok(caminhoDoArtifact(c.id, "1.html"));
  assert.equal(caminhoDoArtifact(c.id, "../../segredo.html"), null);
  // Sem provedor configurado a resposta falha, mas a mensagem do CEO fica com os anexos válidos.
  enviarMensagem(c.id, "veja", { imagens: ["/api/midia/x.png", "https://fora.com/y.png"], arquivos: [{ url: "/api/midia/arquivos/a.pdf", nome: "a.pdf" }, { url: "file:///etc/passwd", nome: "p" }] });
  pararConversa(c.id);
  const m = listarMensagens(c.id)[0]!;
  assert.deepEqual(m.imagens, ["/api/midia/x.png"]);
  assert.deepEqual(m.arquivos?.map((a) => a.nome), ["a.pdf"]);
});
