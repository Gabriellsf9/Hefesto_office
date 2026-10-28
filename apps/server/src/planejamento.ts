import { colunaDe, colunaDeEntrada, fluxoPadrao, type Card } from "@empresa/shared";
import { agentById, coordenadorDe, SEDE } from "@empresa/org";
import { db, getSetting, setSetting } from "./db.ts";
import { postChat, postFeed } from "./bus.ts";
import { estimativaDeCusto } from "./chamadas.ts";
import { fichaDoProjeto, listarProjetos } from "./projetos.ts";
import { comentar, criarCard, editarCard, lerCard, listarCards } from "./tarefas.ts";
import { auditar } from "./confianca/auditoria.ts";

// Planejamento por projeto:
// 1. Estimativa de cada card (horas de trabalho e custo), pelo histórico da mesma área e tipo.
// 2. Cronograma simulado: dependências (o card só começa quando as dele terminam) e um card por agente
//    de cada vez. Daí sai a previsão de término e o caminho crítico (a corrente que define o fim).
// 3. Orçamento por projeto: ao chegar no teto, os cards do projeto param e pedem a você; aviso em 80%.
// 4. Replanejamento automático: quando a previsão escorrega muito da linha de base, o custo projetado
//    passa do orçamento ou um card do caminho crítico trava, o coordenador recebe um card para replanejar.

const tipoDe = (c: Card) => colunaDe(c.fluxo, c.coluna)?.tipo;
const SALAS_DE_CODIGO = new Set(["desenvolvimento", "dados", "devops", "infraestrutura", "qa", "seguranca"]);
export const ETIQUETA_ORCAMENTO_PROJETO = "orcamento-projeto";
export const ETIQUETA_REPLANEJAR = "replanejamento";

/* ---------- 1. Estimativas ---------- */

/** Horas de trabalho até a entrega (da 1ª chamada de IA à última entrega) de cards já entregues. */
function amostrasDeDuracao(sala: string | null, tipo: string | null): number[] {
  const linhas = db
    .prepare(
      `SELECT (SELECT MAX(e.ts) FROM entregas e WHERE e.card_id = k.id) - (SELECT MIN(ch.ts) FROM chamadas ch WHERE ch.card_id = k.id) AS ms
       FROM cards k WHERE k.demo = 0 ${sala ? "AND k.sala = ?" : ""} ${tipo ? "AND k.tipo = ?" : ""}
       AND EXISTS (SELECT 1 FROM entregas e WHERE e.card_id = k.id) ORDER BY k.id DESC LIMIT 40`,
    )
    .all(...[sala, tipo].filter((x): x is string => !!x)) as { ms: number | null }[];
  // Mínimo de 3 minutos: um card nunca sai de graça no cronograma.
  return linhas.map((l) => (l.ms ?? 0) / 3600_000).filter((h) => h >= 0 && h < 24 * 14).map((h) => Math.max(h, 0.05));
}

const mediana = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)]!;
};

const HORAS_PADRAO: Record<string, number> = { tarefa: 0.5, historia: 0.5, bug: 0.75, epico: 3, conteudo: 0.5, lead: 0.25 };

export interface Estimativa {
  horas: number;
  custoUsd: number;
  /** De onde veio: o histórico da área e tipo, só da área, ou o padrão. */
  base: "historico" | "area" | "padrao";
}

export function estimarCard(c: Pick<Card, "sala" | "tipo">): Estimativa {
  const exato = amostrasDeDuracao(c.sala, c.tipo);
  const area = exato.length >= 3 ? exato : amostrasDeDuracao(c.sala, null);
  const custo = estimativaDeCusto(c.sala, c.tipo)?.tipico ?? (SALAS_DE_CODIGO.has(c.sala) ? 1 : 0.3);
  if (exato.length >= 3) return { horas: mediana(exato), custoUsd: custo, base: "historico" };
  if (area.length >= 3) return { horas: mediana(area), custoUsd: custo, base: "area" };
  return { horas: (HORAS_PADRAO[c.tipo] ?? 0.5) * (SALAS_DE_CODIGO.has(c.sala) ? 2 : 1), custoUsd: custo, base: "padrao" };
}

/* ---------- 2. Cronograma e caminho crítico ---------- */

export interface ItemDoPlano {
  id: number;
  chave: string;
  titulo: string;
  dono: string | null;
  estado: "feito" | "andamento" | "fila" | "voce" | "bloqueado";
  estimativa: Estimativa;
  /** Horas a partir de agora. */
  inicio: number;
  fim: number;
  critico: boolean;
  /** O que segura o começo deste card: uma dependência ou o mesmo agente ocupado com outro. */
  esperaPor: { tipo: "dependencia" | "agente"; id: number } | null;
}

export interface PlanoDoProjeto {
  projetoId: number;
  nome: string;
  geradoEm: number;
  itens: ItemDoPlano[];
  caminhoCritico: number[];
  horasRestantes: number;
  previsaoFim: number | null;
  linhaDeBase: number | null;
  atrasoHoras: number;
  gastoUsd: number;
  custoRestanteUsd: number;
  orcamentoUsd: number | null;
  aguardandoVoce: number;
  bloqueados: number;
}

const depsDe = (c: Card) => [...(c.dependeDe ? [c.dependeDe] : []), ...(c.dependencias ?? [])];

function estadoDe(c: Card): ItemDoPlano["estado"] {
  const t = tipoDe(c);
  if (t === "feito" || t === "perdido") return "feito";
  if (t === "ceo") return "voce";
  if (c.bloqueado) return "bloqueado";
  if (t === "trabalho" || t === "validacao" || t === "bug" || c.emValidacao) return "andamento";
  return "fila";
}

export function planoDoProjeto(projetoId: number): PlanoDoProjeto {
  const projeto = fichaDoProjeto(projetoId);
  const todos = listarCards().filter((c) => !c.demo);
  const porId = new Map(todos.map((c) => [c.id, c]));
  const doProjeto = todos.filter((c) => c.projetoId === projetoId && c.tipo !== "lead");
  const agora = Date.now();
  const primeiraChamada = db.prepare("SELECT card_id, MIN(ts) AS ts FROM chamadas GROUP BY card_id").all() as { card_id: number; ts: number }[];
  const comecou = new Map(primeiraChamada.map((r) => [r.card_id, r.ts]));

  // Cards abertos, mais as dependências abertas de fora do projeto (também seguram o fim).
  const abertos = new Map<number, Card>();
  const juntar = (c: Card) => {
    if (abertos.has(c.id) || estadoDe(c) === "feito") return;
    abertos.set(c.id, c);
    for (const d of depsDe(c)) {
      const dep = porId.get(d);
      if (dep) juntar(dep);
    }
  };
  doProjeto.forEach(juntar);

  const est = new Map<number, Estimativa>();
  const restante = new Map<number, number>();
  for (const c of abertos.values()) {
    const e = estimarCard(c);
    est.set(c.id, e);
    const estado = estadoDe(c);
    const gasto = comecou.has(c.id) ? (agora - comecou.get(c.id)!) / 3600_000 : 0;
    // Aguardando você: o trabalho dos agentes acabou (a sua aprovação não entra na conta de horas).
    restante.set(c.id, estado === "voce" ? 0 : estado === "andamento" ? Math.max(e.horas - gasto, e.horas * 0.1) : e.horas);
  }

  // Simulação: pega sempre o card pronto que pode começar mais cedo (P0 antes de P3 no empate).
  const fim = new Map<number, number>();
  const inicio = new Map<number, number>();
  const espera = new Map<number, ItemDoPlano["esperaPor"]>();
  const livre = new Map<string, { em: number; card: number }>();
  const pendentes = new Set(abertos.keys());
  const pesoPrioridade = (c: Card) => Number(c.prioridade.slice(1)) || 2;
  while (pendentes.size) {
    let melhor: { id: number; comeco: number; por: ItemDoPlano["esperaPor"] } | null = null;
    for (const id of pendentes) {
      const c = abertos.get(id)!;
      const deps = depsDe(c).filter((d) => abertos.has(d));
      if (deps.some((d) => pendentes.has(d))) continue;
      let comeco = 0;
      let por: ItemDoPlano["esperaPor"] = null;
      for (const d of deps) if (fim.get(d)! > comeco) (comeco = fim.get(d)!), (por = { tipo: "dependencia", id: d });
      const ag = c.dono ? livre.get(c.dono) : undefined;
      if (ag && ag.em > comeco) (comeco = ag.em), (por = { tipo: "agente", id: ag.card });
      if (!melhor || comeco < melhor.comeco || (comeco === melhor.comeco && pesoPrioridade(c) < pesoPrioridade(abertos.get(melhor.id)!))) melhor = { id, comeco, por };
    }
    // Ciclo de dependências (não deveria existir): solta o primeiro para não travar o plano.
    if (!melhor) {
      const id = pendentes.values().next().value!;
      melhor = { id, comeco: Math.max(0, ...fim.values()), por: null };
    }
    const c = abertos.get(melhor.id)!;
    const f = melhor.comeco + restante.get(c.id)!;
    inicio.set(c.id, melhor.comeco);
    fim.set(c.id, f);
    espera.set(c.id, melhor.por);
    if (c.dono && restante.get(c.id)! > 0) livre.set(c.dono, { em: f, card: c.id });
    pendentes.delete(c.id);
  }

  // Caminho crítico: do card que termina por último, volta pelo que segurou cada começo.
  const critico: number[] = [];
  const ultimo = [...fim.entries()].sort((a, b) => b[1] - a[1])[0];
  for (let id = ultimo?.[0]; id !== undefined; ) {
    critico.unshift(id);
    const p = espera.get(id);
    id = p ? p.id : undefined;
  }
  const criticos = new Set(critico);

  const itens: ItemDoPlano[] = [
    ...doProjeto
      .filter((c) => estadoDe(c) === "feito")
      .map((c) => ({ id: c.id, chave: c.chave, titulo: c.titulo, dono: c.dono, estado: "feito" as const, estimativa: estimarCard(c), inicio: 0, fim: 0, critico: false, esperaPor: null })),
    ...[...abertos.values()]
      .sort((a, b) => inicio.get(a.id)! - inicio.get(b.id)! || a.id - b.id)
      .map((c) => ({ id: c.id, chave: c.chave, titulo: c.titulo, dono: c.dono, estado: estadoDe(c), estimativa: est.get(c.id)!, inicio: inicio.get(c.id)!, fim: fim.get(c.id)!, critico: criticos.has(c.id), esperaPor: espera.get(c.id) ?? null })),
  ];
  const horas = Math.max(0, ...fim.values());
  const previsao = abertos.size ? agora + horas * 3600_000 : null;
  const base = linhaDeBase(projetoId);
  return {
    projetoId,
    nome: projeto?.nome ?? `Projeto ${projetoId}`,
    geradoEm: agora,
    itens,
    caminhoCritico: critico,
    horasRestantes: Math.round(horas * 10) / 10,
    previsaoFim: previsao,
    linhaDeBase: base,
    atrasoHoras: previsao && base ? Math.round(((previsao - base) / 3600_000) * 10) / 10 : 0,
    gastoUsd: centavos(gastoDoProjeto(projetoId)),
    custoRestanteUsd: Math.round([...abertos.values()].filter((c) => estadoDe(c) !== "voce").reduce((s, c) => s + Math.max(0, est.get(c.id)!.custoUsd - c.custoUsd), 0) * 100) / 100,
    orcamentoUsd: orcamentoDoProjeto(projetoId),
    aguardandoVoce: [...abertos.values()].filter((c) => estadoDe(c) === "voce").length,
    bloqueados: [...abertos.values()].filter((c) => estadoDe(c) === "bloqueado").length,
  };
}

/* ---------- Linha de base ---------- */

export const linhaDeBase = (projetoId: number) => Number(getSetting(`projeto_${projetoId}_linha_base`) ?? 0) || null;

/** Fixa a previsão atual como a linha de base (o "combinado"), contra a qual o atraso é medido. */
export function fixarLinhaDeBase(projetoId: number): PlanoDoProjeto {
  setSetting(`projeto_${projetoId}_linha_base`, "");
  const p = planoDoProjeto(projetoId);
  setSetting(`projeto_${projetoId}_linha_base`, p.previsaoFim ? String(p.previsaoFim) : "");
  return { ...p, linhaDeBase: p.previsaoFim, atrasoHoras: 0 };
}

/* ---------- 3. Orçamento por projeto ---------- */

export const orcamentoDoProjeto = (projetoId: number) => {
  const v = Number(getSetting(`projeto_${projetoId}_orcamento_usd`) ?? 0);
  return v > 0 ? v : null;
};

export const gastoDoProjeto = (projetoId: number) =>
  (db.prepare("SELECT COALESCE(SUM(custo_usd), 0) AS s FROM cards WHERE projeto_id = ? AND demo = 0").get(projetoId) as { s: number }).s;
const centavos = (v: number) => Math.round(v * 100) / 100;

/** O projeto deste card já gastou o orçamento dele. */
export function projetoSemOrcamento(cardId: number): { projeto: string; gasto: number; orcamento: number } | null {
  const c = lerCard(cardId);
  if (c.projetoId === null) return null;
  const orc = orcamentoDoProjeto(c.projetoId);
  if (!orc) return null;
  const gasto = centavos(gastoDoProjeto(c.projetoId));
  return gasto >= orc ? { projeto: fichaDoProjeto(c.projetoId)?.nome ?? `Projeto ${c.projetoId}`, gasto, orcamento: orc } : null;
}

/** Depois de cada gasto num card: avisa uma vez quando o projeto passa de 80% do orçamento. */
export function conferirOrcamentoDoProjeto(cardId: number) {
  const c = lerCard(cardId);
  if (c.projetoId === null) return;
  const orc = orcamentoDoProjeto(c.projetoId);
  if (!orc) return;
  const chave = `projeto_${c.projetoId}_aviso80`;
  if (getSetting(chave) === String(orc)) return;
  const gasto = gastoDoProjeto(c.projetoId);
  if (gasto < orc * 0.8) return;
  setSetting(chave, String(orc));
  const nome = fichaDoProjeto(c.projetoId)?.nome ?? `Projeto ${c.projetoId}`;
  postChat("chief-of-staff", `O projeto ${nome} já usou ${Math.round((gasto / orc) * 100)}% do orçamento (US$ ${gasto.toFixed(2)} de US$ ${orc.toFixed(2)}). Ao chegar no teto, os cards dele param e esperam você.`);
}

export function definirOrcamentoDoProjeto(projetoId: number, usd: number | null) {
  if (!fichaDoProjeto(projetoId)) throw new Error("Projeto não encontrado.");
  const v = usd && usd > 0 ? Math.min(100_000, Math.round(usd * 100) / 100) : null;
  setSetting(`projeto_${projetoId}_orcamento_usd`, v ? String(v) : "");
  auditar("voce", "orçamento do projeto", projetoId, v ? `US$ ${v.toFixed(2)}` : "sem orçamento");
  // Com folga de novo: os cards que pararam pelo orçamento voltam a trabalhar.
  if (!v || gastoDoProjeto(projetoId) < v) {
    for (const c of listarCards().filter((x) => x.projetoId === projetoId && x.etiquetas.includes(ETIQUETA_ORCAMENTO_PROJETO))) {
      editarCard(c.id, { bloqueado: false, etiquetas: c.etiquetas.filter((e) => e !== ETIQUETA_ORCAMENTO_PROJETO) });
      comentar(c.id, "chief-of-staff", "comentario", `Orçamento do projeto ${v ? `aumentado para US$ ${v.toFixed(2)}` : "liberado"}: volto ao trabalho de onde parei.`);
    }
  }
  return { orcamentoUsd: v, gastoUsd: centavos(gastoDoProjeto(projetoId)) };
}

/* ---------- 4. Replanejamento automático ---------- */

/** Por que o projeto precisa de replanejamento agora (ou null). */
export function motivoParaReplanejar(p: PlanoDoProjeto): string | null {
  const motivos: string[] = [];
  if (p.linhaDeBase && p.previsaoFim) {
    const prazo = p.linhaDeBase - p.geradoEm;
    if (p.atrasoHoras >= 2 && p.atrasoHoras * 3600_000 > Math.max(prazo, 3600_000) * 0.2)
      motivos.push(`a previsão de término escorregou ${p.atrasoHoras} h em relação ao combinado (de ${new Date(p.linhaDeBase).toLocaleString("pt-BR")} para ${new Date(p.previsaoFim).toLocaleString("pt-BR")})`);
  }
  if (p.orcamentoUsd && p.gastoUsd + p.custoRestanteUsd > p.orcamentoUsd * 1.05)
    motivos.push(`o custo projetado (US$ ${(p.gastoUsd + p.custoRestanteUsd).toFixed(2)}) passa do orçamento (US$ ${p.orcamentoUsd.toFixed(2)})`);
  const travados = p.itens.filter((i) => i.critico && i.estado === "bloqueado");
  if (travados.length) motivos.push(`card(s) do caminho crítico parado(s): ${travados.map((i) => i.chave).join(", ")}`);
  return motivos.length ? motivos.join("; ") : null;
}

const replanejamentoAberto = (projetoId: number) =>
  listarCards().find((c) => c.projetoId === projetoId && c.etiquetas.includes(ETIQUETA_REPLANEJAR) && !["feito", "perdido"].includes(tipoDe(c) ?? ""));

function textoDoPlano(p: PlanoDoProjeto): string {
  const linha = (i: ItemDoPlano) =>
    `| ${i.chave} | ${i.titulo.slice(0, 60)} | ${i.dono ? agentById[i.dono]?.nome ?? i.dono : "—"} | ${i.estado} | ${i.estimativa.horas.toFixed(1)} h | ${i.inicio.toFixed(1)}–${i.fim.toFixed(1)} h | ${i.critico ? "★" : ""} |`;
  return [
    `Previsão: ${p.previsaoFim ? new Date(p.previsaoFim).toLocaleString("pt-BR") : "—"} (${p.horasRestantes} h de trabalho no caminho crítico). Gasto: US$ ${p.gastoUsd.toFixed(2)}${p.orcamentoUsd ? ` de US$ ${p.orcamentoUsd.toFixed(2)}` : ""}; falta cerca de US$ ${p.custoRestanteUsd.toFixed(2)}.`,
    "",
    "| Card | Título | Dono | Estado | Estimativa | Janela (a partir de agora) | Crítico |",
    "|---|---|---|---|---|---|---|",
    ...p.itens.filter((i) => i.estado !== "feito").map(linha),
  ].join("\n");
}

/** Confere um projeto e, se for o caso, abre o card de replanejamento para o coordenador. */
export function conferirReplanejamento(projetoId: number): Card | null {
  const p = planoDoProjeto(projetoId);
  if (!p.previsaoFim) return null;
  // Primeira vez com trabalho aberto: o plano de agora vira a linha de base.
  if (!p.linhaDeBase) {
    setSetting(`projeto_${projetoId}_linha_base`, String(p.previsaoFim));
    return null;
  }
  const motivo = motivoParaReplanejar(p);
  if (!motivo || replanejamentoAberto(projetoId)) return null;
  const coord = coordenadorDe(SEDE)?.id ?? "chief-of-staff";
  const fluxo = fluxoPadrao("diretoria");
  const card = criarCard(
    {
      titulo: `Replanejar o projeto ${p.nome}`,
      descricao: `O plano do projeto saiu do combinado: ${motivo}.

Proponha o novo plano: o que cortar ou adiar, o que dá para fazer em paralelo, quem deve assumir os cards travados (ou que pergunta fazer ao CEO para destravar) e a nova previsão e o custo. Seja concreto, card por card. Se precisar mudar o escopo ou o orçamento, deixe isso explícito para o CEO decidir.

## Plano atual (simulado pelas dependências e por um card por agente)
${textoDoPlano(p)}`,
      criterios: "- Novo plano card a card\n- Nova previsão e custo\n- Decisões que dependem do CEO explícitas",
      sala: "diretoria",
      fluxo,
      coluna: colunaDeEntrada(fluxo),
      dono: coord,
      nivel: "N1",
      tipo: "tarefa",
      prioridade: "P1",
      projetoId,
      etiquetas: [ETIQUETA_REPLANEJAR],
    },
    "chief-of-staff",
  );
  // A previsão de agora vira a nova base: só reabre se escorregar de novo.
  setSetting(`projeto_${projetoId}_linha_base`, String(p.previsaoFim));
  postFeed("diretoria", coord, `${agentById[coord]?.nome ?? "O coordenador"} vai replanejar o projeto ${p.nome}: ${motivo}`);
  auditar("hefesto", "replanejamento aberto", card.chave, motivo);
  return card;
}

export function iniciarPlanejamento() {
  const conferir = () => {
    for (const pr of listarProjetos()) {
      try {
        conferirReplanejamento(pr.id);
      } catch (e) {
        console.error(`Planejamento do projeto ${pr.id}:`, e);
      }
    }
  };
  setInterval(conferir, Number(process.env.EMPRESA_PLANO_INTERVALO_MS) || 30 * 60_000).unref();
}
