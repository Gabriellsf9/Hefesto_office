import { randomInt } from "node:crypto";
import { colunaDe, type Card, type EstadoTelegram, type ServerEvent } from "@empresa/shared";
import { agentById, roomById, nomeDaSala } from "@empresa/org";
import { getSetting, setSetting } from "./db.ts";
import { emit, subscribe } from "./bus.ts";
import { apagarSegredo, lerSegredo, salvarSegredo } from "./secrets.ts";
import { aprovar, devolver, ErroCard, lerCard, listarCards, listarComentarios, ultimaEntrega, ETIQUETA_LIMITE, liberarGasto, limiteDoCard } from "./tarefas.ts";
import { codigoDoCard } from "./fabrica/workspace.ts";
import { previaPublicadaDo } from "./fabrica/producao.ts";
import { ehPessoa as isPessoa, lerPessoa } from "./pessoas.ts";
import { aprovarPedido, recusarPedido } from "./mcp/ferramentas.ts";
import { aprovarResposta, descartarResposta, lerContato } from "./whatsapp/whatsapp.ts";
import { pedirParaHelena } from "./agentes/helena.ts";

// Aprovar pelo celular (pedido do CEO em 27/10/2026): um bot do Telegram avisa o que espera o CEO
// (aprovações, perguntas, ações externas, respostas do WhatsApp, incidentes P0) com botões de Aprovar e
// Devolver, e o que ele escreve ao bot vai para a Helena. Funciona por long polling (getUpdates): o Mac
// só faz chamadas de saída, nada fica exposto. Só o chat pareado (código mostrado na tela local) é atendido.

const API = (process.env.TELEGRAM_API_URL ?? "https://api.telegram.org").replace(/\/$/, "");
const SEG = "telegram_token";
const CHAVE = "telegram_config";

export interface ConfigTelegram {
  ativo: boolean;
  chatId: number | null;
  nomeChat: string | null;
  bot: string | null;
  codigo: string;
  notificar: { aprovacoes: boolean; perguntas: boolean; acoes: boolean; whatsapp: boolean; incidentes: boolean };
}

const novoCodigo = () => String(randomInt(100000, 999999));

function config(): ConfigTelegram {
  const padrao: ConfigTelegram = { ativo: false, chatId: null, nomeChat: null, bot: null, codigo: novoCodigo(), notificar: { aprovacoes: true, perguntas: true, acoes: true, whatsapp: true, incidentes: true } };
  try {
    const c = { ...padrao, ...JSON.parse(getSetting(CHAVE) ?? "{}") } as ConfigTelegram;
    c.notificar = { ...padrao.notificar, ...c.notificar };
    return c;
  } catch {
    return padrao;
  }
}
const salvar = (c: ConfigTelegram) => setSetting(CHAVE, JSON.stringify(c));

let status: EstadoTelegram["status"] = "desligado";
let erro: string | null = null;

export function estadoTelegram(): EstadoTelegram {
  const c = config();
  if (!getSetting(CHAVE)) salvar(c);
  return { ...c, codigo: c.chatId ? null : c.codigo, temToken: !!lerSegredo(SEG), status, erro };
}
const avisarEstado = () => emit({ type: "telegram", estado: estadoTelegram() });

async function chamar<T = unknown>(metodo: string, corpo: Record<string, unknown> = {}, timeoutMs = 20_000): Promise<T> {
  const token = lerSegredo(SEG);
  if (!token) throw new ErroCard("Token do bot não configurado.");
  const r = await fetch(`${API}/bot${token}/${metodo}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo), signal: AbortSignal.timeout(timeoutMs) });
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
  if (!j.ok) throw new ErroCard(`Telegram: ${j.description ?? `HTTP ${r.status}`}`, 502);
  return j.result as T;
}

export async function configurarTelegram(d: Record<string, unknown>): Promise<EstadoTelegram> {
  const c = config();
  if (typeof d.token === "string" && d.token.trim()) {
    if (!/^\d{6,12}:[\w-]{30,}$/.test(d.token.trim())) throw new ErroCard("Token inválido: copie o token completo que o @BotFather mandou (números:letras).");
    salvarSegredo(SEG, d.token.trim());
    c.chatId = null;
    c.nomeChat = null;
    c.codigo = novoCodigo();
    try {
      const eu = await chamar<{ username: string }>("getMe");
      c.bot = eu.username;
    } catch (e) {
      apagarSegredo(SEG);
      throw e;
    }
  }
  if (typeof d.ativo === "boolean") c.ativo = d.ativo;
  if (d.notificar && typeof d.notificar === "object") {
    for (const k of Object.keys(c.notificar) as (keyof ConfigTelegram["notificar"])[]) {
      const v = (d.notificar as Record<string, unknown>)[k];
      if (typeof v === "boolean") c.notificar[k] = v;
    }
  }
  if (c.ativo && !lerSegredo(SEG)) throw new ErroCard("Cole o token do bot antes de ligar.");
  salvar(c);
  reiniciar();
  return estadoTelegram();
}

export function desparear(): EstadoTelegram {
  const c = config();
  salvar({ ...c, chatId: null, nomeChat: null, codigo: novoCodigo() });
  avisarEstado();
  return estadoTelegram();
}

export function esquecerTelegram(): EstadoTelegram {
  apagarSegredo(SEG);
  salvar({ ...config(), ativo: false, chatId: null, nomeChat: null, bot: null, codigo: novoCodigo() });
  reiniciar();
  return estadoTelegram();
}

/* ---------- Envio ---------- */

type Botao = { text: string; callback_data: string };
const escapar = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function enviar(texto: string, botoes?: Botao[][], forcarResposta = false): Promise<number | null> {
  const c = config();
  if (!c.ativo || !c.chatId) return null;
  try {
    const r = await chamar<{ message_id: number }>("sendMessage", {
      chat_id: c.chatId,
      text: texto.slice(0, 4000),
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...(botoes ? { reply_markup: { inline_keyboard: botoes } } : forcarResposta ? { reply_markup: { force_reply: true, input_field_placeholder: "O que precisa mudar?" } } : {}),
    });
    return r.message_id;
  } catch (e) {
    console.error("Telegram: falha ao enviar", e);
    return null;
  }
}

/* ---------- Avisos (o que espera o CEO) ---------- */

const avisados = new Set<string>();
const uma = (chave: string) => (avisados.has(chave) ? false : (avisados.add(chave), true));
const nomeDe = (id: string | null) => (id ? agentById[id]?.nome ?? lerPessoa(id)?.nome ?? id : "");

/** O que ajuda a decidir pelo celular: o resumo da entrega, o que mudou no código e a prévia publicada. */
async function detalhesDaAprovacao(card: Card): Promise<string> {
  const partes: string[] = [];
  const e = ultimaEntrega(card.id);
  if (e?.resumo) partes.push(`📝 ${escapar(e.resumo.slice(0, 300))}`);
  const codigo = await codigoDoCard(card).catch(() => null);
  if (codigo?.stat) {
    const total = codigo.stat.trim().split("\n").at(-1) ?? "";
    const arquivos = codigo.arquivos.slice(0, 6).map((a) => `${a.status} ${a.caminho}`).join("\n");
    partes.push(`💻 <b>Código</b> (${escapar(codigo.branch)}): ${escapar(total.trim())}\n<code>${escapar(arquivos)}${codigo.arquivos.length > 6 ? `\n… e mais ${codigo.arquivos.length - 6}` : ""}</code>`);
  }
  const previa = previaPublicadaDo(card.id);
  if (previa?.status === "pronta" && previa.url) partes.push(`🌐 Prévia: ${escapar(previa.url)}`);
  const alertas = listarComentarios(card.id).filter((c) => c.ts >= (e?.ts ?? 0) && /^(⚖️|🛡️ Ataque: nada grave)/.test(c.texto)).map((c) => escapar(c.texto.split("\n")[0]!.slice(0, 160)));
  if (alertas.length) partes.push(alertas.join("\n"));
  partes.push(`💸 US$ ${card.custoUsd.toFixed(2)}`);
  return partes.join("\n");
}

function avisoCard(card: Card) {
  const c = config();
  const tipo = colunaDe(card.fluxo, card.coluna)?.tipo;
  if (card.demo) return;
  if (tipo === "ceo" && c.notificar.aprovacoes && uma(`ap-${card.id}-${card.atualizadoEm}-${card.devolucoes}`)) {
    void detalhesDaAprovacao(card).then((det) =>
      enviar(
        `✅ <b>Pronto para aprovar</b> · ${card.chave} (${card.nivel}, ${card.prioridade})\n${escapar(card.titulo)}\n<i>${escapar(nomeDaSala(card.sala))} · ${escapar(nomeDe(card.dono))}${card.validador ? `, validado por ${escapar(nomeDe(card.validador))}` : ""}</i>\n\n${det}`,
        [[{ text: "Aprovar", callback_data: `ap:${card.id}` }, { text: "Devolver", callback_data: `dv:${card.id}` }]],
      ),
    );
  } else if (card.bloqueado && card.etiquetas.includes(ETIQUETA_LIMITE) && uma(`lg-${card.id}-${card.custoUsd.toFixed(2)}`)) {
    const lim = limiteDoCard(card);
    void enviar(
      `💸 <b>Limite de gasto</b> · ${card.chave}\n${escapar(card.titulo)}\n<i>Gastou US$ ${card.custoUsd.toFixed(2)} e parou. Liberando, ${escapar(nomeDe(card.dono))} continua de onde parou.</i>`,
      [[{ text: `Liberar mais US$ ${lim.toFixed(2)}`, callback_data: `lb:${card.id}` }]],
    );
  } else if (card.bloqueado && c.notificar.perguntas && uma(`bq-${card.id}-${card.atualizadoEm}`)) {
    void enviar(`❓ <b>Pergunta para você</b> · ${card.chave}\n${escapar(card.titulo)}\n<i>Responda aqui citando ${card.chave} ou abra o card no Mac.</i>`);
  }
  // Card de uma pessoa do time: avisa no chat pareado (num grupo, com a menção dela).
  const pessoa = card.dono && isPessoa(card.dono) ? lerPessoa(card.dono) : null;
  if (pessoa && tipo !== "feito" && tipo !== "perdido" && uma(`ps-${card.id}-${card.dono}`)) {
    void enviar(`👤 <b>Card para ${escapar(pessoa.nome)}</b>${pessoa.telegram ? ` (@${escapar(pessoa.telegram)})` : ""} · ${card.chave}\n${escapar(card.titulo)}\n<i>${escapar(nomeDaSala(card.sala))} · ${card.prioridade}</i>`);
  }
  if (card.prioridade === "P0" && c.notificar.incidentes && uma(`p0-${card.id}`)) {
    void enviar(`🚨 <b>P0</b> · ${card.chave}\n${escapar(card.titulo)}`);
  }
}

function aoEvento(e: ServerEvent) {
  const c = config();
  if (!c.ativo || !c.chatId) return;
  if (e.type === "card") avisoCard(e.card);
  else if (e.type === "mcp.pedido" && e.pedido.status === "pendente" && c.notificar.acoes && uma(`pd-${e.pedido.id}`)) {
    const p = e.pedido;
    const detalhe = p.servidorId === -1 ? String(p.args.comando ?? "") : p.servidorId === -2 ? `sessão de ${p.args.minutos ?? 15} min no Mac` : JSON.stringify(p.args).slice(0, 600);
    void enviar(
      `⚡ <b>Ação externa</b> · ${escapar(p.servidor)} · ${escapar(p.ferramenta)}\n<code>${escapar(detalhe)}</code>\n${p.motivo ? `<i>${escapar(p.motivo)}</i>\n` : ""}Pedido por ${escapar(nomeDe(p.agenteId))}`,
      [[{ text: "Executar", callback_data: `ex:${p.id}` }, { text: "Recusar", callback_data: `rc:${p.id}` }]],
    );
  } else if (e.type === "whatsapp_mensagem" && e.mensagem.status === "pendente" && c.notificar.whatsapp && uma(`wa-${e.mensagem.id}`)) {
    const m = e.mensagem;
    const contato = lerContato(m.telefone);
    void enviar(`💬 <b>WhatsApp · ${escapar(contato?.nome || `+${m.telefone}`)}</b>\nA Lorena quer responder:\n\n${escapar(m.texto)}`, [[{ text: "Enviar", callback_data: `wo:${m.id}` }, { text: "Descartar", callback_data: `wn:${m.id}` }]]);
  } else if (e.type === "whatsapp_contato" && e.contato.humano && e.contato.naoLidas > 0 && c.notificar.whatsapp && uma(`wh-${e.contato.telefone}-${e.contato.ultimaMensagem?.ts}`)) {
    void enviar(`💬 <b>Cliente esperando você</b> · ${escapar(e.contato.nome || `+${e.contato.telefone}`)}\n${escapar(e.contato.ultimaMensagem?.texto ?? "")}`);
  } else if (e.type === "chat" && e.mensagem.de !== "voce" && Date.now() - ultimaDoCeo < 10 * 60_000) {
    // Respostas da empresa a um pedido feito pelo Telegram voltam para o Telegram.
    void enviar(`<b>${escapar(nomeDe(e.mensagem.de))}:</b> ${escapar(e.mensagem.texto)}`);
  }
}

/* ---------- Recebimento (long polling) ---------- */

let ultimaDoCeo = 0;
/** Card esperando o comentário de devolução (a próxima mensagem de texto vira o comentário). */
let devolvendo: number | null = null;
let rodando = false;
let geracao = 0;

interface Update {
  update_id: number;
  message?: { message_id: number; chat: { id: number; first_name?: string; username?: string }; text?: string; voice?: unknown };
  callback_query?: { id: string; data?: string; message?: { message_id: number; chat: { id: number }; text?: string } };
}

async function tratar(u: Update) {
  const c = config();
  if (u.callback_query) {
    const q = u.callback_query;
    if (!c.chatId || q.message?.chat.id !== c.chatId) return void chamar("answerCallbackQuery", { callback_query_id: q.id, text: "Não autorizado." }).catch(() => {});
    const [acao, idTxt] = (q.data ?? "").split(":");
    const id = Number(idTxt);
    let resposta = "Feito.";
    try {
      if (acao === "ap") resposta = `Aprovado: ${aprovar(id, "Aprovado pelo Telegram").chave}`;
      else if (acao === "dv") {
        devolvendo = id;
        resposta = "Escreva o que precisa mudar.";
        await enviar(`Devolver ${lerCard(id).chave}: o que precisa mudar? Responda esta mensagem.`, undefined, true);
      } else if (acao === "ex") resposta = `Executado: ${(await aprovarPedido(id)).status}`;
      else if (acao === "rc") resposta = (recusarPedido(id, "Recusado pelo Telegram"), "Recusado.");
      else if (acao === "wo") resposta = `Mensagem ${(await aprovarResposta(id)).status}.`;
      else if (acao === "wn") resposta = (descartarResposta(id), "Descartada.");
      else if (acao === "lb") resposta = `Liberado: ${liberarGasto(id).chave} continua.`;
    } catch (e) {
      resposta = e instanceof Error ? e.message : String(e);
    }
    await chamar("answerCallbackQuery", { callback_query_id: q.id, text: resposta.slice(0, 190) }).catch(() => {});
    if (q.message && acao !== "dv") await chamar("editMessageReplyMarkup", { chat_id: c.chatId, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => {});
    if (acao !== "dv") await enviar(`→ ${escapar(resposta)}`);
    return;
  }
  const m = u.message;
  if (!m) return;
  const texto = (m.text ?? "").trim();
  if (!c.chatId) {
    const par = /^\/parear\s+(\d{6})$/.exec(texto);
    if (par && par[1] === c.codigo) {
      salvar({ ...c, chatId: m.chat.id, nomeChat: m.chat.first_name ?? m.chat.username ?? null, codigo: novoCodigo() });
      avisarEstado();
      await chamar("sendMessage", { chat_id: m.chat.id, text: "Pareado! Agora eu aviso aqui o que espera você, com botões para aprovar. O que você escrever vai para a Helena. /pendencias lista o que está esperando." });
    } else {
      await chamar("sendMessage", { chat_id: m.chat.id, text: "Este bot é privado. Para parear, envie /parear seguido do código que aparece em Configurações → Celular no seu Mac." }).catch(() => {});
    }
    return;
  }
  if (m.chat.id !== c.chatId) return; // Outros chats: ignorados.
  if (m.voice) return void enviar("Ainda não ouço áudios por aqui: mande por texto, por favor.");
  if (!texto) return;
  if (devolvendo !== null && !texto.startsWith("/")) {
    const id = devolvendo;
    devolvendo = null;
    try {
      await enviar(`Devolvido: ${devolver(id, texto).chave}. O autor vai fazer uma nova versão.`);
    } catch (e) {
      await enviar(e instanceof Error ? e.message : String(e));
    }
    return;
  }
  if (texto === "/start" || texto === "/ajuda") return void enviar("Eu aviso o que espera você, com botões para aprovar ou devolver. Comandos: /pendencias. Qualquer outra mensagem vai para a Helena (a resposta volta aqui).");
  if (texto === "/pendencias") {
    const pend = listarCards().filter((x) => !x.demo && colunaDe(x.fluxo, x.coluna)?.tipo === "ceo");
    if (!pend.length) return void enviar("Nada esperando aprovação agora.");
    avisados.clear();
    for (const x of pend.slice(0, 10)) avisoCard(x);
    return;
  }
  ultimaDoCeo = Date.now();
  pedirParaHelena(texto);
}

async function laco(minha: number) {
  let offset = Number(getSetting("telegram_offset") ?? 0);
  while (geracao === minha) {
    try {
      const updates = await chamar<Update[]>("getUpdates", { offset, timeout: 25, allowed_updates: ["message", "callback_query"] }, 35_000);
      status = "conectado";
      erro = null;
      for (const u of updates) {
        offset = u.update_id + 1;
        setSetting("telegram_offset", String(offset));
        await tratar(u).catch((e) => console.error("Telegram: erro ao tratar", e));
      }
    } catch (e) {
      if (geracao !== minha) break;
      status = "erro";
      erro = e instanceof Error ? e.message : String(e);
      avisarEstado();
      await new Promise((r) => setTimeout(r, 10_000));
    }
  }
}

let desinscrever: (() => void) | null = null;

export function reiniciar() {
  geracao++;
  desinscrever?.();
  desinscrever = null;
  const c = config();
  if (!c.ativo || !lerSegredo(SEG)) {
    status = "desligado";
    erro = null;
    rodando = false;
    avisarEstado();
    return;
  }
  desinscrever = subscribe(aoEvento);
  rodando = true;
  status = "conectado";
  void laco(geracao);
  avisarEstado();
}

export function iniciarTelegram() {
  if (process.env.EMPRESA_SEM_REDE === "1" && !process.env.TELEGRAM_API_URL) return;
  if (config().ativo) reiniciar();
}

export const telegramRodando = () => rodando;
