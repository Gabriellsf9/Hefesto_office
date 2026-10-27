import { spawn, type ChildProcess } from "node:child_process";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { ContatoWhatsapp, EstadoWhatsapp, MensagemWhatsapp, ModeloWhatsapp, ModoWhatsapp, StatusMensagemWhatsapp } from "@empresa/shared";
import { db, getSetting, setSetting } from "../db.ts";
import { emit } from "../bus.ts";
import { apagarSegredo, lerSegredo, salvarSegredo } from "../secrets.ts";
import { ErroCard } from "../tarefas.ts";
import { adicionarNaoContatar, listarNaoContatar, soDigitos } from "../prospeccao.ts";
import { salvarImagem } from "../imagens.ts";

// WhatsApp da empresa pela API oficial da Meta (WhatsApp Business Cloud API), pedido do CEO em 27/10/2026.
// - Recebe: a Meta chama um webhook. Ele roda num servidor SEPARADO (127.0.0.1:4318) que só tem essa rota e
//   confere a assinatura X-Hub-Signature-256 (HMAC-SHA256 do corpo com o App Secret). Para a Meta alcançar o
//   seu Mac, um túnel do Cloudflare (cloudflared) expõe só essa porta; o endereço vai sozinho para a Meta
//   (override_callback_uri na WABA). O resto do sistema continua só em 127.0.0.1.
// - Envia: mensagem livre só dentro da janela de 24 h desde a última mensagem do cliente; fora dela, só modelos
//   (templates) aprovados pela Meta, e só para quem autorizou receber (opt-in). Regras e preços:
//   https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing
// - "SAIR", "PARAR"… põem o número na lista de não contatar e a empresa nunca mais escreve primeiro.
// - Quem responde é a Lorena (agente). No modo "aprovar" cada resposta espera o seu OK; no "automatico" ela
//   responde sozinha a quem escreveu. Você pode assumir qualquer conversa.

const GRAPH = (process.env.WHATSAPP_GRAPH_URL ?? "https://graph.facebook.com").replace(/\/$/, "");
const PORTA = Number(process.env.WHATSAPP_PORT ?? 4318);
const ROTA = "/whatsapp/webhook";
const JANELA_MS = 24 * 3600_000;
const CHAVE = "whatsapp_config";
const SEG_TOKEN = "whatsapp_token";
const SEG_APP = "whatsapp_app_secret";

db.exec(`
  CREATE TABLE IF NOT EXISTS wa_contatos (
    telefone        TEXT PRIMARY KEY,
    nome            TEXT NOT NULL DEFAULT '',
    ultima_entrada  INTEGER,
    nao_lidas       INTEGER NOT NULL DEFAULT 0,
    humano          INTEGER NOT NULL DEFAULT 0,
    etapa           TEXT NOT NULL DEFAULT 'novo',
    resumo          TEXT NOT NULL DEFAULT '',
    lead_card_id    INTEGER,
    criado_em       INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS wa_mensagens (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    telefone  TEXT NOT NULL,
    direcao   TEXT NOT NULL,
    tipo      TEXT NOT NULL,
    texto     TEXT NOT NULL,
    imagem    TEXT,
    wamid     TEXT UNIQUE,
    status    TEXT NOT NULL,
    erro      TEXT,
    autor     TEXT NOT NULL,
    ts        INTEGER NOT NULL,
    modelo    TEXT
  );
  CREATE INDEX IF NOT EXISTS wa_mensagens_tel ON wa_mensagens (telefone, id);
`);

/* ---------- Configuração ---------- */

interface Config {
  ativo: boolean;
  modo: ModoWhatsapp;
  phoneNumberId: string;
  wabaId: string;
  versao: string;
  verifyToken: string;
  urlFixa: string;
  usarTunel: boolean;
  numero: string | null;
  nomeVerificado: string | null;
}

function config(): Config {
  let c: Partial<Config> = {};
  try {
    c = JSON.parse(getSetting(CHAVE) ?? "{}");
  } catch {}
  const padrao: Config = { ativo: false, modo: "aprovar", phoneNumberId: "", wabaId: "", versao: "v24.0", verifyToken: "", urlFixa: "", usarTunel: true, numero: null, nomeVerificado: null };
  const r = { ...padrao, ...c };
  if (!r.verifyToken) {
    r.verifyToken = randomBytes(18).toString("base64url");
    setSetting(CHAVE, JSON.stringify(r));
  }
  return r;
}
const salvarConfig = (c: Config) => setSetting(CHAVE, JSON.stringify(c));

let status: EstadoWhatsapp["status"] = "desligado";
let erro: string | null = null;
let urlTunel: string | null = null;

export function estadoWhatsapp(): EstadoWhatsapp {
  const c = config();
  return {
    ativo: c.ativo, modo: c.modo, phoneNumberId: c.phoneNumberId, wabaId: c.wabaId, versao: c.versao,
    temToken: !!lerSegredo(SEG_TOKEN), temAppSecret: !!lerSegredo(SEG_APP), verifyToken: c.verifyToken,
    urlPublica: urlPublica(), usarTunel: c.usarTunel, numero: c.numero, nomeVerificado: c.nomeVerificado, status, erro,
  };
}

function urlPublica(): string | null {
  const c = config();
  const base = c.urlFixa || (c.usarTunel ? urlTunel : null);
  return base ? `${base.replace(/\/$/, "")}${ROTA}` : null;
}

const avisarEstado = () => emit({ type: "whatsapp", estado: estadoWhatsapp() });

export async function configurarWhatsapp(d: Record<string, unknown>): Promise<EstadoWhatsapp> {
  const c = config();
  const txt = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : undefined);
  if (txt(d.phoneNumberId) !== undefined) c.phoneNumberId = soDigitos(txt(d.phoneNumberId)!);
  if (txt(d.wabaId) !== undefined) c.wabaId = soDigitos(txt(d.wabaId)!);
  if (txt(d.versao) && /^v\d{2}\.0$/.test(txt(d.versao)!)) c.versao = txt(d.versao)!;
  if (d.modo === "aprovar" || d.modo === "automatico") c.modo = d.modo;
  if (typeof d.usarTunel === "boolean") c.usarTunel = d.usarTunel;
  if (txt(d.urlFixa) !== undefined) {
    const u = txt(d.urlFixa)!;
    if (u && !/^https:\/\/[^\s/]+(\/[^\s]*)?$/.test(u)) throw new ErroCard("O endereço fixo precisa começar com https://");
    c.urlFixa = u.replace(/\/whatsapp\/webhook\/?$/, "");
  }
  const token = txt(d.token, 2000);
  if (token) salvarSegredo(SEG_TOKEN, token);
  const app = txt(d.appSecret, 200);
  if (app) salvarSegredo(SEG_APP, app);
  if (typeof d.ativo === "boolean") c.ativo = d.ativo;
  if (c.ativo && (!c.phoneNumberId || !lerSegredo(SEG_TOKEN) || !lerSegredo(SEG_APP))) {
    throw new ErroCard("Para ligar, preencha o ID do número, o token de acesso e o App Secret.");
  }
  salvarConfig(c);
  await reiniciar();
  return estadoWhatsapp();
}

export function esquecerWhatsapp(): EstadoWhatsapp {
  apagarSegredo(SEG_TOKEN);
  apagarSegredo(SEG_APP);
  salvarConfig({ ...config(), ativo: false, numero: null, nomeVerificado: null });
  void reiniciar();
  return estadoWhatsapp();
}

/* ---------- Chamadas à Meta ---------- */

async function graph<T = Record<string, unknown>>(caminho: string, metodo = "GET", corpo?: unknown): Promise<T> {
  const token = lerSegredo(SEG_TOKEN);
  if (!token) throw new ErroCard("Token do WhatsApp não configurado.");
  const r = await fetch(`${GRAPH}/${config().versao}/${caminho}`, {
    method: metodo,
    headers: { authorization: `Bearer ${token}`, ...(corpo ? { "content-type": "application/json" } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const j = (await r.json().catch(() => ({}))) as T & { error?: { message?: string; code?: number } };
  if (!r.ok || j.error) throw new ErroCard(`Meta: ${j.error?.message ?? `HTTP ${r.status}`}`, 502);
  return j;
}

/** Confere o número na Meta (nome verificado, número exibido e qualidade). */
export async function testarConexao(): Promise<EstadoWhatsapp> {
  const c = config();
  if (!c.phoneNumberId) throw new ErroCard("Informe o ID do número de telefone.");
  const j = await graph<{ display_phone_number?: string; verified_name?: string }>(`${c.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`);
  salvarConfig({ ...config(), numero: j.display_phone_number ?? null, nomeVerificado: j.verified_name ?? null });
  avisarEstado();
  return estadoWhatsapp();
}

export async function listarModelos(): Promise<ModeloWhatsapp[]> {
  const c = config();
  if (!c.wabaId) throw new ErroCard("Informe o ID da conta do WhatsApp Business (WABA) para listar os modelos.");
  const j = await graph<{ data: { name: string; language: string; category: string; status: string; components?: { type: string; text?: string }[] }[] }>(
    `${c.wabaId}/message_templates?fields=name,language,category,status,components&limit=100`,
  );
  return j.data
    .filter((m) => m.status === "APPROVED")
    .map((m) => {
      const corpo = m.components?.find((x) => x.type === "BODY")?.text ?? "";
      return { nome: m.name, idioma: m.language, categoria: m.category, texto: corpo, variaveis: new Set(corpo.match(/\{\{\d+\}\}/g) ?? []).size };
    });
}

/* ---------- Contatos e mensagens ---------- */

interface LinhaContato {
  telefone: string; nome: string; ultima_entrada: number | null; nao_lidas: number; humano: number; etapa: string; resumo: string; lead_card_id: number | null;
}
interface LinhaMsg {
  id: number; telefone: string; direcao: string; tipo: string; texto: string; imagem: string | null; wamid: string | null; status: string; erro: string | null; autor: string; ts: number; modelo: string | null;
}

const bloqueado = (tel: string) => listarNaoContatar().some((n) => n.tipo === "telefone" && soDigitos(n.valor).endsWith(tel.slice(-10)));

function deContato(r: LinhaContato): ContatoWhatsapp {
  const ult = db.prepare("SELECT texto, ts, direcao FROM wa_mensagens WHERE telefone = ? AND status != 'descartada' ORDER BY id DESC LIMIT 1").get(r.telefone) as { texto: string; ts: number; direcao: "in" | "out" } | undefined;
  const pend = (db.prepare("SELECT COUNT(*) n FROM wa_mensagens WHERE telefone = ? AND status = 'pendente'").get(r.telefone) as { n: number }).n;
  return {
    telefone: r.telefone, nome: r.nome, ultimaEntrada: r.ultima_entrada, ultimaMensagem: ult ?? null, naoLidas: r.nao_lidas, pendentes: pend,
    humano: !!r.humano, bloqueado: bloqueado(r.telefone), etapa: r.etapa as ContatoWhatsapp["etapa"], resumo: r.resumo, leadCardId: r.lead_card_id,
  };
}
const deMsg = (r: LinhaMsg): MensagemWhatsapp => ({
  id: r.id, telefone: r.telefone, direcao: r.direcao as "in" | "out", tipo: r.tipo, texto: r.texto, imagem: r.imagem, status: r.status as StatusMensagemWhatsapp, erro: r.erro, autor: r.autor, ts: r.ts, modelo: r.modelo,
});

export function lerContato(tel: string): ContatoWhatsapp | null {
  const r = db.prepare("SELECT * FROM wa_contatos WHERE telefone = ?").get(tel) as LinhaContato | undefined;
  return r ? deContato(r) : null;
}
export function listarContatos(): ContatoWhatsapp[] {
  return (db.prepare("SELECT c.* FROM wa_contatos c ORDER BY (SELECT MAX(id) FROM wa_mensagens m WHERE m.telefone = c.telefone) DESC LIMIT 300").all() as unknown as LinhaContato[]).map(deContato);
}
export function listarMensagens(tel: string, limite = 200): MensagemWhatsapp[] {
  return (db.prepare("SELECT * FROM (SELECT * FROM wa_mensagens WHERE telefone = ? ORDER BY id DESC LIMIT ?) ORDER BY id").all(tel, limite) as unknown as LinhaMsg[]).map(deMsg);
}
const lerMsg = (id: number) => {
  const r = db.prepare("SELECT * FROM wa_mensagens WHERE id = ?").get(id) as LinhaMsg | undefined;
  if (!r) throw new ErroCard("Mensagem não encontrada.", 404);
  return deMsg(r);
};

function garantirContato(tel: string, nome?: string): ContatoWhatsapp {
  db.prepare("INSERT INTO wa_contatos (telefone, nome, criado_em) VALUES (?, ?, ?) ON CONFLICT(telefone) DO NOTHING").run(tel, nome ?? "", Date.now());
  if (nome) db.prepare("UPDATE wa_contatos SET nome = ? WHERE telefone = ? AND nome = ''").run(nome, tel);
  return lerContato(tel)!;
}

export function atualizarContato(tel: string, d: { humano?: boolean; etapa?: ContatoWhatsapp["etapa"]; resumo?: string; leadCardId?: number | null; lido?: boolean; nome?: string }): ContatoWhatsapp {
  if (!lerContato(tel)) throw new ErroCard("Contato não encontrado.", 404);
  if (typeof d.humano === "boolean") db.prepare("UPDATE wa_contatos SET humano = ? WHERE telefone = ?").run(d.humano ? 1 : 0, tel);
  if (d.etapa) db.prepare("UPDATE wa_contatos SET etapa = ? WHERE telefone = ?").run(d.etapa, tel);
  if (typeof d.resumo === "string") db.prepare("UPDATE wa_contatos SET resumo = ? WHERE telefone = ?").run(d.resumo.slice(0, 2000), tel);
  if (d.leadCardId !== undefined) db.prepare("UPDATE wa_contatos SET lead_card_id = ? WHERE telefone = ?").run(d.leadCardId, tel);
  if (d.lido) db.prepare("UPDATE wa_contatos SET nao_lidas = 0 WHERE telefone = ?").run(tel);
  if (typeof d.nome === "string" && d.nome.trim()) db.prepare("UPDATE wa_contatos SET nome = ? WHERE telefone = ?").run(d.nome.trim().slice(0, 120), tel);
  const c = lerContato(tel)!;
  emit({ type: "whatsapp_contato", contato: c });
  return c;
}

function inserirMsg(m: Omit<MensagemWhatsapp, "id"> & { wamid?: string | null }): MensagemWhatsapp | null {
  const r = db
    .prepare("INSERT INTO wa_mensagens (telefone, direcao, tipo, texto, imagem, wamid, status, erro, autor, ts, modelo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(wamid) DO NOTHING")
    .run(m.telefone, m.direcao, m.tipo, m.texto, m.imagem, m.wamid ?? null, m.status, m.erro, m.autor, m.ts, m.modelo);
  if (!r.changes) return null;
  const msg = lerMsg(Number(r.lastInsertRowid));
  emit({ type: "whatsapp_mensagem", mensagem: msg });
  emit({ type: "whatsapp_contato", contato: lerContato(m.telefone)! });
  return msg;
}

function mudarStatus(id: number, s: StatusMensagemWhatsapp, extra: { erro?: string | null; wamid?: string; texto?: string } = {}) {
  db.prepare("UPDATE wa_mensagens SET status = ?, erro = ?, wamid = COALESCE(?, wamid), texto = COALESCE(?, texto) WHERE id = ?").run(s, extra.erro ?? null, extra.wamid ?? null, extra.texto ?? null, id);
  const m = lerMsg(id);
  emit({ type: "whatsapp_mensagem", mensagem: m });
  emit({ type: "whatsapp_contato", contato: lerContato(m.telefone)! });
  return m;
}

export const janelaAberta = (c: ContatoWhatsapp) => !!c.ultimaEntrada && Date.now() - c.ultimaEntrada < JANELA_MS;

/* ---------- Envio ---------- */

async function despachar(id: number, corpo: Record<string, unknown>): Promise<MensagemWhatsapp> {
  const m = mudarStatus(id, "enviando");
  try {
    const j = await graph<{ messages?: { id: string }[] }>(`${config().phoneNumberId}/messages`, "POST", { messaging_product: "whatsapp", recipient_type: "individual", to: m.telefone, ...corpo });
    return mudarStatus(id, "enviada", { wamid: j.messages?.[0]?.id });
  } catch (e) {
    return mudarStatus(id, "falhou", { erro: e instanceof Error ? e.message : String(e) });
  }
}

function podeEnviarLivre(tel: string) {
  const c = lerContato(tel);
  if (!c) throw new ErroCard("Contato não encontrado.", 404);
  if (!config().ativo) throw new ErroCard("Ligue o WhatsApp em Configurar antes de enviar.");
  if (c.bloqueado) throw new ErroCard("Este número pediu para não receber mensagens.");
  if (!janelaAberta(c)) throw new ErroCard("Passaram 24 h desde a última mensagem do cliente: agora só dá para enviar um modelo aprovado pela Meta.");
  return c;
}

/** Mensagem livre (você ou a agente, já aprovada). */
export async function enviarTexto(tel: string, texto: string, autor: string): Promise<MensagemWhatsapp> {
  const t = texto.trim().slice(0, 4096);
  if (!t) throw new ErroCard("Mensagem vazia.");
  podeEnviarLivre(tel);
  const m = inserirMsg({ telefone: tel, direcao: "out", tipo: "text", texto: t, imagem: null, status: "enviando", erro: null, autor, ts: Date.now(), modelo: null })!;
  return despachar(m.id, { type: "text", text: { preview_url: true, body: t } });
}

/** Resposta da agente esperando o seu OK (ou enviada direto no modo automático). */
export async function proporResposta(tel: string, texto: string, autor: string): Promise<MensagemWhatsapp> {
  const t = texto.trim().slice(0, 4096);
  const c = lerContato(tel)!;
  const direto = config().modo === "automatico" && !c.humano && janelaAberta(c) && !c.bloqueado;
  if (direto) return enviarTexto(tel, t, autor);
  return inserirMsg({ telefone: tel, direcao: "out", tipo: "text", texto: t, imagem: null, status: "pendente", erro: null, autor, ts: Date.now(), modelo: null })!;
}

export async function aprovarResposta(id: number, textoEditado?: string): Promise<MensagemWhatsapp> {
  const m = lerMsg(id);
  if (m.status !== "pendente") throw new ErroCard("Esta mensagem não está esperando aprovação.");
  podeEnviarLivre(m.telefone);
  const t = (textoEditado ?? m.texto).trim().slice(0, 4096);
  if (!t) throw new ErroCard("Mensagem vazia.");
  mudarStatus(id, "pendente", { texto: t });
  return despachar(id, { type: "text", text: { preview_url: true, body: t } });
}

export function descartarResposta(id: number): MensagemWhatsapp {
  const m = lerMsg(id);
  if (m.status !== "pendente") throw new ErroCard("Esta mensagem não está esperando aprovação.");
  return mudarStatus(id, "descartada");
}

export const pendentesWhatsapp = (): MensagemWhatsapp[] =>
  (db.prepare("SELECT * FROM wa_mensagens WHERE status = 'pendente' ORDER BY id").all() as unknown as LinhaMsg[]).map(deMsg);

/**
 * Primeira mensagem da empresa (ou depois de 24 h): só modelo aprovado e só para quem autorizou (opt-in).
 * Sempre ação sua, nunca da agente.
 */
export async function enviarModelo(d: { telefone?: unknown; nome?: unknown; idioma?: unknown; parametros?: unknown; optin?: unknown; contatoNome?: unknown; leadCardId?: unknown }): Promise<MensagemWhatsapp> {
  if (!config().ativo) throw new ErroCard("Ligue o WhatsApp em Configurar antes de enviar.");
  if (d.optin !== true) throw new ErroCard("Confirme que esta pessoa autorizou receber mensagens da empresa no WhatsApp (regra da Meta e da LGPD).");
  let tel = soDigitos(String(d.telefone ?? ""));
  if (tel.length === 10 || tel.length === 11) tel = `55${tel}`;
  if (tel.length < 12 || tel.length > 15) throw new ErroCard("Telefone inválido: use DDI + DDD + número (ex.: 5511999998888).");
  if (bloqueado(tel)) throw new ErroCard("Este número está na lista de não contatar.");
  const nome = String(d.nome ?? "").trim();
  if (!/^[a-z0-9_]+$/.test(nome)) throw new ErroCard("Escolha um modelo aprovado.");
  const idioma = String(d.idioma ?? "pt_BR").trim();
  const params = Array.isArray(d.parametros) ? d.parametros.map((p) => String(p).slice(0, 500)) : [];
  garantirContato(tel, typeof d.contatoNome === "string" ? d.contatoNome.trim().slice(0, 120) : undefined);
  if (typeof d.leadCardId === "number") atualizarContato(tel, { leadCardId: d.leadCardId });
  const m = inserirMsg({ telefone: tel, direcao: "out", tipo: "template", texto: `[modelo ${nome}] ${params.join(" · ")}`.trim(), imagem: null, status: "enviando", erro: null, autor: "voce", ts: Date.now(), modelo: nome })!;
  return despachar(m.id, {
    type: "template",
    template: { name: nome, language: { code: idioma }, ...(params.length ? { components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }] } : {}) },
  });
}

/* ---------- Recebimento (webhook) ---------- */

/** Chamado quando chega mensagem de cliente que a agente deve responder (registrado pelo agente.ts). */
export const aoReceber: ((telefone: string) => void)[] = [];

const SAIR = /^\s*(sair|parar|pare|stop|cancelar|descadastrar|n[aã]o quero mais( receber)?)\s*[.!]?\s*$/i;

async function baixarImagem(mediaId: string): Promise<string | null> {
  try {
    const info = await graph<{ url: string; mime_type: string }>(mediaId);
    if (!/^image\/(jpeg|png|webp)$/.test(info.mime_type)) return null;
    const r = await fetch(info.url, { headers: { authorization: `Bearer ${lerSegredo(SEG_TOKEN)}` }, signal: AbortSignal.timeout(30_000) });
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 5 * 1024 * 1024) return null;
    return salvarImagem(`data:${info.mime_type};base64,${buf.toString("base64")}`).url;
  } catch (e) {
    console.error("WhatsApp: falha ao baixar imagem", e);
    return null;
  }
}

interface MsgMeta {
  from: string; id: string; timestamp: string; type: string;
  text?: { body: string }; image?: { id: string; caption?: string }; button?: { text: string };
  interactive?: { button_reply?: { title: string }; list_reply?: { title: string } };
  document?: { filename?: string; caption?: string }; location?: { latitude: number; longitude: number; name?: string };
}

export async function processarWebhook(corpo: unknown) {
  const entradas = (corpo as { entry?: { changes?: { value?: Record<string, unknown> }[] }[] })?.entry ?? [];
  for (const ch of entradas.flatMap((e) => e.changes ?? [])) {
    const v = ch.value ?? {};
    const contatos = (v.contacts as { wa_id: string; profile?: { name?: string } }[] | undefined) ?? [];
    for (const st of (v.statuses as { id: string; status: string; errors?: { title?: string; message?: string }[] }[] | undefined) ?? []) {
      const linha = db.prepare("SELECT id FROM wa_mensagens WHERE wamid = ?").get(st.id) as { id: number } | undefined;
      const novo = ({ sent: "enviada", delivered: "entregue", read: "lida", failed: "falhou" } as Record<string, StatusMensagemWhatsapp>)[st.status];
      if (linha && novo) mudarStatus(linha.id, novo, { erro: st.errors?.[0] ? (st.errors[0].message ?? st.errors[0].title ?? null) : null });
    }
    for (const msg of (v.messages as MsgMeta[] | undefined) ?? []) {
      const tel = soDigitos(msg.from);
      const nome = contatos.find((c) => c.wa_id === msg.from)?.profile?.name;
      garantirContato(tel, nome);
      let texto = "";
      let imagem: string | null = null;
      if (msg.type === "text") texto = msg.text?.body ?? "";
      else if (msg.type === "image") {
        imagem = msg.image ? await baixarImagem(msg.image.id) : null;
        texto = msg.image?.caption ?? "";
      } else if (msg.type === "button") texto = msg.button?.text ?? "";
      else if (msg.type === "interactive") texto = msg.interactive?.button_reply?.title ?? msg.interactive?.list_reply?.title ?? "";
      else if (msg.type === "audio") texto = "[áudio — a agente ainda não ouve áudios]";
      else if (msg.type === "document") texto = `[documento${msg.document?.filename ? `: ${msg.document.filename}` : ""}] ${msg.document?.caption ?? ""}`.trim();
      else if (msg.type === "location") texto = `[localização${msg.location?.name ? `: ${msg.location.name}` : ""} ${msg.location?.latitude},${msg.location?.longitude}]`;
      else texto = `[${msg.type}]`;
      const ts = Number(msg.timestamp) * 1000 || Date.now();
      const nova = inserirMsg({ telefone: tel, direcao: "in", tipo: msg.type, texto, imagem, status: "recebida", erro: null, autor: "cliente", ts, modelo: null, wamid: msg.id });
      if (!nova) continue; // repetida (a Meta reenvia)
      db.prepare("UPDATE wa_contatos SET ultima_entrada = MAX(COALESCE(ultima_entrada, 0), ?), nao_lidas = nao_lidas + 1 WHERE telefone = ?").run(ts, tel);
      void graph(`${config().phoneNumberId}/messages`, "POST", { messaging_product: "whatsapp", status: "read", message_id: msg.id }).catch(() => {});
      if (SAIR.test(texto)) {
        // Confirma antes de bloquear (depois de bloqueado, nada mais sai para este número).
        await enviarTexto(tel, "Pronto, você não vai mais receber mensagens nossas. Se precisar de algo, é só escrever aqui.", "sistema").catch(() => {});
        if (!bloqueado(tel)) adicionarNaoContatar("telefone", tel, "Pediu pelo WhatsApp para não receber mais mensagens");
        atualizarContato(tel, { etapa: "perdido" });
        continue;
      }
      emit({ type: "whatsapp_contato", contato: lerContato(tel)! });
      if (!lerContato(tel)!.humano) for (const f of aoReceber) f(tel);
    }
  }
}

function assinaturaValida(corpo: Buffer, cabecalho: string | undefined): boolean {
  const segredo = lerSegredo(SEG_APP);
  if (!segredo || !cabecalho?.startsWith("sha256=")) return false;
  const esperado = Buffer.from(createHmac("sha256", segredo).update(corpo).digest("hex"));
  const recebido = Buffer.from(cabecalho.slice(7));
  return esperado.length === recebido.length && timingSafeEqual(esperado, recebido);
}

let servidor: Server | null = null;

function iniciarServidor(): Promise<void> {
  if (servidor) return Promise.resolve();
  servidor = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname !== ROTA) return res.writeHead(404).end();
    if (req.method === "GET") {
      const ok = url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === config().verifyToken;
      return ok ? res.writeHead(200, { "content-type": "text/plain" }).end(url.searchParams.get("hub.challenge") ?? "") : res.writeHead(403).end();
    }
    if (req.method !== "POST") return res.writeHead(405).end();
    const partes: Buffer[] = [];
    let tamanho = 0;
    req.on("data", (p: Buffer) => {
      tamanho += p.length;
      if (tamanho > 3 * 1024 * 1024) req.destroy();
      else partes.push(p);
    });
    req.on("end", () => {
      const corpo = Buffer.concat(partes);
      if (!assinaturaValida(corpo, req.headers["x-hub-signature-256"] as string | undefined)) return res.writeHead(401).end();
      res.writeHead(200).end();
      try {
        void processarWebhook(JSON.parse(corpo.toString("utf8"))).catch((e) => console.error("WhatsApp: erro ao processar", e));
      } catch {}
    });
  });
  return new Promise((ok, falha) => {
    servidor!.once("error", falha);
    servidor!.listen(PORTA, "127.0.0.1", () => ok());
  });
}

/* ---------- Túnel (cloudflared) ---------- */

let tunel: ChildProcess | null = null;

function abrirTunel(): Promise<string> {
  return new Promise((ok, falha) => {
    const p = spawn(process.env.CLOUDFLARED ?? "cloudflared", ["tunnel", "--no-autoupdate", "--url", `http://127.0.0.1:${PORTA}`], { stdio: ["ignore", "pipe", "pipe"] });
    tunel = p;
    const prazo = setTimeout(() => falha(new Error("O túnel do Cloudflare não respondeu em 40 s.")), 40_000);
    const ler = (b: Buffer) => {
      const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(b.toString());
      if (m) {
        clearTimeout(prazo);
        ok(m[0]);
      }
    };
    p.stdout!.on("data", ler);
    p.stderr!.on("data", ler);
    p.once("error", (e) => {
      clearTimeout(prazo);
      falha(/ENOENT/.test(String(e)) ? new Error("cloudflared não está instalado (no Terminal: brew install cloudflared).") : e);
    });
    p.once("exit", () => {
      if (tunel === p) {
        tunel = null;
        urlTunel = null;
        if (config().ativo && status === "conectado") {
          status = "erro";
          erro = "O túnel caiu; reconectando em 30 s.";
          avisarEstado();
          setTimeout(() => void reiniciar(), 30_000).unref();
        }
      }
    });
  });
}

/** Aponta o webhook da WABA para o endereço atual (a Meta confere o verify_token antes). */
async function apontarWebhook(url: string) {
  const c = config();
  if (!c.wabaId) return;
  await graph(`${c.wabaId}/subscribed_apps`, "POST", { override_callback_uri: url, verify_token: c.verifyToken });
}

let reiniciando: Promise<void> = Promise.resolve();

export function reiniciar(): Promise<void> {
  reiniciando = reiniciando.then(async () => {
    tunel?.kill();
    tunel = null;
    urlTunel = null;
    const c = config();
    if (!c.ativo) {
      servidor?.close();
      servidor = null;
      status = "desligado";
      erro = null;
      avisarEstado();
      return;
    }
    status = "conectando";
    erro = null;
    avisarEstado();
    try {
      await iniciarServidor();
      if (!c.urlFixa && c.usarTunel) urlTunel = await abrirTunel();
      const url = urlPublica();
      if (url && c.wabaId) await apontarWebhook(url);
      status = "conectado";
      if (!url) erro = "Sem endereço público: ligue o túnel ou informe um endereço fixo, senão a Meta não consegue entregar as mensagens.";
      if (url && !c.wabaId) erro = `Informe o ID da WABA para o endereço ir sozinho para a Meta, ou cole ${url} no painel do app (WhatsApp → Configuração).`;
    } catch (e) {
      status = "erro";
      erro = e instanceof Error ? e.message : String(e);
    }
    avisarEstado();
  });
  return reiniciando;
}

export function iniciarWhatsapp() {
  if (config().ativo) void reiniciar();
}

export function pararWhatsapp() {
  tunel?.kill();
  servidor?.close();
}
