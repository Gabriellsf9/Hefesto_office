import { mkdirSync } from "node:fs";
import { rename } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { DATA_DIR } from "../paths.ts";
import { opcoesDoChrome } from "../plataforma.ts";
import { ErroEntrada, ferramenta, type Ferramenta } from "../agentes/loop.ts";
import { ambienteAtivo, HOST_DO_AMBIENTE } from "./ambiente.ts";

// Prints (e vídeo, quando possível) das telas do app do CEO para treinamento e QA (Fase 4).
// Usa o Google Chrome instalado no Mac, com um perfil temporário (sem os seus cookies e logins),
// e só abre endereços locais (localhost): o app precisa estar rodando na sua máquina.

const TEMPO_MAX_MS = 90_000;
const HOSTS_LOCAIS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export const pastaDeMidia = (cardId: number) => join(DATA_DIR, "midia", String(cardId));

export function urlLocalValida(url: string): boolean {
  try {
    const u = new URL(url);
    // O app que os agentes sobem no Docker deles (ambiente do card) também é local.
    const doAmbiente = ambienteAtivo() && u.hostname === HOST_DO_AMBIENTE;
    return (u.protocol === "http:" || u.protocol === "https:") && (HOSTS_LOCAIS.has(u.hostname) || u.hostname.endsWith(".localhost") || doAmbiente);
  } catch {
    return false;
  }
}

interface Passo {
  acao: "abrir" | "clicar" | "preencher" | "esperar" | "print";
  alvo?: string;
  valor?: string;
  nome?: string;
  legenda?: string;
}

const slug = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "tela";

export async function capturar(cardId: number, urlBase: string, passos: Passo[], gravarVideo: boolean): Promise<string> {
  if (!urlLocalValida(urlBase)) throw new ErroEntrada("O endereço do app precisa ser local (localhost).");
  const pasta = pastaDeMidia(cardId);
  mkdirSync(pasta, { recursive: true });
  const saida: string[] = [];
  let navegador;
  try {
    navegador = await chromium.launch({ ...opcoesDoChrome(), headless: true, timeout: 30_000 });
  } catch (e) {
    throw new ErroEntrada(`Não consegui abrir o Google Chrome para as capturas: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
  }
  const inicio = Date.now();
  try {
    let contexto;
    let video = gravarVideo;
    try {
      contexto = await navegador.newContext({ viewport: { width: 1280, height: 800 }, ...(video ? { recordVideo: { dir: pasta, size: { width: 1280, height: 800 } } } : {}) });
    } catch {
      video = false;
      saida.push("(Vídeo indisponível neste Mac: falta o ffmpeg do Playwright. Os prints seguem normalmente.)");
      contexto = await navegador.newContext({ viewport: { width: 1280, height: 800 } });
    }
    const pagina = await contexto.newPage();
    pagina.setDefaultTimeout(10_000);
    const base = new URL(urlBase);
    let n = 0;
    for (const p of passos.slice(0, 40)) {
      if (Date.now() - inicio > TEMPO_MAX_MS) {
        saida.push("(Parei: passou do tempo máximo de 90 s.)");
        break;
      }
      try {
        if (p.acao === "abrir") {
          const destino = new URL(p.alvo ?? "/", base);
          if (!urlLocalValida(destino.href)) throw new Error("só endereços locais");
          await pagina.goto(destino.href, { waitUntil: "networkidle" });
        } else if (p.acao === "clicar") await pagina.locator(p.alvo ?? "").first().click();
        else if (p.acao === "preencher") await pagina.locator(p.alvo ?? "").first().fill(p.valor ?? "");
        else if (p.acao === "esperar") await pagina.waitForTimeout(Math.min(5000, Number(p.valor) || 800));
        else if (p.acao === "print") {
          n++;
          const arquivo = `${String(n).padStart(2, "0")}-${slug(p.nome ?? p.legenda ?? "tela")}.png`;
          await pagina.screenshot({ path: join(pasta, arquivo) });
          saida.push(`![${p.legenda ?? p.nome ?? `Tela ${n}`}](/api/midia/${cardId}/${arquivo})`);
        }
        // Se algum clique levou para fora do app local, para por aqui.
        if (!urlLocalValida(pagina.url()) && pagina.url() !== "about:blank") {
          saida.push(`(Parei: a página saiu do app local para ${new URL(pagina.url()).hostname}.)`);
          break;
        }
      } catch (e) {
        saida.push(`(Falhou no passo "${p.acao}${p.alvo ? ` ${p.alvo}` : ""}": ${e instanceof Error ? e.message.split("\n")[0] : String(e)})`);
      }
    }
    const caminhoVideo = video ? await pagina.video()?.path() : undefined;
    await contexto.close();
    if (caminhoVideo) {
      const arquivo = `video-${Date.now()}.webm`;
      await rename(caminhoVideo, join(pasta, arquivo));
      saida.push(`[Vídeo do passo a passo](/api/midia/${cardId}/${arquivo})`);
    }
  } finally {
    await navegador.close();
  }
  return saida.join("\n\n") || "Nenhum print feito (inclua passos com acao \"print\").";
}

const HTML_MAX = 300_000;

/**
 * Renderiza uma tela, wireframe ou diagrama escrito em HTML/CSS/SVG e salva o print no card. Sem rede (nada externo
 * é carregado nem enviado) e sem JavaScript: só o que vier no próprio HTML, como imagem estática.
 */
export async function desenharImagem(cardId: number, html: string, nome: string, legenda: string, largura = 1280): Promise<string> {
  if (!html.trim()) throw new ErroEntrada("Envie o HTML da imagem.");
  if (html.length > HTML_MAX) throw new ErroEntrada("HTML grande demais (máximo 300 mil caracteres).");
  const pasta = pastaDeMidia(cardId);
  mkdirSync(pasta, { recursive: true });
  let navegador;
  try {
    navegador = await chromium.launch({ ...opcoesDoChrome(), headless: true, timeout: 30_000 });
  } catch (e) {
    throw new ErroEntrada(`Não consegui abrir o navegador para desenhar: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
  }
  try {
    const w = Math.min(1920, Math.max(320, Math.round(largura)));
    // Altura mínima: o print acompanha a altura do conteúdo, sem faixa vazia embaixo.
    const contexto = await navegador.newContext({ viewport: { width: w, height: 200 }, javaScriptEnabled: false });
    await contexto.route("**/*", (r) => (/^(data|about):/.test(r.request().url()) ? r.continue() : r.abort()));
    const pagina = await contexto.newPage();
    await pagina.setContent(html, { waitUntil: "load", timeout: 20_000 });
    const altura = Math.min(6000, await pagina.evaluate("document.documentElement.scrollHeight").catch(() => 800) as number);
    const arquivo = `img-${Date.now().toString(36)}-${slug(nome)}.png`;
    await pagina.screenshot({ path: join(pasta, arquivo), clip: { x: 0, y: 0, width: w, height: Math.max(200, altura) } });
    await contexto.close();
    return `![${legenda.replace(/[\[\]\n]/g, " ").trim() || nome}](/api/midia/${cardId}/${arquivo})`;
  } finally {
    await navegador.close();
  }
}

/** Ferramenta para todos: desenha a tela, o fluxo ou o diagrama e devolve a imagem pronta para a entrega. */
export function ferramentaGerarImagem(cardId: number): Ferramenta {
  return ferramenta(
    "gerar_imagem",
    `Desenha uma imagem e salva no card: tela ou wireframe (HTML com CSS), fluxo, diagrama de arquitetura ou gráfico (SVG dentro do HTML). Escreva um documento HTML completo, com todo o CSS no próprio arquivo: nada externo carrega (sem CDN, fontes ou imagens da web) e JavaScript não roda. Fontes instaladas: Geist e Geist Mono, Inter, Noto Sans, Liberation; use a fonte que o projeto usa (veja o tema dele), e system-ui/sans-serif viram Inter. Devolve a linha da imagem em Markdown: coloque-a sozinha numa linha da entrega, para o CEO e os próximos agentes verem.`,
    {
      html: { type: "string", description: "Documento HTML completo (CSS em <style>, SVG inline)" },
      nome: { type: "string", description: "Nome curto do arquivo (ex.: tela-de-integracoes)" },
      legenda: { type: "string", description: "O que a imagem mostra (aparece embaixo dela)" },
      largura: { type: "number", description: "Largura em pixels: 1280 (desktop, padrão) ou 390 (celular)" },
    },
    ["html", "nome", "legenda"],
    async (e) => ({
      texto: `Imagem salva. Coloque esta linha na entrega:\n${await desenharImagem(cardId, String(e.html ?? ""), String(e.nome ?? "imagem"), String(e.legenda ?? ""), Number(e.largura) || 1280)}`,
    }),
  );
}

/** Ferramenta para Treinamento e QA: abre o app local, segue os passos e tira prints (e vídeo). */
export function ferramentaDeCaptura(cardId: number, urlBase: string): Ferramenta {
  return ferramenta(
    "capturar_telas",
    `Abre o app do CEO rodando em ${urlBase} num Chrome limpo, segue os passos e tira prints (e grava um vídeo, se pedir). Devolve as imagens em Markdown para você colocar na entrega. Seletores no formato do Playwright (ex.: "text=Salvar", "#email", "button:has-text('Entrar')").`,
    {
      passos: {
        type: "array",
        maxItems: 40,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["acao"],
          properties: {
            acao: { type: "string", enum: ["abrir", "clicar", "preencher", "esperar", "print"] },
            alvo: { type: "string", description: "abrir: caminho (ex.: /login); clicar/preencher: seletor" },
            valor: { type: "string", description: "preencher: texto; esperar: milissegundos" },
            nome: { type: "string", description: "print: nome curto do arquivo" },
            legenda: { type: "string", description: "print: o que a imagem mostra" },
          },
        },
      },
      gravar_video: { type: "boolean" },
    },
    ["passos"],
    async (e) => {
      if (!Array.isArray(e.passos) || !e.passos.length) throw new ErroEntrada("Informe os passos.");
      return { texto: await capturar(cardId, urlBase, e.passos as Passo[], e.gravar_video === true) };
    },
  );
}
