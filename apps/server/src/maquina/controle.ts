import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { Agent, Card, SessaoControle } from "@empresa/shared";
import { emit, postChat } from "../bus.ts";
import { comentar, editarCard, ErroCard } from "../tarefas.ts";
import { ErroEntrada, ferramenta, type Ferramenta, type ResultadoFerramenta } from "../agentes/loop.ts";
import { pedirAprovacao, registrarExecutor } from "../mcp/ferramentas.ts";
import { pastaDeMidia } from "../fabrica/capturas.ts";
import { writeFileSync } from "node:fs";

// Controle do Mac (pedido do CEO em 27/10/2026): ver a tela, clicar, digitar, atalhos e abrir apps.
// - O agente pede uma SESSÃO para o card; o CEO aprova por um tempo (padrão 15 min).
// - Durante a sessão, cada ação gera um print para o painel ao vivo; uma faixa vermelha fica no topo da
//   tela com o botão PARAR, que corta na hora (e a sessão expira sozinha).
// - O macOS exige duas permissões para o programa que roda o servidor: Gravação de Tela e Acessibilidade.

const run = promisify(execFile);
export const ID_CONTROLE = -2;
const NOME = "Controle do Mac";
const LARGURA_PRINT = 1280;

interface Sessao {
  info: SessaoControle;
}
const sessoes = new Map<number, Sessao>();

export const listarSessoesControle = (): SessaoControle[] => [...sessoes.values()].map((s) => s.info);
const publicar = (s: SessaoControle) => emit({ type: "controle", sessao: s });

function ativa(cardId: number): Sessao | null {
  const s = sessoes.get(cardId);
  if (!s) return null;
  if (!s.info.ativa || Date.now() > s.info.ate) {
    if (s.info.ativa) encerrar(cardId, "o tempo da sessão acabou");
    return null;
  }
  return s;
}

export function encerrar(cardId: number | null, motivo = "parado pelo CEO") {
  for (const [id, s] of sessoes) {
    if (cardId !== null && id !== cardId) continue;
    if (!s.info.ativa) continue;
    s.info.ativa = false;
    s.info.acoes = [...s.info.acoes, { ts: Date.now(), acao: "fim", detalhe: motivo, ok: true }].slice(-30);
    publicar(s.info);
    comentar(id, "voce", "comentario", `Sessão de controle do Mac encerrada: ${motivo}.`);
  }
}

// Pedido aprovado: libera a sessão para o card pelo tempo pedido (máximo 60 min).
registrarExecutor(ID_CONTROLE, async (args, p) => {
  if (!p.cardId) return { texto: "Sessões de controle só existem dentro de um card.", erro: true };
  const minutos = Math.max(1, Math.min(60, Math.round(Number(args.minutos) || 15)));
  const info: SessaoControle = { cardId: p.cardId, agenteId: p.agenteId, ate: Date.now() + minutos * 60_000, ativa: true, imagem: null, acoes: [] };
  sessoes.set(p.cardId, { info });
  publicar(info);
  // O card estava pausado esperando a sessão: despausa e o agente volta ao trabalho.
  editarCard(p.cardId, { bloqueado: false });
  return { texto: `Sessão de controle do Mac liberada por ${minutos} minutos. O agente retoma o card agora.` };
});

/* ---------- Ações no macOS ---------- */

function erroDePermissao(e: unknown): never {
  const msg = e instanceof Error ? e.message : String(e);
  if (/not allowed|assistive|1002|-1719|-25211|accessibility/i.test(msg)) {
    throw new ErroEntrada("O macOS bloqueou o controle: dê permissão de Acessibilidade ao programa que roda a Empresa Completa (Ajustes do Sistema → Privacidade e Segurança → Acessibilidade).");
  }
  throw new ErroEntrada(`Falhou: ${msg.split("\n")[0]}`);
}

const jxa = (codigo: string) => run("/usr/bin/osascript", ["-l", "JavaScript", "-e", codigo], { timeout: 15_000 }).catch(erroDePermissao);

async function tamanhoDaTela(): Promise<{ w: number; h: number }> {
  const r = await jxa("ObjC.import('AppKit'); var f = $.NSScreen.mainScreen.frame; JSON.stringify({ w: f.size.width, h: f.size.height })");
  return JSON.parse(r.stdout.trim());
}

/** Print da tela inteira, reduzido para 1280 px; devolve também a escala para converter coordenadas. */
async function print(): Promise<{ base64: string; escala: number; buffer: Buffer }> {
  const pasta = join(tmpdir(), "empresa-controle");
  mkdirSync(pasta, { recursive: true });
  const bruto = join(pasta, `t-${Date.now()}.jpg`);
  const menor = join(pasta, `m-${Date.now()}.jpg`);
  try {
    await run("/usr/sbin/screencapture", ["-x", "-t", "jpg", bruto], { timeout: 15_000 });
    await run("/usr/bin/sips", ["-Z", String(LARGURA_PRINT), "-s", "formatOptions", "60", bruto, "--out", menor], { timeout: 15_000 });
    const buffer = readFileSync(menor);
    const larg = Number((await run("/usr/bin/sips", ["-g", "pixelWidth", menor])).stdout.match(/pixelWidth: (\d+)/)?.[1] ?? LARGURA_PRINT);
    const tela = await tamanhoDaTela();
    return { base64: buffer.toString("base64"), escala: tela.w / larg, buffer };
  } catch (e) {
    if (/could not create image|not permitted|-3801/i.test(String(e))) {
      throw new ErroEntrada("O macOS bloqueou o print: dê permissão de Gravação de Tela ao programa que roda a Empresa Completa (Ajustes do Sistema → Privacidade e Segurança → Gravação de Tela).");
    }
    throw e;
  } finally {
    rmSync(bruto, { force: true });
    rmSync(menor, { force: true });
  }
}

const TECLAS: Record<string, number> = {
  enter: 36, return: 36, tab: 48, space: 49, espaco: 49, delete: 51, backspace: 51, esc: 53, escape: 53, left: 123, esquerda: 123, right: 124, direita: 124,
  down: 125, baixo: 125, up: 126, cima: 126, home: 115, end: 119, pageup: 116, pagedown: 121, f5: 96,
};
const MODS: Record<string, string> = { cmd: "command down", command: "command down", ctrl: "control down", control: "control down", alt: "option down", option: "option down", shift: "shift down" };

async function clicar(x: number, y: number, botao: "esquerdo" | "direito", duplo: boolean) {
  const [down, up, b] = botao === "direito" ? ["kCGEventRightMouseDown", "kCGEventRightMouseUp", 1] : ["kCGEventLeftMouseDown", "kCGEventLeftMouseUp", 0];
  await jxa(`ObjC.import('CoreGraphics');
var p = $.CGPointMake(${x}, ${y});
function ev(t, n) { var e = $.CGEventCreateMouseEvent($(), t, p, ${b}); if (n) $.CGEventSetIntegerValueField(e, $.kCGMouseEventClickState, n); $.CGEventPost($.kCGHIDEventTap, e); }
ev($.kCGEventMouseMoved, 0); delay(0.05);
ev($.${down}, 1); ev($.${up}, 1);
${duplo ? `delay(0.05); ev($.${down}, 2); ev($.${up}, 2);` : ""}`);
}

/** Digita colando pela área de transferência (acentos funcionam) e devolve o que estava copiado antes. */
async function digitar(texto: string) {
  const antes = await run("/usr/bin/pbpaste", [], { timeout: 5000 }).then((r) => r.stdout).catch(() => "");
  await new Promise<void>((ok, erro) => {
    const p = execFile("/usr/bin/pbcopy", [], (e) => (e ? erro(e) : ok()));
    p.stdin?.end(texto);
  });
  await jxa(`Application('System Events').keystroke('v', { using: ['command down'] })`);
  await new Promise((r) => setTimeout(r, 300));
  await new Promise<void>((ok) => {
    const p = execFile("/usr/bin/pbcopy", [], () => ok());
    p.stdin?.end(antes);
  });
}

async function tecla(combo: string) {
  const partes = combo.toLowerCase().split("+").map((s) => s.trim()).filter(Boolean);
  const principal = partes.pop() ?? "";
  const mods = partes.map((m) => MODS[m]).filter(Boolean);
  if (partes.length !== mods.length) throw new ErroEntrada(`Modificador desconhecido em "${combo}". Use cmd, ctrl, alt, shift.`);
  const using = mods.length ? `, { using: ${JSON.stringify(mods)} }` : "";
  if (TECLAS[principal] !== undefined) await jxa(`Application('System Events').keyCode(${TECLAS[principal]}${using})`);
  else if (principal.length === 1) await jxa(`Application('System Events').keystroke(${JSON.stringify(principal)}${using})`);
  else throw new ErroEntrada(`Tecla desconhecida: ${principal}`);
}

async function rolar(linhas: number) {
  await jxa(`ObjC.import('CoreGraphics'); var e = $.CGEventCreateScrollWheelEvent($(), 1, 1, ${-Math.round(linhas)}); $.CGEventPost($.kCGHIDEventTap, e);`);
}

/* ---------- Ferramenta ---------- */

const ACOES = ["print", "clicar", "duplo_clique", "clique_direito", "digitar", "tecla", "rolar", "abrir_app", "esperar", "encerrar"] as const;

async function registrarAcao(s: Sessao, acao: string, detalhe: string, ok: boolean, buffer?: Buffer) {
  if (buffer) {
    const pasta = pastaDeMidia(s.info.cardId);
    mkdirSync(pasta, { recursive: true });
    const nome = `mac-${Date.now()}.jpg`;
    writeFileSync(join(pasta, nome), buffer);
    s.info.imagem = `/api/midia/${s.info.cardId}/${nome}`;
  }
  s.info.acoes = [...s.info.acoes, { ts: Date.now(), acao, detalhe: detalhe.slice(0, 160), ok }].slice(-30);
  publicar(s.info);
}

export function ferramentaDeControle(agente: Agent, card: Card): Ferramenta {
  return ferramenta(
    "controlar_mac",
    `Controla o Mac do CEO: print da tela (você vê), clicar/duplo_clique/clique_direito (x, y no print), digitar (texto), tecla (ex.: "enter", "cmd+s", "cmd+shift+4"), rolar (linhas; positivo = para baixo), abrir_app (nome), esperar (ms), encerrar.
Precisa de uma SESSÃO aprovada pelo CEO: a primeira chamada sem sessão vira um pedido (informe minutos e o motivo). Depois de cada ação você recebe um print novo.
Regras: nunca digite senhas, dados de cartão ou documentos; nunca compre, pague ou transfira dinheiro; nunca mude ajustes de segurança, contas ou permissões; não feche nem apague trabalho do CEO. Se precisar disso, pare e pergunte no card.`,
    {
      acao: { type: "string", enum: [...ACOES] },
      x: { type: "number" },
      y: { type: "number" },
      texto: { type: "string" },
      tecla: { type: "string" },
      linhas: { type: "number" },
      app: { type: "string" },
      ms: { type: "number" },
      minutos: { type: "number", description: "Na primeira chamada (sem sessão): por quantos minutos pedir a sessão (1 a 60)" },
      motivo_para_o_ceo: { type: "string" },
    },
    ["acao"],
    async (e): Promise<ResultadoFerramenta> => {
      const acao = String(e.acao) as (typeof ACOES)[number];
      if (!ACOES.includes(acao)) throw new ErroEntrada(`Ação inválida. Use: ${ACOES.join(", ")}.`);
      const s = ativa(card.id);
      if (acao === "encerrar") {
        encerrar(card.id, "encerrada pelo agente");
        return { texto: "Sessão encerrada." };
      }
      if (!s) {
        const motivo = typeof e.motivo_para_o_ceo === "string" ? e.motivo_para_o_ceo.trim().slice(0, 1000) : "";
        const p = pedirAprovacao({ servidorId: ID_CONTROLE, servidor: NOME, ferramenta: "sessao", args: { minutos: Math.max(1, Math.min(60, Math.round(Number(e.minutos) || 15))) }, cardId: card.id, agenteId: agente.id, motivo });
        // Sem a sessão não dá para seguir: o card pausa e volta sozinho quando o CEO aprovar.
        editarCard(card.id, { bloqueado: true });
        return { texto: `Sem sessão ativa: pedido #${p.id} enviado ao CEO para liberar o controle do Mac. O card fica pausado e você volta a ele com a sessão aberta quando ele aprovar.`, fim: true };
      }
      const num = (v: unknown, nome: string) => {
        if (typeof v !== "number" || !Number.isFinite(v)) throw new ErroEntrada(`Informe ${nome}.`);
        return v;
      };
      let detalhe = "";
      try {
        const antes = acao === "print" ? null : await print();
        const escala = antes?.escala ?? 1;
        if (acao === "clicar" || acao === "duplo_clique" || acao === "clique_direito") {
          const x = num(e.x, "x") * escala;
          const y = num(e.y, "y") * escala;
          await clicar(Math.round(x), Math.round(y), acao === "clique_direito" ? "direito" : "esquerdo", acao === "duplo_clique");
          detalhe = `${Math.round(num(e.x, "x"))}, ${Math.round(num(e.y, "y"))}`;
        } else if (acao === "digitar") {
          const t = typeof e.texto === "string" ? e.texto : "";
          if (!t) throw new ErroEntrada("Informe o texto.");
          await digitar(t.slice(0, 5000));
          detalhe = `${t.length} caracteres`;
        } else if (acao === "tecla") {
          const t = String(e.tecla ?? "");
          await tecla(t);
          detalhe = t;
        } else if (acao === "rolar") {
          await rolar(num(e.linhas, "linhas"));
          detalhe = String(e.linhas);
        } else if (acao === "abrir_app") {
          const app = String(e.app ?? "").trim();
          if (!app || /[/\\]/.test(app)) throw new ErroEntrada("Informe o nome do app (ex.: Safari).");
          await run("/usr/bin/open", ["-a", app], { timeout: 15_000 }).catch(() => {
            throw new ErroEntrada(`Não encontrei o app "${app}".`);
          });
          detalhe = app;
        } else if (acao === "esperar") {
          await new Promise((r) => setTimeout(r, Math.min(5000, Math.max(100, Number(e.ms) || 1000))));
        }
        await new Promise((r) => setTimeout(r, 400));
        const depois = await print();
        await registrarAcao(s, acao, detalhe, true, depois.buffer);
        const restam = Math.max(0, Math.round((s.info.ate - Date.now()) / 60_000));
        return { texto: `${acao} ok${detalhe ? ` (${detalhe})` : ""}. Print atual da tela (${restam} min de sessão restantes). Coordenadas são as deste print.`, imagem: { media: "image/jpeg", base64: depois.base64 } };
      } catch (err) {
        await registrarAcao(s, acao, `${detalhe} — ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`, false);
        if (err instanceof ErroEntrada) throw err;
        throw new ErroEntrada(`Falhou: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
      }
    },
  );
}

export function pararTudo() {
  encerrar(null);
  postChat("chief-of-staff", "Parei todo controle do Mac, como você pediu.");
}

export function validarCard(cardId: number | null) {
  if (cardId === null) throw new ErroCard("Informe o card.");
}
