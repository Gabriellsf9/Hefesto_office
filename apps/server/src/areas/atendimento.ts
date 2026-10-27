import { colunaDeEntrada, type Card } from "@empresa/shared";
import { postFeed } from "../bus.ts";
import { criarCard, editarCard, ErroCard } from "../tarefas.ts";
import { ErroEntrada, ferramenta, type Ferramenta } from "../agentes/loop.ts";

// Customer Success (Fase 6): atendimentos. O CEO cola a mensagem do cliente; o Suporte faz a
// triagem (prioridade e prazo), escreve a resposta pronta, abre bug para o QA quando é defeito e
// propõe artigo para a base de conhecimento quando a dúvida se repete. Responder é do CEO (N2).

const PRAZOS: Record<string, string> = { P0: "1 hora", P1: "4 horas", P2: "1 dia útil", P3: "3 dias úteis" };

export function abrirAtendimento(d: { cliente?: unknown; canal?: unknown; mensagem?: unknown }): Card {
  const cliente = typeof d.cliente === "string" && d.cliente.trim() ? d.cliente.trim().slice(0, 120) : "Cliente";
  const canal = typeof d.canal === "string" && d.canal.trim() ? d.canal.trim().slice(0, 40) : "e-mail";
  if (typeof d.mensagem !== "string" || !d.mensagem.trim()) throw new ErroCard("Cole a mensagem do cliente.");
  const card = criarCard(
    {
      titulo: `Atendimento: ${cliente}`,
      sala: "cs",
      fluxo: "geral",
      coluna: colunaDeEntrada("geral"),
      tipo: "tarefa",
      dono: "suporte",
      validador: "cs-manager",
      nivel: "N2",
      prioridade: "P2",
      etiquetas: ["atendimento", canal.toLowerCase()],
      descricao: `## Mensagem do cliente (${canal})
${d.mensagem.trim().slice(0, 10_000)}

## Como atender
1. Faça a triagem com triagem_atendimento: prioridade pelo impacto (P0 sistema fora do ar para muitos; P1 algo importante parado; P2 problema com contorno; P3 dúvida ou pedido).
2. Se for defeito, abra um bug para o QA com pedir_para_outra_area (passos, esperado × obtido, conta afetada).
3. Se a dúvida for comum, proponha um artigo com registrar_conhecimento.
4. Entregue a RESPOSTA PRONTA para o cliente: reconheça o problema, resolva ou diga o próximo passo com prazo, sem jargão, no tom da marca. O CEO revisa e envia.`,
      criterios: "- Prioridade e prazo definidos\n- Resposta empática, objetiva e com próximo passo\n- Bug aberto quando é defeito\n- Nada prometido que o produto não faz",
    },
    "voce",
  );
  postFeed("cs", "suporte", `Novo atendimento de ${cliente} (${canal}): ${card.chave}`);
  return card;
}

export function ferramentasDeAtendimento(card: Card): Ferramenta[] {
  if (!card.etiquetas.includes("atendimento")) return [];
  return [
    ferramenta(
      "triagem_atendimento",
      "Define a prioridade do atendimento pelo impacto e o prazo de resposta. Não termina a sua vez.",
      {
        prioridade: { type: "string", enum: ["P0", "P1", "P2", "P3"] },
        categoria: { type: "string", enum: ["defeito", "duvida", "pedido", "cobranca", "cancelamento", "elogio", "outro"] },
        motivo: { type: "string" },
      },
      ["prioridade", "categoria"],
      (e) => {
        const p = String(e.prioridade);
        if (!PRAZOS[p]) throw new ErroEntrada("Prioridade inválida.");
        const etiquetas = [...new Set([...card.etiquetas.filter((x) => !x.startsWith("categoria:")), `categoria:${String(e.categoria)}`])];
        editarCard(card.id, { prioridade: p as Card["prioridade"], etiquetas, prazo: Date.now() + ({ P0: 1, P1: 4, P2: 24, P3: 72 }[p as "P0"] ?? 24) * 3_600_000 });
        return { texto: `Triagem feita: ${p} (${String(e.categoria)}), responder em até ${PRAZOS[p]}.` };
      },
    ),
  ];
}
