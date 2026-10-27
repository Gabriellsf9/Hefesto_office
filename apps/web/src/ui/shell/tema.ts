import { create } from "zustand";

// Tema da interface: claro, escuro ou automático (segue o macOS). Fica salvo no navegador.

export type Tema = "auto" | "claro" | "escuro";
const CHAVE = "tema";

const ler = (): Tema => {
  try {
    const v = localStorage.getItem(CHAVE);
    return v === "claro" || v === "escuro" ? v : "auto";
  } catch {
    return "auto";
  }
};

function aplicar(t: Tema) {
  if (t === "auto") document.documentElement.removeAttribute("data-tema");
  else document.documentElement.setAttribute("data-tema", t);
}

export const useTema = create<{ tema: Tema }>(() => ({ tema: ler() }));
aplicar(useTema.getState().tema);

export function definirTema(t: Tema) {
  try {
    localStorage.setItem(CHAVE, t);
  } catch {}
  aplicar(t);
  useTema.setState({ tema: t });
}
