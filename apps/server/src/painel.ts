import { colunaDe, type Card } from "@empresa/shared";
import { agentById, escritorioDe, nomeDaSala, SEDE } from "@empresa/org";
import { db, getSetting, setSetting } from "./db.ts";
import { postChat } from "./bus.ts";
import { custoHoje, orcamentoDiario } from "./custo.ts";
import { listarCards, tetoDoCard } from "./tarefas.ts";
import { resumoChamadas } from "./chamadas.ts";
import { enviar as enviarTelegram, estadoTelegram } from "./telegram.ts";

// Painel do CEO: o dia da empresa numa tela só (entregas, gasto, o que espera você e onde há risco)
// e o relatório diário, que a Helena manda no fim do dia pelo chat e pelo Telegram.

export interface Painel {
  dia: string;
  entregues: { chave: string; titulo: string; sala: string; usd: number }[];
  concluidos: number;
  esperandoVoce: { chave: string; titulo: string; motivo: string }[];
  riscos: { chave: string; titulo: string; risco: string }[];
  gasto: { hoje: number; orcamento: number; taxaCache: number; chamadas: number; maisCaros: { chave: string; usd: number }[] };
  emAndamento: number;
  naFila: number;
}

const inicioDoDia = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const tipo = (c: Card) => colunaDe(c.fluxo, c.coluna)?.tipo;

export function montarPainel(escritorio = SEDE): Painel {
  const desde = inicioDoDia();
  const cards = listarCards().filter((c) => !c.demo && escritorioDe(c.sala) === escritorio);
  const porId = new Map(cards.map((c) => [c.id, c]));
  // Entregas de hoje: cards que receberam uma versão hoje.
  const ent = db.prepare("SELECT DISTINCT card_id FROM entregas WHERE ts >= ?").all(desde) as { card_id: number }[];
  const entregues = ent
    .map((e) => porId.get(e.card_id))
    .filter((c): c is Card => !!c)
    .map((c) => ({ chave: c.chave, titulo: c.titulo, sala: nomeDaSala(c.sala), usd: c.custoUsd }));
  const concluidosHoje = (db.prepare("SELECT DISTINCT card_id FROM comentarios WHERE tipo = 'movimento' AND ts >= ?").all(desde) as { card_id: number }[])
    .map((r) => porId.get(r.card_id))
    .filter((c): c is Card => !!c && tipo(c) === "feito").length;

  const esperandoVoce = cards
    .filter((c) => tipo(c) === "ceo" || c.bloqueado)
    .map((c) => ({
      chave: c.chave,
      titulo: c.titulo,
      motivo: c.etiquetas.includes("limite-de-gasto") ? "parou no limite de gasto" : c.bloqueado ? "pergunta para você" : "pronto para aprovar",
    }));

  const riscos: Painel["riscos"] = [];
  for (const c of cards) {
    if (["feito", "perdido"].includes(tipo(c) ?? "")) continue;
    if (c.prioridade === "P0") riscos.push({ chave: c.chave, titulo: c.titulo, risco: "prioridade P0 aberta" });
    if (c.devolucoes >= 3) riscos.push({ chave: c.chave, titulo: c.titulo, risco: `devolvido ${c.devolucoes} vezes` });
    if (c.custoUsd >= tetoDoCard(c) * 0.8 && !c.etiquetas.includes("limite-de-gasto")) riscos.push({ chave: c.chave, titulo: c.titulo, risco: `perto do limite de gasto (US$ ${c.custoUsd.toFixed(2)})` });
    if (c.prazo && c.prazo < Date.now()) riscos.push({ chave: c.chave, titulo: c.titulo, risco: "prazo vencido" });
  }

  const ch = resumoChamadas((Date.now() - desde) / 3600_000);
  return {
    dia: new Date().toLocaleDateString("pt-BR"),
    entregues,
    concluidos: concluidosHoje,
    esperandoVoce,
    riscos,
    gasto: {
      hoje: custoHoje(),
      orcamento: orcamentoDiario(),
      taxaCache: ch.total.taxaCache,
      chamadas: ch.total.chamadas,
      maisCaros: ch.porCard.slice(0, 5).map((p) => ({ chave: porId.get(p.cardId)?.chave ?? `#${p.cardId}`, usd: p.usd })),
    },
    emAndamento: cards.filter((c) => ["trabalho", "validacao"].includes(tipo(c) ?? "") || c.emValidacao).length,
    naFila: cards.filter((c) => tipo(c) === "fila" && c.coluna !== "backlog").length,
  };
}

/** O relatório do dia em texto (para o chat e para o Telegram). */
export function relatorioDoDia(p = montarPainel()): string {
  const usd = (v: number) => `US$ ${v.toFixed(2)}`;
  const linhas = [
    `Resumo de ${p.dia}: ${p.entregues.length} entrega(s), ${p.concluidos} card(s) concluído(s), ${usd(p.gasto.hoje)} de ${usd(p.gasto.orcamento)} gastos (${Math.round(p.gasto.taxaCache * 100)}% da entrada veio do cache).`,
  ];
  if (p.esperandoVoce.length) linhas.push(`Esperando você (${p.esperandoVoce.length}): ${p.esperandoVoce.slice(0, 8).map((e) => `${e.chave} (${e.motivo})`).join(", ")}.`);
  if (p.riscos.length) linhas.push(`Riscos: ${p.riscos.slice(0, 6).map((r) => `${r.chave} ${r.risco}`).join("; ")}.`);
  if (p.gasto.maisCaros.length) linhas.push(`Mais caros hoje: ${p.gasto.maisCaros.map((m) => `${m.chave} ${usd(m.usd)}`).join(", ")}.`);
  linhas.push(`Agora: ${p.emAndamento} em andamento, ${p.naFila} na fila.`);
  return linhas.join("\n");
}

/** Hora do relatório diário (0–23) e se está ligado. */
export const configRelatorio = () => ({ ativo: getSetting("relatorio_ativo") !== "0", hora: Number(getSetting("relatorio_hora") ?? 18) });
export function definirRelatorio(c: { ativo?: boolean; hora?: number }) {
  if (typeof c.ativo === "boolean") setSetting("relatorio_ativo", c.ativo ? "1" : "0");
  if (typeof c.hora === "number" && c.hora >= 0 && c.hora <= 23) setSetting("relatorio_hora", String(Math.round(c.hora)));
  return configRelatorio();
}

/** Manda o relatório agora: chat da Helena e, se pareado, Telegram. */
export async function mandarRelatorio() {
  const texto = relatorioDoDia();
  postChat("chief-of-staff", texto);
  const tg = estadoTelegram();
  if (tg.ativo && tg.chatId) await enviarTelegram(`📊 <b>Resumo do dia</b>\n${texto.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!)}`).catch(() => {});
  setSetting("relatorio_ultimo_dia", new Date().toDateString());
  return texto;
}

/** Confere a cada 5 minutos se chegou a hora do relatório do dia (uma vez por dia). */
export function iniciarRelatorioDiario() {
  if (process.env.EMPRESA_SEM_REDE === "1" && process.env.EMPRESA_RELATORIO !== "1") return;
  setInterval(() => {
    const c = configRelatorio();
    if (!c.ativo || new Date().getHours() < c.hora || getSetting("relatorio_ultimo_dia") === new Date().toDateString()) return;
    if (!agentById["chief-of-staff"]) return;
    void mandarRelatorio();
  }, 5 * 60_000);
}
