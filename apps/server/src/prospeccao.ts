import { promises as dns } from "node:dns";
import {
  camposLead, colunaDeEntrada, rotulosCampoLead, type Campanha, type CampoLead, type Card, type ConferenciaLead, type DadoLead, type Lead, type MensagensLead,
  type NaoContatar, type TipoNaoContatar,
} from "@empresa/shared";
import { db } from "./db.ts";
import { emit, postFeed } from "./bus.ts";
import { comentar, criarCard, editarCard, ErroCard, lerCard, listarCards, mover } from "./tarefas.ts";
import { ErroEntrada, ferramenta, texto, type Ferramenta } from "./agentes/loop.ts";

// Prospecção de clientes (Fase 3, PLANO.md seção 4.5).
// Campanha → o SDR pesquisa e registra cada lead (um card por lead, com a origem de cada dado)
// → o servidor confere os dados (sem IA) e barra quem está na lista de não contatar
// → a Copywriter escreve as mensagens → a Executiva de Vendas valida → você aprova e envia.

db.exec(`
  CREATE TABLE IF NOT EXISTS campanhas (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    produto       TEXT NOT NULL,
    cliente_ideal TEXT NOT NULL,
    regiao        TEXT NOT NULL,
    quantidade    INTEGER NOT NULL,
    card_id       INTEGER,
    criado_em     INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS leads (
    card_id       INTEGER PRIMARY KEY,
    campanha_id   INTEGER,
    dados         TEXT NOT NULL,
    sinais        TEXT NOT NULL,
    nota          INTEGER NOT NULL,
    motivo_nota   TEXT NOT NULL,
    mensagens     TEXT NOT NULL,
    conferencia   TEXT NOT NULL,
    criado_em     INTEGER NOT NULL,
    atualizado_em INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS nao_contatar (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo      TEXT NOT NULL,
    valor     TEXT NOT NULL,
    motivo    TEXT NOT NULL,
    criado_em INTEGER NOT NULL,
    UNIQUE (tipo, valor)
  );
`);

const MAX_LEADS_POR_CAMPANHA = 40;
/** Testes rodam sem rede: sem DNS, sem acessar sites e sem consultar CNPJ. */
const SEM_REDE = process.env.EMPRESA_SEM_REDE === "1";
const DOMINIOS_GENERICOS = new Set(["gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "yahoo.com.br", "live.com", "icloud.com", "uol.com.br", "bol.com.br", "terra.com.br"]);

/* ---------- Normalização ---------- */

export const soDigitos = (s: string) => s.replace(/\D/g, "");
const minusculo = (s: string) => s.trim().toLowerCase();

export function dominioDe(s: string): string | null {
  const v = minusculo(s);
  if (!v) return null;
  if (v.includes("@")) return v.split("@")[1] || null;
  try {
    return new URL(v.startsWith("http") ? v : `https://${v}`).hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

export const emailValido = (s: string) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(s.trim());
/** Telefone brasileiro: DDD + número (10 ou 11 dígitos), com ou sem o 55. */
export function telefoneValido(s: string) {
  const d = soDigitos(s).replace(/^55(?=\d{10,11}$)/, "");
  return /^[1-9]{2}9?\d{8}$/.test(d);
}

/* ---------- Leitura e escrita ---------- */

type Linha = {
  card_id: number; campanha_id: number | null; dados: string; sinais: string; nota: number; motivo_nota: string; mensagens: string; conferencia: string;
  criado_em: number; atualizado_em: number;
};
const deLinha = (r: Linha): Lead => ({
  cardId: r.card_id, campanhaId: r.campanha_id, dados: JSON.parse(r.dados), sinais: JSON.parse(r.sinais), nota: r.nota, motivoNota: r.motivo_nota,
  mensagens: JSON.parse(r.mensagens), conferencia: JSON.parse(r.conferencia), criadoEm: r.criado_em, atualizadoEm: r.atualizado_em,
});

export function listarLeads(): Lead[] {
  const existentes = new Set(listarCards().map((c) => c.id));
  return (db.prepare("SELECT * FROM leads ORDER BY card_id").all() as Linha[]).map(deLinha).filter((l) => existentes.has(l.cardId));
}

export function lerLead(cardId: number): Lead | null {
  const r = db.prepare("SELECT * FROM leads WHERE card_id = ?").get(cardId) as Linha | undefined;
  return r ? deLinha(r) : null;
}

function gravar(l: Lead) {
  db.prepare(
    `INSERT INTO leads (card_id, campanha_id, dados, sinais, nota, motivo_nota, mensagens, conferencia, criado_em, atualizado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(card_id) DO UPDATE SET dados = excluded.dados, sinais = excluded.sinais, nota = excluded.nota, motivo_nota = excluded.motivo_nota,
       mensagens = excluded.mensagens, conferencia = excluded.conferencia, atualizado_em = excluded.atualizado_em`,
  ).run(l.cardId, l.campanhaId, JSON.stringify(l.dados), JSON.stringify(l.sinais), l.nota, l.motivoNota, JSON.stringify(l.mensagens), JSON.stringify(l.conferencia), l.criadoEm, l.atualizadoEm);
  emit({ type: "lead", lead: l });
}

/* ---------- Lista de não contatar ---------- */

export function listarNaoContatar(): NaoContatar[] {
  return (db.prepare("SELECT id, tipo, valor, motivo, criado_em AS criadoEm FROM nao_contatar ORDER BY criado_em DESC").all() as unknown as NaoContatar[]);
}

function normalizarBloqueio(tipo: TipoNaoContatar, valor: string): string {
  if (tipo === "telefone" || tipo === "cnpj") return soDigitos(valor).replace(/^55(?=\d{10,11}$)/, "");
  if (tipo === "dominio") return dominioDe(valor) ?? minusculo(valor);
  return minusculo(valor);
}

export function adicionarNaoContatar(tipo: TipoNaoContatar, valor: string, motivo = "Pediu para não ser contatado"): NaoContatar[] {
  if (!["email", "telefone", "dominio", "cnpj", "nome"].includes(tipo)) throw new ErroCard("Tipo inválido.");
  const v = normalizarBloqueio(tipo, valor);
  if (!v) throw new ErroCard("Informe o valor.");
  db.prepare("INSERT OR IGNORE INTO nao_contatar (tipo, valor, motivo, criado_em) VALUES (?, ?, ?, ?)").run(tipo, v, motivo.slice(0, 300), Date.now());
  return listarNaoContatar();
}

export function removerNaoContatar(id: number): NaoContatar[] {
  db.prepare("DELETE FROM nao_contatar WHERE id = ?").run(id);
  return listarNaoContatar();
}

/** Se algum contato do lead está na lista de não contatar, devolve o motivo. */
export function bloqueio(dados: Lead["dados"]): string | null {
  const lista = listarNaoContatar();
  if (!lista.length) return null;
  const v = (c: CampoLead) => dados[c]?.valor ?? "";
  const candidatos: [TipoNaoContatar, string][] = [
    ["email", minusculo(v("email"))],
    ["telefone", normalizarBloqueio("telefone", v("telefone"))],
    ["telefone", normalizarBloqueio("telefone", v("whatsapp"))],
    ["cnpj", soDigitos(v("cnpj"))],
    ["nome", minusculo(v("nome"))],
    ["dominio", dominioDe(v("site")) ?? ""],
    ["dominio", dominioDe(v("email")) ?? ""],
  ];
  for (const [tipo, valor] of candidatos) {
    if (!valor) continue;
    const achou = lista.find((n) => n.tipo === tipo && n.valor === valor);
    if (achou) return `${rotulosCampoLead[tipo === "dominio" ? "site" : tipo === "telefone" ? "telefone" : tipo === "cnpj" ? "cnpj" : tipo === "nome" ? "nome" : "email"]} na lista de não contatar (${achou.motivo})`;
  }
  return null;
}

/* ---------- Conferência automática (sem IA) ---------- */

function duplicadoDe(dados: Lead["dados"], ignorar?: number): number | null {
  const v = (c: CampoLead) => dados[c]?.valor ?? "";
  const cnpj = soDigitos(v("cnpj"));
  const tels = [v("telefone"), v("whatsapp")].map((t) => normalizarBloqueio("telefone", t)).filter(Boolean);
  const dom = [dominioDe(v("site")), dominioDe(v("email"))].filter((d): d is string => !!d && !DOMINIOS_GENERICOS.has(d));
  const nomeCidade = `${minusculo(v("nome"))}|${minusculo(v("cidade"))}`;
  for (const l of listarLeads()) {
    if (l.cardId === ignorar) continue;
    const w = (c: CampoLead) => l.dados[c]?.valor ?? "";
    if (cnpj && soDigitos(w("cnpj")) === cnpj) return l.cardId;
    if (tels.some((t) => [w("telefone"), w("whatsapp")].map((x) => normalizarBloqueio("telefone", x)).includes(t))) return l.cardId;
    if (dom.some((d) => d === dominioDe(w("site")) || d === dominioDe(w("email")))) return l.cardId;
    if (v("nome") && `${minusculo(w("nome"))}|${minusculo(w("cidade"))}` === nomeCidade) return l.cardId;
  }
  return null;
}

async function comPrazo<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]).catch(() => null);
}

export async function conferir(dados: Lead["dados"], ignorar?: number): Promise<ConferenciaLead> {
  const c: ConferenciaLead = { duplicadoDe: duplicadoDe(dados, ignorar) };
  const email = dados.email?.valor;
  if (email) {
    c.emailValido = emailValido(email);
    const dom = dominioDe(email);
    if (c.emailValido && dom && !SEM_REDE) c.emailDominioRecebe = !!(await comPrazo(dns.resolveMx(dom).then((mx) => mx.length > 0), 3000));
  }
  const tel = dados.whatsapp?.valor || dados.telefone?.valor;
  if (tel) c.telefoneValido = telefoneValido(tel);
  const site = dados.site?.valor;
  if (site && !SEM_REDE) {
    const url = site.startsWith("http") ? site : `https://${site}`;
    const r = await comPrazo(fetch(url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(5000) }), 6000);
    c.siteNoAr = !!r && r.status < 500;
  }
  return c;
}

/* ---------- Campanha e pesquisa ---------- */

export function listarCampanhas(): Campanha[] {
  return db.prepare("SELECT id, produto, cliente_ideal AS clienteIdeal, regiao, quantidade, card_id AS cardId, criado_em AS criadoEm FROM campanhas ORDER BY id DESC").all() as unknown as Campanha[];
}

export function iniciarProspeccao(
  d: { produto?: unknown; clienteIdeal?: unknown; regiao?: unknown; quantidade?: unknown },
  autor = "voce",
): { campanha: Campanha; card: Card } {
  const s = (v: unknown, nome: string, max: number) => {
    if (typeof v !== "string" || !v.trim()) throw new ErroCard(`Informe ${nome}.`);
    return v.trim().slice(0, max);
  };
  const produto = s(d.produto, "o produto ou serviço", 2000);
  const clienteIdeal = s(d.clienteIdeal, "o cliente ideal (segmento, porte, sinais de compra)", 2000);
  const regiao = s(d.regiao, "a região (cidade, estado ou bairros)", 300);
  const quantidade = Math.max(1, Math.min(MAX_LEADS_POR_CAMPANHA, Math.round(Number(d.quantidade) || 10)));
  const r = db.prepare("INSERT INTO campanhas (produto, cliente_ideal, regiao, quantidade, criado_em) VALUES (?, ?, ?, ?, ?)").run(produto, clienteIdeal, regiao, quantidade, Date.now());
  const id = Number(r.lastInsertRowid);

  const card = criarCard(
    {
      titulo: `Prospecção: ${quantidade} leads em ${regiao}`,
      sala: "comercial",
      fluxo: "geral",
      coluna: colunaDeEntrada("geral"),
      tipo: "tarefa",
      dono: "sdr",
      validador: "executiva-vendas",
      nivel: "N0",
      prioridade: "P1",
      etiquetas: ["prospeccao", `campanha-${id}`],
      descricao: `Campanha de prospecção #${id}.

## Produto
${produto}

## Cliente ideal
${clienteIdeal}

## Região
${regiao}

## Como trabalhar
1. Pesquise com web_search e web_fetch empresas que combinam com o cliente ideal nesta região. Use só fontes públicas e oficiais: o site da própria empresa (páginas de contato e equipe), o Google e diretórios do setor, e os dados abertos de CNPJ (ferramenta consultar_cnpj).
2. Para CADA empresa encontrada, chame registrar_lead com todos os dados que achou. Cada dado leva a URL de onde veio e a confiança: "confirmado" se veio de fonte oficial da própria empresa, "provavel" nos outros casos.
3. Instagram, Facebook e LinkedIn só se a própria empresa publicar o link no site ou no Google. Não raspe redes sociais.
4. Pessoa de decisão só se a própria empresa divulgar publicamente (nome e cargo). Nada de dados pessoais ou sensíveis.
5. Dê uma nota de 0 a 100 de aderência ao cliente ideal, com o motivo, e liste os sinais de compra que você viu (com evidência).
6. O servidor confere os dados, barra duplicados e quem pediu para não ser contatado. Se recusar um lead, siga para o próximo.
7. Ao terminar, chame entregar com um resumo: quantos leads, de onde vieram e os melhores.`,
      criterios: `- ${quantidade} leads registrados (ou o máximo que existir, explicando por quê)\n- Cada dado com fonte e confiança\n- Nota e sinais de compra com evidência\n- Só dados profissionais e públicos (LGPD)`,
    },
    autor,
  );
  db.prepare("UPDATE campanhas SET card_id = ? WHERE id = ?").run(card.id, id);
  postFeed("comercial", "sdr", `Nova campanha de prospecção: ${quantidade} leads em ${regiao} (${card.chave})`);
  return { campanha: listarCampanhas().find((c) => c.id === id)!, card };
}

/** Lê os dados enviados pelo agente (ou pelo CEO) no formato { campo: { valor, fonte, confianca } }. */
function lerDados(bruto: unknown, anteriores: Lead["dados"] = {}): Lead["dados"] {
  if (!bruto || typeof bruto !== "object") throw new ErroEntrada("dados precisa ser um objeto { campo: { valor, fonte, confianca } }.");
  const out: Lead["dados"] = { ...anteriores };
  const agora = Date.now();
  for (const [campo, v] of Object.entries(bruto as Record<string, unknown>)) {
    if (!(camposLead as readonly string[]).includes(campo)) continue;
    if (v === null || v === "") {
      delete out[campo as CampoLead];
      continue;
    }
    const d = (typeof v === "string" ? { valor: v } : v) as Partial<DadoLead>;
    if (typeof d.valor !== "string" || !d.valor.trim()) continue;
    out[campo as CampoLead] = {
      valor: d.valor.trim().slice(0, 500),
      fonte: typeof d.fonte === "string" ? d.fonte.trim().slice(0, 500) : (anteriores[campo as CampoLead]?.fonte ?? ""),
      confianca: d.confianca === "confirmado" ? "confirmado" : "provavel",
      coletadoEm: agora,
    };
  }
  return out;
}

function resumoDoLead(l: Lead): string {
  const linhas = camposLead
    .filter((c) => l.dados[c])
    .map((c) => `- ${rotulosCampoLead[c]}: ${l.dados[c]!.valor} (${l.dados[c]!.confianca}${l.dados[c]!.fonte ? `, ${l.dados[c]!.fonte}` : ""})`);
  return `${linhas.join("\n")}\n\n**Nota:** ${l.nota}/100 — ${l.motivoNota}\n\n**Sinais de compra:**\n${l.sinais.map((s) => `- ${s}`).join("\n") || "- (nenhum)"}`;
}

export async function registrarLead(
  campanhaId: number | null,
  entrada: { dados?: unknown; sinais?: unknown; nota?: unknown; motivo_nota?: unknown },
  autor: string,
  paiId: number | null,
): Promise<{ lead: Lead; card: Card }> {
  const dados = lerDados(entrada.dados);
  if (!dados.nome) throw new ErroEntrada("Informe ao menos o nome da empresa em dados.nome.");
  if (!dados.telefone && !dados.whatsapp && !dados.email && !dados.site) throw new ErroEntrada("Informe ao menos um contato profissional (telefone, WhatsApp, e-mail ou site).");
  const motivoBloqueio = bloqueio(dados);
  if (motivoBloqueio) throw new ErroEntrada(`Lead recusado: ${motivoBloqueio}. Siga para o próximo.`);
  if (campanhaId !== null) {
    const n = listarLeads().filter((l) => l.campanhaId === campanhaId).length;
    if (n >= MAX_LEADS_POR_CAMPANHA) throw new ErroEntrada(`Limite de ${MAX_LEADS_POR_CAMPANHA} leads por campanha atingido. Entregue o resumo.`);
  }
  const conferencia = await conferir(dados);
  if (conferencia.duplicadoDe) throw new ErroEntrada(`Lead duplicado do card EMP-${conferencia.duplicadoDe}. Siga para o próximo.`);

  const sinais = Array.isArray(entrada.sinais) ? entrada.sinais.filter((s): s is string => typeof s === "string" && !!s.trim()).map((s) => s.trim().slice(0, 300)).slice(0, 10) : [];
  const nota = Math.max(0, Math.min(100, Math.round(Number(entrada.nota) || 0)));
  const motivoNota = typeof entrada.motivo_nota === "string" ? entrada.motivo_nota.trim().slice(0, 600) : "";
  const agora = Date.now();
  const nome = dados.nome.valor;
  const cidade = dados.cidade?.valor;
  const card = criarCard(
    {
      titulo: cidade ? `${nome} · ${cidade}` : nome,
      sala: "comercial",
      fluxo: "comercial",
      coluna: "encontrado",
      tipo: "lead",
      dono: "copywriter",
      validador: "executiva-vendas",
      nivel: "N1",
      prioridade: nota >= 80 ? "P1" : nota >= 50 ? "P2" : "P3",
      paiId,
      etiquetas: ["lead", ...(campanhaId ? [`campanha-${campanhaId}`] : [])],
      descricao: "Escreva as mensagens de abordagem deste lead (WhatsApp, e-mail com assunto e direct do Instagram) com salvar_mensagens e depois entregue.",
      criterios: "- Cita algo específico desta empresa\n- Uma dor provável e uma proposta de valor curta\n- Pergunta fácil de responder\n- Opção clara de não receber mais contatos em cada mensagem",
    },
    autor,
  );
  const lead: Lead = { cardId: card.id, campanhaId, dados, sinais, nota, motivoNota, mensagens: {}, conferencia, criadoEm: agora, atualizadoEm: agora };
  gravar(lead);
  editarCard(card.id, { descricao: `${card.descricao}\n\n## Ficha do lead\n${resumoDoLead(lead)}` });
  return { lead, card: lerCard(card.id) };
}

/** Toda mensagem precisa oferecer um jeito claro de não receber mais contatos (LGPD). */
const temOptOut = (t: string) => /(não|nao)\s+(quer|quiser|deseja|desejar).{0,40}(receber|contato|mensage)|descadastr|parar de receber|sair da lista|responda\s+["“']?(sair|pare|parar)/i.test(t);

export function salvarMensagens(cardId: number, m: Record<string, unknown>): Lead {
  const l = lerLead(cardId);
  if (!l) throw new ErroEntrada("Este card não é um lead.");
  const pegar = (k: string, max: number) => (typeof m[k] === "string" && (m[k] as string).trim() ? (m[k] as string).trim().slice(0, max) : undefined);
  const mensagens: MensagensLead = {
    whatsapp: pegar("whatsapp", 1500),
    emailAssunto: pegar("email_assunto", 200) ?? pegar("emailAssunto", 200),
    emailCorpo: pegar("email_corpo", 5000) ?? pegar("emailCorpo", 5000),
    instagram: pegar("instagram", 1000),
  };
  if (!mensagens.whatsapp && !mensagens.emailCorpo && !mensagens.instagram) throw new ErroEntrada("Escreva ao menos uma mensagem.");
  const semOptOut = (["whatsapp", "emailCorpo", "instagram"] as const).filter((k) => mensagens[k] && !temOptOut(mensagens[k]!));
  if (semOptOut.length) {
    throw new ErroEntrada(`Falta a opção de não receber mais contatos em: ${semOptOut.join(", ")}. Ex.: "Se não quiser receber mais mensagens, é só responder SAIR."`);
  }
  if (mensagens.emailCorpo && !mensagens.emailAssunto) throw new ErroEntrada("O e-mail precisa de assunto (email_assunto).");
  const novo = { ...l, mensagens, atualizadoEm: Date.now() };
  gravar(novo);
  return novo;
}

/** Edição pelo CEO (dados, sinais, nota, mensagens). Refaz a conferência se os dados mudaram. */
export async function editarLead(cardId: number, patch: { dados?: unknown; sinais?: unknown; nota?: unknown; motivoNota?: unknown; mensagens?: unknown }): Promise<Lead> {
  const l = lerLead(cardId);
  if (!l) throw new ErroCard("Lead não encontrado.", 404);
  const novo: Lead = { ...l, atualizadoEm: Date.now() };
  if (patch.dados !== undefined) {
    novo.dados = lerDados(patch.dados, l.dados);
    novo.conferencia = await conferir(novo.dados, cardId);
  }
  if (Array.isArray(patch.sinais)) novo.sinais = patch.sinais.filter((s): s is string => typeof s === "string" && !!s.trim()).slice(0, 10);
  if (patch.nota !== undefined) novo.nota = Math.max(0, Math.min(100, Math.round(Number(patch.nota) || 0)));
  if (typeof patch.motivoNota === "string") novo.motivoNota = patch.motivoNota.slice(0, 600);
  if (patch.mensagens && typeof patch.mensagens === "object") novo.mensagens = { ...l.mensagens, ...(patch.mensagens as MensagensLead) };
  gravar(novo);
  return novo;
}

/* ---------- Depois da sua aprovação ---------- */

export function marcarContatado(cardId: number, canal: string): Card {
  const card = lerCard(cardId);
  if (card.tipo !== "lead") throw new ErroCard("Este card não é um lead.");
  const movido = mover(cardId, "contatado", "voce");
  comentar(cardId, "voce", "comentario", `Contato feito por ${canal}.`);
  return movido;
}

/** O lead pediu para não ser contatado: entra na lista (todos os contatos dele) e o card vai para Perdido. */
export function naoContatarLead(cardId: number, motivo: string): Card {
  const l = lerLead(cardId);
  if (!l) throw new ErroCard("Lead não encontrado.", 404);
  const v = (c: CampoLead) => l.dados[c]?.valor;
  const m = motivo.trim() || "Pediu para não ser contatado";
  if (v("email")) adicionarNaoContatar("email", v("email")!, m);
  if (v("telefone")) adicionarNaoContatar("telefone", v("telefone")!, m);
  if (v("whatsapp")) adicionarNaoContatar("telefone", v("whatsapp")!, m);
  if (v("cnpj")) adicionarNaoContatar("cnpj", v("cnpj")!, m);
  const dom = dominioDe(v("site") ?? "") ?? dominioDe(v("email") ?? "");
  if (dom && !DOMINIOS_GENERICOS.has(dom)) adicionarNaoContatar("dominio", dom, m);
  if (v("nome")) adicionarNaoContatar("nome", v("nome")!, m);
  comentar(cardId, "voce", "comentario", `Na lista de não contatar: ${m}`);
  return mover(cardId, "perdido", "voce");
}

/* ---------- Exportação ---------- */

export function leadsEmCsv(): string {
  const cards = new Map(listarCards().map((c) => [c.id, c]));
  const cab = ["chave", "coluna", "nota", ...camposLead.map((c) => rotulosCampoLead[c]), "sinais", "whatsapp_msg", "email_assunto", "email_corpo", "instagram_msg"];
  const esc = (s: string | number | undefined) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const linhas = listarLeads().map((l) => {
    const c = cards.get(l.cardId);
    return [c?.chave, c?.coluna, l.nota, ...camposLead.map((k) => l.dados[k]?.valor), l.sinais.join(" | "), l.mensagens.whatsapp, l.mensagens.emailAssunto, l.mensagens.emailCorpo, l.mensagens.instagram]
      .map(esc)
      .join(",");
  });
  return `﻿${[cab.map(esc).join(","), ...linhas].join("\n")}`;
}

/* ---------- Ferramentas dos agentes ---------- */

const esquemaDado = {
  type: "object",
  additionalProperties: false,
  required: ["valor", "fonte", "confianca"],
  properties: {
    valor: { type: "string" },
    fonte: { type: "string", description: "URL de onde veio o dado" },
    confianca: { type: "string", enum: ["confirmado", "provavel"] },
  },
};

/** Consulta os dados abertos de CNPJ da Receita (via BrasilAPI). */
async function consultarCnpj(cnpj: string): Promise<string> {
  const d = soDigitos(cnpj);
  if (d.length !== 14) return "CNPJ precisa ter 14 dígitos.";
  if (SEM_REDE) return "Consulta de CNPJ indisponível (sem rede).";
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${d}`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return `Não encontrado (HTTP ${r.status}).`;
    const j = (await r.json()) as Record<string, unknown>;
    const campos = ["razao_social", "nome_fantasia", "descricao_situacao_cadastral", "cnae_fiscal_descricao", "porte", "logradouro", "numero", "bairro", "municipio", "uf", "cep", "ddd_telefone_1", "email", "data_inicio_atividade"];
    return `${campos.filter((c) => j[c]).map((c) => `${c}: ${String(j[c])}`).join("\n")}\nfonte: https://brasilapi.com.br/api/cnpj/v1/${d} (dados abertos da Receita Federal)`;
  } catch (e) {
    return `Não consegui consultar agora: ${e instanceof Error ? e.message : String(e)}`;
  }
}

/** Ferramentas extras conforme o card: pesquisa da campanha ou mensagens de um lead. */
export function ferramentasDeProspeccao(card: Card, autor: string): Ferramenta[] {
  const campanha = card.etiquetas.find((e) => e.startsWith("campanha-"));
  const out: Ferramenta[] = [];
  if (card.etiquetas.includes("prospeccao")) {
    out.push(
      ferramenta(
        "registrar_lead",
        "Registra UMA empresa encontrada como lead (vira um card no Comercial). Não termina a sua vez. O servidor confere e pode recusar duplicados ou quem está na lista de não contatar.",
        {
          dados: {
            type: "object",
            additionalProperties: false,
            description: "Cada campo com valor, fonte (URL) e confiança. Use só os campos que encontrou.",
            properties: Object.fromEntries(camposLead.map((c) => [c, { ...esquemaDado, description: rotulosCampoLead[c] }])),
          },
          sinais: { type: "array", items: { type: "string" }, description: "Sinais de compra, cada um com a evidência" },
          nota: { type: "integer", minimum: 0, maximum: 100 },
          motivo_nota: { type: "string" },
        },
        ["dados", "nota", "motivo_nota"],
        async (e) => {
          const { card: novo } = await registrarLead(campanha ? Number(campanha.slice(9)) : null, e, autor, card.id);
          return { texto: `Lead registrado: ${novo.chave} — ${novo.titulo}.` };
        },
      ),
      ferramenta("consultar_cnpj", "Consulta os dados abertos de um CNPJ na Receita Federal (razão social, endereço, telefone, situação).", { cnpj: { type: "string" } }, ["cnpj"], async (e) => ({
        texto: await consultarCnpj(texto(e, "cnpj", 30)),
      })),
    );
  }
  if (card.tipo === "lead" && lerLead(card.id)) {
    out.push(
      ferramenta(
        "salvar_mensagens",
        "Salva as mensagens de abordagem deste lead. Cada mensagem cita algo específico da empresa e oferece um jeito claro de não receber mais contatos. Não termina a sua vez.",
        {
          whatsapp: { type: "string" },
          email_assunto: { type: "string" },
          email_corpo: { type: "string" },
          instagram: { type: "string", description: "Direct do Instagram (curto)" },
        },
        ["whatsapp", "email_assunto", "email_corpo"],
        (e) => {
          salvarMensagens(card.id, e);
          return { texto: "Mensagens salvas. Agora chame entregar com as mensagens em Markdown." };
        },
      ),
    );
  }
  return out;
}

/** Antes de entregar um lead, as mensagens precisam estar salvas. */
export function conferirEntregaDeLead(card: Card) {
  const l = card.tipo === "lead" ? lerLead(card.id) : null;
  if (l && !l.mensagens.whatsapp && !l.mensagens.emailCorpo && !l.mensagens.instagram) {
    throw new ErroEntrada("Antes de entregar, salve as mensagens do lead com salvar_mensagens.");
  }
}

/** Contexto do lead para os prompts (autor e validador). */
export function contextoDoLead(cardId: number): string {
  const l = lerLead(cardId);
  if (!l) return "";
  const msgs = l.mensagens;
  const conf = l.conferencia;
  return `## Ficha do lead
${resumoDoLead(l)}

**Conferência automática:** e-mail ${conf.emailValido === undefined ? "—" : conf.emailValido ? "válido" : "INVÁLIDO"}${conf.emailDominioRecebe === false ? " (domínio não recebe e-mail)" : ""} · telefone ${conf.telefoneValido === undefined ? "—" : conf.telefoneValido ? "válido" : "INVÁLIDO"} · site ${conf.siteNoAr === undefined ? "—" : conf.siteNoAr ? "no ar" : "FORA DO AR"}
${msgs.whatsapp || msgs.emailCorpo ? `\n## Mensagens salvas\n- WhatsApp: ${msgs.whatsapp ?? "—"}\n- E-mail: ${msgs.emailAssunto ?? ""}\n${msgs.emailCorpo ?? ""}\n- Instagram: ${msgs.instagram ?? "—"}` : ""}`;
}
