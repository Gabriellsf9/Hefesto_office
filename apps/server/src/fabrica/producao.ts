import { colunaDe, type Card, type PreviaPublicada } from "@empresa/shared";
import { agentById } from "@empresa/org";
import { db, getSetting, setSetting } from "../db.ts";
import { emit, postChat, postFeed } from "../bus.ts";
import { apagarSegredo, lerSegredo, salvarSegredo } from "../secrets.ts";
import { fichaDoProjeto } from "../projetos.ts";
import { abrirBug, comentar, ErroCard, lerCard, listarCards } from "../tarefas.ts";
import { auditar } from "../confianca/auditoria.ts";
import { aoAbrirPullRequest, publicarBranch } from "./github.ts";

// Do card à produção:
// 1. Prévia publicada: com o seu clique, a branch do card vai para o GitHub e a Vercel faz o deploy de prévia;
//    o Hefesto acompanha o deploy e põe o link no card (e no Telegram) para você testar antes de aprovar.
// 2. Monitoramento depois do merge: por 48 h, os erros novos do Sentry no projeto viram cards de bug
//    ligados ao card que mudou o código.
// 3. Métrica de sucesso por card: o que deve mudar e quando medir; no prazo, o Hefesto pergunta o resultado.
// Os tokens (Vercel e Sentry) são seus e ficam cifrados; sem eles, nada disso roda.

const VERCEL = "vercel_token";
const SENTRY = "sentry_token";
const vercelApi = () => process.env.VERCEL_API_URL ?? "https://api.vercel.com";
const sentryApi = () => process.env.SENTRY_API_URL ?? "https://sentry.io";
const intervalo = (padrao: number) => Number(process.env.HEFESTO_POLL_MS) || padrao;

/* ---------- Configuração ---------- */

interface VinculoProjeto {
  /** Id ou nome do projeto na Vercel. */
  vercel: string | null;
  /** "organizacao/projeto" no Sentry. */
  sentry: string | null;
}

export const vinculoDoProjeto = (projetoId: number): VinculoProjeto => {
  try {
    return { vercel: null, sentry: null, ...(JSON.parse(getSetting(`projeto_${projetoId}_producao`) ?? "{}") as Partial<VinculoProjeto>) };
  } catch {
    return { vercel: null, sentry: null };
  }
};

export const estadoProducao = () => ({
  vercel: { configurado: !!lerSegredo(VERCEL), time: getSetting("vercel_time") || null },
  sentry: { configurado: !!lerSegredo(SENTRY) },
});

export function configurarProducao(c: { vercelToken?: string | null; vercelTime?: string | null; sentryToken?: string | null }) {
  if (c.vercelToken === null) apagarSegredo(VERCEL);
  else if (typeof c.vercelToken === "string" && c.vercelToken.trim()) {
    if (!/^[A-Za-z0-9_-]{20,}$/.test(c.vercelToken.trim())) throw new ErroCard("Isso não parece um token da Vercel.");
    salvarSegredo(VERCEL, c.vercelToken.trim());
  }
  if (c.vercelTime !== undefined) setSetting("vercel_time", (c.vercelTime ?? "").trim().slice(0, 80));
  if (c.sentryToken === null) apagarSegredo(SENTRY);
  else if (typeof c.sentryToken === "string" && c.sentryToken.trim()) {
    if (!/^(sntrys_|sntryu_)?[A-Za-z0-9_=-]{30,}$/.test(c.sentryToken.trim())) throw new ErroCard("Isso não parece um token do Sentry.");
    salvarSegredo(SENTRY, c.sentryToken.trim());
  }
  return estadoProducao();
}

export function vincularProjeto(projetoId: number, v: Partial<VinculoProjeto>) {
  if (!fichaDoProjeto(projetoId)) throw new ErroCard("Projeto não encontrado.");
  const atual = vinculoDoProjeto(projetoId);
  const limpo = (x: string | null | undefined, re: RegExp) => (x === undefined ? undefined : x && re.test(x.trim()) ? x.trim() : null);
  const novo: VinculoProjeto = {
    vercel: limpo(v.vercel, /^[\w.-]{1,100}$/) ?? (v.vercel === undefined ? atual.vercel : null),
    sentry: limpo(v.sentry, /^[\w.-]{1,100}\/[\w.-]{1,100}$/) ?? (v.sentry === undefined ? atual.sentry : null),
  };
  setSetting(`projeto_${projetoId}_producao`, JSON.stringify(novo));
  return novo;
}

/* ---------- 1. Prévia publicada (Vercel) ---------- */

export const previaPublicadaDo = (cardId: number): PreviaPublicada | null => {
  const v = getSetting(`card_${cardId}_previa_publicada`);
  return v ? (JSON.parse(v) as PreviaPublicada) : null;
};

function salvarPrevia(cardId: number, p: PreviaPublicada) {
  setSetting(`card_${cardId}_previa_publicada`, JSON.stringify(p));
  emit({ type: "previaPublicada", cardId, previa: p });
}

async function vercel<T>(caminho: string): Promise<T> {
  const token = lerSegredo(VERCEL);
  if (!token) throw new ErroCard("Cadastre o token da Vercel primeiro.");
  const time = getSetting("vercel_time");
  const sep = caminho.includes("?") ? "&" : "?";
  const res = await fetch(`${vercelApi()}${caminho}${time ? `${sep}teamId=${encodeURIComponent(time)}` : ""}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) throw new ErroCard(`A Vercel recusou (${res.status}): ${json.error?.message ?? ""}`.trim());
  return json;
}

interface DeployVercel {
  uid: string;
  url: string;
  state?: string;
  readyState?: string;
  inspectorUrl?: string;
  meta?: { githubCommitSha?: string; githubCommitRef?: string };
  created: number;
}

/** Publica a branch e acompanha o deploy de prévia da Vercel até ficar pronto (ou falhar). Só com o seu clique. */
export async function publicarPrevia(cardId: number): Promise<PreviaPublicada> {
  const card = lerCard(cardId);
  if (card.projetoId === null) throw new ErroCard("Este card não é de um projeto.");
  const projetoVercel = vinculoDoProjeto(card.projetoId).vercel;
  if (!projetoVercel) throw new ErroCard("Ligue este projeto a um projeto da Vercel primeiro (Operação → Projetos).");
  if (!lerSegredo(VERCEL)) throw new ErroCard("Cadastre o token da Vercel primeiro.");
  const atual = previaPublicadaDo(cardId);
  if (atual && (atual.status === "publicando" || atual.status === "construindo") && Date.now() - atual.desde < 20 * 60_000) return atual;
  salvarPrevia(cardId, { status: "publicando", branch: "", sha: "", url: null, inspetor: null, desde: Date.now(), erro: null });
  let pub: Awaited<ReturnType<typeof publicarBranch>>;
  try {
    pub = await publicarBranch(cardId);
  } catch (e) {
    const p: PreviaPublicada = { status: "erro", branch: "", sha: "", url: null, inspetor: null, desde: Date.now(), erro: (e as Error).message };
    salvarPrevia(cardId, p);
    throw e;
  }
  auditar("voce", "publicou a prévia", card.chave, `branch ${pub.branch} (${pub.sha.slice(0, 7)})`);
  const p: PreviaPublicada = { status: "construindo", branch: pub.branch, sha: pub.sha, url: null, inspetor: null, desde: Date.now(), erro: null };
  salvarPrevia(cardId, p);
  void acompanharDeploy(cardId, projetoVercel, p);
  return p;
}

async function acompanharDeploy(cardId: number, projetoVercel: string, p: PreviaPublicada) {
  const limite = Date.now() + Number(process.env.HEFESTO_PREVIA_TIMEOUT_MS || 20 * 60_000);
  while (Date.now() < limite) {
    await new Promise((r) => setTimeout(r, intervalo(15_000)));
    try {
      const r = await vercel<{ deployments: DeployVercel[] }>(`/v6/deployments?projectId=${encodeURIComponent(projetoVercel)}&limit=20&meta-githubCommitRef=${encodeURIComponent(p.branch)}`);
      const d = r.deployments.find((x) => x.meta?.githubCommitSha === p.sha) ?? null;
      if (!d) continue;
      const estado = d.readyState ?? d.state ?? "";
      const inspetor = d.inspectorUrl ?? null;
      if (estado === "READY") {
        const url = `https://${d.url.replace(/^https?:\/\//, "")}`;
        salvarPrevia(cardId, { ...p, status: "pronta", url, inspetor });
        const card = lerCard(cardId);
        comentar(cardId, "devops", "comentario", `🌐 Prévia publicada na Vercel: ${url}\nTeste por lá antes de aprovar (commit ${p.sha.slice(0, 7)}).`);
        postFeed(card.sala, "devops", `Prévia do ${card.chave} no ar: ${url}`);
        return;
      }
      if (estado === "ERROR" || estado === "CANCELED") {
        salvarPrevia(cardId, { ...p, status: "erro", inspetor, erro: estado === "ERROR" ? "O build na Vercel falhou." : "O deploy foi cancelado." });
        comentar(cardId, "devops", "comentario", `❌ O deploy de prévia na Vercel falhou${inspetor ? `: ${inspetor}` : ""}. Veja o log do build por lá.`);
        return;
      }
    } catch (e) {
      salvarPrevia(cardId, { ...p, status: "erro", erro: (e as Error).message });
      return;
    }
  }
  salvarPrevia(cardId, { ...p, status: "erro", erro: "A Vercel não terminou o deploy a tempo (20 min). O projeto está ligado ao repositório do GitHub?" });
}

/* ---------- 2. Monitoramento depois do merge (Sentry) ---------- */

db.exec(`CREATE TABLE IF NOT EXISTS vigilias (
  card_id INTEGER PRIMARY KEY,
  projeto_id INTEGER NOT NULL,
  desde INTEGER NOT NULL,
  ate INTEGER NOT NULL,
  bugs INTEGER NOT NULL DEFAULT 0
)`);
db.exec("CREATE TABLE IF NOT EXISTS sentry_vistos (issue TEXT PRIMARY KEY, card_id INTEGER, ts INTEGER NOT NULL)");

const JANELA_MS = 48 * 3600_000;

/** O código do card entrou (merge local ou PR aberto): vigia o Sentry do projeto por 48 h. */
export function vigiarDepoisDoMerge(cardId: number) {
  const card = lerCard(cardId);
  if (card.projetoId === null || !vinculoDoProjeto(card.projetoId).sentry || !lerSegredo(SENTRY)) return;
  const agora = Date.now();
  db.prepare("INSERT INTO vigilias (card_id, projeto_id, desde, ate) VALUES (?, ?, ?, ?) ON CONFLICT(card_id) DO UPDATE SET ate = excluded.ate").run(cardId, card.projetoId, agora, agora + JANELA_MS);
  comentar(cardId, "sre", "comentario", "👀 Vigiando os erros do Sentry deste projeto pelas próximas 48 h: erro novo vira card de bug ligado a este.");
}
aoAbrirPullRequest.push(vigiarDepoisDoMerge);

interface IssueSentry {
  id: string;
  title: string;
  culprit?: string;
  permalink?: string;
  firstSeen: string;
  count?: string | number;
  userCount?: number;
  level?: string;
}

export async function conferirSentry(): Promise<number> {
  const token = lerSegredo(SENTRY);
  if (!token) return 0;
  const agora = Date.now();
  const ativas = db.prepare("SELECT * FROM vigilias WHERE ate > ?").all(agora) as { card_id: number; projeto_id: number; desde: number; ate: number }[];
  let abertos = 0;
  // Um card por projeto de cada vez: erro novo depois de vários merges vai para o mais recente.
  const porProjeto = new Map<number, (typeof ativas)[number]>();
  for (const v of ativas) if ((porProjeto.get(v.projeto_id)?.desde ?? 0) < v.desde) porProjeto.set(v.projeto_id, v);
  for (const v of porProjeto.values()) {
    const alvo = vinculoDoProjeto(v.projeto_id).sentry;
    if (!alvo) continue;
    const [org, proj] = alvo.split("/");
    let issues: IssueSentry[] = [];
    try {
      const res = await fetch(`${sentryApi()}/api/0/projects/${encodeURIComponent(org!)}/${encodeURIComponent(proj!)}/issues/?query=${encodeURIComponent("is:unresolved")}&statsPeriod=24h&sort=new`, {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`Sentry respondeu ${res.status}`);
      issues = (await res.json()) as IssueSentry[];
    } catch (e) {
      console.error("Sentry:", e);
      continue;
    }
    for (const i of issues) {
      if (Date.parse(i.firstSeen) < v.desde) continue;
      if (db.prepare("SELECT 1 FROM sentry_vistos WHERE issue = ?").get(i.id)) continue;
      const origem = lerCard(v.card_id);
      const usuarios = i.userCount ?? 0;
      const sev: Card["severidade"] = i.level === "fatal" || usuarios >= 10 ? "S1" : usuarios >= 2 ? "S2" : "S3";
      let bug: Card;
      try {
        bug = abrirBug(
          v.card_id,
          {
            titulo: `Erro em produção: ${i.title}`.slice(0, 160),
            descricao: `Apareceu no Sentry depois do merge do ${origem.chave} (${new Date(Date.parse(i.firstSeen)).toLocaleString("pt-BR")}).

- Onde: ${i.culprit ?? "—"}
- Ocorrências: ${i.count ?? "?"} · usuários afetados: ${usuarios}
- Nível: ${i.level ?? "error"}
- Sentry: ${i.permalink ?? i.id}

Reproduza, corrija e diga se o problema veio do ${origem.chave}.`,
            severidade: sev,
          },
          "sre",
        );
      } catch (e) {
        console.error("Bug do Sentry:", e);
        continue;
      }
      db.prepare("INSERT INTO sentry_vistos (issue, card_id, ts) VALUES (?, ?, ?)").run(i.id, bug.id, agora);
      db.prepare("UPDATE vigilias SET bugs = bugs + 1 WHERE card_id = ?").run(v.card_id);
      abertos++;
      auditar("sre", "bug do Sentry", bug.chave, `${i.title} (depois do ${origem.chave})`);
      postFeed(bug.sala, "sre", `Erro novo em produção depois do ${origem.chave}: ${i.title} → ${bug.chave}`);
      if (sev === "S1") postChat("sre", `Erro grave em produção depois do ${origem.chave} (${usuarios} usuário(s)): ${i.title}. Abri o ${bug.chave}.`);
    }
  }
  return abertos;
}

/* ---------- 3. Métrica de sucesso por card ---------- */

db.exec(`CREATE TABLE IF NOT EXISTS metricas (
  card_id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  alvo TEXT NOT NULL,
  como_medir TEXT NOT NULL DEFAULT '',
  prazo_dias INTEGER NOT NULL,
  medir_em INTEGER,
  perguntado INTEGER NOT NULL DEFAULT 0,
  resultado TEXT,
  atingiu INTEGER,
  medido_em INTEGER
)`);

export interface Metrica {
  cardId: number;
  nome: string;
  alvo: string;
  comoMedir: string;
  prazoDias: number;
  medirEm: number | null;
  resultado: string | null;
  atingiu: boolean | null;
  medidoEm: number | null;
}

const deLinhaMetrica = (r: Record<string, string | number | null>): Metrica => ({
  cardId: r.card_id as number,
  nome: r.nome as string,
  alvo: r.alvo as string,
  comoMedir: r.como_medir as string,
  prazoDias: r.prazo_dias as number,
  medirEm: (r.medir_em as number | null) ?? null,
  resultado: (r.resultado as string | null) ?? null,
  atingiu: r.atingiu === null || r.atingiu === undefined ? null : r.atingiu === 1,
  medidoEm: (r.medido_em as number | null) ?? null,
});

export const metricaDoCard = (cardId: number): Metrica | null => {
  const r = db.prepare("SELECT * FROM metricas WHERE card_id = ?").get(cardId) as Record<string, string | number | null> | undefined;
  return r ? deLinhaMetrica(r) : null;
};

const feito = (c: Card) => colunaDe(c.fluxo, c.coluna)?.tipo === "feito";

export function definirMetrica(cardId: number, m: { nome: string; alvo: string; comoMedir?: string; prazoDias: number } | null): Metrica | null {
  const card = lerCard(cardId);
  if (!m) {
    db.prepare("DELETE FROM metricas WHERE card_id = ?").run(cardId);
    return null;
  }
  const nome = String(m.nome ?? "").trim().slice(0, 160);
  const alvo = String(m.alvo ?? "").trim().slice(0, 160);
  const prazo = Math.round(Number(m.prazoDias));
  if (!nome || !alvo) throw new ErroCard("Diga o nome da métrica e o alvo.");
  if (!Number.isFinite(prazo) || prazo < 1 || prazo > 365) throw new ErroCard("O prazo para medir vai de 1 a 365 dias.");
  // Card já entregue: o prazo conta de agora.
  const medirEm = feito(card) ? Date.now() + prazo * 86_400_000 : null;
  db.prepare(
    `INSERT INTO metricas (card_id, nome, alvo, como_medir, prazo_dias, medir_em) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(card_id) DO UPDATE SET nome = excluded.nome, alvo = excluded.alvo, como_medir = excluded.como_medir, prazo_dias = excluded.prazo_dias,
       medir_em = COALESCE(metricas.medir_em, excluded.medir_em), perguntado = CASE WHEN metricas.prazo_dias <> excluded.prazo_dias THEN 0 ELSE metricas.perguntado END`,
  ).run(cardId, nome, alvo, String(m.comoMedir ?? "").trim().slice(0, 1000), prazo, medirEm);
  return metricaDoCard(cardId);
}

/** Número do texto (aceita vírgula e %), para comparar com o alvo. */
const numero = (t: string) => {
  const m = /-?\d+(?:[.,]\d+)?/.exec(t);
  return m ? Number(m[0].replace(",", ".")) : null;
};

/** Atingiu o alvo? Alvo como "≥ 5%", "> 100", "< 2 s", "até 3": compara pelo número. Sem número, quem diz é você. */
export function compararComAlvo(alvo: string, resultado: string): boolean | null {
  const a = numero(alvo);
  const r = numero(resultado);
  if (a === null || r === null) return null;
  if (/(≤|<=|<|até|no máximo|menos)/i.test(alvo)) return r <= a;
  return r >= a;
}

export function registrarResultadoDaMetrica(cardId: number, resultado: string, atingiu?: boolean | null): Metrica {
  const m = metricaDoCard(cardId);
  if (!m) throw new ErroCard("Este card não tem métrica.");
  const r = resultado.trim().slice(0, 300);
  if (!r) throw new ErroCard("Diga o resultado.");
  const ok = typeof atingiu === "boolean" ? atingiu : compararComAlvo(m.alvo, r);
  db.prepare("UPDATE metricas SET resultado = ?, atingiu = ?, medido_em = ? WHERE card_id = ?").run(r, ok === null ? null : ok ? 1 : 0, Date.now(), cardId);
  const card = lerCard(cardId);
  comentar(cardId, "voce", "comentario", `📈 Resultado da métrica "${m.nome}": ${r} (alvo: ${m.alvo})${ok === null ? "" : ok ? " — atingiu" : " — não atingiu"}.`);
  if (ok === false && card.dono) postFeed(card.sala, card.dono, `${card.chave} não atingiu a métrica "${m.nome}" (${r}, alvo ${m.alvo}): vale um card para entender por quê`);
  auditar("voce", "resultado da métrica", card.chave, `${m.nome}: ${r}`);
  return metricaDoCard(cardId)!;
}

/** Cards entregues ganham a data de medir; no prazo, o Hefesto pergunta o resultado a você. */
export function conferirMetricas(): number {
  const agora = Date.now();
  const cards = new Map(listarCards().map((c) => [c.id, c]));
  for (const r of db.prepare("SELECT card_id, prazo_dias FROM metricas WHERE medir_em IS NULL").all() as { card_id: number; prazo_dias: number }[]) {
    const c = cards.get(r.card_id);
    if (c && feito(c)) db.prepare("UPDATE metricas SET medir_em = ? WHERE card_id = ?").run(agora + r.prazo_dias * 86_400_000, r.card_id);
  }
  let perguntas = 0;
  for (const r of db.prepare("SELECT * FROM metricas WHERE medir_em <= ? AND perguntado = 0 AND resultado IS NULL").all(agora) as Record<string, string | number | null>[]) {
    const m = deLinhaMetrica(r);
    const c = cards.get(m.cardId);
    if (!c) continue;
    db.prepare("UPDATE metricas SET perguntado = 1 WHERE card_id = ?").run(m.cardId);
    const quem = c.dono && agentById[c.dono] ? c.dono : "chief-of-staff";
    comentar(m.cardId, quem, "comentario", `❓ Pergunta para o CEO: já dá para medir "${m.nome}" (alvo: ${m.alvo})${m.comoMedir ? `. Como medir: ${m.comoMedir}` : ""}. Qual foi o resultado? Registre na métrica do card.`);
    postChat(quem, `Hora de medir o ${c.chave} (${c.titulo}): "${m.nome}", alvo ${m.alvo}. Qual foi o resultado?`);
    perguntas++;
  }
  return perguntas;
}

export function iniciarProducao() {
  setInterval(() => void conferirSentry().catch((e) => console.error("Sentry:", e)), intervalo(15 * 60_000)).unref();
  setInterval(() => {
    try {
      conferirMetricas();
    } catch (e) {
      console.error("Métricas:", e);
    }
  }, intervalo(60 * 60_000)).unref();
}
