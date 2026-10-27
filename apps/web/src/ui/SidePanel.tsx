import { useState } from "react";
import type { Agent, RoomId } from "@empresa/shared";
import { agentById, agentsByRoom, roomById } from "@empresa/org";
import { useStore } from "../store.ts";
import { statusInfo } from "../status.ts";
import { escolherVoz, falar, pararDeFalar, vozEscolhida, vozesDisponiveis } from "../voz/falar.ts";
import { usePaineis } from "../paineis.ts";
import { BotaoMinimizar, Recolhido } from "./Minimizavel.tsx";

const nomesModelo: Record<Agent["modelo"], string> = {
  "claude-opus-5-5": "Opus 5.5",
  "claude-sonnet-5-5": "Sonnet 5.5",
  "claude-haiku-5-5": "Haiku 5.5",
};

export function SidePanel() {
  const sala = useStore((s) => s.salaSelecionada);
  const agente = useStore((s) => s.agenteSelecionado);
  const visaoGeral = useStore((s) => s.visaoGeral);
  const entrevistaAberta = useStore((s) => s.entrevistaAberta);
  const minimizado = usePaineis((s) => s.minimizados.lateral);
  if (!sala || entrevistaAberta) return null;
  if (minimizado) {
    const rotulo = agente ? `${agentById[agente]!.nome} · ${roomById[sala].nome}` : roomById[sala].nome;
    return <Recolhido id="lateral" rotulo={rotulo} cor={roomById[sala].cor} className="right-4 top-24" />;
  }

  return (
    <aside className="painel scroll-fino pointer-events-auto absolute bottom-4 right-4 top-24 flex w-[380px] flex-col overflow-hidden">
      <div className="absolute right-3 top-3 z-10 flex items-center gap-0.5">
        <BotaoMinimizar id="lateral" className="h-7 w-7" />
        <button
          onClick={visaoGeral}
          className="grid h-7 w-7 place-items-center rounded-full text-black/50 hover:bg-black/5"
          aria-label="Fechar"
        >
          ✕
        </button>
      </div>
      {agente ? <AgentView agent={agentById[agente]!} /> : <RoomView sala={sala} />}
    </aside>
  );
}

function RoomView({ sala }: { sala: RoomId }) {
  const room = roomById[sala];
  const membros = agentsByRoom(sala);
  const validador = room.validador ? agentById[room.validador] : null;
  const [aba, setAba] = useState<"conversa" | "entregas" | "linha">("linha");

  return (
    <>
      <div className="border-b border-black/5 p-4 pr-12">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full" style={{ background: room.cor }} />
          <h2 className="text-base font-bold">{room.nome}</h2>
        </div>
        <p className="mt-1 text-xs text-black/60">{room.descricao}</p>
        {validador && (
          <p className="mt-2 rounded-lg bg-teal-50 px-2.5 py-1.5 text-[11px] text-teal-800">
            Toda entrega é validada por <b>{validador.nome}</b> ({validador.cargo}) e depois por você.
          </p>
        )}
      </div>

      {membros.length > 0 && (
        <div className="border-b border-black/5 p-2">
          {membros.map((a) => (
            <AgentRow key={a.id} agent={a} />
          ))}
        </div>
      )}

      <div className="flex gap-1 border-b border-black/5 px-3 pt-2">
        {(
          [
            ["linha", "Linha do tempo"],
            ["conversa", "Conversa"],
            ["entregas", "Entregas"],
          ] as const
        ).map(([id, rotulo]) => (
          <button
            key={id}
            onClick={() => setAba(id)}
            className={`rounded-t-lg px-3 py-1.5 text-xs font-medium ${aba === id ? "bg-black/5 text-black" : "text-black/50 hover:text-black"}`}
          >
            {rotulo}
          </button>
        ))}
      </div>

      <div className="scroll-fino min-h-0 flex-1 overflow-y-auto p-3">
        {aba === "linha" && <Timeline sala={sala} />}
        {aba === "conversa" && (
          <Vazio texto="Aqui você vai ler o debate entre os agentes desta sala e o validador. Liga na Fase 2." />
        )}
        {aba === "entregas" && (
          <Vazio texto="Código, protótipos, relatórios de teste e posts aparecem aqui, com o status de validação. Liga na Fase 2." />
        )}
      </div>
    </>
  );
}

function AgentRow({ agent }: { agent: Agent }) {
  const estado = useStore((s) => s.estados[agent.id]);
  const tempoLivre = useStore((s) => s.tempoLivre[agent.id]);
  const selecionarAgente = useStore((s) => s.selecionarAgente);
  const info = statusInfo[estado?.status ?? "ocioso"];
  return (
    <button onClick={() => selecionarAgente(agent.id)} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-black/5">
      <Avatarzinho agent={agent} />
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold">
          {agent.nome} {agent.lider && <span className="ml-1 rounded bg-amber-100 px-1 text-[9px] font-bold text-amber-700">LÍDER</span>}
        </div>
        <div className="truncate text-[11px] text-black/50">{estado?.atividade ?? tempoLivre ?? agent.cargo}</div>
      </div>
      <span className="flex items-center gap-1 text-[10px] font-medium" style={{ color: info.cor }}>
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: info.cor }} />
        {info.rotulo}
      </span>
    </button>
  );
}

function AgentView({ agent }: { agent: Agent }) {
  const estado = useStore((s) => s.estados[agent.id]);
  const tempoLivre = useStore((s) => s.tempoLivre[agent.id]);
  const feed = useStore((s) => s.feed);
  const selecionarSala = useStore((s) => s.selecionarSala);
  const info = statusInfo[estado?.status ?? "ocioso"];
  const room = roomById[agent.sala];
  const meus = feed.filter((f) => f.agenteId === agent.id).slice(-15).reverse();

  return (
    <div className="scroll-fino overflow-y-auto">
      <div className="border-b border-black/5 p-4 pr-12">
        <button onClick={() => selecionarSala(agent.sala)} className="mb-2 text-[11px] text-black/50 hover:text-black">
          ← {room.nome}
        </button>
        <div className="flex items-center gap-3">
          <Avatarzinho agent={agent} grande />
          <div>
            <h2 className="text-base font-bold">{agent.nome}</h2>
            <p className="text-xs text-black/60">{agent.cargo}</p>
          </div>
        </div>
        <div className="mt-3 rounded-lg px-3 py-2 text-xs" style={{ background: `${info.cor}18` }}>
          <div className="font-semibold" style={{ color: info.cor }}>
            {info.rotulo}
          </div>
          {(estado?.atividade ?? tempoLivre) && <div className="mt-0.5 text-black/70">{estado?.atividade ?? tempoLivre}</div>}
        </div>
      </div>

      <div className="space-y-3 p-4 text-xs">
        <Campo rotulo="Perfil">{agent.persona}</Campo>
        <Campo rotulo="Modelo">{nomesModelo[agent.modelo]}</Campo>
        <Campo rotulo="Voz">
          <SeletorDeVoz agenteId={agent.id} />
        </Campo>
        <Campo rotulo="Ferramentas">
          {agent.ferramentas.length ? (
            <div className="flex flex-wrap gap-1">
              {agent.ferramentas.map((f) => (
                <span key={f} className="rounded-md bg-black/5 px-1.5 py-0.5 text-[11px]">
                  {f}
                </span>
              ))}
            </div>
          ) : (
            "Só conversa e documentos"
          )}
        </Campo>
        <Campo rotulo="Costuma acionar">
          {agent.podeChamar.includes("*")
            ? "Toda a empresa"
            : agent.podeChamar.map((id) => agentById[id]?.nome ?? roomById[id as RoomId]?.nome ?? id).join(", ")}
        </Campo>
        <Campo rotulo="Últimas atividades">
          {meus.length ? (
            <ul className="space-y-1">
              {meus.map((f) => (
                <li key={f.id} className="text-black/70">
                  <span className="text-black/35">{hora(f.ts)}</span> {f.texto}
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-black/45">Nenhuma ainda.</span>
          )}
        </Campo>
      </div>
    </div>
  );
}

function Timeline({ sala }: { sala: RoomId }) {
  const feed = useStore((s) => s.feed);
  const itens = feed.filter((f) => f.sala === sala).slice(-40).reverse();
  if (!itens.length) return <Vazio texto="Nada aconteceu nesta sala ainda. Ligue o modo demonstração para ver o fluxo." />;
  return (
    <ul className="space-y-2">
      {itens.map((f) => (
        <li key={f.id} className="flex gap-2 text-xs">
          <span className="shrink-0 tabular-nums text-black/35">{hora(f.ts)}</span>
          <span className="text-black/75">{f.texto}</span>
        </li>
      ))}
    </ul>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-black/40">{rotulo}</div>
      <div className="text-black/75">{children}</div>
    </div>
  );
}

function Vazio({ texto }: { texto: string }) {
  return <p className="px-4 py-8 text-center text-xs text-black/45">{texto}</p>;
}

export function Avatarzinho({ agent, grande }: { agent: Agent; grande?: boolean }) {
  const s = grande ? "h-11 w-11 text-sm" : "h-7 w-7 text-[10px]";
  return (
    <span
      className={`${s} grid shrink-0 place-items-center rounded-full font-bold text-white ring-2 ring-white`}
      style={{ background: agent.aparencia.camisa }}
    >
      {agent.nome.slice(0, 1)}
    </span>
  );
}

export const hora = (ts: number) => new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

/** Voz do Mac usada por este agente quando ele fala (automática ou escolhida por você). */
function SeletorDeVoz({ agenteId }: { agenteId: string }) {
  const [escolhida, setEscolhida] = useState<string | null>(() => vozEscolhida(agenteId));
  const vozes = vozesDisponiveis();
  if (!vozes.length) return <span className="text-black/45">Nenhuma voz em português instalada no Mac.</span>;
  return (
    <div className="flex items-center gap-1.5">
      <select
        value={escolhida ?? ""}
        onChange={(e) => {
          const v = e.target.value || null;
          escolherVoz(agenteId, v);
          setEscolhida(v);
        }}
        className="h-7 min-w-0 flex-1 rounded-lg bg-black/5 px-1.5 text-[11px] outline-none"
      >
        <option value="">Automática</option>
        {vozes.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
      <button
        onClick={() => {
          pararDeFalar();
          falar(`Oi! Eu sou ${agentById[agenteId]?.nome ?? ""}.`, agenteId);
        }}
        className="h-7 rounded-lg px-2 text-[11px] ring-1 ring-black/10 hover:bg-black/5"
      >
        Ouvir
      </button>
    </div>
  );
}
