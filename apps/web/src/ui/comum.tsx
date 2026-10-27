import type { Agent, Card } from "@empresa/shared";
import { colunaDe } from "@empresa/shared";
import { Avatar } from "./kit/index.ts";

// Pequenos utilitários de exibição usados por várias telas.

export const hora = (ts: number) => new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

export function quando(ts: number): string {
  const d = Date.now() - ts;
  if (d < 60_000) return "agora";
  if (d < 3600_000) return `há ${Math.floor(d / 60_000)} min`;
  const dt = new Date(ts);
  const hoje = new Date();
  if (dt.toDateString() === hoje.toDateString()) return hora(ts);
  const ontem = new Date(hoje.getTime() - 86400_000);
  if (dt.toDateString() === ontem.toDateString()) return `ontem, ${hora(ts)}`;
  return dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export const usd = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

/** Avatar de um agente (iniciais na cor da camisa). */
export function Avatarzinho({ agent, grande, tamanho }: { agent: Agent; grande?: boolean; tamanho?: number }) {
  return <Avatar nome={agent.nome} cor={agent.aparencia.camisa} tamanho={tamanho ?? (grande ? 44 : 28)} />;
}

export const nomesModelo: Record<Agent["modelo"], string> = {
  "claude-opus-5-5": "Opus 5.5",
  "claude-sonnet-5-5": "Sonnet 5.5",
  "claude-haiku-5-5": "Haiku 5.5",
};

export interface Desempenho {
  total: number;
  concluidos: number;
  dePrimeira: number;
  devolucoes: number;
  custo: number;
  emAndamento: number;
}

/** Desempenho do agente como autor, calculado dos cards (sem demonstração). */
export function desempenhoDe(agenteId: string, cards: Card[]): Desempenho {
  const meus = cards.filter((c) => !c.demo && c.dono === agenteId);
  const feitos = meus.filter((c) => colunaDe(c.fluxo, c.coluna)?.tipo === "feito");
  return {
    total: meus.length,
    concluidos: feitos.length,
    dePrimeira: feitos.filter((c) => c.devolucoes === 0).length,
    devolucoes: meus.reduce((t, c) => t + c.devolucoes, 0),
    custo: meus.reduce((t, c) => t + c.custoUsd, 0),
    emAndamento: meus.filter((c) => { const t = colunaDe(c.fluxo, c.coluna)?.tipo; return t === "trabalho" || t === "validacao" || t === "bug"; }).length,
  };
}
