import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { postChat } from "../bus.ts";
import { recentChat } from "../db.ts";
import { ferramentaPerguntar, type PerguntaAoCeo } from "./helena.ts";

describe("perguntar_ao_ceo da Helena", () => {
  test("guarda a pergunta com a recomendada primeiro e termina a vez", async () => {
    let p: PerguntaAoCeo | null = null;
    const f = ferramentaPerguntar((x) => (p = x));
    const r = await f.executar!({
      pergunta: "O pentest é uma atividade nova ou parte do trabalho das boards?",
      opcoes: ["Parte das boards (EMP-11 a EMP-15)", "  ", "Atividade nova: pentest do Parliamo inteiro"],
      recomendada: 2,
      motivo: "O pedido não cita card e as boards ainda não terminaram.",
    });
    assert.equal(r.fim, true);
    assert.deepEqual(p, {
      texto: "O pentest é uma atividade nova ou parte do trabalho das boards?",
      opcoes: ["Atividade nova: pentest do Parliamo inteiro", "Parte das boards (EMP-11 a EMP-15)"],
      motivo: "O pedido não cita card e as boards ainda não terminaram.",
    });
  });

  test("recusa pergunta sem recomendação válida ou com menos de 2 opções", async () => {
    const f = ferramentaPerguntar(() => assert.fail("não devia perguntar"));
    await assert.rejects(async () => f.executar!({ pergunta: "?", opcoes: ["Um", "Outro"], recomendada: 5, motivo: "m" }), /recomendada/);
    await assert.rejects(async () => f.executar!({ pergunta: "?", opcoes: ["Um", "Outro"], recomendada: 0 }), /motivo/);
    await assert.rejects(async () => f.executar!({ pergunta: "?", opcoes: ["só uma"], recomendada: 0, motivo: "m" }), /2 a 4 opções/);
  });

  test("opções e recomendação passam pelo banco e voltam no histórico do chat", () => {
    postChat("chief-of-staff", "Qual dos dois?", undefined, undefined, ["Um", "Outro"], { opcao: 0, motivo: "Mais barato." });
    postChat("voce", "Sem opções aqui", undefined, undefined, undefined, { opcao: 0, motivo: "ignorado" });
    const msgs = recentChat(10);
    const pergunta = msgs.find((m) => m.texto === "Qual dos dois?");
    assert.deepEqual(pergunta?.opcoes, ["Um", "Outro"]);
    assert.deepEqual(pergunta?.recomendacao, { opcao: 0, motivo: "Mais barato." });
    const semOpcoes = msgs.find((m) => m.texto === "Sem opções aqui");
    assert.equal(semOpcoes?.opcoes, undefined);
    assert.equal(semOpcoes?.recomendacao, undefined, "recomendação sem opções não é guardada");
  });
});
