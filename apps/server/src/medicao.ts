import { agentById } from "@empresa/org";
import { colunaDe, type Card, type Medicao, type MedicaoModelo } from "@empresa/shared";
import { db } from "./db.ts";
import { listarCards } from "./tarefas.ts";
import { listarEvals } from "./evals.ts";
import { escolhas } from "./provedores.ts";

// Painel de medição: o que a empresa entrega por dia, quanto custa, quanto o CEO precisou entrar, e como cada modelo
// se sai nos cards de verdade (aprovado de primeira, tempo, velocidade) somado à nota dos evals. Daí sai a sugestão
// de modelo por agente: escolha por resultado medido, não por achismo.

const DIA = 86_400_000;
const MIN_CARDS = 3; // abaixo disso, pouco card para comparar
const tipo = (c: Card) => colunaDe(c.fluxo, c.coluna)?.tipo;
const pct = (parte: number, total: number) => (total ? Math.round((parte / total) * 100) : null);
const diaDe = (ts: number) => new Date(ts).toLocaleDateString("sv-SE");

export function calcularMedicao(agora = Date.now(), dias = 30): Medicao {
  const desde = agora - dias * DIA;
  const cards = listarCards().filter((c) => !c.demo);
  const porId = new Map(cards.map((c) => [c.id, c]));

  // Quando cada card terminou: o último movimento de um card que está numa coluna "feito".
  const terminou = new Map<number, number>();
  for (const r of db.prepare("SELECT card_id, MAX(ts) AS ts FROM comentarios WHERE tipo = 'movimento' GROUP BY card_id").all() as { card_id: number; ts: number }[]) {
    const c = porId.get(r.card_id);
    if (c && tipo(c) === "feito") terminou.set(c.id, r.ts);
  }
  const feitos = [...terminou].filter(([, ts]) => ts >= desde).map(([id]) => porId.get(id)!);
  // Intervenção do CEO: comentou ou devolveu (mover e aprovar não contam; é o caminho normal).
  const comCeo = new Set(
    (db.prepare("SELECT DISTINCT card_id FROM comentarios WHERE autor = 'voce' AND tipo NOT IN ('movimento', 'aprovacao') AND ts >= ?").all(desde) as { card_id: number }[]).map((r) => r.card_id),
  );
  const devolucoes = db.prepare("SELECT ts FROM comentarios WHERE tipo = 'devolucao' AND ts >= ?").all(desde) as { ts: number }[];
  const chamadas = db.prepare("SELECT ts, card_id, agente, modelo, saida, usd, ms, parada FROM chamadas WHERE ts >= ?").all(desde) as {
    ts: number; card_id: number | null; agente: string | null; modelo: string; saida: number; usd: number; ms: number; parada: string | null;
  }[];

  const inicio = new Map(
    (db.prepare("SELECT card_id, MIN(ts) AS ts FROM chamadas WHERE card_id IS NOT NULL GROUP BY card_id").all() as { card_id: number; ts: number }[]).map((r) => [r.card_id, r.ts]),
  );

  // Série por dia.
  const serie = new Map<string, Medicao["dias"][number]>();
  for (let t = desde + DIA; t <= agora + 1; t += DIA) serie.set(diaDe(t), { dia: diaDe(t), concluidos: 0, devolucoes: 0, custoUsd: 0, horasDeModelo: 0 });
  for (const c of feitos) {
    const d = serie.get(diaDe(terminou.get(c.id)!));
    if (d) d.concluidos++;
  }
  for (const r of devolucoes) {
    const d = serie.get(diaDe(r.ts));
    if (d) d.devolucoes++;
  }
  for (const r of chamadas) {
    const d = serie.get(diaDe(r.ts));
    if (!d) continue;
    d.custoUsd += r.usd;
    d.horasDeModelo += r.ms / 3_600_000;
  }

  // Cada card é do modelo que mais escreveu nele pelo dono (quem executa); sem chamadas do dono, de quem mais escreveu.
  const autoria = new Map<number, Map<string, number>>();
  for (const r of chamadas) {
    if (r.card_id == null || r.parada === "compactacao") continue;
    const peso = r.saida * (r.agente === porId.get(r.card_id)?.dono ? 1000 : 1);
    const m = autoria.get(r.card_id) ?? new Map<string, number>();
    m.set(r.modelo, (m.get(r.modelo) ?? 0) + peso);
    autoria.set(r.card_id, m);
  }
  const modeloDoCard = new Map([...autoria].map(([id, m]) => [id, [...m].sort((a, b) => b[1] - a[1])[0]![0]]));

  // Nota dos evals por modelo (média das tarefas da rodada mais recente em que ele apareceu).
  const notaEval = new Map<string, number>();
  for (const rodada of listarEvals()) {
    const porModelo = new Map<string, number[]>();
    for (const r of rodada.resultados) porModelo.set(r.modelo, [...(porModelo.get(r.modelo) ?? []), r.nota]);
    for (const [m, notas] of porModelo) if (!notaEval.has(m)) notaEval.set(m, Math.round((notas.reduce((s, n) => s + n, 0) / notas.length) * 10) / 10);
  }

  const nomesDeModelo = new Set([...chamadas.map((r) => r.modelo), ...notaEval.keys()]);
  const modelos: MedicaoModelo[] = [...nomesDeModelo].map((modelo) => {
    const dele = chamadas.filter((r) => r.modelo === modelo && r.parada !== "compactacao");
    const seus = [...modeloDoCard].filter(([, m]) => m === modelo).map(([id]) => porId.get(id)).filter((c): c is Card => !!c);
    const concluidos = seus.filter((c) => terminou.has(c.id) && terminou.get(c.id)! >= desde);
    const ms = dele.reduce((s, r) => s + r.ms, 0);
    const msNosSeus = dele.filter((r) => r.card_id != null && seus.some((c) => c.id === r.card_id)).reduce((s, r) => s + r.ms, 0);
    return {
      modelo,
      local: modelo.startsWith("ollama:"),
      cards: seus.length,
      concluidos: concluidos.length,
      aprovadosDePrimeira: pct(concluidos.filter((c) => c.devolucoes === 0).length, concluidos.length),
      semCeo: pct(concluidos.filter((c) => !comCeo.has(c.id)).length, concluidos.length),
      minutosPorCard: seus.length ? Math.round(msNosSeus / seus.length / 60_000) : null,
      tokensPorSegundo: ms ? Math.round((dele.reduce((s, r) => s + r.saida, 0) / ms) * 1000 * 10) / 10 : null,
      custoUsd: dele.reduce((s, r) => s + r.usd, 0),
      notaEval: notaEval.get(modelo) ?? null,
    };
  }).sort((a, b) => b.concluidos - a.concluidos || b.cards - a.cards);

  return {
    dias: [...serie.values()],
    resumo: {
      concluidos: feitos.length,
      aprovadosDePrimeira: pct(feitos.filter((c) => c.devolucoes === 0).length, feitos.length),
      semCeo: pct(feitos.filter((c) => !comCeo.has(c.id)).length, feitos.length),
      // Do primeiro trabalho de IA no card até ele terminar (a criação pode ser dias antes, na fila).
      horasPorCard: feitos.length ? Math.round(feitos.reduce((s, c) => s + (terminou.get(c.id)! - (inicio.get(c.id) ?? c.criadoEm)), 0) / feitos.length / 3_600_000 * 10) / 10 : null,
      custoUsd: chamadas.reduce((s, r) => s + r.usd, 0),
      custoPorCardUsd: feitos.length ? chamadas.reduce((s, r) => s + r.usd, 0) / feitos.length : null,
    },
    modelos,
    sugestoes: sugerirModelos(modelos, cards, modeloDoCard),
  };
}

/** Para cada agente que executa cards, sugere trocar de modelo quando outro (com cards suficientes) foi claramente melhor. */
function sugerirModelos(modelos: MedicaoModelo[], cards: Card[], modeloDoCard: Map<number, string>): Medicao["sugestoes"] {
  const comparaveis = modelos.filter((m) => m.concluidos >= MIN_CARDS && m.aprovadosDePrimeira != null);
  if (comparaveis.length < 2) return [];
  const nota = (m: MedicaoModelo) => (m.aprovadosDePrimeira ?? 0) + (m.notaEval ?? 0) * 2; // aprovação de primeira pesa mais que eval
  const escolhidos = escolhas();
  const sugestoes: Medicao["sugestoes"] = [];
  for (const agente of new Set(cards.map((c) => c.dono).filter((d): d is string => !!d))) {
    const usados = cards.filter((c) => c.dono === agente).map((c) => modeloDoCard.get(c.id)).filter(Boolean);
    const atual = escolhidos[agente] ?? usados.at(-1);
    const doAtual = comparaveis.find((m) => m.modelo === atual);
    // Só entre modelos do mesmo tipo (local com local): a troca não pode passar a gastar dinheiro sem você pedir.
    const melhor = comparaveis.filter((m) => !doAtual || m.local === doAtual.local).sort((a, b) => nota(b) - nota(a))[0];
    if (!doAtual || !melhor || melhor.modelo === atual || (melhor.aprovadosDePrimeira ?? 0) - (doAtual.aprovadosDePrimeira ?? 0) < 15) continue;
    sugestoes.push({
      agente,
      nomeAgente: agentById[agente]?.nome ?? agente,
      de: atual!,
      para: melhor.modelo,
      motivo: `${melhor.aprovadosDePrimeira}% aprovados de primeira contra ${doAtual.aprovadosDePrimeira}% (${melhor.concluidos} e ${doAtual.concluidos} cards).`,
    });
  }
  return sugestoes;
}
