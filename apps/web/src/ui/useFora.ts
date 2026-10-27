import { useEffect, useRef } from "react";

/** Fecha um menu suspenso quando você clica fora dele ou aperta Esc. */
export function useFecharFora<T extends HTMLElement>(aberto: boolean, fechar: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!aberto) return;
    const clique = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) fechar();
    };
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && fechar();
    document.addEventListener("pointerdown", clique);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointerdown", clique);
      document.removeEventListener("keydown", tecla);
    };
  }, [aberto, fechar]);
  return ref;
}
