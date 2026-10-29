import type { ProvedorIa } from "@empresa/shared";
import { AsyncLocalStorage } from "node:async_hooks";
import { execFile } from "node:child_process";
import { ferramentasDeWebLocal } from "./webLocal.ts";
import type Anthropic from "@anthropic-ai/sdk";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { Readable } from "node:stream";
import { agentById } from "@empresa/org";
import { modeloPara, orcamentoEsgotado, registrarUsoTokens } from "../custo.ts";
import { cardPassouDoLimite, somarCusto } from "../tarefas.ts";
import { blocosDeImagem } from "../imagens.ts";
import { blocosDeArquivo } from "../arquivos.ts";
import { BASE_COMPAT, capacidadesOllama, chaveDe, configOllama, modeloDisponivel, precoDe, provedorDe, provedorForaDoAr } from "../provedores.ts";
import { novaExecucao, registrarPasso } from "../confianca/execucoes.ts";
import { conferirOrcamentoDoProjeto, projetoSemOrcamento } from "../planejamento.ts";
import { registrarChamada } from "../chamadas.ts";
import { ERRO_DE_MEMORIA, semMemoriaPara } from "./memoria.ts";
import { ErroInterrompido, ErroLimiteCard, ErroOrcamentoProjeto, ErroSemOrcamento, executarFerramenta, ferramenta, rodarAgente, type Ferramenta, type OpcoesAgente, type ResultadoAgente, blocoDeOrientacao, soAnunciou } from "./loop.ts";

// O laço do agente para modelos fora do Claude: Ollama (API nativa, para controlar o
// tamanho do contexto) e OpenAI e Gemini (API de chat no formato da OpenAI). Mesmas
// regras do laço do Claude: ferramentas, ferramenta final, lembretes, orçamento e limite por card.

/** Conversa salva pelo laço local (formato próprio, começa pelo system); a do Claude tem outro formato e não serve aqui. */
const ehConversaLocal = (m: readonly unknown[]) => (m[0] as { role?: string } | undefined)?.role === "system";

/** O trabalho deste card não cabe em nenhum modelo no ar agora: só ele espera (não é o provedor que caiu). */
export class ErroNaoCabe extends Error {}

/** Erro de um provedor fora do Claude. `passageiro`: vale esperar e tentar de novo (limite, sobrecarga, Ollama fechado). */
export class ErroProvedor extends Error {
  /** Quem falhou de verdade (o motor marca este fora do ar, não o modelo que o agente usaria agora). */
  provedor?: ProvedorIa;
  constructor(
    message: string,
    readonly status: number,
    readonly passageiro: boolean,
  ) {
    super(message);
  }
}

/** O Ollama não conseguiu carregar o modelo por falta de memória (a troca para um menor é automática). */
export class ErroSemMemoria extends ErroProvedor {
  constructor(message: string, readonly modelo: string) {
    super(message, 507, true);
  }
}

type Parte = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
interface Chamada {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
  /** Gemini 3 devolve uma assinatura de raciocínio que precisa voltar junto com a chamada. */
  extra_content?: unknown;
}
interface Msg {
  role: "system" | "user" | "assistant" | "tool";
  content: string | Parte[];
  tool_calls?: Chamada[];
  tool_call_id?: string;
  /** Nome da ferramenta (o Ollama usa no resultado). */
  name?: string;
}
interface Resposta {
  texto: string;
  chamadas: Chamada[];
  entrada: number;
  saida: number;
  cortada: boolean;
}

const textoDe = (c: Msg["content"]) => (typeof c === "string" ? c : c.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("\n"));

/** Anexos (imagens, PDF, texto) no formato de partes. PDF não vai direto: fica um aviso. */
/** Texto de um PDF (pdftotext, do poppler): modelos fora do Claude não leem PDF direto. Null se não deu. */
export function textoDoPdf(base64: string): Promise<string | null> {
  return new Promise((ok) => {
    const p = execFile("pdftotext", ["-layout", "-enc", "UTF-8", "-", "-"], { timeout: 60_000, maxBuffer: 20 * 1024 * 1024 }, (err, stdout) => ok(err ? null : String(stdout)));
    p.stdin?.on("error", () => ok(null));
    p.stdin?.end(Buffer.from(base64, "base64"));
  });
}

/** O primeiro pedido nunca é compactado: no modelo local, o texto de cada PDF vai até este tamanho. */
const PDF_MAX_LOCAL = 10_000;
const PDF_MAX = 60_000;

async function partesDosAnexos(blocos: Anthropic.Beta.BetaContentBlockParam[], local: boolean): Promise<Parte[]> {
  const partes: Parte[] = [];
  for (const b of blocos) {
    if (b.type === "text") partes.push({ type: "text", text: b.text });
    else if (b.type === "image" && b.source.type === "base64") partes.push({ type: "image_url", image_url: { url: `data:${b.source.media_type};base64,${b.source.data}` } });
    else if (b.type === "document") {
      const nome = b.title ? ` "${b.title}"` : "";
      const texto = b.source.type === "base64" ? await textoDoPdf(b.source.data) : null;
      const max = local ? PDF_MAX_LOCAL : PDF_MAX;
      partes.push({
        type: "text",
        text: texto?.trim()
          ? `## PDF anexado${nome} (texto extraído)
${texto.trim().slice(0, max)}${texto.length > max ? `
…(cortado: o PDF tem ${texto.length} caracteres)` : ""}`
          : `(PDF anexado${nome}: não consegui extrair o texto. Se precisar do conteúdo, peça o texto ao CEO.)`,
      });
    }
  }
  return partes;
}

/** Esquema das entradas sem o que o Gemini recusa (additionalProperties, $schema). */
function limparEsquema(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(limparEsquema);
  if (!v || typeof v !== "object") return v;
  return Object.fromEntries(Object.entries(v).filter(([k]) => k !== "additionalProperties" && k !== "$schema").map(([k, x]) => [k, limparEsquema(x)]));
}

/**
 * Para caber no contexto: resultados antigos de ferramentas viram uma nota (os 6 mais recentes ficam),
 * como o context_management faz no Claude. Estimativa grosseira: 3,5 caracteres por token.
 */
/**
 * Degraus de contexto do modelo local quando o trabalho não cabe no padrão. Medido no 9b com 8 GB de VRAM: 32 mil
 * escreve a ~19 tok/s, 64 mil a ~6 e 96 mil a ~3: acima de 32 mil o modelo não cabe inteiro na placa e parte roda
 * no processador (uma chamada chegou a 26 minutos). Por isso o teto é 32 mil: o que não cabe é dividido em partes
 * (dividir_em_partes) ou espera a nuvem.
 */
const CONTEXTOS_LOCAIS_AMPLIADOS = [32_768];
/** Máximo de tokens que o modelo local escreve numa resposta (cabe nos 25% do contexto deixados para a saída). */
const SAIDA_MAX_LOCAL = 6144;
/** Acima disso (escrita a ~6 tok/s ou menos), o modelo local trabalha sem o modo de raciocínio. */
const CONTEXTO_COM_RACIOCINIO = 32_768;

/** Tokens estimados da conversa (português com Markdown fica perto de 3 caracteres por token). */
const caracteresDe = (msgs: Msg[]) => msgs.reduce((n, m) => n + textoDe(m.content).length + (m.tool_calls ? JSON.stringify(m.tool_calls).length : 0), 0);
const tokensDe = (msgs: Msg[], porToken = 3) => caracteresDe(msgs) / porToken;
/**
 * Caracteres por token medidos na resposta do Ollama (contagem real do prompt), presos entre 3 e 4: a contagem pode
 * excluir o que veio do cache, e subestimar o tamanho faria o Ollama cortar o começo do prompt em silêncio.
 */
export const calibrarCaracteresPorToken = (caracteres: number, tokensReais: number, atual: number) =>
  tokensReais > 2000 ? Math.min(4, Math.max(3, caracteres / tokensReais)) : atual;

function aparar(msgs: Msg[], limiteTokens: number, porToken = 3) {
  const ferramentas = msgs.flatMap((m, i) => (m.role === "tool" ? [i] : []));
  for (const i of ferramentas.slice(0, -6)) {
    if (tokensDe(msgs, porToken) <= limiteTokens) return;
    if (textoDe(msgs[i]!.content).length > 200) msgs[i]!.content = "[Resultado antigo removido para caber no contexto. Rode a ferramenta de novo se precisar.]";
  }
  // Ainda não coube (contexto local curto): os recentes, menos o último, ficam só com o começo.
  for (const i of ferramentas.slice(-6, -1)) {
    if (tokensDe(msgs, porToken) <= limiteTokens) return;
    const t = textoDe(msgs[i]!.content);
    if (t.length > CORTE_RECENTE) msgs[i]!.content = `${t.slice(0, CORTE_RECENTE)}\n[…cortado para caber no contexto. Rode a ferramenta de novo se precisar do resto.]`;
  }
  // Nem assim: o último resultado (ex.: o mapa do projeto inteiro) fica só com o que cabe. Sem isso o card esperava
  // "um modelo com espaço", recomeçava, pedia o mesmo mapa e travava de novo.
  const ultimo = ferramentas.at(-1);
  const excesso = tokensDe(msgs, porToken) - limiteTokens;
  if (ultimo === undefined || excesso <= 0) return;
  const t = textoDe(msgs[ultimo]!.content);
  const cabe = Math.max(2000, t.length - Math.ceil(excesso * porToken) - 500);
  if (cabe < t.length) msgs[ultimo]!.content = `${t.slice(0, cabe)}\n[…cortado: o resultado inteiro não cabe no contexto do modelo local. Peça algo mais específico (uma pasta, um arquivo ou um trecho).]`;
}
const CORTE_RECENTE = 3000;

/**
 * Fração do limite do modelo local que o pedido inicial pode ocupar. Com 55%, o começo fixo (instruções + pedido)
 * deixava ~4 mil tokens de folga antes de compactar, e a compactação não reduzia abaixo dele.
 */
const TETO_PEDIDO_LOCAL = 0.4;
/** Fração mínima da conversa que o resumo precisa substituir para valer a chamada. */
const MEIO_MINIMO_PARA_RESUMIR = 0.2;
const AVISO_CORTE = "\n…(cortado para caber no modelo local; leia o resto com ler_card, se precisar)";

/**
 * Encolhe o pedido até `max` caracteres cortando as seções "## " maiores primeiro (a maior vai à metade, de novo e
 * de novo), para que nenhuma parte importante suma inteira.
 */
export function encolherPedido(texto: string, max: number): string {
  if (texto.length <= max) return texto;
  const secoes = texto.split(/\n(?=## )/);
  const total = () => secoes.reduce((n, s) => n + s.length + 1, 0);
  while (total() > max) {
    let i = 0;
    for (let j = 1; j < secoes.length; j++) if (secoes[j]!.length > secoes[i]!.length) i = j;
    const s = secoes[i]!;
    if (s.length <= 1200) break; // nada mais para cortar com proveito
    const base = s.endsWith(AVISO_CORTE) ? s.slice(0, -AVISO_CORTE.length) : s;
    secoes[i] = base.slice(0, Math.max(800, Math.floor(base.length / 2))) + AVISO_CORTE;
  }
  return secoes.join("\n");
}

/* ---------- Compactação: a parte antiga da conversa vira um resumo ---------- */

/** A partir desta fração do limite, resume a parte antiga da conversa. */
const LIMIAR_COMPACTAR = 0.85;
/** Trocas mais recentes que ficam inteiras (as que o modelo está usando agora). */
// Duas: com três, a conversa saía da compactação já em ~60% do limite (o gpt-oss lê trechos grandes) e voltava a
// compactar em dois ou três passos, de 50 a 100 s cada vez.
const RODADAS_MANTIDAS = 2;

/**
 * Onde cortar: antes da resposta do assistente que abre as últimas rodadas, para não separar uma chamada de
 * ferramenta do resultado dela. O começo (sistema e o pedido) fica sempre. Sem meio suficiente: null.
 */
export function pontoDeCorte(msgs: Msg[], manter = RODADAS_MANTIDAS): number | null {
  const assistentes = msgs.flatMap((m, i) => (m.role === "assistant" && i >= 2 ? [i] : []));
  if (assistentes.length <= manter) return null;
  const corte = assistentes[assistentes.length - manter]!;
  return corte - 2 >= 4 ? corte : null;
}

/** O pedido de resumo: o meio da conversa em texto (resultados longos encurtados), no máximo `maxCaracteres`. */
function pedidoDeResumo(meio: Msg[], maxCaracteres: number): Msg[] {
  const linhas = meio.map((m) => {
    if (m.role === "tool") return `[resultado de ${m.name ?? "ferramenta"}] ${textoDe(m.content).slice(0, 1500)}`;
    const chamadas = (m.tool_calls ?? []).map((c) => `${c.function.name}(${c.function.arguments.slice(0, 300)})`).join("; ");
    return `[${m.role === "assistant" ? "você" : "mensagem"}] ${textoDe(m.content).slice(0, 2000)}${chamadas ? ` → chamou ${chamadas}` : ""}`;
  });
  let texto = linhas.join("\n");
  // Grande demais até para resumir: fica o fim (o mais recente e mais útil).
  if (texto.length > maxCaracteres) texto = `…\n${texto.slice(-maxCaracteres)}`;
  return [
    {
      role: "system",
      content:
        "Você resume o trabalho de um agente para ele continuar sem reler tudo. Escreva em tópicos curtos: o que já leu e descobriu (arquivos, funções, caminhos e fatos exatos), o que já fez ou escreveu, decisões tomadas, o que deu erro e o que falta fazer. Guarde nomes de arquivos, valores e trechos que ele vai precisar. Não invente nada que não está no registro. No máximo 400 palavras.",
    },
    { role: "user", content: `Registro do trabalho até aqui:\n${texto}` },
  ];
}

/** Troca o meio da conversa (do pedido inicial até `corte`) pelo resumo. */
export function compactar(msgs: Msg[], corte: number, resumo: string) {
  msgs.splice(2, corte - 2, {
    role: "user",
    content: `## Resumo do que você já fez nesta tarefa (a conversa antiga foi compactada)\n${resumo}\n\nContinue de onde parou: não refaça o que já está no resumo, a não ser que precise conferir um detalhe.`,
  });
}

/* ---------- OpenAI e Gemini (chat completions) ---------- */

async function lerLinhas(res: Response, cadaLinha: (linha: string) => void) {
  const leitor = res.body!.getReader();
  const dec = new TextDecoder();
  let resto = "";
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    resto += dec.decode(value, { stream: true });
    const linhas = resto.split("\n");
    resto = linhas.pop()!;
    for (const l of linhas) if (l.trim()) cadaLinha(l.trim());
  }
  if (resto.trim()) cadaLinha(resto.trim());
}

async function erroDaResposta(res: Response, quem: string): Promise<ErroProvedor> {
  const corpo = await res.text().catch(() => "");
  let msg = corpo.slice(0, 300);
  try {
    const j = JSON.parse(corpo) as { error?: { message?: string } | string } | Array<{ error?: { message?: string } }>;
    const e = Array.isArray(j) ? j[0]?.error : j.error;
    msg = (typeof e === "string" ? e : e?.message) ?? msg;
  } catch { /* corpo não é JSON */ }
  const passageiro = res.status === 429 || res.status >= 500;
  if (res.status === 401 || res.status === 403) msg = `${quem} recusou a chave (${msg}). Confira em Configurações → Modelos de IA.`;
  return new ErroProvedor(`${quem} respondeu ${res.status}: ${msg}`, res.status, passageiro);
}

async function chamarCompat(p: "openai" | "gemini", modelo: string, msgs: Msg[], tools: unknown[], sinal: AbortSignal | undefined, onTexto: (t: string) => void): Promise<Resposta> {
  const quem = p === "openai" ? "A OpenAI" : "O Gemini";
  let res: Response;
  try {
    res = await fetch(`${BASE_COMPAT[p]}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${chaveDe(p)}` },
      body: JSON.stringify({ model: modelo, messages: msgs, stream: true, stream_options: { include_usage: true }, ...(tools.length ? { tools } : {}) }),
      signal: sinal,
    });
  } catch (e) {
    if (sinal?.aborted) throw e;
    throw new ErroProvedor(`Sem conexão com ${quem === "A OpenAI" ? "a OpenAI" : "o Gemini"}: ${e instanceof Error ? e.message : String(e)}`, 0, true);
  }
  if (!res.ok) throw await erroDaResposta(res, quem);

  const r: Resposta = { texto: "", chamadas: [], entrada: 0, saida: 0, cortada: false };
  const porId = new Map<string, Chamada>();
  await lerLinhas(res, (linha) => {
    if (!linha.startsWith("data:")) return;
    const dado = linha.slice(5).trim();
    if (dado === "[DONE]") return;
    let j: {
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      choices?: { delta?: { content?: string | null; tool_calls?: { index?: number; id?: string; function?: { name?: string; arguments?: string }; extra_content?: unknown }[] }; finish_reason?: string | null }[];
    };
    try {
      j = JSON.parse(dado) as typeof j;
    } catch {
      return; // linha de evento ilegível: ignora
    }
    if (j.usage) {
      r.entrada = j.usage.prompt_tokens ?? r.entrada;
      r.saida = j.usage.completion_tokens ?? r.saida;
    }
    const c = j.choices?.[0];
    if (!c) return;
    if (c.delta?.content) {
      r.texto += c.delta.content;
      onTexto(r.texto);
    }
    for (const tc of c.delta?.tool_calls ?? []) {
      // A OpenAI manda a chamada em pedaços (index); o Gemini manda inteira, às vezes sem index.
      let atual = tc.index !== undefined ? r.chamadas[tc.index] : tc.id ? porId.get(tc.id) : r.chamadas.at(-1);
      if (!atual || (tc.index === undefined && tc.id && atual.id !== tc.id)) {
        atual = { id: tc.id ?? `chamada_${r.chamadas.length}_${Date.now()}`, type: "function", function: { name: "", arguments: "" } };
        if (tc.index !== undefined) r.chamadas[tc.index] = atual;
        else r.chamadas.push(atual);
        porId.set(atual.id, atual);
      }
      if (tc.function?.name) atual.function.name += tc.function.name;
      if (tc.function?.arguments) atual.function.arguments += tc.function.arguments;
      if (tc.extra_content) atual.extra_content = tc.extra_content;
    }
    if (c.finish_reason === "length") r.cortada = true;
  });
  r.chamadas = r.chamadas.filter(Boolean);
  return r;
}

/* ---------- Ollama (API nativa) ---------- */

/**
 * POST sem o limite de 5 minutos sem dados do fetch do Node: com ferramentas, o Ollama segura o texto até fechar a
 * chamada da ferramenta, e num contexto grande (a ~6 tok/s) isso passa de 5 minutos e o fetch cortava ("terminated").
 * O sinal continua interrompendo (card movido, empresa pausada).
 */
function postarSemLimiteDeTempo(url: string, corpo: string, sinal?: AbortSignal): Promise<Response> {
  return new Promise((ok, falha) => {
    const pedido = (url.startsWith("https:") ? httpsRequest : httpRequest)(
      url,
      { method: "POST", headers: { "content-type": "application/json", "content-length": Buffer.byteLength(corpo) }, signal: sinal },
      (res) => ok(new Response(Readable.toWeb(res) as ReadableStream<Uint8Array>, { status: res.statusCode ?? 500, statusText: res.statusMessage })),
    );
    pedido.on("error", falha);
    pedido.end(corpo);
  });
}

// Um pedido por vez ao Ollama: numa máquina de 16 GB, dois modelos (ou dois contextos grandes)
// ao mesmo tempo estouram a memória. Os agentes locais esperam a vez.
// Uma fila por computador (com vários computadores com Ollama, cada um atende o seu trabalho em paralelo).
const filasOllama = new Map<string, Promise<unknown>>();
function naFilaDoOllama<T>(url: string, fn: () => Promise<T>): Promise<T> {
  const vez = (filasOllama.get(url) ?? Promise.resolve()).then(fn, fn);
  filasOllama.set(url, vez.catch(() => undefined));
  return vez;
}

/** Computador com Ollama deste trabalho (o motor escolhe um livre); subagentes e compactação herdam. */
export const computadorOllama = new AsyncLocalStorage<{ url: string }>();
/** Computador extra que não respondeu: fica fora por 5 min e o trabalho segue no principal. */
const extrasForaAte = new Map<string, number>();
export const computadorExtraNoAr = (url: string) => (extrasForaAte.get(url) ?? 0) < Date.now();

async function chamarOllama(modelo: string, msgs: Msg[], tools: unknown[], esforco: OpcoesAgente["esforco"], sinal: AbortSignal | undefined, onTexto: (t: string) => void, contexto = configOllama().contexto): Promise<Resposta> {
  const principal = configOllama().url;
  const escolhido = computadorOllama.getStore()?.url;
  const url = escolhido && escolhido !== principal && computadorExtraNoAr(escolhido) ? escolhido : principal;
  const caps = await capacidadesOllama(modelo);
  const visao = caps?.includes("vision") ?? false;
  if (tools.length && caps && !caps.includes("tools")) {
    throw new ErroProvedor(`O modelo ${modelo} não chama ferramentas, e este trabalho precisa delas. Escolha outro (ex.: qwen3.5:9b) em Configurações → Modelos de IA.`, 400, false);
  }
  const mensagens = msgs.map((m) => {
    const imagens = typeof m.content === "string" ? [] : m.content.flatMap((p) => (p.type === "image_url" ? [p.image_url.url.replace(/^data:[^,]+,/, "")] : []));
    return {
      role: m.role,
      content: textoDe(m.content) + (imagens.length && !visao ? "\n(Havia imagens aqui, mas este modelo não enxerga imagens.)" : ""),
      ...(imagens.length && visao ? { images: imagens } : {}),
      ...(m.tool_calls ? { tool_calls: m.tool_calls.map((c) => ({ function: { name: c.function.name, arguments: argumentos(c.function.arguments) ?? {} } })) } : {}),
      ...(m.role === "tool" && m.name ? { tool_name: m.name } : {}),
    };
  });
  return naFilaDoOllama(url, async () => {
    if (sinal?.aborted) throw new ErroInterrompido(String(sinal.reason ?? "interrompido"));
    let res: Response;
    try {
      res = await postarSemLimiteDeTempo(
        `${url}/api/chat`,
        JSON.stringify({
          model: modelo,
          messages: mensagens,
          stream: true,
          keep_alive: "15m",
          // Teto de escrita por resposta (~5 min a 21 tok/s): sem ele, uma resposta desembestada ocupava o modelo 18 minutos.
          options: { num_ctx: contexto, num_predict: SAIDA_MAX_LOCAL },
          // Raciocínio deixa o modelo local mais certeiro, mas bem mais lento: só fora das conversas rápidas e só no
          // contexto curto. Com contexto grande o modelo escreve a ~5 tok/s, e ele chegou a "pensar" 7 mil tokens
          // (25 minutos) antes de agir.
          ...(caps?.includes("thinking") ? { think: esforco !== "low" && contexto <= CONTEXTO_COM_RACIOCINIO } : {}),
          ...(tools.length ? { tools } : {}),
        }),
        sinal,
      );
    } catch (e) {
      if (sinal?.aborted) throw e;
      // Computador extra fora do ar: fica de lado por 5 min e esta chamada segue no principal (não derruba o local todo).
      if (url !== principal) {
        extrasForaAte.set(url, Date.now() + 5 * 60_000);
        return computadorOllama.run({ url: principal }, () => chamarOllama(modelo, msgs, tools, esforco, sinal, onTexto, contexto));
      }
      throw new ErroProvedor(`O Ollama não está respondendo em ${url}. Abra o app do Ollama (ou rode "ollama serve").`, 0, true);
    }
    if (res.status === 404) throw new ErroProvedor(`O modelo ${modelo} não está instalado no Ollama. Rode no terminal: ollama pull ${modelo}`, 404, false);
    if (!res.ok) {
      const erro = await erroDaResposta(res, "O Ollama");
      throw ERRO_DE_MEMORIA.test(erro.message) ? new ErroSemMemoria(erro.message, modelo) : erro;
    }

    const r: Resposta = { texto: "", chamadas: [], entrada: 0, saida: 0, cortada: false };
    await lerLinhas(res, (linha) => {
      const j = JSON.parse(linha) as {
        error?: string;
        message?: { content?: string; tool_calls?: { id?: string; function: { name: string; arguments: unknown } }[] };
        done?: boolean;
        done_reason?: string;
        prompt_eval_count?: number;
        eval_count?: number;
      };
      if (j.error) throw ERRO_DE_MEMORIA.test(j.error) ? new ErroSemMemoria(`O Ollama falhou: ${j.error}`, modelo) : new ErroProvedor(`O Ollama falhou: ${j.error}`, 500, false);
      if (j.message?.content) {
        r.texto += j.message.content;
        onTexto(r.texto);
      }
      for (const tc of j.message?.tool_calls ?? []) {
        r.chamadas.push({ id: tc.id ?? `chamada_${r.chamadas.length}_${Date.now()}`, type: "function", function: { name: tc.function.name, arguments: typeof tc.function.arguments === "string" ? tc.function.arguments : JSON.stringify(tc.function.arguments ?? {}) } });
      }
      if (j.done) {
        r.entrada = j.prompt_eval_count ?? 0;
        r.saida = j.eval_count ?? 0;
        r.cortada = j.done_reason === "length";
      }
    });
    return r;
  });
}

function argumentos(texto: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(texto || "{}") as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/* ---------- O laço ---------- */

export async function rodarAgenteCompat(o: OpcoesAgente): Promise<ResultadoAgente> {
  try {
    return await laçoCompat(o);
  } catch (e) {
    // Faltou memória para o modelo local: segue com o próximo menor instalado (o agente passa a usá-lo; a vigia avisa).
    if (e instanceof ErroSemMemoria) {
      const menor = await semMemoriaPara(e.modelo, o.agenteId, e.message);
      if (menor) return rodarAgenteCompat({ ...o, modelo: `ollama:${menor}` });
    }
    // Marca no erro o provedor que falhou: depois da falha, o agente já aponta para a reserva, e era a reserva
    // (o modelo local) que acabava marcada como fora do ar, parando todo o trabalho local.
    if (e instanceof ErroProvedor && !e.provedor) e.provedor = provedorDe(o.modelo).provedor;
    throw e;
  }
}

async function laçoCompat(o: OpcoesAgente): Promise<ResultadoAgente> {
  const { provedor, nome } = provedorDe(o.modelo);
  if ((provedor === "openai" || provedor === "gemini") && !chaveDe(provedor)) {
    throw new ErroProvedor(`Sem chave da ${provedor === "openai" ? "OpenAI" : "Google (Gemini)"}: cadastre em Configurações → Modelos de IA.`, 401, false);
  }
  // Ferramentas do servidor da Anthropic (pesquisa e leitura na web) não existem fora do Claude.
  const doServidor = o.ferramentas.filter((f): f is Ferramenta & { def: Anthropic.Beta.BetaTool } => !!f.executar && "input_schema" in f.def);
  // A pesquisa do Claude (web_search, web_fetch) não existe aqui: quem tinha direito a ela usa a busca do Hefesto.
  const tinhaWeb = doServidor.length < o.ferramentas.length;
  const webLocal = tinhaWeb ? (ferramentasDeWebLocal({ enxuto: provedor === "ollama" }) as (Ferramenta & { def: Anthropic.Beta.BetaTool })[]) : [];
  const locais = [...doServidor, ...webLocal];
  const semWeb = tinhaWeb && !webLocal.length;
  const porNome = new Map(locais.map((f) => [f.def.name, f] as const));
  const tools = locais.map((f) => ({
    type: "function",
    function: { name: f.def.name, description: f.def.description ?? "", parameters: provedor === "gemini" ? limparEsquema(f.def.input_schema) : f.def.input_schema },
  }));

  const anexos = await partesDosAnexos([...(o.imagens?.length ? blocosDeImagem(o.imagens) : []), ...(o.arquivos?.length ? await blocosDeArquivo(o.arquivos) : [])], provedor === "ollama");
  // Retomada (queda, reinício, pausa): a conversa salva pelo laço local continua de onde parou, sem reler tudo.
  const salva = o.retomar?.length && ehConversaLocal(o.retomar) ? (o.retomar as unknown as Msg[]) : null;
  // No modelo local o pedido inicial tem teto (~55% do que cabe): o começo da conversa nunca é compactado, e um
  // pedido grande demais (card + entrega + diff + regras + críticas) fazia a conversa não caber mesmo compactada.
  const mensagem = provedor === "ollama" ? encolherPedido(o.mensagem, Math.floor((o.contexto ?? configOllama().contexto) * 0.75 * TETO_PEDIDO_LOCAL * 3)) : o.mensagem;
  const novas = (): Msg[] => [
    { role: "system", content: `${o.sistema}${semWeb ? "\n\n(Neste modelo não há pesquisa na web: trabalhe com as ferramentas disponíveis e com o que você sabe, e diga quando faltar informação atual.)" : ""}` },
    { role: "user", content: anexos.length ? [...anexos, { type: "text", text: mensagem }] : mensagem },
  ];
  const msgs: Msg[] = salva
    ? [...salva, { role: "user", content: "Você foi pausado (reinício do sistema, limite ou espera de um modelo) e agora pode continuar. Siga exatamente de onde parou: não refaça leituras nem o trabalho que já fez." }]
    : novas();
  // Conversa retomada de antes do teto: o pedido inicial salvo também encolhe (senão ela compacta a cada passo).
  if (salva && provedor === "ollama" && typeof msgs[1]?.content === "string" && msgs[1].role === "user") {
    msgs[1] = { ...msgs[1], content: encolherPedido(msgs[1].content, Math.floor((o.contexto ?? configOllama().contexto) * 0.75 * TETO_PEDIDO_LOCAL * 3)) };
  }
  const salvarRodada = () => o.aoRodada?.(msgs as unknown as Anthropic.Beta.BetaMessageParam[]);
  let contextoLocal = o.contexto ?? configOllama().contexto;
  let limiteTokens = provedor === "ollama" ? contextoLocal * 0.75 : 150_000;
  let custoUsd = 0;
  let lembretes = 0;
  let tamanhoAposCompactar = 0;
  let ultimoTexto = "";
  // Calibrado a cada resposta do Ollama com a contagem real do prompt (começa no pessimista: 3 caracteres por token).
  let porToken = 3;
  const replay = novaExecucao(o.cardId, o.agenteId, o.modelo);
  const interrompido = () => new ErroInterrompido(String(o.sinal?.reason ?? "interrompido"));

  for (let rodada = 0; rodada < (o.maxRodadas ?? 16); rodada++) {
    if (o.sinal?.aborted) throw interrompido();
    if (o.cardId && rodada > 0 && orcamentoEsgotado()) throw new ErroSemOrcamento("O orçamento de IA de hoje acabou.");
    if (o.cardId && rodada > 0 && cardPassouDoLimite(o.cardId)) throw new ErroLimiteCard("Este card chegou ao limite de gasto.");
    if (o.cardId && projetoSemOrcamento(o.cardId)) throw new ErroOrcamentoProjeto("O projeto deste card chegou ao orçamento.");
    // Mensagem do CEO no meio do trabalho: entra antes da próxima chamada, sem reiniciar.
    const doCeo = rodada > 0 ? (o.orientacoes?.() ?? []) : [];
    if (doCeo.length) {
      msgs.push({ role: "user", content: blocoDeOrientacao(doCeo) });
      registrarPasso(replay, { rodada, tipo: "texto", saida: `(Mensagem do CEO recebida: ${doCeo.join(" | ").slice(0, 300)})` });
    }
    // Perto do limite: a parte antiga da conversa vira um resumo (antes de cortar resultados), como o Claude Code faz.
    // Só de novo quando a conversa crescer outros 30% do limite: se as últimas rodadas sozinhas já são grandes,
    // resumir a cada passo não ajuda (no card 11 compactou duas vezes em 30 s); aí o aparar resolve.
    if (tokensDe(msgs, porToken) > Math.max(limiteTokens * LIMIAR_COMPACTAR, tamanhoAposCompactar + limiteTokens * 0.3)) {
      const corte = pontoDeCorte(msgs);
      // Só resume se o meio (o que o resumo substitui) pesa: com o começo fixo grande, resumir um meio pequeno gastava
      // 20-30 s para tirar 3% da conversa (15% do tempo do modelo local ia nisso). Aí o aparar resolve sozinho.
      const meio = corte ? tokensDe(msgs.slice(2, corte), porToken) : 0;
      if (corte && meio >= tokensDe(msgs, porToken) * MEIO_MINIMO_PARA_RESUMIR) {
        const t0 = Date.now();
        const pedido = pedidoDeResumo(msgs.slice(2, corte), Math.floor(limiteTokens * 0.6 * porToken));
        try {
          const r = provedor === "ollama"
            ? await chamarOllama(nome, pedido, [], "low", o.sinal, () => {}, contextoLocal)
            : await chamarCompat(provedor as "openai" | "gemini", nome, pedido, [], o.sinal, () => {});
          const usd = provedor === "ollama" ? 0 : registrarUsoTokens(r.entrada, r.saida, precoDe(provedor as "openai" | "gemini"));
          registrarChamada({ cardId: o.cardId ?? null, agente: o.agenteId ?? null, modelo: o.modelo, rodada, entrada: r.entrada, saida: r.saida, cacheEscrita: 0, cacheLeitura: 0, usd, ms: Date.now() - t0, parada: "compactacao" });
          custoUsd += usd;
          if (o.cardId && usd) somarCusto(o.cardId, usd);
          const resumo = r.texto.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
          if (resumo.length > 80) {
            const antes = Math.round(tokensDe(msgs, porToken));
            compactar(msgs, corte, resumo);
            tamanhoAposCompactar = tokensDe(msgs, porToken);
            registrarPasso(replay, { rodada, tipo: "texto", saida: `(Conversa compactada: ~${antes} → ~${Math.round(tokensDe(msgs, porToken))} tokens.)` });
            salvarRodada();
          }
        } catch (e) {
          if (o.sinal?.aborted) throw interrompido();
          // Resumo falhou: segue cortando resultados antigos, como antes.
        }
      }
    }
    aparar(msgs, limiteTokens, porToken);
    // Não cabe no contexto do modelo local nem depois de aparar: o Ollama cortaria o começo (as instruções e o
    // card) em silêncio e o agente trabalharia às cegas. Segue no Claude do agente, que comporta o trabalho.
    // Não cabe no contexto padrão do modelo local: tenta o contexto ampliado (mais memória, só neste trabalho).
    for (const degrau of CONTEXTOS_LOCAIS_AMPLIADOS) {
      if (provedor !== "ollama" || o.contexto || tokensDe(msgs, porToken) <= limiteTokens || contextoLocal >= degrau) continue;
      contextoLocal = degrau;
      limiteTokens = contextoLocal * 0.75;
      aparar(msgs, limiteTokens, porToken);
    }
    // Conversa salva que já não cabe (de quando o contexto local ia além da placa): recomeça a partir do card, bem menor.
    if (provedor === "ollama" && rodada === 0 && salva && tokensDe(msgs, porToken) > limiteTokens) {
      msgs.splice(0, msgs.length, ...novas());
      registrarPasso(replay, { rodada, tipo: "texto", saida: "(A conversa salva não cabe no contexto do modelo local: recomeço a partir do card.)" });
      aparar(msgs, limiteTokens, porToken);
    }
    if (provedor === "ollama" && tokensDe(msgs, porToken) > limiteTokens) {
      if (o.semReserva) throw new ErroProvedor(`Não cabe no contexto do modelo local (~${Math.round(tokensDe(msgs))} tokens, limite ${Math.round(limiteTokens)}).`, 413, false);
      const claude = modeloPara(agentById[o.agenteId ?? ""]?.modelo ?? "claude-sonnet-5-5", "autor");
      if (modeloDisponivel(claude) && !provedorForaDoAr("claude")) {
        registrarPasso(replay, { rodada, tipo: "texto", saida: `(O trabalho não cabe no contexto do modelo local: ~${Math.round(tokensDe(msgs))} tokens, limite ${Math.round(limiteTokens)}. Continua no ${claude}.)` });
        return rodarAgente({ ...o, modelo: claude });
      }
      // Nem o local comporta nem o Claude está no ar: espera (o motor tenta de novo depois), sem bater no Claude em loop.
      throw new ErroNaoCabe(`O trabalho não cabe no modelo local (~${Math.round(tokensDe(msgs))} tokens) e o Claude está fora do ar: espero um dos dois.`);
    }
    const onTexto = (t: string) => o.onTexto?.(t);
    const caracteresEnviados = caracteresDe(msgs);
    const t0 = Date.now();
    let r: Resposta;
    try {
      r = provedor === "ollama" ? await chamarOllama(nome, msgs, tools, o.esforco, o.sinal, onTexto, contextoLocal) : await chamarCompat(provedor as "openai" | "gemini", nome, msgs, tools, o.sinal, onTexto);
    } catch (e) {
      if (o.sinal?.aborted) throw interrompido();
      throw e;
    }
    if (provedor === "ollama") porToken = calibrarCaracteresPorToken(caracteresEnviados, r.entrada, porToken);
    const usd = provedor === "ollama" ? 0 : registrarUsoTokens(r.entrada, r.saida, precoDe(provedor as "openai" | "gemini"));
    // Mesmo rastreamento do Claude (Operação → Chamadas), com os nomes de parada dele.
    registrarChamada({
      cardId: o.cardId ?? null,
      agente: o.agenteId ?? null,
      modelo: o.modelo,
      rodada,
      entrada: r.entrada,
      saida: r.saida,
      cacheEscrita: 0,
      cacheLeitura: 0,
      usd,
      ms: Date.now() - t0,
      parada: r.cortada ? "max_tokens" : r.chamadas.length ? "tool_use" : "end_turn",
    });
    custoUsd += usd;
    if (o.cardId && usd) {
      somarCusto(o.cardId, usd);
      conferirOrcamentoDoProjeto(o.cardId);
    }
    // Passou do tamanho máximo de resposta: nada dela é executado (chamada pela metade) e o agente refaz em pedaços.
    // Antes virava erro e, na segunda vez, card bloqueado; no card 11 foram 18 minutos escrevendo um arquivo inteiro.
    if (r.cortada) {
      registrarPasso(replay, { rodada, tipo: "texto", saida: `(Resposta cortada no tamanho máximo, ~${r.saida} tokens: peço para refazer em pedaços.)` });
      msgs.push({ role: "assistant", content: `${r.texto.slice(0, 1500)}\n[…resposta cortada no tamanho máximo]` });
      msgs.push({
        role: "user",
        content: "Sua última resposta passou do tamanho máximo e foi cortada: nada dela foi executado. Faça em pedaços menores: para um arquivo grande, crie com o começo (escrever_arquivo) e complete com editar_arquivo em trechos; não repita o arquivo inteiro no texto.",
      });
      salvarRodada();
      continue;
    }

    // Modelos com raciocínio às vezes deixam o pensamento no texto; não vai para o CEO.
    const texto = r.texto.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    if (texto) registrarPasso(replay, { rodada, tipo: "texto", saida: texto });
    ultimoTexto = texto || ultimoTexto;
    msgs.push({ role: "assistant", content: r.texto, ...(r.chamadas.length ? { tool_calls: r.chamadas } : {}) });

    if (!r.chamadas.length) {
      if (o.exigeFerramenta === false && !soAnunciou(ultimoTexto)) return { terminou: true, texto: ultimoTexto, custoUsd };
      if (lembretes >= 2) return { terminou: false, texto: ultimoTexto, custoUsd };
      lembretes++;
      msgs.push({
        role: "user",
        content: lembretes === 1 ? o.lembrete : `Você parou de novo sem usar ferramentas. Não descreva o que vai fazer: faça agora, com as ferramentas, e termine com a ferramenta final. ${o.lembrete}`,
      });
      salvarRodada();
      continue;
    }
    // Lembretes contam só as paradas seguidas: o modelo local às vezes "narra" um passo e depois volta a trabalhar,
    // e duas paradas soltas em 20 passos encerravam a vez dele sem entrega.
    lembretes = 0;

    let fim = false;
    const imagens: Parte[] = [];
    for (const c of r.chamadas) {
      const entrada = argumentos(c.function.arguments);
      const t1 = Date.now();
      const res = entrada
        ? await executarFerramenta(porNome, c.function.name, entrada)
        : { texto: `Os argumentos de ${c.function.name} não são um JSON válido. Chame de novo com um objeto JSON.`, erro: true };
      registrarPasso(replay, { rodada, tipo: "ferramenta", nome: c.function.name, entrada: entrada ?? c.function.arguments, saida: res.texto, erro: res.erro, ms: Date.now() - t1 });
      if (res.fim && !res.erro) fim = true;
      msgs.push({ role: "tool", tool_call_id: c.id, name: c.function.name, content: res.erro ? `ERRO: ${res.texto}` : res.texto });
      // Resultado de ferramenta só aceita texto: a imagem (print do navegador) vai numa mensagem logo depois.
      if (res.imagem) imagens.push({ type: "image_url", image_url: { url: `data:${res.imagem.media};base64,${res.imagem.base64}` } });
    }
    if (fim) return { terminou: true, texto: ultimoTexto, custoUsd };
    if (imagens.length) msgs.push({ role: "user", content: [{ type: "text", text: "Imagens devolvidas pelas ferramentas acima:" }, ...imagens] });
    salvarRodada();
  }
  return { terminou: false, texto: ultimoTexto, custoUsd };
}

/**
 * Teste rápido de um modelo (tela Modelos de IA): ele precisa chamar uma ferramenta com
 * argumentos certos, que é o que os agentes fazem o dia todo.
 */
export async function testarModelo(modelo: string): Promise<{ ok: boolean; segundos: number; detalhe: string }> {
  const inicio = Date.now();
  let recebido: Record<string, unknown> | null = null;
  const segundos = () => Math.round((Date.now() - inicio) / 100) / 10;
  try {
    const r = await rodarAgente({
      modelo,
      sistema: "Você é um agente de teste do Hefesto. Responda sempre usando a ferramenta pedida.",
      mensagem: "Some 17 + 25 e entregue o resultado com a ferramenta entregar (campo resultado, número) e um resumo de uma frase em português.",
      ferramentas: [
        ferramenta("entregar", "Entrega o resultado final.", { resultado: { type: "integer" }, resumo: { type: "string" } }, ["resultado", "resumo"], (e) => {
          recebido = e;
          return { texto: "Recebido.", fim: true };
        }),
      ],
      esforco: "low",
      lembrete: "Use a ferramenta entregar agora.",
      maxRodadas: 3,
      sinal: AbortSignal.timeout(180_000),
    });
    const entrada = recebido as Record<string, unknown> | null;
    if (!entrada) return { ok: false, segundos: segundos(), detalhe: `Respondeu sem chamar a ferramenta: "${r.texto.slice(0, 160)}"` };
    const certo = Number(entrada.resultado) === 42;
    return { ok: certo, segundos: segundos(), detalhe: certo ? `Chamou a ferramenta certo: "${String(entrada.resumo ?? "").slice(0, 160)}"` : `Chamou a ferramenta, mas errou a conta (${String(entrada.resultado)}).` };
  } catch (e) {
    return { ok: false, segundos: segundos(), detalhe: e instanceof Error ? e.message : String(e) };
  }
}
