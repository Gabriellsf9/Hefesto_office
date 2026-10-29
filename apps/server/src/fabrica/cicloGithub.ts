import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { agentById } from "@empresa/org";
import { colunaDe, colunaDeEntrada, colunaDeTrabalho, type Card } from "@empresa/shared";
import { db } from "../db.ts";
import { lerSegredo } from "../secrets.ts";
import { comentar, criarCard, editarCard, lerCard, listarCards, mover } from "../tarefas.ts";
import { listarProjetos } from "../projetos.ts";
import { raizDoRepositorio } from "./workspace.ts";
import { orientarCard } from "../agentes/motor.ts";

// O ciclo com o GitHub (como o Codex faz): issue com a etiqueta "hefesto" vira card; revisão pedindo mudança ou
// comentário em linha no PR de um card vira devolução; CI vermelho no PR também. O card volta para o agente, que
// corrige, e o PR é atualizado quando ele for aprovado de novo. Roda a cada 5 minutos, só com o token cadastrado.

const run = promisify(execFile);
const ETIQUETA = "hefesto";

db.exec(`CREATE TABLE IF NOT EXISTS github_issues (
  dono TEXT NOT NULL, nome TEXT NOT NULL, numero INTEGER NOT NULL, card_id INTEGER NOT NULL, PRIMARY KEY (dono, nome, numero)
)`);
db.exec(`CREATE TABLE IF NOT EXISTS github_prs (
  card_id INTEGER PRIMARY KEY, dono TEXT NOT NULL, nome TEXT NOT NULL, numero INTEGER NOT NULL,
  visto_ate INTEGER NOT NULL DEFAULT 0, ci_reportado TEXT
)`);

export function registrarPrDoCard(cardId: number, dono: string, nome: string, numero: number) {
  db.prepare("INSERT OR REPLACE INTO github_prs (card_id, dono, nome, numero, visto_ate, ci_reportado) VALUES (?, ?, ?, ?, ?, NULL)").run(cardId, dono, nome, numero, Date.now());
}

async function gh<T>(caminho: string, token: string, metodo = "GET", corpo?: unknown): Promise<T> {
  const base = process.env.GITHUB_API_URL ?? "https://api.github.com";
  const res = await fetch(`${base}${caminho}`, {
    method: metodo,
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", ...(corpo ? { "content-type": "application/json" } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`GitHub respondeu ${res.status} em ${caminho}`);
  return (await res.json()) as T;
}

async function repositorioDoGithub(pasta: string): Promise<{ dono: string; nome: string } | null> {
  const repo = await raizDoRepositorio(pasta).catch(() => pasta);
  const r = await run("git", ["-C", repo, "remote", "get-url", "origin"]).catch(() => null);
  const m = /github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?\s*$/.exec(r?.stdout ?? "");
  return m ? { dono: m[1]!, nome: m[2]! } : null;
}

const liderDe = (sala: Card["sala"]) => Object.values(agentById).find((a) => a.sala === sala && a.lider)?.id ?? Object.values(agentById).find((a) => a.sala === sala)?.id ?? null;

/** Card terminado (ou esperando você) volta para o trabalho do dono, com o motivo como devolução. */
function devolverAoTrabalho(card: Card, texto: string) {
  comentar(card.id, "voce", "devolucao", texto);
  // Rodando agora: o agente recebe na hora. Parado: volta para a coluna de trabalho.
  if (orientarCard(card.id, texto)) return;
  const tipo = colunaDe(card.fluxo, card.coluna)?.tipo;
  if (tipo === "feito" || tipo === "ceo" || card.emValidacao) {
    if (card.emValidacao) editarCard(card.id, { emValidacao: false } as never);
    mover(card.id, colunaDeTrabalho(card.fluxo, card.sala), "voce");
  }
}

type Issue = { number: number; title: string; body: string | null; html_url: string; labels: { name: string }[]; pull_request?: unknown };
type Revisao = { id: number; state: string; body: string | null; user: { login: string }; submitted_at: string };
type ComentarioLinha = { id: number; body: string; path: string; line: number | null; user: { login: string }; created_at: string };

export async function sincronizarGithub(): Promise<{ issues: number; devolucoes: number }> {
  const token = lerSegredo("github_token");
  if (!token) return { issues: 0, devolucoes: 0 };
  let issues = 0;
  let devolucoes = 0;

  // 1) Issues com a etiqueta "hefesto" nos repositórios dos projetos vinculados.
  for (const p of listarProjetos()) {
    const repo = await repositorioDoGithub(p.caminho);
    if (!repo) continue;
    const lista = await gh<Issue[]>(`/repos/${repo.dono}/${repo.nome}/issues?labels=${ETIQUETA}&state=open&per_page=30`, token).catch(() => []);
    for (const i of lista) {
      if (i.pull_request) continue;
      if (db.prepare("SELECT 1 FROM github_issues WHERE dono = ? AND nome = ? AND numero = ?").get(repo.dono, repo.nome, i.number)) continue;
      const bug = i.labels.some((l) => /bug/i.test(l.name));
      const card = criarCard({
        titulo: `#${i.number} ${i.title}`.slice(0, 200),
        descricao: `${(i.body ?? "").slice(0, 15_000)}\n\n---\nIssue do GitHub: ${i.html_url}`,
        sala: "desenvolvimento",
        fluxo: "software",
        coluna: colunaDeEntrada("software"),
        tipo: bug ? "bug" : "tarefa",
        dono: liderDe("desenvolvimento"),
        projetoId: p.id,
        nivel: "N1",
        prioridade: bug ? "P1" : "P2",
        etiquetas: ["github"],
      });
      db.prepare("INSERT INTO github_issues (dono, nome, numero, card_id) VALUES (?, ?, ?, ?)").run(repo.dono, repo.nome, i.number, card.id);
      await gh(`/repos/${repo.dono}/${repo.nome}/issues/${i.number}/comments`, token, "POST", { body: `Virou o card ${card.chave} no Hefesto.` }).catch(() => null);
      issues++;
    }
  }

  // 2) Revisões e comentários em linha nos PRs dos cards; 3) CI vermelho.
  const porId = new Map(listarCards().map((c) => [c.id, c]));
  for (const pr of db.prepare("SELECT * FROM github_prs").all() as { card_id: number; dono: string; nome: string; numero: number; visto_ate: number; ci_reportado: string | null }[]) {
    const card = porId.get(pr.card_id);
    if (!card) continue;
    const base = `/repos/${pr.dono}/${pr.nome}/pulls/${pr.numero}`;
    const info = await gh<{ state: string; merged: boolean; head: { sha: string } }>(base, token).catch(() => null);
    if (!info || info.state !== "open") continue;
    const revisoes = (await gh<Revisao[]>(`${base}/reviews`, token).catch(() => [])).filter((r) => Date.parse(r.submitted_at) > pr.visto_ate && r.state === "CHANGES_REQUESTED");
    const linhas = (await gh<ComentarioLinha[]>(`${base}/comments`, token).catch(() => [])).filter((c) => Date.parse(c.created_at) > pr.visto_ate);
    const novos = [
      ...revisoes.map((r) => `- @${r.user.login} pediu mudanças: ${(r.body ?? "").trim() || "(sem texto)"}`),
      ...linhas.map((c) => `- @${c.user.login} em \`${c.path}${c.line ? `:${c.line}` : ""}\`: ${c.body.trim()}`),
    ];
    // Visto até o horário do último item processado (do relógio do GitHub, não deste computador: com o relógio de lá
    // adiantado, o mesmo comentário voltava na rodada seguinte).
    let visto = pr.visto_ate;
    if (novos.length) {
      devolverAoTrabalho(card, `Revisão do PR #${pr.numero} no GitHub:\n${novos.join("\n")}\n\nCorrija e entregue de novo; o PR é atualizado quando a nova versão for aprovada.`);
      devolucoes++;
      visto = Math.max(pr.visto_ate, ...revisoes.map((x) => Date.parse(x.submitted_at)), ...linhas.map((x) => Date.parse(x.created_at)));
    }
    const checks = await gh<{ check_runs: { name: string; conclusion: string | null; status: string }[] }>(`/repos/${pr.dono}/${pr.nome}/commits/${info.head.sha}/check-runs`, token).catch(() => ({ check_runs: [] }));
    const falhas = checks.check_runs.filter((c) => c.status === "completed" && ["failure", "timed_out", "cancelled"].includes(c.conclusion ?? ""));
    if (falhas.length && pr.ci_reportado !== info.head.sha) {
      devolverAoTrabalho(card, `❌ O CI do PR #${pr.numero} falhou no commit ${info.head.sha.slice(0, 7)}: ${falhas.map((f) => f.name).join(", ")}. Rode as mesmas verificações na estação, corrija e entregue de novo.`);
      devolucoes++;
      db.prepare("UPDATE github_prs SET ci_reportado = ? WHERE card_id = ?").run(info.head.sha, pr.card_id);
    }
    if (visto !== pr.visto_ate) db.prepare("UPDATE github_prs SET visto_ate = ? WHERE card_id = ?").run(visto, pr.card_id);
  }
  return { issues, devolucoes };
}

/** Lê o card só para o motor (evita ciclo de importação com o github.ts). */
export const cardExiste = (id: number) => {
  try {
    lerCard(id);
    return true;
  } catch {
    return false;
  }
};
