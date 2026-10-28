import { execFile } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import type { Agent, Card, RoomId } from "@empresa/shared";
import { roomById } from "@empresa/org";
import { getSetting, setSetting } from "../db.ts";
import { ErroCard } from "../tarefas.ts";
import { ErroEntrada, ferramenta, texto, type Ferramenta } from "../agentes/loop.ts";
import { NO_MAC } from "../plataforma.ts";
import { pedirAprovacao, registrarExecucao, registrarExecutor } from "../mcp/ferramentas.ts";

// Terminal do Mac (pedido do CEO em 27/10/2026): os agentes podem rodar comandos no seu terminal.
// - Comandos da lista "liberados" (leitura: ls, git status, df…) rodam direto, mas só se forem simples
//   (sem ; | & > < ` $( ), para ninguém encadear outra coisa depois).
// - Todo o resto vira um pedido em Aprovações com o comando exato, a pasta e o motivo; aprovado, roda no zsh.
// - Fora da sandbox da fábrica: é o seu terminal de verdade, por isso a aprovação é por comando.

export const ID_TERMINAL = -1;
const NOME = "Terminal do Mac";
const TEMPO_MAX_MS = 10 * 60_000;
const SAIDA_MAX = 15_000;

const CHAVE_CONFIG = "maquina_config";
export interface ConfigMaquina {
  terminal: boolean;
  controle: boolean;
  salas: RoomId[];
  /** Começos de comando que rodam sem pedir (só comandos simples). */
  liberados: string[];
}
const PADRAO: ConfigMaquina = {
  terminal: true,
  controle: true,
  salas: ["devops", "infraestrutura", "desenvolvimento", "diretoria"],
  liberados: ["ls", "pwd", "whoami", "uname", "sw_vers", "uptime", "df -h", "du -sh", "git status", "git log", "git diff", "git branch", "node -v", "npm -v", "brew list", "which "],
};

export function configMaquina(): ConfigMaquina {
  try {
    return { ...PADRAO, ...JSON.parse(getSetting(CHAVE_CONFIG) ?? "{}") };
  } catch {
    return PADRAO;
  }
}

export function definirConfigMaquina(d: Partial<ConfigMaquina>): ConfigMaquina {
  const atual = configMaquina();
  const novo: ConfigMaquina = {
    terminal: typeof d.terminal === "boolean" ? d.terminal : atual.terminal,
    controle: typeof d.controle === "boolean" ? d.controle : atual.controle,
    salas: Array.isArray(d.salas) ? d.salas.filter((s): s is RoomId => typeof s === "string" && !!roomById[s as RoomId]) : atual.salas,
    liberados: Array.isArray(d.liberados) ? d.liberados.filter((s): s is string => typeof s === "string" && !!s.trim()).map((s) => s.trimStart()).slice(0, 60) : atual.liberados,
  };
  setSetting(CHAVE_CONFIG, JSON.stringify(novo));
  return novo;
}

/** Comando simples (sem encadear, redirecionar ou substituir) que começa por um prefixo liberado. */
/** Caminhos e palavras que sempre pedem aprovação, mesmo num comando liberado (chaves, senhas, segredos). */
const SENSIVEL = /\.ssh|\.aws|\.gnupg|\.env\b|\.npmrc|\.netrc|\.pgpass|\.git-credentials|keychain|id_rsa|id_ed25519|\.pem\b|\.key\b|secret|senha|password|token|credentials|Cookies|Library\/Mail|Library\/Messages/i;

export function liberadoSemPedir(comando: string, liberados: string[]): boolean {
  const c = comando.trim();
  if (!c || /[;&|<>`$\n\\]/.test(c) || SENSIVEL.test(c)) return false;
  return liberados.some((l) => (l.endsWith(" ") ? c.startsWith(l) : c === l || c.startsWith(`${l} `)));
}

function resolverPasta(p: unknown): string {
  const bruto = typeof p === "string" && p.trim() ? p.trim() : "~";
  const caminho = bruto === "~" ? homedir() : bruto.startsWith("~/") ? join(homedir(), bruto.slice(2)) : bruto;
  if (!isAbsolute(caminho)) throw new ErroEntrada("A pasta precisa ser um caminho completo (ex.: ~/projetos/app ou /Users/…).");
  if (!existsSync(caminho) || !statSync(caminho).isDirectory()) throw new ErroEntrada(`Pasta não encontrada: ${bruto}`);
  return caminho;
}

/** Roda no zsh de login do usuário (com o PATH dele), na pasta pedida. */
export function rodarNoTerminal(comando: string, pasta: string): Promise<{ texto: string; erro: boolean }> {
  const inicio = Date.now();
  return new Promise((resolve) => {
    execFile("/bin/zsh", ["-lc", comando], { cwd: pasta, timeout: TEMPO_MAX_MS, maxBuffer: 20 * 1024 * 1024, env: { ...process.env, TERM: "dumb", NO_COLOR: "1" } }, (err, stdout, stderr) => {
      const tudo = `${stdout}${stderr ? `\n${stderr}` : ""}`.trim();
      const saida = tudo.length > SAIDA_MAX ? `…(cortado)\n${tudo.slice(-SAIDA_MAX)}` : tudo;
      const e = err as (NodeJS.ErrnoException & { code?: number | string; killed?: boolean }) | null;
      const codigo = e ? (typeof e.code === "number" ? e.code : e.killed ? "interrompido (tempo máximo)" : 1) : 0;
      resolve({ texto: `$ ${comando}\n(em ${pasta} · código de saída ${codigo} · ${((Date.now() - inicio) / 1000).toFixed(1)} s)\n${saida || "(sem saída)"}`, erro: codigo !== 0 });
    });
  });
}

// Pedido aprovado: roda o comando exatamente como foi pedido.
registrarExecutor(ID_TERMINAL, async (args) => rodarNoTerminal(String(args.comando ?? ""), resolverPasta(args.pasta)));

export function podeUsarMaquina(agente: Agent, recurso: "terminal" | "controle"): boolean {
  const c = configMaquina();
  // No Docker não existe "o Mac do CEO" para controlar.
  return NO_MAC && c[recurso] && c.salas.includes(agente.sala);
}

export function ferramentaDeTerminal(agente: Agent, card: Card | null): Ferramenta {
  return ferramenta(
    "terminal_do_mac",
    `Roda um comando no terminal do Mac do CEO (zsh, com o PATH dele). Comandos simples de leitura liberados (${configMaquina().liberados.slice(0, 8).join(", ")}…) rodam na hora; qualquer outro vira um pedido de aprovação com o comando exato, e só roda quando o CEO aprovar (o resultado aparece no card). Nunca rode nada destrutivo sem necessidade, nunca exponha senhas ou chaves, e prefira comandos que só leem.`,
    {
      comando: { type: "string" },
      pasta: { type: "string", description: "Pasta onde rodar (caminho completo ou ~/…). Padrão: a pasta do usuário" },
      motivo_para_o_ceo: { type: "string", description: "Por que rodar isso (o CEO lê antes de aprovar)" },
    },
    ["comando", "motivo_para_o_ceo"],
    async (e) => {
      const comando = texto(e, "comando", 4000);
      const pasta = resolverPasta(e.pasta);
      const motivo = typeof e.motivo_para_o_ceo === "string" ? e.motivo_para_o_ceo.trim().slice(0, 1000) : "";
      if (liberadoSemPedir(comando, configMaquina().liberados)) {
        const r = await rodarNoTerminal(comando, pasta);
        registrarExecucao({ servidorId: ID_TERMINAL, servidor: NOME, ferramenta: "executar", args: { comando, pasta }, cardId: card?.id ?? null, agenteId: agente.id, resultado: r.texto, erro: r.erro });
        return { texto: r.texto, erro: r.erro };
      }
      const p = pedirAprovacao({ servidorId: ID_TERMINAL, servidor: NOME, ferramenta: "executar", args: { comando, pasta }, cardId: card?.id ?? null, agenteId: agente.id, motivo });
      return { texto: `Pedido #${p.id} enviado ao CEO: o comando NÃO rodou ainda. Quando ele aprovar, roda e a saída aparece nos comentários do card. Siga com o resto e diga na entrega o que depende disso.` };
    },
  );
}

export function validarConfig(d: unknown): Partial<ConfigMaquina> {
  if (!d || typeof d !== "object") throw new ErroCard("Configuração inválida.");
  return d as Partial<ConfigMaquina>;
}
