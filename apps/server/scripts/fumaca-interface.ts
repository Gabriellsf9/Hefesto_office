import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { opcoesDoChrome } from "../src/plataforma.ts";

// Fumaça da interface: abre cada página no Chrome de verdade e falha se alguma der erro de JavaScript ou ficar em
// branco (a interface não tem tela de erro: um erro de renderização apaga a página inteira, como já aconteceu com
// Conversas). Uso: node --import tsx scripts/fumaca-interface.ts http://127.0.0.1:4399 [pasta-dos-prints]

const base = (process.argv[2] ?? "http://127.0.0.1:4417").replace(/\/$/, "");
const pastaPrints = process.argv[3] ?? "fumaca-interface";

const PAGINAS = [
  "escritorio",
  "entrada",
  "conversas",
  "trabalho",
  "clientes",
  "equipe",
  "equipe/desempenho",
  "equipe/ao-vivo",
  "empresa",
  "empresa/conhecimento",
  "empresa/metas",
  "empresa/indicadores",
  "empresa/rituais",
  "empresa/conquistas",
  "operacao",
  "operacao/medicao",
  "operacao/piloto",
  "operacao/projetos",
  "operacao/chamadas",
  "operacao/qualidade",
  "operacao/auditoria",
  "operacao/monitoramento",
  "operacao/financas",
  "operacao/backup",
  "config",
  "config/integracoes",
  "config/modelos",
  "config/voz",
  "config/escritorio",
  "config/permissoes",
  "config/conectores",
  "config/whatsapp",
  "config/celular",
  "config/backup",
  "config/sobre",
  "escritorios",
];
// Ruído que não é defeito da interface: WebGL sem placa de vídeo no CI, rede de terceiros, o WebSocket reconectando.
const IGNORAR = /WebGL|GPU|GL_|swiftshader|favicon|net::ERR_|WebSocket|Failed to load resource/i;

async function api(caminho: string, corpo: unknown) {
  const r = await fetch(`${base}${caminho}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) });
  if (!r.ok) throw new Error(`${caminho} respondeu ${r.status}: ${await r.text()}`);
  return (await r.json()) as { id: number };
}

const card = await api("/api/cards", {
  titulo: "Card da fumaça",
  descricao: "Abrir o detalhe.",
  sala: "desenvolvimento",
  fluxo: "software",
  coluna: "concluido", // o motor nunca pega card concluído
  dono: "dev-backend",
});
// O card é só para abrir o detalhe: sai do board no fim, passe ou falhe (rodando contra o Hefesto em uso, um agente pegaria).
const apagarCard = () => fetch(`${base}/api/cards/${card.id}`, { method: "DELETE" }).catch(() => null);
const navegador = await chromium.launch({ ...opcoesDoChrome(), headless: true });
const contexto = await navegador.newContext({ viewport: { width: 1366, height: 900 } });
await contexto.addInitScript(() => localStorage.setItem("boas-vindas-concluidas", "1"));
const pagina = await contexto.newPage();
let erros: string[] = [];
pagina.on("pageerror", (e) => erros.push(`erro: ${e.message}`));
pagina.on("console", (m) => {
  if (m.type() === "error" && !IGNORAR.test(m.text())) erros.push(`console: ${m.text().slice(0, 300)}`);
});

const falhas: string[] = [];
try {
  await pagina.goto(`${base}/#/escritorio`, { waitUntil: "load" });
  for (const p of [...PAGINAS, `trabalho?card=${card.id}`]) {
    erros = [];
    await pagina.evaluate((h) => (location.hash = h), `#/${p}`);
    await pagina.waitForTimeout(1200);
    const { texto, quebrou } = await pagina.evaluate(() => ({
      texto: document.getElementById("root")?.innerText.trim().length ?? 0,
      quebrou: [...document.querySelectorAll("[data-erro-pagina]")].map((e) => (e as HTMLElement).innerText.slice(0, 300)),
    }));
    const problema = [...(texto < 40 ? [`página em branco (${texto} caracteres)`] : []), ...quebrou.map((q) => `tela de erro: ${q}`), ...erros];
    if (problema.length) {
      falhas.push(`#/${p}\n  ${problema.join("\n  ")}`);
      mkdirSync(pastaPrints, { recursive: true });
      await pagina.screenshot({ path: join(pastaPrints, `${p.replace(/[/?=]/g, "_")}.png`) });
      // Recarrega do zero: a próxima página é avaliada sozinha, não herda a quebra desta.
      await pagina.goto(`${base}/?recarga=${Date.now()}#/escritorio`, { waitUntil: "load" });
    }
    console.log(`${problema.length ? "✖" : "✔"} #/${p}`);
  }
  // O detalhe do card abriu de verdade.
  if (!(await pagina.getByText("Card da fumaça").first().isVisible())) falhas.push("O detalhe do card não abriu.");
} finally {
  await navegador.close();
  await apagarCard();
}

if (falhas.length) {
  console.error(`\n${falhas.length} página(s) com problema:\n${falhas.join("\n")}`);
  process.exit(1);
}
console.log(`\nTodas as ${PAGINAS.length + 1} páginas abriram sem erro.`);
