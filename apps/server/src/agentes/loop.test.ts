import { test } from "node:test";
import assert from "node:assert/strict";
import Anthropic from "@anthropic-ai/sdk";
import { ErroSemEntrega, rodarAgente } from "./loop.ts";

/** Cliente falso: toda chamada falha como o SDK falha quando o modelo manda JSON quebrado numa ferramenta. */
function clienteComJsonQuebrado() {
  let chamadas = 0;
  const client = {
    beta: {
      messages: {
        stream: () => {
          chamadas++;
          return {
            on: () => {},
            finalMessage: () => Promise.reject(new Anthropic.AnthropicError("Unable to parse tool parameter JSON from model. Please retry your request or adjust your prompt.")),
          };
        },
      },
    },
  } as unknown as Anthropic;
  return { client, chamadas: () => chamadas };
}

test("JSON ilegível do modelo 3 vezes seguidas vira entrega vazia (o card tenta de novo antes de bloquear)", async () => {
  const { client, chamadas } = clienteComJsonQuebrado();
  await assert.rejects(
    rodarAgente({ client, modelo: "claude-sonnet-5-5", sistema: "s", mensagem: "m", ferramentas: [], lembrete: "l" }),
    (e) => e instanceof ErroSemEntrega && /ilegíveis 3 vezes/.test(e.message),
  );
  assert.equal(chamadas(), 3);
});

test("retomada depois de um pause_turn: tira a chamada de ferramenta do servidor que ficou sem resultado", async () => {
  const { semFerramentaDoServidorPendente } = await import("./loop.ts");
  const msgs = [
    { role: "user" as const, content: "faça" },
    {
      role: "assistant" as const,
      content: [
        { type: "text" as const, text: "Vou rodar e pesquisar." },
        { type: "server_tool_use" as const, id: "srvtoolu_ok", name: "web_search" as const, input: {} },
        { type: "web_search_tool_result" as const, tool_use_id: "srvtoolu_ok", content: [] },
        { type: "server_tool_use" as const, id: "srvtoolu_pendente", name: "bash_code_execution" as const, input: {} },
      ],
    },
    { role: "assistant" as const, content: [{ type: "server_tool_use" as const, id: "srvtoolu_so", name: "bash_code_execution" as const, input: {} }] },
  ] as unknown as Parameters<typeof semFerramentaDoServidorPendente>[0];
  const limpo = semFerramentaDoServidorPendente(msgs);
  assert.equal(limpo.length, 2, "a mensagem que só tinha a chamada pendente sai");
  const ids = JSON.stringify(limpo);
  assert.match(ids, /srvtoolu_ok/, "a chamada com resultado fica");
  assert.doesNotMatch(ids, /srvtoolu_pendente|srvtoolu_so/);
});
