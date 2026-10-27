import type { Card } from "@empresa/shared";
import { colunaDe, prioridades, tiposCard } from "@empresa/shared";
import { agentById, roomById, nomeDaSala } from "@empresa/org";
import { Bug, CalendarClock, CircleDot, Lock, RotateCcw, ShieldCheck } from "lucide-react";
import { useStore } from "../../store.ts";
import { Etiqueta, cx } from "../kit/index.ts";
import { Avatarzinho, quando } from "../comum.tsx";

// Cartão do card (board) e linha de card (listas). DESIGN-INTERFACE.md §6.3.

export const tipoInfo = (t: Card["tipo"]) => tiposCard.find((x) => x.id === t)!;
export const prioridadeInfo = (p: Card["prioridade"]) => prioridades.find((x) => x.id === p)!;

const DIA = 86_400_000;
const COR_PRIO: Record<string, string> = { P0: "text-danger-fg bg-danger-soft", P1: "text-warning-fg bg-warning-soft", P2: "text-accent-fg bg-accent-soft", P3: "text-fg-2 bg-sunken" };

export function SeloPrioridade({ p }: { p: Card["prioridade"] }) {
  return <span className={cx("tabular inline-grid h-5 place-items-center rounded-md px-1.5 text-legenda font-semibold", COR_PRIO[p] ?? "bg-sunken text-fg-2")} title={`Prioridade ${prioridadeInfo(p).nome}`}>{p}</span>;
}

export function IconeTipo({ tipo }: { tipo: Card["tipo"] }) {
  const t = tipoInfo(tipo);
  return <span className="inline-block size-2.5 shrink-0 rounded-[3px]" style={{ background: t.cor }} title={t.nome} />;
}

export function CartaoBoard({ card, bugsAbertos }: { card: Card; bugsAbertos: number }) {
  const abrirCard = useStore((s) => s.abrirCard);
  const lead = useStore((s) => (card.tipo === "lead" ? s.leads[card.id] : undefined));
  const dono = card.dono ? agentById[card.dono] : null;
  const validador = card.validador ? agentById[card.validador] : null;
  const vencendo = card.prazo !== null && card.prazo - Date.now() < 2 * DIA;
  const extras = card.etiquetas.filter((e) => e !== "lead");

  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/card", String(card.id));
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={() => abrirCard(card.id)}
      onKeyDown={(e) => e.key === "Enter" && abrirCard(card.id)}
      className="group relative cursor-pointer overflow-hidden rounded-card bg-surface p-3 shadow-1 transition-shadow hover:shadow-2"
    >
      {card.emValidacao && <span className="absolute inset-x-0 top-0 h-0.5 bg-success" title="Em validação" />}
      <div className="text-corpo font-medium leading-5 text-fg">{card.titulo}</div>

      {(lead || card.emValidacao || card.devolucoes > 0 || bugsAbertos > 0 || card.bloqueado || vencendo || card.nivel !== "N1" || extras.length > 0 || card.demo) && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {lead && <Etiqueta tom={lead.nota >= 80 ? "sucesso" : lead.nota >= 50 ? "alerta" : "neutro"}>nota {lead.nota}</Etiqueta>}
          {lead?.dados.cidade && <Etiqueta>{lead.dados.cidade.valor}</Etiqueta>}
          {card.emValidacao && validador && <Etiqueta tom="sucesso" icone={ShieldCheck}>{validador.nome} validando</Etiqueta>}
          {card.devolucoes > 0 && <Etiqueta tom="alerta" icone={RotateCcw}>{card.devolucoes}×</Etiqueta>}
          {bugsAbertos > 0 && <Etiqueta tom="perigo" icone={Bug}>{bugsAbertos}</Etiqueta>}
          {card.severidade && <Etiqueta tom="perigo">{card.severidade}</Etiqueta>}
          {card.bloqueado && <Etiqueta tom="perigo" icone={Lock}>bloqueado</Etiqueta>}
          {vencendo && <Etiqueta tom="alerta" icone={CalendarClock}>prazo</Etiqueta>}
          {card.nivel !== "N1" && <Etiqueta tom="info">{card.nivel}</Etiqueta>}
          {extras.slice(0, 2).map((e) => <Etiqueta key={e}>{e}</Etiqueta>)}
          {extras.length > 2 && <Etiqueta>+{extras.length - 2}</Etiqueta>}
          {card.demo && <Etiqueta>demo</Etiqueta>}
        </div>
      )}

      <div className="mt-2.5 flex items-center gap-1.5">
        <IconeTipo tipo={card.tipo} />
        <span className="tabular text-legenda font-medium text-fg-3">{card.chave}</span>
        <SeloPrioridade p={card.prioridade} />
        <div className="flex-1" />
        <div className="flex -space-x-1.5">
          {validador && validador.id !== dono?.id && (
            <span title={`Validador: ${validador.nome}`} className="rounded-full opacity-70 ring-2 ring-surface"><Avatarzinho agent={validador} tamanho={24} /></span>
          )}
          {dono && <span title={`Responsável: ${dono.nome}`} className="rounded-full ring-2 ring-surface"><Avatarzinho agent={dono} tamanho={24} /></span>}
        </div>
      </div>
    </div>
  );
}

/** Linha de card para listas (Caixa de entrada, escritório, perfil). */
export function LinhaCard({ card, acao, detalhe }: { card: Card; acao?: React.ReactNode; detalhe?: React.ReactNode }) {
  const abrirCard = useStore((s) => s.abrirCard);
  const dono = card.dono ? agentById[card.dono] : null;
  const col = colunaDe(card.fluxo, card.coluna);
  return (
    <div className="group flex items-center gap-3 rounded-ctl px-2 py-2 hover:bg-hover">
      <button type="button" onClick={() => abrirCard(card.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        {dono ? <Avatarzinho agent={dono} tamanho={28} /> : <CircleDot className="size-7 p-1 text-fg-3" />}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-corpo text-fg">{card.titulo}</span>
          <span className="flex items-center gap-1.5 text-legenda text-fg-3">
            <IconeTipo tipo={card.tipo} />
            <span className="tabular">{card.chave}</span>·<span className="truncate">{detalhe ?? `${nomeDaSala(card.sala)} · ${col?.nome ?? card.coluna}`}</span>·<span>{quando(card.atualizadoEm)}</span>
          </span>
        </span>
        <SeloPrioridade p={card.prioridade} />
      </button>
      {acao}
    </div>
  );
}
