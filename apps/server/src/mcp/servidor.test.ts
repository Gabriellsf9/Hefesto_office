import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { atenderMcp } from "./servidor.ts";

test("servidor MCP: um cliente MCP de verdade lista as ferramentas, cria um card, lê e comenta", async () => {
  const http = createServer((req, res) => {
    let corpo = "";
    req.on("data", (c) => (corpo += c));
    req.on("end", () => void atenderMcp(req, res, corpo ? JSON.parse(corpo) : undefined));
  });
  await new Promise<void>((ok) => http.listen(0, "127.0.0.1", ok));
  const cliente = new Client({ name: "teste", version: "1.0.0" });
  await cliente.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${(http.address() as AddressInfo).port}/mcp`)));
  try {
    const { tools } = await cliente.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), ["comentar_card", "conversar", "criar_card", "ler_card", "listar_cards", "status"]);
    const texto = (r: unknown) => ((r as { content: { text: string }[] }).content[0]!.text);
    const criado = texto(await cliente.callTool({ name: "criar_card", arguments: { titulo: "Endpoint de sprints", descricao: "CRUD de sprints.", sala: "desenvolvimento" } }));
    const chave = /Card (EMP-\d+) criado/.exec(criado)?.[1];
    assert.ok(chave, criado);
    assert.match(texto(await cliente.callTool({ name: "listar_cards", arguments: { abertos: true } })), new RegExp(`${chave} .*Endpoint de sprints`));
    assert.match(texto(await cliente.callTool({ name: "ler_card", arguments: { chave } })), /## Descrição\nCRUD de sprints\./);
    assert.match(texto(await cliente.callTool({ name: "comentar_card", arguments: { chave, texto: "Use o padrão de auth/." } })), /Comentado/);
    assert.match(texto(await cliente.callTool({ name: "status", arguments: {} })), /Concluídos: \d+\/\d+/);
  } finally {
    await cliente.close();
    http.close();
  }
});
