import { test } from "node:test";
import assert from "node:assert/strict";
import { textoDoAlvo } from "./navegador.ts";

test("navegador: do seletor inválido que o modelo escreveu, sai o texto do botão", () => {
  assert.equal(textoDoAlvo('button:contains("Chegou o horário do corte")'), "Chegou o horário do corte");
  assert.equal(textoDoAlvo('button[submit]: "Salvar"'), "Salvar");
  assert.equal(textoDoAlvo("text=Entrar"), "Entrar");
  assert.equal(textoDoAlvo("Novo card"), "Novo card");
});
