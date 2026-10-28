import { colunaDe, type Card } from "@empresa/shared";
import { gerarArquivo } from "./arquivos.ts";
import { listarCards, ultimaEntrega } from "./tarefas.ts";
import { fichaDoProjeto } from "./projetos.ts";

// Relatório para cliente: o andamento de um projeto em PDF, para você mandar a quem contratou.
// Só o que interessa a ele (o que foi entregue, o que está em andamento, o que vem a seguir),
// sem custos internos, nomes de agentes, debates ou devoluções.

const tipo = (c: Card) => colunaDe(c.fluxo, c.coluna)?.tipo;

export async function relatorioParaCliente(projetoId: number, cliente?: string): Promise<{ url: string; nome: string }> {
  const projeto = fichaDoProjeto(projetoId);
  const cards = listarCards().filter((c) => c.projetoId === projetoId && !c.demo && !c.etiquetas.includes("pedido"));
  const grupo = (f: (c: Card) => boolean) => cards.filter(f).sort((a, b) => a.atualizadoEm - b.atualizadoEm);
  const entregues = grupo((c) => tipo(c) === "feito");
  const aprovar = grupo((c) => tipo(c) === "ceo");
  const andamento = grupo((c) => ["trabalho", "validacao", "bug"].includes(tipo(c) ?? "") || c.emValidacao);
  const proximos = grupo((c) => tipo(c) === "fila" && c.coluna !== "backlog");
  const item = (c: Card) => {
    const e = ultimaEntrega(c.id);
    return `- **${c.titulo}**${e ? ` — ${e.resumo}` : ""}`;
  };
  const secao = (titulo: string, lista: Card[]) => (lista.length ? `## ${titulo}\n${lista.map(item).join("\n")}` : "");
  const total = entregues.length + aprovar.length + andamento.length + proximos.length;
  const pct = total ? Math.round(((entregues.length + aprovar.length * 0.9) / total) * 100) : 0;
  const nome = projeto?.nome ?? `Projeto ${projetoId}`;
  const md = [
    `# ${nome} — relatório de andamento`,
    `${cliente ? `Para: ${cliente} · ` : ""}${new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}`,
    `**Andamento:** ${pct}% (${entregues.length} entregue(s), ${aprovar.length} em revisão final, ${andamento.length} em andamento, ${proximos.length} a seguir).`,
    secao("Entregue", entregues),
    secao("Em revisão final", aprovar),
    secao("Em andamento", andamento),
    secao("Próximos passos", proximos),
  ]
    .filter(Boolean)
    .join("\n\n");
  const data = new Date().toLocaleDateString("sv-SE");
  return gerarArquivo(0, "pdf", `relatorio-${nome}-${data}`, md);
}
