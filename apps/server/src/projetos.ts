import { execFile } from "node:child_process";
import { readdir, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, isAbsolute, sep } from "node:path";
import { promisify } from "node:util";
import type { Projeto } from "@empresa/shared";
import { db, garantirColuna, getSetting, setSetting } from "./db.ts";
import { emit } from "./bus.ts";
import { DATA_DIR, ROOT } from "./paths.ts";
import { aoAprovar, ErroCard, listarCards, ultimaEntrega } from "./tarefas.ts";
import { urlLocalValida } from "./fabrica/capturas.ts";

// Projetos da sua máquina (PLANO.md, seção 4.4). Aqui só cadastramos a pasta e
// lemos o básico (git, branch, manifestos). Os agentes nunca mexem na pasta
// original: quando forem trabalhar (Fase 2c/4), usam um git worktree em workspace/.

const exec = promisify(execFile);

db.exec(`
  CREATE TABLE IF NOT EXISTS projetos (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    nome      TEXT NOT NULL,
    caminho   TEXT NOT NULL UNIQUE,
    git       INTEGER NOT NULL,
    branch    TEXT,
    sinais    TEXT NOT NULL,
    criado_em INTEGER NOT NULL
  );
`);
garantirColuna("projetos", "ficha", "TEXT");
garantirColuna("projetos", "url_local", "TEXT");

// Raio-x aprovado por você vira a Ficha do Projeto, que todos os agentes leem.
aoAprovar.push((card) => {
  if (!card.projetoId || !card.etiquetas.includes("raio-x")) return;
  const entrega = ultimaEntrega(card.id);
  if (!entrega) return;
  db.prepare("UPDATE projetos SET ficha = ? WHERE id = ?").run(entrega.conteudo, card.projetoId);
  publicar();
});

export function fichaDoProjeto(id: number | null): { nome: string; caminho: string; ficha: string | null; urlLocal: string | null } | null {
  if (id === null) return null;
  const r = db.prepare("SELECT nome, caminho, ficha, url_local AS urlLocal FROM projetos WHERE id = ?").get(id) as
    | { nome: string; caminho: string; ficha: string | null; urlLocal: string | null }
    | undefined;
  return r ?? null;
}

/** Endereço local do app (só localhost), usado nos prints de treinamento e QA. */
export function definirUrlLocal(id: number, url: string | null) {
  if (!listarProjetos().some((p) => p.id === id)) throw new ErroCard("Projeto não encontrado.", 404);
  const limpo = url?.trim() || null;
  if (limpo && !urlLocalValida(limpo)) throw new ErroCard("Use um endereço local, como http://localhost:3000.");
  db.prepare("UPDATE projetos SET url_local = ? WHERE id = ?").run(limpo, id);
  publicar();
}

const MANIFESTOS = [
  "package.json", "pnpm-lock.yaml", "yarn.lock", "tsconfig.json", "next.config.js", "next.config.ts", "next.config.mjs",
  "vite.config.ts", "vite.config.js", "pyproject.toml", "requirements.txt", "go.mod", "Cargo.toml", "pom.xml",
  "build.gradle", "build.gradle.kts", "Gemfile", "composer.json", "pubspec.yaml", "Package.swift", "Dockerfile",
  "docker-compose.yml", "compose.yaml", ".github",
];

type Linha = {
  id: number; nome: string; caminho: string; git: number; branch: string | null; sinais: string; ficha: string | null; url_local: string | null; criado_em: number;
};
const deLinha = (r: Linha): Projeto => ({
  id: r.id, nome: r.nome, caminho: r.caminho, git: r.git === 1, branch: r.branch, sinais: JSON.parse(r.sinais),
  ficha: r.ficha ?? null, urlLocal: r.url_local ?? null, criadoEm: r.criado_em,
});

export function listarProjetos(): Projeto[] {
  return (db.prepare("SELECT * FROM projetos ORDER BY nome").all() as Linha[]).map(deLinha);
}

export function projetoAtivo(): number | null {
  const v = getSetting("projeto_ativo");
  return v ? Number(v) : null;
}

const publicar = () => emit({ type: "projetos", projetos: listarProjetos(), projetoAtivo: projetoAtivo() });

export function definirAtivo(id: number | null) {
  if (id !== null && !listarProjetos().some((p) => p.id === id)) throw new ErroCard("Projeto não encontrado.", 404);
  setSetting("projeto_ativo", id === null ? "" : String(id));
  publicar();
}

async function inspecionar(caminho: string) {
  let git = false;
  let branch: string | null = null;
  try {
    const { stdout } = await exec("git", ["-C", caminho, "rev-parse", "--is-inside-work-tree"], { timeout: 5000 });
    git = stdout.trim() === "true";
    if (git) branch = (await exec("git", ["-C", caminho, "branch", "--show-current"], { timeout: 5000 })).stdout.trim() || null;
  } catch {
    git = false;
  }
  const nomes = new Set(await readdir(caminho));
  return { git, branch, sinais: MANIFESTOS.filter((m) => nomes.has(m)) };
}

export async function adicionarProjeto(caminhoBruto: string): Promise<Projeto> {
  if (typeof caminhoBruto !== "string" || !isAbsolute(caminhoBruto.trim())) throw new ErroCard("Informe o caminho completo da pasta.");
  let caminho: string;
  try {
    caminho = await realpath(caminhoBruto.trim());
    if (!(await stat(caminho)).isDirectory()) throw new Error();
  } catch {
    throw new ErroCard("Pasta não encontrada.");
  }
  // Pastas amplas demais ou o próprio Hefesto não podem virar projeto.
  const proibidas = [sep, homedir(), await realpath(ROOT), await realpath(DATA_DIR)];
  if (proibidas.includes(caminho)) throw new ErroCard("Escolha a pasta de um projeto específico, não uma pasta do sistema.");
  if (caminho.startsWith(await realpath(ROOT) + sep)) throw new ErroCard("Essa pasta faz parte do próprio Hefesto.");

  const existente = db.prepare("SELECT * FROM projetos WHERE caminho = ?").get(caminho) as Linha | undefined;
  if (existente) {
    definirAtivo(existente.id);
    return deLinha(existente);
  }
  const info = await inspecionar(caminho);
  const r = db.prepare("INSERT INTO projetos (nome, caminho, git, branch, sinais, criado_em) VALUES (?, ?, ?, ?, ?, ?)").run(
    basename(caminho), caminho, info.git ? 1 : 0, info.branch, JSON.stringify(info.sinais), Date.now(),
  );
  const id = Number(r.lastInsertRowid);
  definirAtivo(id);
  return listarProjetos().find((p) => p.id === id)!;
}

/** Abre a janela nativa do macOS para escolher uma pasta. Null se você cancelar. */
export async function escolherPasta(): Promise<string | null> {
  if (process.platform !== "darwin") throw new ErroCard("A janela de escolha só existe no macOS. Cole o caminho da pasta.");
  try {
    const { stdout } = await exec(
      "osascript",
      ["-e", 'POSIX path of (choose folder with prompt "Escolha a pasta do projeto para o Hefesto trabalhar")'],
      { timeout: 5 * 60_000 },
    );
    return stdout.trim().replace(/\/$/, "") || null;
  } catch (err) {
    // Código -128 = você clicou em Cancelar.
    if (String((err as { stderr?: string }).stderr ?? "").includes("-128")) return null;
    throw new ErroCard("Não foi possível abrir a janela de escolha de pasta. Cole o caminho manualmente.");
  }
}

export function removerProjeto(id: number) {
  db.prepare("UPDATE cards SET projeto_id = NULL WHERE projeto_id = ?").run(id);
  db.prepare("DELETE FROM projetos WHERE id = ?").run(id);
  if (projetoAtivo() === id) setSetting("projeto_ativo", "");
  publicar();
  emit({ type: "cards", cards: listarCards() });
}
