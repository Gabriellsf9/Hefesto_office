import { useEffect, useRef } from "react";

// Gerente de camadas: janelas, gavetas, popovers e a paleta ⌘K entram numa pilha.
// Esc fecha só a de cima; o foco fica preso na camada aberta e volta para quem abriu.

interface Camada {
  id: number;
  fechar: () => void;
  el: () => HTMLElement | null;
  prender: boolean;
}
const pilha: Camada[] = [];
let proximo = 1;

function aoTeclar(e: KeyboardEvent) {
  const topo = pilha.at(-1);
  if (!topo) return;
  if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    topo.fechar();
    return;
  }
  if (e.key === "Tab" && topo.prender) {
    const raiz = topo.el();
    if (!raiz) return;
    const focaveis = [...raiz.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter((x) => x.offsetParent !== null);
    if (!focaveis.length) return;
    const primeiro = focaveis[0]!;
    const ultimo = focaveis.at(-1)!;
    if (e.shiftKey && document.activeElement === primeiro) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primeiro.focus();
    }
  }
}
if (typeof window !== "undefined") window.addEventListener("keydown", aoTeclar, true);

export const haCamadaAberta = () => pilha.length > 0;

/** Registra uma camada enquanto `aberta`. Devolve a ref para o elemento raiz. */
export function useCamada<T extends HTMLElement>(aberta: boolean, fechar: () => void, opcoes: { prender?: boolean; focarAoAbrir?: boolean } = {}) {
  const ref = useRef<T>(null);
  const fecharRef = useRef(fechar);
  fecharRef.current = fechar;
  useEffect(() => {
    if (!aberta) return;
    const antes = document.activeElement as HTMLElement | null;
    const c: Camada = { id: proximo++, fechar: () => fecharRef.current(), el: () => ref.current, prender: opcoes.prender ?? true };
    pilha.push(c);
    if (opcoes.focarAoAbrir !== false) {
      requestAnimationFrame(() => {
        const raiz = ref.current;
        if (!raiz || raiz.contains(document.activeElement)) return;
        (raiz.querySelector<HTMLElement>("[data-autofoco]") ?? raiz).focus?.({ preventScroll: true });
      });
    }
    return () => {
      const i = pilha.findIndex((x) => x.id === c.id);
      if (i >= 0) pilha.splice(i, 1);
      if (antes && document.contains(antes)) antes.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberta]);
  return ref;
}
