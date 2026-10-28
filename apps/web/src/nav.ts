import { create } from "zustand";

// Navegação por endereço (#/area/sub/id?card=25): cada página e cada card têm link, o voltar do
// navegador funciona e recarregar volta para o mesmo lugar. DESIGN-INTERFACE.md §3.

export type Area = "escritorio" | "entrada" | "conversas" | "trabalho" | "clientes" | "equipe" | "empresa" | "operacao" | "config" | "escritorios";
const AREAS: Area[] = ["escritorio", "entrada", "conversas", "trabalho", "clientes", "equipe", "empresa", "operacao", "config", "escritorios"];

export interface Rota {
  area: Area;
  sub: string | null;
  id: string | null;
  card: number | null;
}

function ler(): Rota {
  const [caminho, busca] = location.hash.replace(/^#\/?/, "").split("?");
  const partes = (caminho ?? "").split("/").filter(Boolean).map(decodeURIComponent);
  const area = AREAS.includes(partes[0] as Area) ? (partes[0] as Area) : "escritorio";
  const card = Number(new URLSearchParams(busca ?? "").get("card")) || null;
  return { area, sub: partes[1] ?? null, id: partes[2] ?? null, card };
}

function escrever(r: Rota): string {
  const caminho = [r.area, r.sub, r.id].filter((x): x is string => !!x).map(encodeURIComponent).join("/");
  return `#/${caminho}${r.card ? `?card=${r.card}` : ""}`;
}

export const useNav = create<{ rota: Rota }>(() => ({ rota: ler() }));

/** Vai para uma página. sub/id omitidos = padrão da área. */
export function navegar(area: Area, sub: string | null = null, id: string | null = null, opcoes: { substituir?: boolean; manterCard?: boolean } = {}) {
  const atual = useNav.getState().rota;
  const r: Rota = { area, sub, id, card: opcoes.manterCard ? atual.card : null };
  const hash = escrever(r);
  if (hash === location.hash) return;
  if (opcoes.substituir) history.replaceState(null, "", hash);
  else history.pushState(null, "", hash);
  useNav.setState({ rota: r });
}

/** Abre/fecha o card por cima da página atual (sem trocar de página). */
export function definirCardNaRota(card: number | null) {
  const atual = useNav.getState().rota;
  if (atual.card === card) return;
  const r = { ...atual, card };
  history[card ? "pushState" : "replaceState"](null, "", escrever(r));
  useNav.setState({ rota: r });
}

if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => useNav.setState({ rota: ler() }));
  window.addEventListener("hashchange", () => useNav.setState({ rota: ler() }));
}
