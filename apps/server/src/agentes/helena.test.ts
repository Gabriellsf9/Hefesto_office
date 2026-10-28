import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { postChat } from "../bus.ts";
import { recentChat } from "../db.ts";
import { ferramentaPerguntar, type PerguntaAoCeo } from "./helena.ts";

describe("perguntar_ao_ceo da Helena", () => {
  test("guarda a pergunta com as opções e termina a vez", async () => {
    let p: PerguntaAoCeo | null = null;
    const f = ferramentaPerguntar((x) => (p = x));
    const r = await f.executar!({
      pergunta: "O pentest é uma atividade nova ou parte do trabalho das boards?",
      opcoes: ["Atividade nova: pentest do Parliamo inteiro", "Parte das boards (EMP-11 a EMP-15)", "  "],
    });
    assert.equal(r.fim, true);
    assert.deepEqual(p, {
      texto: "O pentest é uma atividade nova ou parte do trabalho das boards?",
      opcoes: ["Atividade nova: pentest do Parliamo inteiro", "Parte das boards (EMP-11 a EMP-15)"],
    });
  });

  test("recusa pergunta com menos de 2 opções", async () => {
    const f = ferramentaPerguntar(() => assert.fail("não devia perguntar"));
    await assert.rejects(async () => f.executar!({ pergunta: "?", opcoes: ["só uma"] }), /2 a 4 opções/);
  });

  test("as opções passam pelo banco e voltam no histórico do chat", () => {
    postChat("chief-of-staff", "Qual dos dois?", undefined, undefined, ["Um", "Outro"]);
    postChat("voce", "Sem opções aqui");
    const msgs = recentChat(10);
    assert.deepEqual(msgs.find((m) => m.texto === "Qual dos dois?")?.opcoes, ["Um", "Outro"]);
    assert.equal(msgs.find((m) => m.texto === "Sem opções aqui")?.opcoes, undefined);
  });
});
