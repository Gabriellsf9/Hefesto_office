import { agentsByRoom, rooms } from "@empresa/org";
import { useStore } from "../store.ts";
import { usePaineis } from "../paineis.ts";
import { BotaoMinimizar, Recolhido } from "./Minimizavel.tsx";

/** Atalho para pular de sala em sala, como o minimapa de um jogo. */
export function RoomList() {
  const estados = useStore((s) => s.estados);
  const salaSelecionada = useStore((s) => s.salaSelecionada);
  const selecionarSala = useStore((s) => s.selecionarSala);
  const minimizado = usePaineis((s) => s.minimizados.salas);

  if (minimizado) return <Recolhido id="salas" rotulo="Salas" className="left-4 top-24" />;

  return (
    <nav className="painel scroll-fino pointer-events-auto absolute left-4 top-24 max-h-[calc(100%-22rem)] w-56 overflow-y-auto p-2">
      <div className="flex items-center pb-1 pl-2 pt-0.5">
        <span className="flex-1 text-[10px] font-semibold uppercase tracking-wide text-black/45">Salas</span>
        <BotaoMinimizar id="salas" />
      </div>
      {rooms.map((r) => {
        const membros = agentsByRoom(r.id);
        const ativos = membros.filter((a) => (estados[a.id]?.status ?? "ocioso") !== "ocioso").length;
        const sel = salaSelecionada === r.id;
        return (
          <button
            key={r.id}
            onClick={() => selecionarSala(r.id)}
            className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition ${
              sel ? "bg-[#1f2430] text-white" : "hover:bg-black/5"
            }`}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.cor }} />
            <span className="flex-1 truncate font-medium">{r.nome}</span>
            {membros.length > 0 && (
              <span className={`text-[10px] ${sel ? "text-white/60" : "text-black/40"}`}>
                {ativos > 0 ? <b className={sel ? "text-white" : "text-blue-600"}>{ativos}</b> : 0}/{membros.length}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
