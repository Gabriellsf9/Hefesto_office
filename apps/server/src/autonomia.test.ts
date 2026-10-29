import { test } from "node:test";
import assert from "node:assert/strict";
import { colunaDe } from "@empresa/shared";
import { db } from "./db.ts";
import { criarCard, ETIQUETA_LIMITE, lerCard } from "./tarefas.ts";
import { DECISOR_REGRA, conferirAutonomia, configurarAutonomia, listarDecisoes } from "./autonomia.ts";

test("regra do CEO: aprova tudo o que chega para ele e libera os limites, sem IA; so-ceo fica com ele; desligada, nada muda", async () => {
  const paraOCeo = criarCard({ titulo: "Pronto para aprovar", sala: "produto", fluxo: "geral", dono: "pm", nivel: "N3", prioridade: "P0", coluna: "aguardando-ceo" });
  const soCeo = criarCard({ titulo: "Só eu decido", sala: "produto", fluxo: "geral", dono: "pm", coluna: "aguardando-ceo", etiquetas: ["so-ceo"] });
  const noLimite = criarCard({ titulo: "Parou no limite", sala: "produto", fluxo: "geral", dono: "pm", coluna: "em-andamento" });
  db.prepare("UPDATE cards SET bloqueado = 1, etiquetas = ?, custo_usd = 6 WHERE id = ?").run(JSON.stringify([ETIQUETA_LIMITE]), noLimite.id);

  // Desligada: nada acontece.
  configurarAutonomia({ ativo: false, aprovarSemRevisao: false });
  await conferirAutonomia();
  assert.equal(lerCard(paraOCeo.id).coluna, "aguardando-ceo");

  configurarAutonomia({ aprovarSemRevisao: true });
  await conferirAutonomia();
  const aprovado = lerCard(paraOCeo.id);
  assert.equal(colunaDe(aprovado.fluxo, aprovado.coluna)?.tipo, "feito", "P0/N3 também: a regra é aprovar tudo");
  assert.equal(lerCard(soCeo.id).coluna, "aguardando-ceo", "so-ceo continua com você");
  assert.equal(lerCard(noLimite.id).bloqueado, false, "limite liberado");
  const minhas = listarDecisoes().filter((d) => d.decisor === DECISOR_REGRA);
  assert.ok(minhas.some((d) => d.tipo === "aprovar" && d.cardId === paraOCeo.id));
  assert.ok(minhas.some((d) => d.tipo === "liberar" && d.cardId === noLimite.id));
  configurarAutonomia({ aprovarSemRevisao: false });
});
