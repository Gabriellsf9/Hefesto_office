import { useEffect } from "react";
import { alternarTudo, usePaineis, type PainelId } from "../paineis.ts";

/** Botão "–" no canto de um painel. */
export function BotaoMinimizar({ id, className = "" }: { id: PainelId; className?: string }) {
  const alternar = usePaineis((s) => s.alternar);
  return (
    <button
      onClick={() => alternar(id)}
      className={`grid h-6 w-6 shrink-0 place-items-center rounded-md text-sm leading-none text-black/45 hover:bg-black/5 hover:text-black ${className}`}
      title="Minimizar"
      aria-label="Minimizar"
    >
      –
    </button>
  );
}

/** O painel minimizado: uma etiqueta no mesmo lugar que expande de volta ao clicar. */
export function Recolhido({ id, rotulo, cor, extra, className }: {
  id: PainelId;
  rotulo: string;
  cor?: string;
  extra?: React.ReactNode;
  className: string;
}) {
  const alternar = usePaineis((s) => s.alternar);
  return (
    <button
      onClick={() => alternar(id)}
      className={`painel pointer-events-auto absolute flex items-center gap-2 px-3 py-2 text-xs font-semibold text-black/70 hover:text-black ${className}`}
      title="Expandir"
    >
      {cor && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: cor }} />}
      {rotulo}
      {extra}
      <span className="text-[10px] text-black/40">▸</span>
    </button>
  );
}

/** Tecla M (fora de campos de texto) minimiza ou expande todos os painéis. */
export function useAtalhoPaineis() {
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "m" || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(alvo.tagName))) return;
      e.preventDefault();
      alternarTudo();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, []);
}
