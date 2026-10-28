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
