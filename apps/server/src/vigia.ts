import { createHash } from "node:crypto";
import { agentById } from "@empresa/org";
import type { AlertaSaude, TipoAlertaSaude } from "@empresa/shared";
import { db } from "./db.ts";
import { emit, postChat } from "./bus.ts";
import { custoHoje } from "./custo.ts";
import { estadoMotor } from "./agentes/motor.ts";
import { rebaixamentosRecentes } from "./agentes/memoria.ts";
import { listarCards } from "./tarefas.ts";
import { enviar } from "./telegram.ts";

// Vigia de saúde: a cada minuto procura o que trava a empresa sem ninguém ver (card rodando sem avançar, o mesmo
// erro voltando, ferramenta em loop, chamada lenta, gasto fora do ritmo, fila parada) e avisa uma vez só.
// Quando a condição some, o alerta se resolve sozinho.

db.exec(`CREATE TABLE IF NOT EXISTS alertas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chave TEXT NOT NULL,
  tipo TEXT NOT NULL,
  card_id INTEGER,
  texto TEXT NOT NULL,
  criado_em INTEGER NOT NULL,
  resolvido_em INTEGER
)`);
db.exec("CREATE INDEX IF NOT EXISTS alertas_abertos ON alertas (resolvido_em)");

/** Card rodando sem nenhum passo novo há este tempo (uma chamada local longa leva até ~10 min). */
export const SEM_PROGRESSO_MS = 20 * 60_000;
/** A mesma falha neste card, tantas vezes nestas horas. */
const ERRO_REPETIDO_VEZES = 3;
const ERRO_REPETIDO_JANELA_MS = 6 * 3600_000;
/** Mesma ferramenta com a mesma entrada, tantas vezes na execução atual. */
const LOOP_VEZES = 4;
/** Chamada de IA mais lenta que isso. */
export const CHAMADA_LENTA_MS = 10 * 60_000;
const CHAMADA_LENTA_JANELA_MS = 3600_000;
/** Gasto do dia a partir desta fração do orçamento. */
const GASTO_ALERTA = 0.8;
/** Fila com trabalho pronto e ninguém rodando há este tempo. */
export const FILA_PARADA_MS = 15 * 60_000;
/** Entregas seguidas sem o card mudar de coluna. */
export const GIRANDO_ENTREGAS = 3;

export interface Achado {
  chave: string;
  tipo: TipoAlertaSaude;
  cardId: number | null;
  texto: string;
}

/** O que o vigia olha, já lido do banco (separado para testar sem servidor). */
export interface Fotografia {
  agora: number;
  emAndamento: { cardId: number; agenteId: string; desde: number }[];
  ultimoPasso: (cardId: number, desde: number) => number | null;
  /** Passos de ferramenta da execução mais recente do card. */
  ferramentasDaExecucao: (cardId: number) => { nome: string; entrada: string }[];
  falhas: { cardId: number; texto: string }[];
  chamadasLentas: { id: number; cardId: number | null; agente: string | null; modelo: string; ms: number }[];
  gastoHoje: number;
  orcamento: number;
  fila: { naFila: number; pausado: boolean; semOrcamento: boolean };
  filaParadaDesde: number | null;
  chaveDoCard: (cardId: number) => string;
  /** Cards que entregaram várias versões sem sair da coluna (desde o último movimento). */
  girando?: { cardId: number; entregas: number; desde: number }[];
  /** Agentes que passaram para um modelo local menor por falta de memória (últimas 6 h). */
  rebaixamentos?: { id: number; agentes: string[]; de: string; para: string; motivo: string }[];
}

const resumo = (s: string) => s.replace(/\s+/g, " ").trim();
const impressao = (s: string) => createHash("sha1").update(resumo(s).replace(/\d+/g, "#")).digest("hex").slice(0, 10);
const minutos = (ms: number) => Math.round(ms / 60_000);

export function examinar(f: Fotografia): Achado[] {
  const achados: Achado[] = [];
  for (const r of f.rebaixamentos ?? []) {
    const nomes = r.agentes.map((a) => agentById[a]?.nome ?? a).join(", ");
    achados.push({
      chave: `memoria:${r.id}`, tipo: "memoria", cardId: null,
      texto: `${nomes} passou de ${r.de} para ${r.para}: ${r.motivo}. Volte em Configurações → Modelos de IA quando houver memória.`,
    });
  }
  // Várias entregas sem o card andar: algo entre a entrega e a revisão está falhando (no card 11, a verificação era
  // cortada por um reinício e o agente refazia o trabalho; foram 7 versões em 70 minutos).
  for (const g of f.girando ?? []) {
    if (g.entregas < GIRANDO_ENTREGAS) continue;
    achados.push({
      chave: `girando:${g.cardId}:${g.desde}`, tipo: "card-girando", cardId: g.cardId,
      texto: `${f.chaveDoCard(g.cardId)} entregou ${g.entregas} versões sem sair da coluna desde ${new Date(g.desde).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}: alguma coisa impede a ida para a revisão.`,
    });
  }
  for (const t of f.emAndamento) {
    const ultimo = f.ultimoPasso(t.cardId, t.desde) ?? t.desde;
    if (f.agora - ultimo >= SEM_PROGRESSO_MS) {
      achados.push({
        chave: `sem-progresso:${t.cardId}:${t.desde}`, tipo: "card-sem-progresso", cardId: t.cardId,
        texto: `${f.chaveDoCard(t.cardId)} está rodando (${t.agenteId}) há ${minutos(f.agora - t.desde)} min e não dá um passo há ${minutos(f.agora - ultimo)} min.`,
      });
    }
    const vezes = new Map<string, number>();
    for (const p of f.ferramentasDaExecucao(t.cardId)) {
      const k = `${p.nome}\u0000${p.entrada}`;
      vezes.set(k, (vezes.get(k) ?? 0) + 1);
    }
    for (const [k, n] of vezes) {
      if (n < LOOP_VEZES) continue;
      const nome = k.split("\u0000")[0]!;
      achados.push({
        chave: `loop:${t.cardId}:${t.desde}:${impressao(k)}`, tipo: "loop-de-ferramenta", cardId: t.cardId,
        texto: `${f.chaveDoCard(t.cardId)}: o agente chamou ${nome} com a mesma entrada ${n} vezes nesta execução (parece um loop).`,
      });
    }
  }
  const porErro = new Map<string, { cardId: number; texto: string; n: number }>();
  for (const x of f.falhas) {
    const k = `${x.cardId}:${impressao(x.texto)}`;
    const atual = porErro.get(k);
    if (atual) atual.n++;
    else porErro.set(k, { ...x, n: 1 });
  }
  for (const [k, e] of porErro) {
    if (e.n < ERRO_REPETIDO_VEZES) continue;
    achados.push({
      chave: `erro:${k}`, tipo: "erro-repetido", cardId: e.cardId,
      texto: `${f.chaveDoCard(e.cardId)}: a mesma falha ${e.n} vezes nas últimas horas — ${resumo(e.texto).slice(0, 220)}`,
    });
  }
  for (const c of f.chamadasLentas) {
    achados.push({
      chave: `lenta:${c.id}`, tipo: "chamada-lenta", cardId: c.cardId,
      texto: `Chamada lenta: ${c.modelo} levou ${minutos(c.ms)} min${c.cardId ? ` no ${f.chaveDoCard(c.cardId)}` : ""}${c.agente ? ` (${c.agente})` : ""}.`,
    });
  }
  if (f.orcamento > 0 && f.gastoHoje >= f.orcamento * GASTO_ALERTA) {
    const dia = new Date(f.agora).toISOString().slice(0, 10);
    achados.push({
      chave: `gasto:${dia}`, tipo: "gasto-do-dia", cardId: null,
      texto: `O gasto de hoje chegou a US$ ${f.gastoHoje.toFixed(2)} de US$ ${f.orcamento.toFixed(2)} (${Math.round((f.gastoHoje / f.orcamento) * 100)}%).`,
    });
  }
  if (f.filaParadaDesde !== null && f.agora - f.filaParadaDesde >= FILA_PARADA_MS) {
    achados.push({
      chave: `fila:${f.filaParadaDesde}`, tipo: "fila-parada", cardId: null,
      texto: `Há ${f.fila.naFila} card(s) prontos na fila e nenhum agente rodando há ${minutos(f.agora - f.filaParadaDesde)} min (todos esperando algum provedor ou espaço no modelo?).`,
    });
  }
  return achados;
}

/* ---------- Estado no banco ---------- */

type Linha = { id: number; chave: string; tipo: string; card_id: number | null; texto: string; criado_em: number; resolvido_em: number | null };
const deLinha = (r: Linha): AlertaSaude => ({
  id: r.id, chave: r.chave, tipo: r.tipo as TipoAlertaSaude, cardId: r.card_id, texto: r.texto, criadoEm: r.criado_em, resolvidoEm: r.resolvido_em,
});

export function listarAlertas(abertos = true): AlertaSaude[] {
  const sql = abertos
    ? "SELECT * FROM alertas WHERE resolvido_em IS NULL ORDER BY criado_em DESC"
    : "SELECT * FROM alertas ORDER BY criado_em DESC LIMIT 100";
  return (db.prepare(sql).all() as Linha[]).map(deLinha);
}

/** Abre os alertas novos e resolve os que sumiram. Devolve só os novos (para avisar uma vez). */
export function sincronizar(achados: Achado[], agora = Date.now()): AlertaSaude[] {
  const abertos = new Map((db.prepare("SELECT * FROM alertas WHERE resolvido_em IS NULL").all() as Linha[]).map((r) => [r.chave, r]));
  const vistos = new Set(achados.map((a) => a.chave));
  for (const [chave, r] of abertos) if (!vistos.has(chave)) db.prepare("UPDATE alertas SET resolvido_em = ? WHERE id = ?").run(agora, r.id);
  const novos: AlertaSaude[] = [];
  for (const a of achados) {
    if (abertos.has(a.chave)) continue;
    // Resolvido à mão pelo CEO: não reabre a mesma ocorrência.
    if (db.prepare("SELECT 1 FROM alertas WHERE chave = ?").get(a.chave)) continue;
    const r = db.prepare("INSERT INTO alertas (chave, tipo, card_id, texto, criado_em) VALUES (?, ?, ?, ?, ?)").run(a.chave, a.tipo, a.cardId, a.texto, agora);
    novos.push({ id: Number(r.lastInsertRowid), chave: a.chave, tipo: a.tipo, cardId: a.cardId, texto: a.texto, criadoEm: agora, resolvidoEm: null });
  }
  return novos;
}

export function resolverAlerta(id: number) {
  db.prepare("UPDATE alertas SET resolvido_em = ? WHERE id = ? AND resolvido_em IS NULL").run(Date.now(), id);
  emit({ type: "alertas", abertos: listarAlertas() });
}

/* ---------- Leitura do banco e laço ---------- */

let filaParadaDesde: number | null = null;

function fotografar(agora: number): Fotografia {
  const m = estadoMotor();
  const parada = m.naFila > 0 && m.emAndamento.length === 0 && !m.pausado && !m.semOrcamento;
  filaParadaDesde = parada ? (filaParadaDesde ?? agora) : null;
  const chaves = new Map(listarCards().map((c) => [c.id, c.chave]));
  return {
    agora,
    emAndamento: m.emAndamento.map((t) => ({ cardId: t.cardId, agenteId: t.agenteId, desde: t.desde })),
    ultimoPasso: (cardId, desde) => (db.prepare("SELECT MAX(ts) AS ts FROM passos WHERE card_id = ? AND ts >= ?").get(cardId, desde) as { ts: number | null }).ts,
    ferramentasDaExecucao: (cardId) => {
      const ex = db.prepare("SELECT execucao FROM passos WHERE card_id = ? ORDER BY ts DESC LIMIT 1").get(cardId) as { execucao: string } | undefined;
      if (!ex) return [];
      return db.prepare("SELECT nome, COALESCE(entrada, '') AS entrada FROM passos WHERE execucao = ? AND tipo = 'ferramenta' AND nome IS NOT NULL").all(ex.execucao) as { nome: string; entrada: string }[];
    },
    falhas: db
      .prepare("SELECT card_id AS cardId, texto FROM comentarios WHERE texto LIKE 'Não consegui concluir agora:%' AND ts >= ?")
      .all(agora - ERRO_REPETIDO_JANELA_MS) as { cardId: number; texto: string }[],
    chamadasLentas: db
      .prepare("SELECT id, card_id AS cardId, agente, modelo, ms FROM chamadas WHERE ms >= ? AND ts >= ?")
      .all(CHAMADA_LENTA_MS, agora - CHAMADA_LENTA_JANELA_MS) as Fotografia["chamadasLentas"],
    gastoHoje: custoHoje(),
    orcamento: m.orcamentoDiarioUsd,
    fila: { naFila: m.naFila, pausado: m.pausado, semOrcamento: m.semOrcamento },
    filaParadaDesde,
    chaveDoCard: (id) => chaves.get(id) ?? `card ${id}`,
    rebaixamentos: rebaixamentosRecentes(agora - 6 * 3_600_000),
    girando: db
      .prepare(
        `SELECT e.card_id AS cardId, COUNT(*) AS entregas, m.ts AS desde FROM entregas e
         JOIN (SELECT card_id, MAX(ts) AS ts FROM comentarios WHERE tipo = 'movimento' GROUP BY card_id) m ON m.card_id = e.card_id
         WHERE e.ts > m.ts GROUP BY e.card_id HAVING COUNT(*) >= ?`,
      )
      .all(GIRANDO_ENTREGAS) as { cardId: number; entregas: number; desde: number }[],
  };
}

const ROTULO: Record<TipoAlertaSaude, string> = {
  "card-sem-progresso": "Card sem avançar",
  "erro-repetido": "Erro repetido",
  "loop-de-ferramenta": "Loop de ferramenta",
  "chamada-lenta": "Chamada lenta",
  "gasto-do-dia": "Gasto do dia",
  "fila-parada": "Fila parada",
  memoria: "Pouca memória",
  "card-girando": "Card girando",
};

export function verificarSaude(agora = Date.now()) {
  const novos = sincronizar(examinar(fotografar(agora)), agora);
  emit({ type: "alertas", abertos: listarAlertas() });
  // Avisa só os novos e no máximo 3 por vez (o resto fica na tela Operação).
  for (const a of novos.slice(0, 3)) {
    const texto = `⚠️ ${ROTULO[a.tipo]}: ${a.texto}`;
    postChat("chief-of-staff", texto);
    void enviar(texto).catch(() => null);
  }
}

export function iniciarVigia() {
  setInterval(() => {
    try {
      verificarSaude();
    } catch (e) {
      console.error("Vigia de saúde:", e);
    }
  }, 60_000).unref();
}
