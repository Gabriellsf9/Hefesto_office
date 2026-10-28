import Anthropic from "@anthropic-ai/sdk";
import { db, getSetting } from "./db.ts";
import { emit } from "./bus.ts";
import { loadApiKey } from "./secrets.ts";

// Preço por milhão de tokens (US$), da tabela oficial em 2026-10. Escrita em cache
// de 5 minutos custa 1,25× a entrada; leitura de cache tem preço próprio.
const PRECOS: Record<string, { entrada: number; saida: number; leituraCache: number }> = {
  "claude-opus-5-5": { entrada: 4, saida: 20, leituraCache: 0.2 },
  "claude-sonnet-5-5": { entrada: 2, saida: 10, leituraCache: 0.2 },
  "claude-haiku-5-5": { entrada: 0.1, saida: 0.5, leituraCache: 0.01 },
};

const hoje = () => new Date().toLocaleDateString("sv-SE"); // AAAA-MM-DD no fuso local

export function custoHoje(): number {
  const row = db.prepare("SELECT usd FROM uso WHERE dia = ?").get(hoje()) as { usd: number } | undefined;
  return row?.usd ?? 0;
}

/**
 * Soma o custo de uma resposta ao dia. É uma estimativa: se uma resposta for
 * atendida por um modelo de fallback, ela é cobrada pelo preço do modelo pedido.
 */
/** desconto: fração do preço (0,5 na Batch API). */
export function registrarUso(modelo: string, usage: Pick<Anthropic.Beta.BetaUsage, "input_tokens" | "output_tokens" | "cache_creation_input_tokens" | "cache_read_input_tokens">, desconto = 1): number {
  const p = PRECOS[modelo] ?? PRECOS["claude-opus-5-5"]!;
  const usd =
    ((usage.input_tokens ?? 0) * p.entrada +
      (usage.cache_creation_input_tokens ?? 0) * p.entrada * 1.25 +
      (usage.cache_read_input_tokens ?? 0) * p.leituraCache +
      (usage.output_tokens ?? 0) * p.saida) /
    1_000_000 *
    desconto;
  db.prepare("INSERT INTO uso (dia, usd) VALUES (?, ?) ON CONFLICT(dia) DO UPDATE SET usd = usd + excluded.usd").run(hoje(), usd);
  emit({ type: "custo", hojeUsd: custoHoje() });
  return usd;
}

/** Custo de uma resposta de outro provedor (OpenAI, Gemini) pelo preço por milhão configurado. Local (Ollama) é 0. */
/** Teto de saída de uma chamada que cabe no que ainda resta de gasto (US$): uma resposta só não estoura o limite do card. */
export function maxTokensQueCabe(modelo: string, restanteUsd: number, piso = 8000, teto = 64000): number {
  const p = PRECOS[modelo] ?? PRECOS["claude-opus-5-5"]!;
  return Math.max(piso, Math.min(teto, Math.floor((Math.max(0, restanteUsd) / p.saida) * 1_000_000)));
}

export function registrarUsoTokens(entrada: number, saida: number, preco: { precoEntrada: number; precoSaida: number }): number {
  const usd = (entrada * preco.precoEntrada + saida * preco.precoSaida) / 1_000_000;
  if (usd > 0) {
    db.prepare("INSERT INTO uso (dia, usd) VALUES (?, ?) ON CONFLICT(dia) DO UPDATE SET usd = usd + excluded.usd").run(hoje(), usd);
    emit({ type: "custo", hojeUsd: custoHoje() });
  }
  return usd;
}

/** Cliente da API com a chave cifrada do CEO. Null quando não há chave. */
export function clienteClaude(): Anthropic | null {
  const apiKey = loadApiKey();
  // Mais tentativas automáticas em sobrecarga (429/529); depois disso o motor espera e tenta de novo.
  return apiKey ? new Anthropic({ apiKey, maxRetries: 4 }) : null;
}

/**
 * Modo de custo: qual modelo cada papel usa.
 * - máximo: o modelo de cada agente, como está no organograma (Opus para líderes e revisores);
 * - equilibrado (padrão): Opus só onde mais pesa (coordenador, revisão/segurança do código e advogado do diabo); o resto em Sonnet;
 * - econômico: ninguém usa Opus; tarefas de apoio (advogado do diabo) em Haiku.
 */
export type ModoCusto = "economico" | "equilibrado" | "maximo";
export const modoCusto = (): ModoCusto => {
  const m = getSetting("modo_custo");
  return m === "economico" || m === "maximo" ? m : "equilibrado";
};
export type Papel = "autor" | "validador" | "validador-codigo" | "coordenador" | "apoio";
export function modeloPara(modeloDoAgente: string, papel: Papel): string {
  const modo = modoCusto();
  if (modo === "maximo") return modeloDoAgente;
  if (papel === "apoio" && modo === "economico") return "claude-haiku-5-5";
  if (!/opus/i.test(modeloDoAgente)) return modeloDoAgente;
  // O advogado do diabo só roda em entregas importantes (N2/N3, épicos, P0): ali o Opus vale o custo.
  if (modo === "equilibrado" && (papel === "coordenador" || papel === "validador-codigo" || papel === "apoio")) return modeloDoAgente;
  return "claude-sonnet-5-5";
}

/** Quanto um card pode gastar antes de parar e pedir a sua liberação (US$). Código custa mais: limite próprio. */
export const LIMITE_CARD_PADRAO_USD = 3;
export const LIMITE_CODIGO_PADRAO_USD = 6;
export const limitePorCard = () => Number(getSetting("motor_limite_card_usd") ?? LIMITE_CARD_PADRAO_USD);
export const limitePorCardDeCodigo = () => Number(getSetting("motor_limite_codigo_usd") ?? LIMITE_CODIGO_PADRAO_USD);

/** Orçamento diário quando você ainda não definiu um (US$). */
export const ORCAMENTO_PADRAO_USD = 20;

/** O orçamento diário do motor (US$). */
export const orcamentoDiario = () => Number(getSetting("motor_orcamento_usd") ?? ORCAMENTO_PADRAO_USD);

/** O gasto de hoje chegou ao orçamento diário do motor. */
export function orcamentoEsgotado() {
  return custoHoje() >= orcamentoDiario();
}
