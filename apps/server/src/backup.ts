import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { db, getSetting, setSetting } from "./db.ts";
import { DATA_DIR } from "./paths.ts";
import { ErroCard } from "./tarefas.ts";

// Backup automático dos dados da empresa (cards, Livro, conhecimento, leads, chat, prints).
// - Uma cópia por dia (e quando você pedir), numa pasta FORA do projeto: padrão ~/Documents/Hefesto/backups.
//   Para proteger contra falha de disco, aponte para o iCloud Drive ou um disco externo.
// - O banco é copiado com VACUUM INTO (cópia consistente mesmo com o servidor rodando).
// - A chave mestra (master.key) NÃO vai junto: os segredos do backup continuam cifrados e ilegíveis
//   para quem pegar a pasta. Ao restaurar em outro Mac, cadastre a chave da API e reconecte os conectores.
// - Guarda os últimos N backups e apaga os mais antigos.

const CHAVE = "backup_config";
export interface ConfigBackup {
  ativo: boolean;
  pasta: string;
  manter: number;
}
export interface EstadoBackup extends ConfigBackup {
  ultimo: { quando: number; pasta: string; tamanhoMb: number } | null;
  erro: string | null;
  total: number;
}

const padrao = (): ConfigBackup => ({ ativo: true, pasta: join(homedir(), "Documents", "Hefesto", "backups"), manter: 14 });
let erro: string | null = null;

export function configBackup(): ConfigBackup {
  try {
    return { ...padrao(), ...JSON.parse(getSetting(CHAVE) ?? "{}") };
  } catch {
    return padrao();
  }
}

export function definirConfigBackup(d: Partial<ConfigBackup>): EstadoBackup {
  const atual = configBackup();
  let pasta = atual.pasta;
  if (typeof d.pasta === "string" && d.pasta.trim()) {
    const p = d.pasta.trim().replace(/^~(?=\/|$)/, homedir());
    if (!isAbsolute(p)) throw new ErroCard("A pasta precisa ser um caminho completo (ex.: ~/Documents/backups).");
    if (p === DATA_DIR || p.startsWith(DATA_DIR + "/")) throw new ErroCard("Escolha uma pasta fora dos dados da empresa.");
    pasta = p;
  }
  const novo: ConfigBackup = {
    ativo: typeof d.ativo === "boolean" ? d.ativo : atual.ativo,
    pasta,
    manter: typeof d.manter === "number" && d.manter >= 1 ? Math.min(90, Math.round(d.manter)) : atual.manter,
  };
  setSetting(CHAVE, JSON.stringify(novo));
  return estadoBackup();
}

function listar(pasta: string): string[] {
  if (!existsSync(pasta)) return [];
  return readdirSync(pasta).filter((n) => /^\d{4}-\d{2}-\d{2}_\d{4}(-\d+)?$/.test(n)).sort();
}

const tamanho = (p: string): number => {
  const s = statSync(p);
  return s.isDirectory() ? readdirSync(p).reduce((t, n) => t + tamanho(join(p, n)), 0) : s.size;
};

export function estadoBackup(): EstadoBackup {
  const c = configBackup();
  const todos = listar(c.pasta);
  const ult = todos.at(-1);
  let ultimo: EstadoBackup["ultimo"] = null;
  if (ult) {
    const p = join(c.pasta, ult);
    ultimo = { quando: statSync(p).mtimeMs, pasta: p, tamanhoMb: Math.round((tamanho(p) / 1e6) * 10) / 10 };
  }
  return { ...c, ultimo, erro, total: todos.length };
}

export function fazerBackup(): EstadoBackup {
  const c = configBackup();
  const d = new Date();
  const dois = (n: number) => String(n).padStart(2, "0");
  let nome = `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}_${dois(d.getHours())}${dois(d.getMinutes())}`;
  for (let i = 2; existsSync(join(c.pasta, nome)); i++) nome = nome.replace(/-\d+$/, "") + `-${i}`;
  const destino = join(c.pasta, nome);
  try {
    mkdirSync(destino, { recursive: true, mode: 0o700 });
    db.exec(`VACUUM INTO '${join(destino, "empresa.db").replace(/'/g, "''")}'`);
    for (const pasta of ["midia"]) {
      const origem = join(DATA_DIR, pasta);
      if (existsSync(origem)) cpSync(origem, join(destino, pasta), { recursive: true });
    }
    for (const velho of listar(c.pasta).slice(0, -c.manter)) rmSync(join(c.pasta, velho), { recursive: true, force: true });
    erro = null;
  } catch (e) {
    // A limpeza do backup pela metade também pode falhar (ex.: sem permissão na pasta): nunca derruba o servidor.
    try {
      rmSync(destino, { recursive: true, force: true });
    } catch {}
    erro = e instanceof Error ? e.message : String(e);
    console.error("Backup falhou:", erro);
  }
  return estadoBackup();
}

/** Confere a cada hora: se está ligado e o último backup tem mais de 24 h, faz um novo. */
export function iniciarBackup() {
  // Instâncias isoladas (testes, EMPRESA_DATA_DIR) não fazem backup automático na sua pasta de documentos.
  if (process.env.EMPRESA_SEM_BACKUP === "1" || (process.env.EMPRESA_DATA_DIR && process.env.EMPRESA_BACKUP !== "1")) return;
  const verificar = () => {
    try {
      const e = estadoBackup();
      if (e.ativo && (!e.ultimo || Date.now() - e.ultimo.quando > 24 * 3600_000)) fazerBackup();
    } catch (e) {
      console.error("Backup automático:", e);
    }
  };
  setTimeout(verificar, 60_000).unref();
  setInterval(verificar, 3600_000).unref();
}
