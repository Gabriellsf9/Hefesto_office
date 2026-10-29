import { test } from "node:test";
import assert from "node:assert/strict";
import type { Card } from "@empresa/shared";
import { ehFuncionalidade } from "./gatilhos.ts";

const card = (c: Partial<Card>) => ({ demo: false, fluxo: "software", sala: "desenvolvimento", tipo: "historia", ...c }) as Card;

test("gatilhos: só disparam para funcionalidade que virou código (ou épico), não para protótipo nem especificação", () => {
  assert.equal(ehFuncionalidade(card({})), true, "história do desenvolvimento");
  assert.equal(ehFuncionalidade(card({ tipo: "epico", sala: "produto" })), true, "épico");
  assert.equal(ehFuncionalidade(card({ sala: "design" })), false, "protótipo do design (EMP-3)");
  assert.equal(ehFuncionalidade(card({ sala: "produto" })), false, "especificação do produto");
  assert.equal(ehFuncionalidade(card({ tipo: "tarefa" })), false);
  assert.equal(ehFuncionalidade(card({ demo: true })), false);
});
