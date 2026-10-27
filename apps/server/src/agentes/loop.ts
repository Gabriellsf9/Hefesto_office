import Anthropic from "@anthropic-ai/sdk";
import { registrarUso } from "../custo.ts";
import { somarCusto } from "../tarefas.ts";
import { buscarNoCodigo, ErroArquivo, lerArquivo, listarArquivos } from "./arquivos.ts";
import { blocosDeImagem } from "../imagens.ts";

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

export interface OpcoesAgente {
  client: Anthropic;
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
  /** Fallback de modelo em caso de recusa. O Haiku não tem fallback no servidor: use false. */
  fallback?: boolean;
  onTexto?: (parcial: string) => void;
  maxRodadas?: number;
  /** Imagens que acompanham a mensagem (o modelo enxerga). Endereços /api/midia/chat/…. */
  imagens?: string[];
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
      "buscar_no_codigo",
      "Procura um texto em todos os arquivos do projeto e devolve arquivo:linha: trecho (até 100 resultados).",
      { texto: { type: "string" } },
      ["texto"],
      (e) => protegido(() => buscarNoCodigo(raiz, texto(e, "texto", 200))),
    ),
  ];
}

export async function rodarAgente(o: OpcoesAgente): Promise<ResultadoAgente> {
  const imagens = o.imagens?.length ? blocosDeImagem(o.imagens) : [];
  const mensagens: Anthropic.Beta.BetaMessageParam[] = [
    { role: "user", content: imagens.length ? [...imagens, { type: "text", text: o.mensagem }] : o.mensagem },
  ];
  const porNome = new Map(o.ferramentas.flatMap((f) => ("name" in f.def && f.executar ? [[f.def.name, f] as const] : [])));
  let custoUsd = 0;
  let lembrou = false;
  let tentativasJson = 0;
  let ultimoTexto = "";

  for (let rodada = 0; rodada < (o.maxRodadas ?? 16); rodada++) {
    let parcial = "";
    const stream = o.client.beta.messages.stream({
      model: o.modelo,
      max_tokens: 64000,
      ...(o.fallback === false ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }),
      output_config: { effort: o.esforco ?? "medium" },
      cache_control: { type: "ephemeral" },
      system: o.sistema,
      ...(o.ferramentas.length ? { tools: o.ferramentas.map((f) => f.def) } : {}),
      messages: mensagens,
    });
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
      // Com eager_input_streaming, uma entrada de ferramenta ilegível rejeita aqui. Só isso é repetido.
      if (err instanceof Anthropic.APIError || tentativasJson++ >= 2) throw err;
      continue;
    }
    const usd = registrarUso(o.modelo, msg.usage);
    custoUsd += usd;
    if (o.cardId) somarCusto(o.cardId, usd);

    const usos = msg.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (msg.stop_reason === "refusal") throw new Error("O modelo recusou esta tarefa (filtro de segurança).");
    if (msg.stop_reason === "max_tokens" && usos.length) throw new Error("A resposta ficou longa demais e foi cortada.");

    ultimoTexto = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("") || ultimoTexto;
    mensagens.push({ role: "assistant", content: msg.content as Anthropic.Beta.BetaContentBlockParam[] });

    if (msg.stop_reason === "pause_turn") continue;

    if (!usos.length) {
      if (o.exigeFerramenta === false) return { terminou: true, texto: ultimoTexto, custoUsd };
      if (lembrou) return { terminou: false, texto: ultimoTexto, custoUsd };
      lembrou = true;
      mensagens.push({ role: "user", content: o.lembrete });
      continue;
    }

    const resultados: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    let fim = false;
    for (const u of usos) {
      const f = porNome.get(u.name);
      let r: ResultadoFerramenta;
      try {
        if (!f?.executar) throw new ErroEntrada(`Ferramenta desconhecida: ${u.name}`);
        r = await f.executar((u.input ?? {}) as Record<string, unknown>);
      } catch (e) {
        if (!(e instanceof ErroEntrada)) throw e;
        r = { texto: e.message, erro: true };
      }
      if (r.fim && !r.erro) fim = true;
      const conteudo: Anthropic.Beta.BetaToolResultBlockParam["content"] = r.imagem
        ? [{ type: "text", text: r.texto }, { type: "image", source: { type: "base64", media_type: r.imagem.media, data: r.imagem.base64 } }]
        : r.texto;
      resultados.push({ type: "tool_result", tool_use_id: u.id, content: conteudo, ...(r.erro ? { is_error: true } : {}) });
    }
    if (fim) return { terminou: true, texto: ultimoTexto, custoUsd };
    mensagens.push({ role: "user", content: resultados });
  }
  return { terminou: false, texto: ultimoTexto, custoUsd };
}
