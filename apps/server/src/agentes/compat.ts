import type Anthropic from "@anthropic-ai/sdk";
import { agentById } from "@empresa/org";
import { modeloPara, orcamentoEsgotado, registrarUsoTokens } from "../custo.ts";
import { cardPassouDoLimite, somarCusto } from "../tarefas.ts";
import { blocosDeImagem } from "../imagens.ts";
import { blocosDeArquivo } from "../arquivos.ts";
import { BASE_COMPAT, capacidadesOllama, chaveDe, configOllama, modeloDisponivel, precoDe, provedorDe, provedorForaDoAr } from "../provedores.ts";
import { novaExecucao, registrarPasso } from "../confianca/execucoes.ts";
import { conferirOrcamentoDoProjeto, projetoSemOrcamento } from "../planejamento.ts";
import { registrarChamada } from "../chamadas.ts";
import { ErroInterrompido, ErroLimiteCard, ErroOrcamentoProjeto, ErroSemOrcamento, executarFerramenta, ferramenta, rodarAgente, type Ferramenta, type OpcoesAgente, type ResultadoAgente } from "./loop.ts";

// O laço do agente para modelos fora do Claude: Ollama (API nativa, para controlar o
// tamanho do contexto) e OpenAI e Gemini (API de chat no formato da OpenAI). Mesmas
// regras do laço do Claude: ferramentas, ferramenta final, lembretes, orçamento e limite por card.

/** Erro de um provedor fora do Claude. `passageiro`: vale esperar e tentar de novo (limite, sobrecarga, Ollama fechado). */
export class ErroProvedor extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly passageiro: boolean,
  ) {
    super(message);
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
function partesDosAnexos(blocos: Anthropic.Beta.BetaContentBlockParam[]): Parte[] {
  return blocos.flatMap((b): Parte[] => {
    if (b.type === "text") return [{ type: "text", text: b.text }];
    if (b.type === "image" && b.source.type === "base64") return [{ type: "image_url", image_url: { url: `data:${b.source.media_type};base64,${b.source.data}` } }];
    if (b.type === "document") return [{ type: "text", text: `(PDF anexado${b.title ? ` "${b.title}"` : ""}: este modelo não lê PDF direto. Se precisar do conteúdo, peça o texto ao CEO.)` }];
    return [];
  });
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
 * escreve a ~19 tok/s e 64 mil a ~6 tok/s, com a RAM livre quase igual (o Qwen 3.5 guarda pouco por token).
 * Usa o menor que couber: o mais lento só quando precisa.
 */
const CONTEXTOS_LOCAIS_AMPLIADOS = [32_768, 65_536];

/** Tokens estimados da conversa (português com Markdown fica perto de 3 caracteres por token). */
const tokensDe = (msgs: Msg[]) => msgs.reduce((n, m) => n + textoDe(m.content).length + (m.tool_calls ? JSON.stringify(m.tool_calls).length : 0), 0) / 3;

function aparar(msgs: Msg[], limiteTokens: number) {
  const ferramentas = msgs.flatMap((m, i) => (m.role === "tool" ? [i] : []));
  for (const i of ferramentas.slice(0, -6)) {
    if (tokensDe(msgs) <= limiteTokens) return;
    if (textoDe(msgs[i]!.content).length > 200) msgs[i]!.content = "[Resultado antigo removido para caber no contexto. Rode a ferramenta de novo se precisar.]";
  }
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

// Um pedido por vez ao Ollama: numa máquina de 16 GB, dois modelos (ou dois contextos grandes)
// ao mesmo tempo estouram a memória. Os agentes locais esperam a vez.
let filaOllama: Promise<unknown> = Promise.resolve();
function naFilaDoOllama<T>(fn: () => Promise<T>): Promise<T> {
  const vez = filaOllama.then(fn, fn);
  filaOllama = vez.catch(() => undefined);
  return vez;
}

async function chamarOllama(modelo: string, msgs: Msg[], tools: unknown[], esforco: OpcoesAgente["esforco"], sinal: AbortSignal | undefined, onTexto: (t: string) => void, contexto = configOllama().contexto): Promise<Resposta> {
  const { url } = configOllama();
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
  return naFilaDoOllama(async () => {
    if (sinal?.aborted) throw new ErroInterrompido(String(sinal.reason ?? "interrompido"));
    let res: Response;
    try {
      res = await fetch(`${url}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: modelo,
          messages: mensagens,
          stream: true,
          keep_alive: "15m",
          options: { num_ctx: contexto },
          // Raciocínio deixa o modelo local mais certeiro, mas bem mais lento: só fora das conversas rápidas.
          ...(caps?.includes("thinking") ? { think: esforco !== "low" } : {}),
          ...(tools.length ? { tools } : {}),
        }),
        signal: sinal,
      });
    } catch (e) {
      if (sinal?.aborted) throw e;
      throw new ErroProvedor(`O Ollama não está respondendo em ${url}. Abra o app do Ollama (ou rode "ollama serve").`, 0, true);
    }
    if (res.status === 404) throw new ErroProvedor(`O modelo ${modelo} não está instalado no Ollama. Rode no terminal: ollama pull ${modelo}`, 404, false);
    if (!res.ok) throw await erroDaResposta(res, "O Ollama");

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
      if (j.error) throw new ErroProvedor(`O Ollama falhou: ${j.error}`, 500, false);
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
  const { provedor, nome } = provedorDe(o.modelo);
  if ((provedor === "openai" || provedor === "gemini") && !chaveDe(provedor)) {
    throw new ErroProvedor(`Sem chave da ${provedor === "openai" ? "OpenAI" : "Google (Gemini)"}: cadastre em Configurações → Modelos de IA.`, 401, false);
  }
  // Ferramentas do servidor da Anthropic (pesquisa e leitura na web) não existem fora do Claude.
  const locais = o.ferramentas.filter((f): f is Ferramenta & { def: Anthropic.Beta.BetaTool } => !!f.executar && "input_schema" in f.def);
  const semWeb = locais.length < o.ferramentas.length;
  const porNome = new Map(locais.map((f) => [f.def.name, f] as const));
  const tools = locais.map((f) => ({
    type: "function",
    function: { name: f.def.name, description: f.def.description ?? "", parameters: provedor === "gemini" ? limparEsquema(f.def.input_schema) : f.def.input_schema },
  }));

  const anexos = partesDosAnexos([...(o.imagens?.length ? blocosDeImagem(o.imagens) : []), ...(o.arquivos?.length ? await blocosDeArquivo(o.arquivos) : [])]);
  const msgs: Msg[] = [
    { role: "system", content: `${o.sistema}${semWeb ? "\n\n(Neste modelo não há pesquisa na web: trabalhe com as ferramentas disponíveis e com o que você sabe, e diga quando faltar informação atual.)" : ""}` },
    { role: "user", content: anexos.length ? [...anexos, { type: "text", text: o.mensagem }] : o.mensagem },
  ];
  let contextoLocal = o.contexto ?? configOllama().contexto;
  let limiteTokens = provedor === "ollama" ? contextoLocal * 0.75 : 150_000;
  let custoUsd = 0;
  let lembretes = 0;
  let ultimoTexto = "";
  const replay = novaExecucao(o.cardId, o.agenteId, o.modelo);
  const interrompido = () => new ErroInterrompido(String(o.sinal?.reason ?? "interrompido"));

  for (let rodada = 0; rodada < (o.maxRodadas ?? 16); rodada++) {
    if (o.sinal?.aborted) throw interrompido();
    if (o.cardId && rodada > 0 && orcamentoEsgotado()) throw new ErroSemOrcamento("O orçamento de IA de hoje acabou.");
    if (o.cardId && rodada > 0 && cardPassouDoLimite(o.cardId)) throw new ErroLimiteCard("Este card chegou ao limite de gasto.");
    if (o.cardId && projetoSemOrcamento(o.cardId)) throw new ErroOrcamentoProjeto("O projeto deste card chegou ao orçamento.");
    aparar(msgs, limiteTokens);
    // Não cabe no contexto do modelo local nem depois de aparar: o Ollama cortaria o começo (as instruções e o
    // card) em silêncio e o agente trabalharia às cegas. Segue no Claude do agente, que comporta o trabalho.
    // Não cabe no contexto padrão do modelo local: tenta o contexto ampliado (mais memória, só neste trabalho).
    for (const degrau of CONTEXTOS_LOCAIS_AMPLIADOS) {
      if (provedor !== "ollama" || o.contexto || tokensDe(msgs) <= limiteTokens || contextoLocal >= degrau) continue;
      contextoLocal = degrau;
      limiteTokens = contextoLocal * 0.75;
      aparar(msgs, limiteTokens);
    }
    if (provedor === "ollama" && tokensDe(msgs) > limiteTokens) {
      if (o.semReserva) throw new ErroProvedor(`Não cabe no contexto do modelo local (~${Math.round(tokensDe(msgs))} tokens, limite ${Math.round(limiteTokens)}).`, 413, false);
      const claude = modeloPara(agentById[o.agenteId ?? ""]?.modelo ?? "claude-sonnet-5-5", "autor");
      if (modeloDisponivel(claude) && !provedorForaDoAr("claude")) {
        registrarPasso(replay, { rodada, tipo: "texto", saida: `(O trabalho não cabe no contexto do modelo local: ~${Math.round(tokensDe(msgs))} tokens, limite ${Math.round(limiteTokens)}. Continua no ${claude}.)` });
        return rodarAgente({ ...o, modelo: claude });
      }
      // Nem o local comporta nem o Claude está no ar: espera (o motor tenta de novo depois), sem bater no Claude em loop.
      throw new ErroProvedor(`O trabalho não cabe no modelo local (~${Math.round(tokensDe(msgs))} tokens) e o Claude está fora do ar: espero um dos dois.`, 503, true);
    }
    const onTexto = (t: string) => o.onTexto?.(t);
    const t0 = Date.now();
    let r: Resposta;
    try {
      r = provedor === "ollama" ? await chamarOllama(nome, msgs, tools, o.esforco, o.sinal, onTexto, contextoLocal) : await chamarCompat(provedor as "openai" | "gemini", nome, msgs, tools, o.sinal, onTexto);
    } catch (e) {
      if (o.sinal?.aborted) throw interrompido();
      throw e;
    }
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
    if (r.cortada && r.chamadas.length) throw new Error("A resposta ficou longa demais e foi cortada.");

    // Modelos com raciocínio às vezes deixam o pensamento no texto; não vai para o CEO.
    const texto = r.texto.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    if (texto) registrarPasso(replay, { rodada, tipo: "texto", saida: texto });
    ultimoTexto = texto || ultimoTexto;
    msgs.push({ role: "assistant", content: r.texto, ...(r.chamadas.length ? { tool_calls: r.chamadas } : {}) });

    if (!r.chamadas.length) {
      if (o.exigeFerramenta === false) return { terminou: true, texto: ultimoTexto, custoUsd };
      if (lembretes >= 2) return { terminou: false, texto: ultimoTexto, custoUsd };
      lembretes++;
      msgs.push({
        role: "user",
        content: lembretes === 1 ? o.lembrete : `Você parou de novo sem usar ferramentas. Não descreva o que vai fazer: faça agora, com as ferramentas, e termine com a ferramenta final. ${o.lembrete}`,
      });
      continue;
    }

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
