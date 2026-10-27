import { useEffect } from "react";
import { useStore } from "../store.ts";
import { tocarNotificacao } from "../sons.ts";

/** Aviso de conquista desbloqueada, no alto da tela, por alguns segundos. */
export function AvisoConquista() {
  const c = useStore((s) => s.conquistaNova);
  useEffect(() => {
    if (!c) return;
    tocarNotificacao();
    const t = setTimeout(() => useStore.setState({ conquistaNova: null }), 7000);
    return () => clearTimeout(t);
  }, [c]);
  if (!c) return null;
  return (
    <button
      onClick={() => {
        useStore.setState({ conquistaNova: null });
        useStore.getState().setRotinaAberta(true, "conquistas");
      }}
      className="pointer-events-auto absolute left-1/2 top-20 z-50 flex -translate-x-1/2 items-center gap-3 rounded-2xl bg-[#1f2430] px-4 py-3 text-left text-white shadow-xl ring-2 ring-amber-300"
    >
      <span className="text-3xl">{c.icone}</span>
      <span>
        <span className="block text-[10px] font-semibold uppercase tracking-wide text-amber-300">Conquista desbloqueada</span>
        <span className="block text-sm font-bold">{c.nome}</span>
        <span className="block text-[11px] text-white/70">{c.descricao}</span>
      </span>
    </button>
  );
}
