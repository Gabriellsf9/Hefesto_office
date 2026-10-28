import Anthropic from "@anthropic-ai/sdk";
import { clienteClaude, maxTokensQueCabe, orcamentoEsgotado, registrarUso } from "../custo.ts";
import { provedorDe } from "../provedores.ts";
import { rodarAgenteCompat } from "./compat.ts";
import { cardPassouDoLimite, lerCard, somarCusto, tetoDoCard } from "../tarefas.ts";
import { buscarNoCodigo, ErroArquivo, lerArquivo, listarArquivos, mapaDoCodigo } from "./arquivos.ts";
import { blocosDeImagem } from "../imagens.ts";
import { registrarChamada } from "../chamadas.ts";
import { blocosDeArquivo } from "../arquivos.ts";
import { novaExecucao, registrarPasso } from "../confianca/execucoes.ts";
import { conferirOrcamentoDoProjeto, projetoSemOrcamento } from "../planejamento.ts";

// Laço de um agente: chama a API, executa as ferramentas pedidas e repete até o
// agente chamar uma ferramenta final (entregar, aprovar, devolver…) ou parar.

export interface Ferramenta {
  def: Anthropic.Beta.BetaToolUnion;
  /** Ferramentas do servidor da Anthropic (web) não têm executor local. */
  executar?: (entrada: Record<string, unknown>) => Promise<ResultadoFerramenta> | ResultadoFerramenta;
}

export interface ResultadoFerramenta {
  texto: string;
  erro?: boolean;
  /** A tarefa terminou com esta chamada; não precisa voltar ao modelo. */
  fim?: boolean;
  /** Imagem que o modelo enxerga junto com o texto (ex.: print do navegador). */
  imagem?: { media: "image/jpeg" | "image/png"; base64: string };
}

export class ErroEntrada extends Error {}
/** O trabalho foi interrompido de fora (o CEO mexeu no card, pausou a empresa…). */
export class ErroInterrompido extends Error {}
/** O orçamento do dia acabou no meio do trabalho. */
export class ErroSemOrcamento extends Error {}
/** O card chegou ao limite de gasto por card. */
export class ErroLimiteCard extends Error {}
/** O projeto do card chegou ao orçamento dele. */
export class ErroOrcamentoProjeto extends Error {}
/** O agente parou sem entregar nada que se aproveite (vale uma nova tentativa antes de bloquear). */
export class ErroSemEntrega extends Error {}

export interface OpcoesAgente {
  /** Cliente do Claude; sem ele, o laço cria um com a chave cadastrada. Outros provedores não usam. */
  client?: Anthropic | null;
  modelo: string;
  sistema: string;
  mensagem: string;
  ferramentas: Ferramenta[];
  /** Para somar o custo no card. */
  cardId?: number;
  esforco?: "low" | "medium" | "high";
  /** Lembrete enviado (uma vez) se o agente parar sem chamar a ferramenta final. */
  lembrete: string;
  /** false: parar sem ferramenta é um final válido (ex.: Helena respondendo uma pergunta). */
  exigeFerramenta?: boolean;
  /** Fallback de modelo em caso de recusa. Padrão: ligado, menos no Haiku (que não tem fallback no servidor). */
  fallback?: boolean;
  /** Para interromper o trabalho no meio (entre rodadas e durante a chamada à API). */
  sinal?: AbortSignal;
  /** Quem está chamando (para o rastreamento de chamadas). */
  agenteId?: string;
  /** Chamado ao fim de cada rodada com a conversa até ali (execução durável: uma queda ou reinício retoma daqui). */
  aoRodada?: (mensagens: Anthropic.Beta.BetaMessageParam[]) => void;
  /** Conversa salva de uma pausa (gasto, orçamento, reinício): continua dela em vez de começar do zero. */
  retomar?: Anthropic.Beta.BetaMessageParam[] | null;
  /** Chamado quando o trabalho pausa por gasto (limite do card ou orçamento do dia), com a conversa até ali. */
  aoPausar?: (mensagens: Anthropic.Beta.BetaMessageParam[]) => void;
  onTexto?: (parcial: string) => void;
  maxRodadas?: number;
  /** Modelo local: contexto deste trabalho (padrão: o de Configurações → Modelos de IA). */
  contexto?: number;
  /** Modelo local: se não couber no contexto, falha em vez de seguir no Claude (testes sombra, que não podem gastar). */
  semReserva?: boolean;
  /** Imagens que acompanham a mensagem (o modelo enxerga). Endereços /api/midia/chat/…. */
  imagens?: string[];
  /** Arquivos (PDF, Word, Excel…) que acompanham a mensagem: o modelo lê o conteúdo. */
  arquivos?: string[];
}

export interface ResultadoAgente {
  terminou: boolean;
  /** Texto escrito na última resposta (útil quando o agente não chamou a ferramenta final). */
  texto: string;
  custoUsd: number;
}

/** Cria a definição de uma ferramenta própria (com streaming das entradas). */
export function ferramenta(
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[],
  executar: Ferramenta["executar"],
): Ferramenta {
  return {
    def: {
      name,
      description,
      eager_input_streaming: true,
      input_schema: { type: "object", properties, required, additionalProperties: false },
    },
    executar,
  };
}

/** Lê um campo de texto obrigatório da entrada de uma ferramenta (as entradas chegam sem validação do servidor). */
export function texto(entrada: Record<string, unknown>, campo: string, max = 60_000): string {
  const v = entrada[campo];
  if (typeof v !== "string" || !v.trim()) throw new ErroEntrada(`Campo "${campo}" é obrigatório e precisa ser texto.`);
  return v.trim().slice(0, max);
}

export const ferramentasWeb: Ferramenta[] = [
  { def: { type: "web_search_20260209", name: "web_search", max_uses: 5 } },
  { def: { type: "web_fetch_20260209", name: "web_fetch", max_uses: 5 } },
];

/** Ferramentas de leitura do projeto do CEO (somente leitura, sem segredos). */
export function ferramentasDeProjeto(raiz: string): Ferramenta[] {
  const protegido = async (fn: () => Promise<string>): Promise<ResultadoFerramenta> => {
    try {
      return { texto: await fn() };
    } catch (e) {
      if (e instanceof ErroArquivo) return { texto: e.message, erro: true };
      throw e;
    }
  };
  return [
    ferramenta(
      "listar_arquivos",
      "Lista pastas e arquivos do projeto (ignora node_modules, .git e builds). Use para entender a estrutura.",
      { caminho: { type: "string", description: "Pasta relativa à raiz do projeto. Padrão: raiz" }, profundidade: { type: "integer", minimum: 1, maximum: 4 } },
      [],
      (e) => protegido(() => listarArquivos(raiz, typeof e.caminho === "string" ? e.caminho : ".", typeof e.profundidade === "number" ? e.profundidade : 2)),
    ),
    ferramenta(
      "ler_arquivo",
      "Lê um arquivo de texto do projeto, com números de linha. Arquivos de segredo (.env, chaves) são bloqueados.",
      { caminho: { type: "string" }, inicio: { type: "integer", minimum: 1 }, fim: { type: "integer", minimum: 1 } },
      ["caminho"],
      (e) => protegido(() => lerArquivo(raiz, texto(e, "caminho", 1000), e.inicio as number | undefined, e.fim as number | undefined)),
    ),
    ferramenta(
      "mapa_do_codigo",
      "Mapa do projeto (ou de uma pasta): para cada arquivo de código, os imports e as assinaturas de funções, classes e tipos, SEM o corpo. Use primeiro para entender a estrutura gastando pouco; depois leia só os arquivos que importam.",
      { caminho: { type: "string", description: "Pasta ou arquivo relativo à raiz. Padrão: raiz" } },
      [],
      (e) => protegido(() => mapaDoCodigo(raiz, typeof e.caminho === "string" ? e.caminho : ".")),
    ),
    ferramenta(
      "buscar_no_codigo",
      "Procura um texto em todos os arquivos do projeto e devolve arquivo:linha: trecho (até 100 resultados).",
      { texto: { type: "string" } },
      ["texto"],
      (e) => protegido(() => buscarNoCodigo(raiz, texto(e, "texto", 200))),
    ),
  ];
}

/** Executa uma ferramenta pedida pelo modelo; falhas viram resultado de erro (o agente fica sabendo e decide). */
export async function executarFerramenta(porNome: Map<string, Ferramenta>, nome: string, entrada: Record<string, unknown>): Promise<ResultadoFerramenta> {
  const f = porNome.get(nome);
  try {
    if (!f?.executar) throw new ErroEntrada(`Ferramenta desconhecida: ${nome}`);
    return await f.executar(entrada);
  } catch (e) {
    if (e instanceof ErroInterrompido || e instanceof ErroSemOrcamento || e instanceof ErroLimiteCard || e instanceof ErroOrcamentoProjeto) throw e;
    // Falha inesperada da ferramenta (git, disco, rede…): o agente fica sabendo e decide, sem perder o trabalho.
    if (!(e instanceof ErroEntrada)) console.error(`Ferramenta ${nome} falhou:`, e);
    return { texto: e instanceof ErroEntrada ? e.message : `A ferramenta ${nome} falhou: ${e instanceof Error ? e.message : String(e)}`, erro: true };
  }
}

export async function rodarAgente(o: OpcoesAgente): Promise<ResultadoAgente> {
  // Modelo de outro provedor (Ollama, OpenAI, Gemini): mesmo laço, outro formato de API.
  if (provedorDe(o.modelo).provedor !== "claude") return rodarAgenteCompat(o);
  const client = o.client ?? clienteClaude();
  if (!client) throw new Error("Sem chave da API da Anthropic: cadastre em Configurações ou escolha outro modelo para este agente.");
  const anexos: Anthropic.Beta.BetaContentBlockParam[] = [...(o.imagens?.length ? blocosDeImagem(o.imagens) : []), ...(o.arquivos?.length ? await blocosDeArquivo(o.arquivos) : [])];
  // Retomando de uma pausa por gasto: a mesma conversa (com as leituras e o raciocínio de antes) e um aviso para seguir.
  const mensagens: Anthropic.Beta.BetaMessageParam[] = o.retomar?.length
    ? [...o.retomar, { role: "user", content: "Você foi pausado (limite de gasto, orçamento do dia ou reinício do sistema) e agora pode continuar. Siga exatamente de onde parou: não refaça leituras nem o trabalho que já fez." }]
    : [{ role: "user", content: anexos.length ? [...anexos, { type: "text", text: o.mensagem }] : o.mensagem }];
  const porNome = new Map(o.ferramentas.flatMap((f) => ("name" in f.def && f.executar ? [[f.def.name, f] as const] : [])));
  let custoUsd = 0;
  let lembretes = 0;
  let tentativasJson = 0;
  let ultimoTexto = "";
  const fallback = o.fallback ?? !/haiku/i.test(o.modelo);
  // Modelos 5.x pensam sempre (adaptativo) e prendem o raciocínio à conversa que o gerou.
  const vinculo = /^claude-(opus|sonnet|haiku|fable|mythos)-5/.test(o.modelo);
  // Replay: cada passo do trabalho num card fica guardado (texto e ferramentas).
  const replay = novaExecucao(o.cardId, o.agenteId, o.modelo);
  const interrompido = () => new ErroInterrompido(String(o.sinal?.reason ?? "interrompido"));

  for (let rodada = 0; rodada < (o.maxRodadas ?? 16); rodada++) {
    if (o.sinal?.aborted) throw interrompido();
    // Trabalho de card respeita o orçamento a cada rodada, não só no começo.
    if (o.cardId && rodada > 0 && orcamentoEsgotado()) {
      o.aoPausar?.(mensagens);
      throw new ErroSemOrcamento("O orçamento de IA de hoje acabou.");
    }
    if (o.cardId && rodada > 0 && cardPassouDoLimite(o.cardId)) {
      o.aoPausar?.(mensagens);
      throw new ErroLimiteCard("Este card chegou ao limite de gasto.");
    }
    if (o.cardId && projetoSemOrcamento(o.cardId)) {
      o.aoPausar?.(mensagens);
      throw new ErroOrcamentoProjeto("O projeto deste card chegou ao orçamento.");
    }
    let parcial = "";
    const t0 = Date.now();
    // O limite do card só é conferido entre chamadas: a saída de cada uma fica dentro do que ainda resta.
    const restante = o.cardId ? (() => { const c = lerCard(o.cardId!); return tetoDoCard(c) - c.custoUsd; })() : Infinity;
    const stream = client.beta.messages.stream({
      model: o.modelo,
      max_tokens: maxTokensQueCabe(o.modelo, restante),
      betas: [...(fallback ? ["server-side-fallback-2026-07-01"] : []), "context-management-2025-06-27", ...(vinculo ? ["thinking-binding-controls-2026-08-01"] : [])],
      ...(fallback ? { fallbacks: "default" as const } : {}),
      // Retomada: o sistema do agente muda entre uma vez e outra (livro, lições, comentários). O raciocínio salvo
      // de antes deixa de valer; a API descarta esses blocos em vez de recusar a conversa inteira.
      ...(vinculo ? { thinking: { type: "adaptive" as const, block_binding: { prefix_mismatch_behavior: "drop_block" as const } } } : {}),
      // Economia: em tarefas longas (raio-x, código), resultados antigos de ferramentas saem do contexto
      // (o servidor limpa; não invalida o raciocínio). Só limpa em lotes grandes, para o cache valer a pena.
      context_management: {
        edits: [
          {
            type: "clear_tool_uses_20250919",
            trigger: { type: "input_tokens", value: 60_000 },
            keep: { type: "tool_uses", value: 6 },
            clear_at_least: { type: "input_tokens", value: 20_000 },
            exclude_tools: ["entregar", "aprovar", "devolver", "buscar_na_memoria"],
          },
        ],
      },
      output_config: { effort: o.esforco ?? "medium" },
      cache_control: { type: "ephemeral" },
      system: o.sistema,
      ...(o.ferramentas.length ? { tools: o.ferramentas.map((f) => f.def) } : {}),
      messages: mensagens,
    }, o.sinal ? { signal: o.sinal } : undefined);
    if (o.onTexto) {
      stream.on("text", (delta) => {
        parcial += delta;
        o.onTexto!(parcial);
      });
    }

    let msg: Anthropic.Beta.BetaMessage;
    try {
      msg = await stream.finalMessage();
      tentativasJson = 0;
    } catch (err) {
      if (o.sinal?.aborted) throw interrompido();
      // Com eager_input_streaming, uma entrada de ferramenta ilegível rejeita aqui. Só isso é repetido.
      if (err instanceof Anthropic.APIError) throw err;
      // Três vezes seguidas: vale uma nova vez do card (como entrega vazia) antes de bloquear.
      if (tentativasJson++ >= 2) throw new ErroSemEntrega(`O modelo mandou parâmetros de ferramenta ilegíveis 3 vezes seguidas (${String(err instanceof Error ? err.message : err).slice(0, 160)}).`);
      continue;
    }
    const usd = registrarUso(o.modelo, msg.usage);
    registrarChamada({
      cardId: o.cardId ?? null,
      agente: o.agenteId ?? null,
      modelo: msg.model || o.modelo,
      rodada,
      entrada: msg.usage.input_tokens ?? 0,
      saida: msg.usage.output_tokens ?? 0,
      cacheEscrita: msg.usage.cache_creation_input_tokens ?? 0,
      cacheLeitura: msg.usage.cache_read_input_tokens ?? 0,
      usd,
      ms: Date.now() - t0,
      parada: msg.stop_reason ?? null,
    });
    custoUsd += usd;
    if (o.cardId) {
      somarCusto(o.cardId, usd);
      conferirOrcamentoDoProjeto(o.cardId);
    }

    const usos = msg.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (msg.stop_reason === "refusal") throw new Error("O modelo recusou esta tarefa (filtro de segurança).");
    if (msg.stop_reason === "max_tokens" && usos.length) throw new Error("A resposta ficou longa demais e foi cortada.");

    const textoRodada = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    if (textoRodada.trim()) registrarPasso(replay, { rodada, tipo: "texto", saida: textoRodada });
    ultimoTexto = textoRodada || ultimoTexto;
    mensagens.push({ role: "assistant", content: msg.content as Anthropic.Beta.BetaContentBlockParam[] });

    if (msg.stop_reason === "pause_turn") continue;

    if (!usos.length) {
      if (o.exigeFerramenta === false) return { terminou: true, texto: ultimoTexto, custoUsd };
      // Parou sem ferramenta (às vezes só anuncia o que vai fazer): até dois lembretes para continuar.
      if (lembretes >= 2) return { terminou: false, texto: ultimoTexto, custoUsd };
      lembretes++;
      mensagens.push({
        role: "user",
        content: lembretes === 1 ? o.lembrete : `Você parou de novo sem usar ferramentas. Não descreva o que vai fazer: faça agora, com as ferramentas, e termine com a ferramenta final. ${o.lembrete}`,
      });
      continue;
    }

    const resultados: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    let fim = false;
    for (const u of usos) {
      const t1 = Date.now();
      const r = await executarFerramenta(porNome, u.name, (u.input ?? {}) as Record<string, unknown>);
      registrarPasso(replay, { rodada, tipo: "ferramenta", nome: u.name, entrada: u.input ?? {}, saida: r.texto, erro: r.erro, ms: Date.now() - t1 });
      if (r.fim && !r.erro) fim = true;
      const conteudo: Anthropic.Beta.BetaToolResultBlockParam["content"] = r.imagem
        ? [{ type: "text", text: r.texto }, { type: "image", source: { type: "base64", media_type: r.imagem.media, data: r.imagem.base64 } }]
        : r.texto;
      resultados.push({ type: "tool_result", tool_use_id: u.id, content: conteudo, ...(r.erro ? { is_error: true } : {}) });
    }
    if (fim) return { terminou: true, texto: ultimoTexto, custoUsd };
    mensagens.push({ role: "user", content: resultados });
    o.aoRodada?.(mensagens);
  }
  return { terminou: false, texto: ultimoTexto, custoUsd };
}
