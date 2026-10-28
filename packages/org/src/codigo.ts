import { etapasDoCodigo, fluxos, salaDoCodigo, type Card, type FluxoId, type RoomId } from "@empresa/shared";
import { agentById } from "./agents.ts";
import { salaDe } from "./rooms.ts";

// Etapas de validação do código em qualquer escritório. Na sede: review, performance, segurança e QA,
// cada uma com o seu especialista. Num escritório criado de um modelo: as colunas de validação do fluxo,
// cada uma com o líder da sala da coluna (ou o validador da sala de código), nunca o próprio autor.

export interface EtapaDoCodigo {
  coluna: string;
  validador: string;
  foco: "corretude" | "performance" | "seguranca" | "qa";
}

const FOCO: Record<string, EtapaDoCodigo["foco"]> = { "code-review": "corretude", seguranca: "seguranca", "em-qa": "qa" };

const liderDa = (sala: RoomId) => {
  const daSala = Object.values(agentById).filter((a) => a.sala === sala);
  return (daSala.find((a) => a.lider) ?? daSala[0])?.id ?? null;
};

export function etapasDoCodigoDe(fluxo: FluxoId, autor?: string | null): EtapaDoCodigo[] {
  if (fluxo === "software") return etapasDoCodigo.filter((e) => e.validador !== autor);
  const sala = salaDoCodigo(fluxo);
  if (!sala) return [];
  const padrao = salaDe(sala).validador ?? null;
  const etapas: EtapaDoCodigo[] = [];
  for (const c of fluxos[fluxo]!.colunas.filter((x) => x.tipo === "validacao")) {
    let validador = (c.sala ? liderDa(c.sala) : null) ?? padrao;
    if (validador === autor) validador = padrao !== autor ? padrao : null;
    if (!validador) continue;
    // O mesmo validador em etapas seguidas confere uma vez só.
    if (etapas.at(-1)?.validador === validador) continue;
    etapas.push({ coluna: c.id, validador, foco: FOCO[c.id] ?? "corretude" });
  }
  return etapas;
}

/** Etapa atual de um card de código (pelo validador), ou null se não é código da sala de código. */
export function etapaDoCodigoDe(card: Pick<Card, "fluxo" | "sala" | "validador" | "dono">): number | null {
  if (card.sala !== salaDoCodigo(card.fluxo)) return null;
  const etapas = etapasDoCodigoDe(card.fluxo, card.dono);
  if (!etapas.length) return null;
  const i = etapas.findIndex((e) => e.validador === card.validador);
  return i >= 0 ? i : 0;
}
