import { create } from "zustand";

// Painéis da tela que podem ser minimizados para liberar a visão do escritório.
// A escolha fica salva neste navegador.

export type PainelId = "topo" | "salas" | "feed" | "chat" | "lateral" | "mapa";

const TODOS: PainelId[] = ["topo", "salas", "feed", "chat", "lateral", "mapa"];
const CHAVE = "empresa.paineisMinimizados";

type Minimizados = Record<PainelId, boolean>;

const nenhum = (): Minimizados => Object.fromEntries(TODOS.map((id) => [id, false])) as Minimizados;
const todos = (): Minimizados => Object.fromEntries(TODOS.map((id) => [id, true])) as Minimizados;

function carregar(): Minimizados {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE) ?? "{}") as Partial<Minimizados>;
    return { ...nenhum(), ...salvo };
  } catch {
    return nenhum();
  }
}

function salvar(m: Minimizados) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(m));
  } catch {
    /* navegador sem armazenamento: vale só nesta sessão */
  }
}

interface EstadoPaineis {
  minimizados: Minimizados;
  alternar: (id: PainelId) => void;
  minimizarTudo: () => void;
  expandirTudo: () => void;
}

export const usePaineis = create<EstadoPaineis>((set, get) => {
  const aplicar = (m: Minimizados) => {
    salvar(m);
    set({ minimizados: m });
  };
  return {
    minimizados: carregar(),
    alternar: (id) => aplicar({ ...get().minimizados, [id]: !get().minimizados[id] }),
    minimizarTudo: () => aplicar(todos()),
    expandirTudo: () => aplicar(nenhum()),
  };
});

export const algumAberto = (m: Minimizados) => TODOS.some((id) => !m[id]);

/** Atalho M: minimiza tudo ou, se já está tudo minimizado, expande tudo. */
export function alternarTudo() {
  const s = usePaineis.getState();
  if (algumAberto(s.minimizados)) s.minimizarTudo();
  else s.expandirTudo();
}
