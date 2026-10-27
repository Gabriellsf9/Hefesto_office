import { roomById } from "@empresa/org";
import { useStore } from "../store.ts";
import { hora } from "./SidePanel.tsx";
import { usePaineis } from "../paineis.ts";
import { BotaoMinimizar, Recolhido } from "./Minimizavel.tsx";

/** "Acontecendo agora": os últimos eventos de toda a empresa. */
export function Feed() {
  const feed = useStore((s) => s.feed);
  const selecionarSala = useStore((s) => s.selecionarSala);
  const minimizado = usePaineis((s) => s.minimizados.feed);
  const itens = feed.slice(-6).reverse();
  if (!itens.length) return null;
  if (minimizado) return <Recolhido id="feed" rotulo="Acontecendo agora" cor={roomById[itens[0]!.sala].cor} className="bottom-4 left-4" />;

  return (
    <div className="painel pointer-events-auto absolute bottom-4 left-4 w-72 p-3">
      <div className="-mr-1.5 -mt-1 mb-1 flex items-center">
        <span className="flex-1 text-[10px] font-semibold uppercase tracking-wide text-black/45">Acontecendo agora</span>
        <BotaoMinimizar id="feed" />
      </div>
      <ul className="space-y-1.5">
        {itens.map((f) => (
          <li key={f.id}>
            <button onClick={() => selecionarSala(f.sala)} className="flex w-full gap-2 text-left text-[11px] hover:opacity-70">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: roomById[f.sala].cor }} />
              <span className="flex-1 text-black/75">{f.texto}</span>
              <span className="shrink-0 tabular-nums text-black/35">{hora(f.ts)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
