import type { ItemTarefaAgente } from "@empresa/shared";
import { db } from "../db.ts";
import { emit } from "../bus.ts";
import { ferramenta, type Ferramenta } from "./loop.ts";

// Lista de tarefas do agente (como o TodoWrite do Claude Code): o agente quebra o card em passos e marca o que fez.
// Aparece no card para o CEO e volta para o agente na próxima rodada, então ele não se perde depois de uma
// compactação, de um reinício ou de dez leituras seguidas (o modelo local esquecia o que já tinha feito).

db.exec("CREATE TABLE IF NOT EXISTS tarefas_agente (card_id INTEGER PRIMARY KEY, itens TEXT NOT NULL, atualizado_em INTEGER NOT NULL)");

const STATUS = new Set(["pendente", "fazendo", "feita"]);

export function lerTarefasDoAgente(cardId: number): ItemTarefaAgente[] {
  const r = db.prepare("SELECT itens FROM tarefas_agente WHERE card_id = ?").get(cardId) as { itens: string } | undefined;
  try {
    return r ? (JSON.parse(r.itens) as ItemTarefaAgente[]) : [];
  } catch {
    return [];
  }
}

export function salvarTarefasDoAgente(cardId: number, itens: ItemTarefaAgente[]) {
  db.prepare("INSERT OR REPLACE INTO tarefas_agente (card_id, itens, atualizado_em) VALUES (?, ?, ?)").run(cardId, JSON.stringify(itens), Date.now());
  emit({ type: "tarefas.agente", cardId, itens });
}

/** Para a mensagem do card: a lista como o agente deixou (vazio se ele ainda não fez uma). */
export function tarefasEmTexto(cardId: number): string {
  const itens = lerTarefasDoAgente(cardId);
  if (!itens.length) return "";
  const marca = { pendente: "[ ]", fazendo: "[~]", feita: "[x]" } as const;
  return `## Sua lista de tarefas deste card (continue dela; atualize com atualizar_tarefas)\n${itens.map((i) => `- ${marca[i.status]} ${i.texto}`).join("\n")}`;
}

export function ferramentaDeTarefas(cardId: number): Ferramenta {
  return ferramenta(
    "atualizar_tarefas",
    "Mantém a sua lista de passos deste card: no começo, quebre o trabalho em 3 a 8 passos; depois marque cada um como fazendo ou feita. Mande a lista inteira a cada vez. O CEO acompanha por ela, e ela volta para você se a conversa for compactada ou retomada.",
    {
      tarefas: {
        type: "array",
        items: { type: "object", properties: { texto: { type: "string" }, status: { type: "string", enum: ["pendente", "fazendo", "feita"] } }, required: ["texto", "status"] },
      },
    },
    ["tarefas"],
    (e) => {
      const itens = (Array.isArray(e.tarefas) ? e.tarefas : [])
        .filter((t): t is { texto: string; status: string } => !!t && typeof t.texto === "string" && t.texto.trim() !== "")
        .slice(0, 20)
        .map((t) => ({ texto: t.texto.trim().slice(0, 200), status: (STATUS.has(t.status) ? t.status : "pendente") as ItemTarefaAgente["status"] }));
      if (!itens.length) return { texto: "Mande pelo menos uma tarefa com texto e status.", erro: true };
      salvarTarefasDoAgente(cardId, itens);
      const feitas = itens.filter((i) => i.status === "feita").length;
      return { texto: `Lista salva: ${feitas}/${itens.length} feitas.` };
    },
  );
}
