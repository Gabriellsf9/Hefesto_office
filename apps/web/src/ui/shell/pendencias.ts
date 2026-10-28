import { useMemo } from "react";
import { colunaDe, prioridades, type Card, type ContatoWhatsapp, type ItemConhecimento, type PedidoMcp } from "@empresa/shared";
import { useStore } from "../../store.ts";
import { escritorioAtivo, escritorioDoFluxoId } from "@empresa/org";

// Tudo o que espera o CEO, num lugar só (Caixa de entrada). Ordem: urgência, depois antiguidade.

export type Pendencia =
  | { tipo: "aprovacao"; chave: string; card: Card; ts: number; peso: number }
  | { tipo: "bloqueado"; chave: string; card: Card; ts: number; peso: number }
  | { tipo: "limite"; chave: string; card: Card; ts: number; peso: number }
  | { tipo: "acao"; chave: string; pedido: PedidoMcp; ts: number; peso: number }
  | { tipo: "whatsapp"; chave: string; contato: ContatoWhatsapp; ts: number; peso: number }
  | { tipo: "conhecimento"; chave: string; item: ItemConhecimento; ts: number; peso: number };

const pesoPrioridade = (p: Card["prioridade"]) => prioridades.findIndex((x) => x.id === p);

export function usePendencias(): Pendencia[] {
  const cards = useStore((s) => s.cards);
  const pedidos = useStore((s) => s.pedidosMcp);
  const contatos = useStore((s) => s.contatosWa);
  const conhecimento = useStore((s) => s.conhecimento);
  return useMemo(() => {
    const lista: Pendencia[] = [];
    const aqui = escritorioAtivo();
    for (const c of Object.values(cards)) {
      // Cards de outros escritórios aparecem quando você entra neles.
      if (escritorioDoFluxoId(c.fluxo) !== aqui) continue;
      if (colunaDe(c.fluxo, c.coluna)?.tipo === "ceo") lista.push({ tipo: "aprovacao", chave: `card-${c.id}`, card: c, ts: c.atualizadoEm, peso: 20 + pesoPrioridade(c.prioridade) });
      else if (c.bloqueado && c.etiquetas.includes("limite-de-gasto")) lista.push({ tipo: "limite", chave: `lim-${c.id}`, card: c, ts: c.atualizadoEm, peso: 8 + pesoPrioridade(c.prioridade) });
      else if (c.bloqueado) lista.push({ tipo: "bloqueado", chave: `bloq-${c.id}`, card: c, ts: c.atualizadoEm, peso: 10 + pesoPrioridade(c.prioridade) });
    }
    for (const p of pedidos) if (p.status === "pendente") lista.push({ tipo: "acao", chave: `acao-${p.id}`, pedido: p, ts: p.criadoEm, peso: 12 });
    for (const c of Object.values(contatos)) {
      if (c.pendentes > 0 || (c.humano && c.naoLidas > 0)) lista.push({ tipo: "whatsapp", chave: `wa-${c.telefone}`, contato: c, ts: c.ultimaMensagem?.ts ?? 0, peso: c.humano ? 5 : 15 });
    }
    for (const i of conhecimento) if (!i.aprovado) lista.push({ tipo: "conhecimento", chave: `con-${i.id}`, item: i, ts: i.atualizadoEm, peso: 40 });
    // P0 sempre no topo, depois por peso e pelo mais antigo.
    return lista.sort((a, b) => a.peso - b.peso || a.ts - b.ts);
  }, [cards, pedidos, contatos, conhecimento]);
}
