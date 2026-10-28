import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { colunaDe } from "@empresa/shared";
import { apagarSegredo, lerSegredo, salvarSegredo } from "../secrets.ts";
import { comentar, ErroCard, lerCard, ultimaEntrega } from "../tarefas.ts";
import { worktreeDoCard } from "./workspace.ts";

// Pull request no GitHub em vez de merge local: publica a branch do card no repositório do projeto
// e abre o PR com o resumo da entrega, para o CI de lá rodar e o time revisar. Só com o seu clique.
// O token (fine-grained, só "Contents" e "Pull requests" do repositório) fica cifrado como as outras chaves;
// no push ele vai só na URL daquele comando, nunca fica gravado no repositório.

const git = promisify(execFile);
const SEG = "github_token";

export const estadoGithub = () => ({ configurado: !!lerSegredo(SEG) });

export function configurarGithub(token: string | null) {
  if (token === null) apagarSegredo(SEG);
  else {
    const t = token.trim();
    if (!/^(github_pat_|ghp_|gho_)[A-Za-z0-9_]{20,}$/.test(t)) throw new ErroCard("Isso não parece um token do GitHub (começa com github_pat_ ou ghp_).");
    salvarSegredo(SEG, t);
  }
  return estadoGithub();
}

/** owner/repo do remote "origin", se for do GitHub. */
async function repositorioDoGithub(repo: string): Promise<{ dono: string; nome: string } | null> {
  const r = await git("git", ["-C", repo, "remote", "get-url", "origin"]).catch(() => null);
  const url = r?.stdout.trim() ?? "";
  const m = /github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/.exec(url);
  return m ? { dono: m[1]!, nome: m[2]! } : null;
}

async function api<T>(caminho: string, token: string, metodo = "GET", corpo?: unknown): Promise<T> {
  const base = process.env.GITHUB_API_URL ?? "https://api.github.com";
  const res = await fetch(`${base}${caminho}`, {
    method: metodo,
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", ...(corpo ? { "content-type": "application/json" } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const json = (await res.json().catch(() => ({}))) as T & { message?: string; errors?: { message?: string }[] };
  if (!res.ok) throw new ErroCard(`GitHub recusou (${res.status}): ${json.message ?? ""} ${json.errors?.map((e) => e.message).join("; ") ?? ""}`.trim());
  return json;
}

/** Publica a branch do card e abre (ou reaproveita) o pull request. */
export async function abrirPullRequest(cardId: number): Promise<{ url: string; numero: number }> {
  const token = lerSegredo(SEG);
  if (!token) throw new ErroCard("Cadastre um token do GitHub primeiro.");
  const card = lerCard(cardId);
  const wt = worktreeDoCard(card);
  if (!wt || wt.cardId !== card.id) throw new ErroCard("Este card não tem código.");
  if (colunaDe(card.fluxo, card.coluna)?.tipo !== "feito") throw new ErroCard("Aprove o card antes de abrir o pull request.");
  const gh = await repositorioDoGithub(wt.repo);
  if (!gh) throw new ErroCard("O remote \"origin\" deste projeto não é do GitHub.");
  const info = await api<{ default_branch: string }>(`/repos/${gh.dono}/${gh.nome}`, token);
  await git("git", ["-C", wt.caminho, "push", `https://x-access-token:${token}@github.com/${gh.dono}/${gh.nome}.git`, `HEAD:refs/heads/${wt.branch}`], {
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    timeout: 120_000,
  }).catch((e: Error) => {
    // Nunca devolve a mensagem crua: ela pode conter a URL com o token.
    throw new ErroCard(`Não consegui publicar a branch: ${e.message.replaceAll(token, "***").split("\n").slice(0, 2).join(" ")}`);
  });
  const existentes = await api<{ html_url: string; number: number }[]>(`/repos/${gh.dono}/${gh.nome}/pulls?head=${gh.dono}:${encodeURIComponent(wt.branch)}&state=open`, token);
  if (existentes[0]) return { url: existentes[0].html_url, numero: existentes[0].number };
  const e = ultimaEntrega(card.id);
  const pr = await api<{ html_url: string; number: number }>(`/repos/${gh.dono}/${gh.nome}/pulls`, token, "POST", {
    title: `${card.chave}: ${card.titulo}`,
    head: wt.branch,
    base: info.default_branch,
    body: `${e?.resumo ?? ""}\n\n## Critérios de aceite\n${card.criterios || "(nenhum)"}\n\n---\nAberto pelo Hefesto (${card.chave}), aprovado pelo CEO.`,
  });
  comentar(card.id, "voce", "comentario", `Pull request #${pr.number} aberto no GitHub: ${pr.html_url}`);
  return { url: pr.html_url, numero: pr.number };
}
