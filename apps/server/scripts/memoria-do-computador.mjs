// Manda ao Hefesto a memória livre deste computador a cada 20 s. No Docker o Hefesto só enxerga a memória da
// máquina virtual; com este script, a vigia de memória vê a de verdade (a do Windows ou do Mac, onde o Ollama roda)
// e troca os agentes para um modelo menor antes de o computador ficar sem memória.
// Uso: node apps/server/scripts/memoria-do-computador.mjs [http://localhost:4417]
import { freemem } from "node:os";

const base = (process.argv[2] ?? "http://localhost:4417").replace(/\/$/, "");
let falhou = false;

for (;;) {
  const livreGb = freemem() / 1024 ** 3;
  try {
    const r = await fetch(`${base}/api/maquina/memoria`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ livreGb }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    if (falhou) console.log(`${new Date().toLocaleTimeString("pt-BR")} Hefesto respondendo de novo.`);
    falhou = false;
  } catch (e) {
    // Hefesto fora do ar (atualização, reinício): tenta de novo na próxima volta, sem encher o log.
    if (!falhou) console.log(`${new Date().toLocaleTimeString("pt-BR")} Hefesto não respondeu (${e.message}); sigo tentando.`);
    falhou = true;
  }
  await new Promise((ok) => setTimeout(ok, 20_000));
}
