import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db.ts";
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
export function registrarUso(modelo: string, usage: Anthropic.Beta.BetaUsage): number {
  const p = PRECOS[modelo] ?? PRECOS["claude-opus-5-5"]!;
  const usd =
    ((usage.input_tokens ?? 0) * p.entrada +
      (usage.cache_creation_input_tokens ?? 0) * p.entrada * 1.25 +
      (usage.cache_read_input_tokens ?? 0) * p.leituraCache +
      (usage.output_tokens ?? 0) * p.saida) /
    1_000_000;
  db.prepare("INSERT INTO uso (dia, usd) VALUES (?, ?) ON CONFLICT(dia) DO UPDATE SET usd = usd + excluded.usd").run(hoje(), usd);
  emit({ type: "custo", hojeUsd: custoHoje() });
  return usd;
}

/** Cliente da API com a chave cifrada do CEO. Null quando não há chave. */
export function clienteClaude(): Anthropic | null {
  const apiKey = loadApiKey();
  return apiKey ? new Anthropic({ apiKey }) : null;
}
