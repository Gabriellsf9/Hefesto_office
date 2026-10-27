import { useEffect } from "react";
import { useStore } from "../store.ts";
import { tocarNotificacao } from "../sons.ts";

/** Toca um aviso curto quando aparece algo novo esperando a sua aprovação (com os efeitos sonoros ligados). */
export function useAvisoSonoro() {
  useEffect(() => {
    const esperando = (cards: ReturnType<typeof useStore.getState>["cards"]) =>
      Object.values(cards).filter((c) => c.coluna === "aguardando-ceo" && !c.demo).length;
    let antes = esperando(useStore.getState().cards);
    return useStore.subscribe((s, anterior) => {
      if (s.cards === anterior.cards) return;
      const agora = esperando(s.cards);
      // A primeira carga (ao conectar) não é novidade.
      if (!Object.keys(anterior.cards).length) {
        antes = agora;
        return;
      }
      if (agora > antes) tocarNotificacao();
      antes = agora;
    });
  }, []);
}
