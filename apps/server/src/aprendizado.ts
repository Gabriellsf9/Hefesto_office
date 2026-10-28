import type { Agent, Card } from "@empresa/shared";
import { agentById } from "@empresa/org";
import { db, getSetting, setSetting } from "./db.ts";
import { postFeed } from "./bus.ts";
import { modeloPara, type Papel } from "./custo.ts";
import { escolhas, modeloDoAgente, provedorDe } from "./provedores.ts";
import { decisaoDoCeo, listarComentarios, listarDevolucoesDoAgente } from "./tarefas.ts";

// A equipe que aprende sozinha:
// 1. Escalonamento: o modelo sobe conforme o card falha (devoluções, verificações, entregas vazias);
//    com "local primeiro", a 1ª tentativa de código usa um modelo local e só sobe se a verificação falhar.
// 2. A/B de instruções por agente: uma variante nova das "instruções aprendidas" (escrita a partir das
//    devoluções que o agente recebeu) é testada em metade dos cards; vence a que é aprovada de primeira mais vezes.
// 3. Testes sombra: às vezes um modelo mais barato refaz um card já aprovado e um juiz compara;
//    quando o barato empata com frequência, o Hefesto sugere trocar (você decide).

/* ---------- 1. Escalonamento de modelo ---------- */

const ESCADA = ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"];

/** Quantas falhas o card acumulou desde a última decisão do CEO (devoluções, verificação, entrega vazia). */
export function falhasDoCard(cardId: number): number {
  let n = 0;
  for (const c of listarComentarios(cardId).reverse()) {
    if (decisaoDoCeo(c) || c.tipo === "aprovacao" || c.texto.startsWith("✅ Verificações passaram")) break;
    if (c.tipo === "devolucao" || c.texto.startsWith("❌ Verificação falhou") || c.texto.startsWith("Não consegui concluir agora")) n++;
  }
  return n;
}

const subir = (modelo: string, niveis: number) => {
  const i = ESCADA.indexOf(modelo);
  return i < 0 ? modelo : ESCADA[Math.min(ESCADA.length - 1, i + niveis)]!;
};

/** Modelo local para a 1ª tentativa de código (ex.: ollama:qwen2.5-coder), ou null se desligado. */
export const modeloLocalPrimeiro = () => getSetting("aprendizado_local_primeiro") || null;

/**
 * Modelo para este agente neste card: o de sempre (escolha do agente ou modo de custo), subindo um nível a cada
 * duas falhas. Com "local primeiro" e código verificável, a tentativa inicial é no modelo local.
 */
export function modeloEscalonado(agente: Agent, papel: Papel, card: Card, codigoVerificavel = false): { modelo: string; motivo: string | null } {
  const base = modeloDoAgente(agente, papel);
  const falhas = falhasDoCard(card.id);
  const local = modeloLocalPrimeiro();
  if (local && papel === "autor" && codigoVerificavel && falhas === 0) return { modelo: local, motivo: "1ª tentativa no modelo local (a verificação confere)" };
  // Agente escolhido para outro provedor (Ollama, OpenAI, Gemini): a 1ª tentativa é nele.
  const foraDoClaude = provedorDe(base).provedor !== "claude";
  if (foraDoClaude && falhas === 0) return { modelo: base, motivo: null };
  // Saiu do local (falhou): volta para o Claude do modo de custo antes de subir.
  const claude = foraDoClaude ? modeloPara(agente.modelo, papel) : base;
  const extra = (local && codigoVerificavel) || foraDoClaude ? Math.max(0, falhas - 1) : falhas;
  const niveis = extra >= 4 ? 2 : extra >= 2 ? 1 : 0;
  const modelo = subir(claude, niveis);
  return { modelo, motivo: modelo !== base ? `subiu para ${modelo.replace("claude-", "")} depois de ${falhas} falha(s)` : null };
}

/* ---------- 2. A/B das instruções aprendidas ---------- */

db.exec(`CREATE TABLE IF NOT EXISTS variantes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, agente TEXT NOT NULL, texto TEXT NOT NULL, status TEXT NOT NULL,
  criada_em INTEGER NOT NULL, cards INTEGER NOT NULL DEFAULT 0, de_primeira INTEGER NOT NULL DEFAULT 0, devolucoes INTEGER NOT NULL DEFAULT 0
)`);
db.exec(`CREATE TABLE IF NOT EXISTS variantes_cards (card_id INTEGER NOT NULL, agente TEXT NOT NULL, variante_id INTEGER NOT NULL, contado INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (card_id, agente))`);

export interface Variante {
  id: number;
  agente: string;
  texto: string;
  /** base (instruções em uso), testando (candidata) ou descartada. */
  status: "base" | "testando" | "descartada";
  criadaEm: number;
  cards: number;
  dePrimeira: number;
  devolucoes: number;
}

type Linha = Record<string, string | number>;
const deLinha = (r: Linha): Variante => ({
  id: r.id as number,
  agente: r.agente as string,
  texto: r.texto as string,
  status: r.status as Variante["status"],
  criadaEm: r.criada_em as number,
  cards: r.cards as number,
  dePrimeira: r.de_primeira as number,
  devolucoes: r.devolucoes as number,
});

/** Cards por variante antes de decidir o A/B. */
export const AMOSTRA_AB = 8;

export const variantesDo = (agente: string): Variante[] => (db.prepare("SELECT * FROM variantes WHERE agente = ? ORDER BY id DESC").all(agente) as Linha[]).map(deLinha);

function emUso(agente: string): { base: Variante | null; testando: Variante | null } {
  const vs = variantesDo(agente);
  return { base: vs.find((v) => v.status === "base") ?? null, testando: vs.find((v) => v.status === "testando") ?? null };
}

/**
 * Instruções aprendidas para este agente neste card. Com um A/B no ar, metade dos cards (pelo número do card)
 * recebe a candidata; a escolha fica registrada para contar o resultado depois.
 */
export function instrucoesAprendidas(agente: string, cardId: number): string {
  const { base, testando } = emUso(agente);
  let v = base;
  if (testando) {
    const ja = db.prepare("SELECT variante_id FROM variantes_cards WHERE card_id = ? AND agente = ?").get(cardId, agente) as { variante_id: number } | undefined;
    const escolhida = ja ? [base, testando].find((x) => x?.id === ja.variante_id) ?? null : cardId % 2 === 0 ? testando : base;
    v = escolhida;
    // A base "vazia" (sem instruções ainda) também precisa de id para contar: cria na primeira vez.
    const idBase = base?.id ?? criarVariante(agente, "", "base").id;
    if (!ja) db.prepare("INSERT OR IGNORE INTO variantes_cards (card_id, agente, variante_id) VALUES (?, ?, ?)").run(cardId, agente, v?.id ?? idBase);
  }
  return v?.texto ? `## Instruções aprendidas (desta equipe, a partir das devoluções que você já recebeu)\n${v.texto}` : "";
}

function criarVariante(agente: string, texto: string, status: Variante["status"]): Variante {
  const id = Number(db.prepare("INSERT INTO variantes (agente, texto, status, criada_em) VALUES (?, ?, ?, ?)").run(agente, texto, status, Date.now()).lastInsertRowid);
  return deLinha(db.prepare("SELECT * FROM variantes WHERE id = ?").get(id) as Linha);
}

/** Começa um A/B com uma candidata (escrita por um modelo a partir das devoluções, ou à mão). */
export function iniciarAB(agente: string, texto: string): Variante {
  if (!agentById[agente]) throw new Error("Agente inválido.");
  if (emUso(agente).testando) throw new Error("Já há um teste A/B no ar para este agente.");
  if (!emUso(agente).base) criarVariante(agente, "", "base");
  return criarVariante(agente, texto.trim().slice(0, 4000), "testando");
}

/** O card terminou a validação (aprovado): conta para a variante que o autor usou. Decide o A/B na amostra. */
export function registrarResultadoAB(card: Card) {
  if (!card.dono) return;
  const r = db.prepare("SELECT variante_id, contado FROM variantes_cards WHERE card_id = ? AND agente = ?").get(card.id, card.dono) as { variante_id: number; contado: number } | undefined;
  if (!r || r.contado) return;
  db.prepare("UPDATE variantes_cards SET contado = 1 WHERE card_id = ? AND agente = ?").run(card.id, card.dono);
  db.prepare("UPDATE variantes SET cards = cards + 1, de_primeira = de_primeira + ?, devolucoes = devolucoes + ? WHERE id = ?").run(card.devolucoes === 0 ? 1 : 0, card.devolucoes, r.variante_id);
  decidirAB(card.dono);
}

export function decidirAB(agente: string) {
  const { base, testando } = emUso(agente);
  if (!base || !testando || base.cards < AMOSTRA_AB || testando.cards < AMOSTRA_AB) return;
  const taxa = (v: Variante) => v.dePrimeira / v.cards;
  const media = (v: Variante) => v.devolucoes / v.cards;
  const venceu = taxa(testando) > taxa(base) || (taxa(testando) === taxa(base) && media(testando) < media(base));
  const nome = agentById[agente]?.nome ?? agente;
  if (venceu) {
    db.prepare("UPDATE variantes SET status = 'descartada' WHERE id = ?").run(base.id);
    db.prepare("UPDATE variantes SET status = 'base' WHERE id = ?").run(testando.id);
    postFeed(agentById[agente]?.sala ?? "diretoria", agente, `${nome} aprendeu: as instruções novas foram aprovadas de primeira em ${Math.round(taxa(testando) * 100)}% dos cards (antes ${Math.round(taxa(base) * 100)}%) e viraram as oficiais`);
  } else {
    db.prepare("UPDATE variantes SET status = 'descartada' WHERE id = ?").run(testando.id);
    postFeed(agentById[agente]?.sala ?? "diretoria", agente, `${nome}: as instruções testadas não melhoraram (${Math.round(taxa(testando) * 100)}% de primeira contra ${Math.round(taxa(base) * 100)}%); ficam as de antes`);
  }
}

/** Material para escrever uma candidata: as devoluções recentes do agente e as instruções em uso. */
export function materialParaCandidata(agente: string): { atuais: string; devolucoes: string[] } {
  return { atuais: emUso(agente).base?.texto ?? "", devolucoes: listarDevolucoesDoAgente(agente, -1, 12).map((d) => `${d.chave}: ${d.texto.replace(/\s+/g, " ").slice(0, 600)}`) };
}

/** Agentes que merecem um A/B: várias devoluções recentes e nenhum teste no ar. */
export function candidatosAoAB(minDevolucoes = 5): string[] {
  const desde = Date.now() - 14 * 24 * 3600_000;
  const linhas = db
    .prepare(
      `SELECT k.dono AS agente, COUNT(*) AS n FROM comentarios c JOIN cards k ON k.id = c.card_id
       WHERE c.tipo = 'devolucao' AND c.ts >= ? AND k.dono IS NOT NULL AND c.autor <> k.dono AND k.demo = 0 GROUP BY k.dono HAVING n >= ?`,
    )
    .all(desde, minDevolucoes) as { agente: string; n: number }[];
  return linhas.map((l) => l.agente).filter((a) => agentById[a] && !emUso(a).testando);
}

/* ---------- 3. Testes sombra ---------- */

db.exec(`CREATE TABLE IF NOT EXISTS sombras (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, card_id INTEGER NOT NULL, agente TEXT NOT NULL,
  modelo_real TEXT NOT NULL, modelo_barato TEXT NOT NULL, resultado TEXT NOT NULL, custo_barato REAL NOT NULL, justificativa TEXT
)`);

/** Porcentagem de cards aprovados que ganham um teste sombra (0 desliga). */
export const sombraPct = () => Number(getSetting("aprendizado_sombra_pct") ?? 0);

/** Modelo local que a sombra testa no lugar do degrau abaixo (ex.: ollama:gpt-oss-hefesto:20b), ou null. */
export const modeloSombraLocal = () => getSetting("aprendizado_sombra_local") || null;

/** O modelo que a sombra testa: o local configurado para a sombra; senão um nível abaixo (ou o local primeiro). */
export function modeloMaisBarato(modelo: string): string | null {
  const sombraLocal = modeloSombraLocal();
  if (sombraLocal && sombraLocal !== modelo) return sombraLocal;
  const local = modeloLocalPrimeiro();
  const i = ESCADA.indexOf(modelo);
  if (i > 0) return ESCADA[i - 1]!;
  return local && local !== modelo ? local : null;
}

export function registrarSombra(s: { cardId: number; agente: string; modeloReal: string; modeloBarato: string; resultado: "melhor" | "empate" | "pior"; custoBarato: number; justificativa: string }) {
  db.prepare("INSERT INTO sombras (ts, card_id, agente, modelo_real, modelo_barato, resultado, custo_barato, justificativa) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
    Date.now(), s.cardId, s.agente, s.modeloReal, s.modeloBarato, s.resultado, s.custoBarato, s.justificativa.slice(0, 2000),
  );
}

export interface Sugestao {
  agente: string;
  nome: string;
  modeloAtual: string;
  modeloBarato: string;
  amostras: number;
  empateOuMelhor: number;
}

/** Onde o barato empatou ou ganhou em pelo menos 80% de 5+ comparações: sugestão de troca. */
export function sugestoesDeEconomia(): Sugestao[] {
  const linhas = db
    .prepare("SELECT agente, modelo_real, modelo_barato, COUNT(*) AS n, SUM(CASE WHEN resultado <> 'pior' THEN 1 ELSE 0 END) AS ok FROM sombras GROUP BY agente, modelo_real, modelo_barato")
    .all() as { agente: string; modelo_real: string; modelo_barato: string; n: number; ok: number }[];
  return linhas
    .filter((l) => l.n >= 5 && l.ok / l.n >= 0.8 && escolhas()[l.agente] !== l.modelo_barato)
    .map((l) => ({ agente: l.agente, nome: agentById[l.agente]?.nome ?? l.agente, modeloAtual: l.modelo_real, modeloBarato: l.modelo_barato, amostras: l.n, empateOuMelhor: l.ok }));
}

export const listarSombras = (limite = 50) =>
  db.prepare("SELECT * FROM sombras ORDER BY id DESC LIMIT ?").all(limite) as { id: number; ts: number; card_id: number; agente: string; modelo_real: string; modelo_barato: string; resultado: string; custo_barato: number; justificativa: string }[];

/** Aplica a troca sugerida: o agente passa a usar o modelo mais barato (como escolha dele). */
export function aplicarSugestao(agente: string, modelo: string) {
  const atual = escolhas();
  setSetting("modelos_agentes", JSON.stringify({ ...atual, [agente]: modelo }));
}

export function configurarAprendizado(c: { localPrimeiro?: string | null; sombraPct?: number; sombraLocal?: string | null }) {
  if (c.localPrimeiro !== undefined) setSetting("aprendizado_local_primeiro", c.localPrimeiro ? String(c.localPrimeiro).slice(0, 120) : "");
  if (c.sombraLocal !== undefined) setSetting("aprendizado_sombra_local", c.sombraLocal && /^ollama:[\w.:/-]{1,120}$/.test(c.sombraLocal) ? c.sombraLocal : "");
  if (typeof c.sombraPct === "number" && c.sombraPct >= 0 && c.sombraPct <= 100) setSetting("aprendizado_sombra_pct", String(Math.round(c.sombraPct)));
  return { localPrimeiro: modeloLocalPrimeiro(), sombraPct: sombraPct(), sombraLocal: modeloSombraLocal() };
}

/* ---------- Escrever a candidata (modelo) ---------- */

/** Um modelo escreve instruções novas para o agente a partir das devoluções que ele recebeu, e começa o A/B. */
export async function proporCandidata(agente: string): Promise<Variante | null> {
  const { rodarAgente, ferramenta, texto } = await import("./agentes/loop.ts");
  const a = agentById[agente];
  if (!a) throw new Error("Agente inválido.");
  const { atuais, devolucoes } = materialParaCandidata(agente);
  if (devolucoes.length < 3) return null;
  let proposta = "";
  await rodarAgente({
    modelo: "claude-sonnet-5-5",
    agenteId: "chief-of-staff",
    esforco: "low",
    sistema: `Você melhora as instruções de trabalho de ${a.nome} (${a.cargo}) a partir das devoluções que essa pessoa recebeu dos validadores. Português do Brasil.
Escreva de 3 a 8 regras curtas, acionáveis e gerais (que valham para os próximos cards, sem citar cards, clientes ou detalhes de um caso), cobrindo os erros que mais se repetem. Mantenha o que já funciona das instruções atuais. Chame registrar com o texto final.`,
    mensagem: `## Instruções atuais\n${atuais || "(nenhuma ainda)"}\n\n## Devoluções recentes\n${devolucoes.map((d) => `- ${d}`).join("\n")}`,
    ferramentas: [
      ferramenta("registrar", "Registra as instruções novas.", { instrucoes: { type: "string" } }, ["instrucoes"], (e) => {
        proposta = texto(e, "instrucoes", 4000);
        return { texto: "Registrado.", fim: true };
      }),
    ],
    lembrete: "Chame registrar com as instruções.",
    maxRodadas: 3,
  });
  if (!proposta) return null;
  const v = iniciarAB(agente, proposta);
  postFeed(a.sala, agente, `${a.nome} está testando instruções novas (A/B em ${AMOSTRA_AB} cards de cada lado), escritas a partir das devoluções que recebeu`);
  return v;
}

/** Uma vez por dia: propõe A/B para quem anda recebendo muitas devoluções. */
export function iniciarAprendizado() {
  if (process.env.EMPRESA_SEM_REDE === "1" && process.env.EMPRESA_APRENDIZADO !== "1") return;
  const verificar = () => {
    if (getSetting("aprendizado_ab_auto") === "0") return;
    const hoje = new Date().toLocaleDateString("sv-SE");
    if (getSetting("aprendizado_ultimo_dia") === hoje) return;
    setSetting("aprendizado_ultimo_dia", hoje);
    for (const agente of candidatosAoAB().slice(0, 3)) void proporCandidata(agente).catch((e) => console.error("Aprendizado:", e));
  };
  setInterval(verificar, 3600_000).unref();
}

/** Tudo o que a tela de Qualidade mostra sobre o aprendizado. */
export function estadoAprendizado() {
  const variantes = (db.prepare("SELECT * FROM variantes WHERE status <> 'descartada' OR criada_em >= ? ORDER BY id DESC LIMIT 60").all(Date.now() - 30 * 24 * 3600_000) as Linha[])
    .map(deLinha)
    .filter((v) => v.texto || v.status === "testando")
    .map((v) => ({ ...v, nome: agentById[v.agente]?.nome ?? v.agente }));
  const resumo = db.prepare("SELECT resultado, COUNT(*) AS n FROM sombras GROUP BY resultado").all() as { resultado: string; n: number }[];
  return {
    localPrimeiro: modeloLocalPrimeiro(),
    sombraPct: sombraPct(),
    sombraLocal: modeloSombraLocal(),
    abAutomatico: getSetting("aprendizado_ab_auto") !== "0",
    amostraAB: AMOSTRA_AB,
    variantes,
    sombras: Object.fromEntries(resumo.map((r) => [r.resultado, r.n])) as Record<string, number>,
    ultimasSombras: listarSombras(10).map((s) => ({ ...s, nome: agentById[s.agente]?.nome ?? s.agente })),
    sugestoes: sugestoesDeEconomia(),
  };
}

/** Encerra o A/B no ar sem decidir (a candidata é descartada). */
export function encerrarAB(agente: string) {
  db.prepare("UPDATE variantes SET status = 'descartada' WHERE agente = ? AND status = 'testando'").run(agente);
}

export function definirABAutomatico(ativo: boolean) {
  setSetting("aprendizado_ab_auto", ativo ? "1" : "0");
}
