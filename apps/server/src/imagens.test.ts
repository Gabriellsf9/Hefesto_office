import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "./paths.ts";
import { criarCard, registrarEntrega } from "./tarefas.ts";
import { blocosDeImagem } from "./imagens.ts";
import { imagensDoCard } from "./agentes/motor.ts";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

test("prints salvos num card chegam a quem valida e aos cards que dependem dele", () => {
  const prototipo = criarCard({ titulo: "Protótipo", sala: "design", dono: "ui-designer", validador: "pm" });
  mkdirSync(join(DATA_DIR, "midia", String(prototipo.id)), { recursive: true });
  writeFileSync(join(DATA_DIR, "midia", String(prototipo.id), "img-abc-board.png"), PNG);
  const url = `/api/midia/${prototipo.id}/img-abc-board.png`;
  registrarEntrega(prototipo.id, "ui-designer", "v1", `Board nativo:\n![Board](${url})\n![Inexistente](/api/midia/${prototipo.id}/img-nao-existe.png)`);

  assert.deepEqual(imagensDoCard(prototipo), [url], "o validador vê o print da entrega (e só o que existe de verdade)");
  const frontend = criarCard({ titulo: "Frontend", sala: "desenvolvimento", dono: "dev-frontend", validador: "reviewer-1", dependeDe: prototipo.id });
  assert.deepEqual(imagensDoCard(frontend), [url], "o card seguinte vê o protótipo");

  const [bloco] = blocosDeImagem([url]);
  assert.equal(bloco?.source.type === "base64" && bloco.source.media_type, "image/png");
});
