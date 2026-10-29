import { test } from "node:test";
import assert from "node:assert/strict";
import { db, setSetting } from "./db.ts";
import { registrarChamada } from "./chamadas.ts";
import { comentar, criarCard, mover } from "./tarefas.ts";
import { calcularMedicao } from "./medicao.ts";

test("medição: conta o que terminou por dia, compara os modelos nos cards de verdade e sugere a troca", () => {
  setSetting("modelos_agentes", JSON.stringify({ "dev-backend": "ollama:pequeno" }));
  const novo = (dono: string, modelo: string, devolvido: boolean, ceo = false) => {
    const c = criarCard({ titulo: `card ${modelo}`, sala: "desenvolvimento", fluxo: "software", coluna: "a-fazer", dono });
    registrarChamada({ cardId: c.id, agente: dono, modelo, rodada: 1, entrada: 1000, saida: 600, cacheEscrita: 0, cacheLeitura: 0, usd: 0, ms: 60_000, parada: "fim" });
    if (devolvido) {
      comentar(c.id, "qa-lead", "devolucao", "falta teste");
      db.prepare("UPDATE cards SET devolucoes = devolucoes + 1 WHERE id = ?").run(c.id);
    }
    if (ceo) comentar(c.id, "voce", "comentario", "use o helper");
    mover(c.id, "concluido", "voce");
    return c;
  };
  for (let i = 0; i < 3; i++) novo("dev-backend", "ollama:pequeno", true, i === 0);
  for (let i = 0; i < 3; i++) novo("dev-frontend", "ollama:grande", false);

  const m = calcularMedicao();
  const hoje = m.dias.at(-1)!;
  assert.ok(hoje.concluidos >= 6, JSON.stringify(hoje));
  assert.ok(hoje.devolucoes >= 3);

  const pequeno = m.modelos.find((x) => x.modelo === "ollama:pequeno")!;
  const grande = m.modelos.find((x) => x.modelo === "ollama:grande")!;
  assert.equal(pequeno.concluidos, 3);
  assert.equal(pequeno.aprovadosDePrimeira, 0);
  assert.equal(pequeno.semCeo, 67);
  assert.equal(grande.aprovadosDePrimeira, 100);
  assert.equal(grande.tokensPorSegundo, 10);
  assert.equal(grande.minutosPorCard, 1);

  const s = m.sugestoes.find((x) => x.agente === "dev-backend");
  assert.ok(s, JSON.stringify(m.sugestoes));
  assert.equal(s.de, "ollama:pequeno");
  assert.equal(s.para, "ollama:grande");
  assert.ok(!m.sugestoes.some((x) => x.agente === "dev-frontend"), "quem já usa o melhor não recebe sugestão");
  setSetting("modelos_agentes", "{}");
});
