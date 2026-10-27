import type { Card } from "@empresa/shared";
import { prioridades, tiposCard } from "@empresa/shared";
import { agentById } from "@empresa/org";
import { useStore } from "../../store.ts";
import { Avatarzinho } from "../SidePanel.tsx";

export const tipoInfo = (t: Card["tipo"]) => tiposCard.find((x) => x.id === t)!;
export const prioridadeInfo = (p: Card["prioridade"]) => prioridades.find((x) => x.id === p)!;

const DIA = 86_400_000;

export function CardItem({ card, bugsAbertos }: { card: Card; bugsAbertos: number }) {
  const abrirCard = useStore((s) => s.abrirCard);
  const selecionarAgente = useStore((s) => s.selecionarAgente);
  const setModoBoard = useStore((s) => s.setModoBoard);
  const tipo = tipoInfo(card.tipo);
  const prio = prioridadeInfo(card.prioridade);
  const dono = card.dono ? agentById[card.dono] : null;
  const validador = card.validador ? agentById[card.validador] : null;
  const vencendo = card.prazo !== null && card.prazo - Date.now() < 2 * DIA;
  const lead = useStore((s) => (card.tipo === "lead" ? s.leads[card.id] : undefined));

  // Clicar no avatar leva a câmera até o agente, com a board ao lado.
  const focarAgente = (id: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    setModoBoard("lado");
    selecionarAgente(id);
  };

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/card", String(card.id));
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={() => abrirCard(card.id)}
      className="cursor-pointer rounded-xl bg-white p-2.5 shadow-sm ring-1 ring-black/5 transition hover:shadow-md hover:ring-black/15"
    >
      <div className="text-[13px] font-medium leading-snug text-[#1f2430]">{card.titulo}</div>

      <div className="mt-2 flex flex-wrap items-center gap-1">
        {lead && <Badge cor={lead.nota >= 80 ? "#059669" : lead.nota >= 50 ? "#d97706" : "#64748b"}>nota {lead.nota}</Badge>}
        {lead?.dados.cidade && <Badge cor="#64748b">{lead.dados.cidade.valor}</Badge>}
        {card.emValidacao && validador && (
          <Badge cor="#0d9488">validando · {validador.nome}</Badge>
        )}
        {card.devolucoes > 0 && <Badge cor="#ea580c">devolvido {card.devolucoes}×</Badge>}
        {bugsAbertos > 0 && <Badge cor="#dc2626">🐞 {bugsAbertos}</Badge>}
        {card.severidade && <Badge cor="#dc2626">{card.severidade}</Badge>}
        {card.bloqueado && <Badge cor="#7f1d1d">bloqueado</Badge>}
        {vencendo && <Badge cor="#b45309">prazo</Badge>}
        {card.nivel !== "N1" && <Badge cor="#475569">{card.nivel}</Badge>}
        {card.etiquetas.slice(0, 2).map((e) => (
          <Badge key={e} cor="#64748b">
            {e}
          </Badge>
        ))}
        {card.demo && <Badge cor="#94a3b8">demo</Badge>}
      </div>

      <div className="mt-2 flex items-center gap-1.5">
        <span className="text-[11px]" style={{ color: tipo.cor }} title={tipo.nome}>
          {tipo.icone}
        </span>
        <span className="text-[11px] font-semibold text-black/45">{card.chave}</span>
        <span className="text-[10px] font-bold" style={{ color: prio.cor }} title={`Prioridade ${prio.nome}`}>
          {card.prioridade}
        </span>
        <div className="flex-1" />
        {validador && validador.id !== dono?.id && (
          <button onClick={focarAgente(validador.id)} title={`Validador: ${validador.nome}`} className="opacity-60 hover:opacity-100">
            <Avatarzinho agent={validador} />
          </button>
        )}
        {dono && (
          <button onClick={focarAgente(dono.id)} title={`Responsável: ${dono.nome}`}>
            <Avatarzinho agent={dono} />
          </button>
        )}
      </div>
    </div>
  );
}

export function Badge({ cor, children }: { cor: string; children: React.ReactNode }) {
  return (
    <span className="rounded px-1.5 py-px text-[10px] font-semibold" style={{ color: cor, background: `${cor}14` }}>
      {children}
    </span>
  );
}
