import { execFile } from "node:child_process";
import { isAbsolute, relative, resolve } from "node:path";
import { ErroEntrada, ferramenta, texto, type Ferramenta } from "../agentes/loop.ts";
import { auditar } from "../confianca/auditoria.ts";
import type { Worktree } from "./workspace.ts";

// Ambiente do card: o app do projeto rodando de verdade (banco, filas, backend, frontend) num Docker só dos
// agentes (o serviço docker-agentes do compose), separado do Docker da máquina do CEO. Lá dentro o agente tem
// autonomia, como um dev: instala o que precisar (Dockerfile, apt, go install), roda migrações, cria contas de
// teste e sobe o app para o QA testar no navegador. O limite fica na borda: só o servidor fala com esse Docker
// (a sandbox dos comandos não alcança a porta dele), e o compose é conferido antes de subir.

/** Endereço do Docker dos agentes (ex.: tcp://docker-agentes:2375). Sem ele, as ferramentas de ambiente ficam desligadas. */
const DOCKER_AGENTES = process.env.HEFESTO_DOCKER_AGENTES ?? "";
/** Nome pelo qual o navegador dos agentes alcança as portas publicadas no Docker dos agentes. */
export const HOST_DO_AMBIENTE = process.env.HEFESTO_AMBIENTE_HOST ?? "docker-agentes";
export const ambienteAtivo = () => !!DOCKER_AGENTES;

const TEMPO_SUBIR_MS = 20 * 60_000;
const TEMPO_COMANDO_MS = 10 * 60_000;
const SAIDA_MAX = 12_000;
/** Ambientes no ar ao mesmo tempo (memória do Docker dos agentes): o mais antigo desce para o novo subir. */
const MAX_AMBIENTES = 2;

const usados = new Map<string, number>();

interface Saida {
  codigo: number | null;
  saida: string;
}

function docker(args: string[], cwd: string, tempo: number): Promise<Saida> {
  return new Promise((ok) => {
    execFile(
      "docker",
      args,
      { cwd, timeout: tempo, maxBuffer: 50 * 1024 * 1024, env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: "/tmp", DOCKER_HOST: DOCKER_AGENTES } },
      (err, stdout, stderr) => {
        const tudo = `${stdout}${stderr ? `\n${stderr}` : ""}`.trim();
        const e = err as (NodeJS.ErrnoException & { code?: number | string; killed?: boolean }) | null;
        const saida = tudo.length > SAIDA_MAX ? `…(cortado)\n${tudo.slice(-SAIDA_MAX)}` : tudo;
        ok({ codigo: e ? (typeof e.code === "number" ? e.code : e.killed ? null : 1) : 0, saida: e?.killed ? `${saida}\n(parado: passou do tempo máximo)` : saida });
      },
    );
  });
}

const dentro = (raiz: string, caminho: string) => {
  const r = relative(raiz, caminho);
  return r === "" || (!r.startsWith("..") && !isAbsolute(r));
};

/** Arquivo do compose, relativo à cópia do card. */
function arquivoDoCompose(wt: Worktree, arquivo: string): string {
  const a = arquivo.trim() || "docker-compose.yml";
  if (isAbsolute(a) || a.split(/[\\/]/).includes("..")) throw new ErroEntrada("Use o caminho do compose relativo ao projeto (sem / no início e sem ..).");
  return a;
}

interface Servico {
  privileged?: boolean;
  cap_add?: string[];
  devices?: unknown[];
  network_mode?: string;
  pid?: string;
  ipc?: string;
  userns_mode?: string;
  cgroup?: string;
  security_opt?: string[];
  volumes?: { type?: string; source?: string; target?: string }[];
  build?: { context?: string };
}

/**
 * Confere o compose já resolvido (docker compose config --format json): nada privilegiado, nada que enxergue
 * o host, e pastas montadas só de dentro da cópia do card. Devolve os problemas encontrados (vazio = pode subir).
 */
export function problemasDoCompose(config: { services?: Record<string, Servico> }, raiz: string): string[] {
  const p: string[] = [];
  for (const [nome, s] of Object.entries(config.services ?? {})) {
    if (s.privileged) p.push(`${nome}: privileged não é permitido`);
    if (s.cap_add?.length) p.push(`${nome}: cap_add (${s.cap_add.join(", ")}) não é permitido`);
    if (s.devices?.length) p.push(`${nome}: devices não é permitido`);
    for (const [campo, v] of [["network_mode", s.network_mode], ["pid", s.pid], ["ipc", s.ipc], ["userns_mode", s.userns_mode], ["cgroup", s.cgroup]] as const) {
      if (v === "host") p.push(`${nome}: ${campo}: host não é permitido`);
    }
    if (s.security_opt?.some((o) => /unconfined|disable/i.test(o))) p.push(`${nome}: security_opt que desliga proteções não é permitido`);
    for (const v of s.volumes ?? []) {
      if (/docker\.sock/.test(`${v.source ?? ""} ${v.target ?? ""}`)) p.push(`${nome}: montar o socket do Docker não é permitido`);
      else if (v.type === "bind" && (!v.source || !dentro(raiz, resolve(v.source)))) p.push(`${nome}: a pasta ${v.source} fica fora do projeto`);
    }
    const ctx = s.build?.context;
    if (ctx && !/^[a-z]+:\/\//i.test(ctx) && !dentro(raiz, resolve(ctx))) p.push(`${nome}: o build usa uma pasta fora do projeto (${ctx})`);
  }
  return p;
}

/** Desce os ambientes mais antigos para caber o novo (memória limitada do Docker dos agentes). */
async function abrirEspaco(raiz: string, projeto: string) {
  const r = await docker(["compose", "ls", "--format", "json"], raiz, 30_000);
  let lista: { Name: string }[] = [];
  try {
    lista = JSON.parse(r.saida || "[]") as { Name: string }[];
  } catch { /* sem ambientes */ }
  const outros = lista.map((x) => x.Name).filter((n) => /^(card|ref)-/.test(n) && n !== projeto).sort((a, b) => (usados.get(a) ?? 0) - (usados.get(b) ?? 0));
  for (const nome of outros.slice(0, Math.max(0, outros.length - (MAX_AMBIENTES - 1)))) {
    await docker(["compose", "-p", nome, "down", "--remove-orphans"], raiz, 5 * 60_000);
    usados.delete(nome);
  }
}

/** Compose e o arquivo de variáveis (opcional) que o agente indicou, ambos relativos à cópia. */
interface Alvo {
  arquivo: string;
  env?: string;
}
const alvoDe = (e: Record<string, unknown>): Alvo => ({ arquivo: String(e.arquivo ?? ""), env: typeof e.arquivo_env === "string" && e.arquivo_env.trim() ? e.arquivo_env : undefined });

async function compose(wt: Worktree, projeto: string, alvo: Alvo, args: string[], tempo: number): Promise<Saida> {
  usados.set(projeto, Date.now());
  // O compose só lê sozinho um arquivo chamado .env; com outro nome (ex.: .env.teste), vai por --env-file.
  const env = alvo.env ? ["--env-file", arquivoDoCompose(wt, alvo.env)] : [];
  return docker(["compose", "-p", projeto, ...env, "-f", arquivoDoCompose(wt, alvo.arquivo), ...args], wt.caminho, tempo);
}

const formatar = (r: Saida) => `código de saída: ${r.codigo ?? "interrompido"}\n${r.saida || "(sem saída)"}`;

/** Endereços das portas publicadas, a partir da saída de "compose ps" com {{.Publishers}}. */
export const enderecosDasPortas = (ps: string) =>
  [...new Set([...ps.matchAll(/\{\S+ \d+ (\d+) \w+\}/g)].map((m) => m[1]!).filter((p) => p !== "0"))].map((p) => `http://${HOST_DO_AMBIENTE}:${p}`);

/** Ferramentas do ambiente do card: subir, rodar comandos dentro, ver logs e status, descer. */
export function ferramentasDeAmbiente(wt: Worktree, projeto = `card-${wt.cardId}`): Ferramenta[] {
  const arquivoParam = {
    arquivo: { type: "string", description: "Compose relativo ao projeto (padrão: docker-compose.yml). Pode ser um que você criou para testes." },
    arquivo_env: { type: "string", description: "Arquivo de variáveis do compose, relativo ao projeto (ex.: infra/teste/.env.teste). Só precisa se não for o .env da pasta." },
  };
  return [
    ferramenta(
      "ambiente_subir",
      `Sobe o app do projeto de verdade, num Docker só dos agentes (separado da máquina do CEO): docker compose up -d --build com o compose do projeto ou um que você escreveu para teste. Use para rodar banco, filas, backend e frontend e testar tudo junto. Você tem autonomia lá dentro: precisa de uma ferramenta, um banco ou dados de teste? Escreva o Dockerfile ou o compose (com escrever_arquivo) e suba. Regras: nada privileged, nada do host, só pastas do projeto; use arquivos .env de TESTE criados por você (nunca credenciais reais). As portas publicadas ficam em http://${HOST_DO_AMBIENTE}:PORTA para o navegador e as capturas.`,
      { ...arquivoParam, servicos: { type: "array", items: { type: "string" }, description: "Só estes serviços (opcional)" } },
      [],
      async (e) => {
        const alvo = alvoDe(e);
        const arquivo = alvo.arquivo;
        const cfg = await compose(wt, projeto, alvo, ["config", "--format", "json"], 2 * 60_000);
        if (cfg.codigo !== 0) return { texto: `O compose não é válido:\n${cfg.saida}`, erro: true };
        let config: { services?: Record<string, Servico> };
        try {
          config = JSON.parse(cfg.saida) as typeof config;
        } catch {
          return { texto: `Não consegui ler o compose resolvido:\n${cfg.saida.slice(0, 2000)}`, erro: true };
        }
        const problemas = problemasDoCompose(config, wt.caminho);
        if (problemas.length) return { texto: `O ambiente não sobe com estas configurações (segurança):\n- ${problemas.join("\n- ")}\nAjuste o compose (ou crie um só para teste) e tente de novo.`, erro: true };
        await abrirEspaco(wt.caminho, projeto);
        const servicos = Array.isArray(e.servicos) ? e.servicos.map(String).filter((s) => /^[\w.-]+$/.test(s)) : [];
        const r = await compose(wt, projeto, alvo, ["up", "-d", "--build", "--remove-orphans", "--wait", ...servicos], TEMPO_SUBIR_MS);
        const ps = await compose(wt, projeto, alvo, ["ps", "--format", "{{.Service}}\t{{.State}}\t{{.Publishers}}"], 60_000);
        auditar("agente", "subiu ambiente", wt.branch, `${arquivo || "docker-compose.yml"} → saída ${r.codigo ?? "interrompido"}`);
        const enderecos = enderecosDasPortas(ps.saida);
        return {
          texto: `${formatar(r)}\n\nServiços:\n${ps.saida || "(nenhum)"}${enderecos.length ? `\n\nEndereços: ${enderecos.join(" · ")}` : ""}`,
          erro: r.codigo !== 0,
        };
      },
    ),
    ferramenta(
      "ambiente_comando",
      "Roda um comando de shell DENTRO de um serviço do ambiente (sh -c, com pipes e &&): instalar pacotes (apt, apk, go install, npm), rodar migrações, criar contas e dados de teste (psql, curl na API), rodar testes de integração. O ambiente precisa estar no ar (ambiente_subir).",
      { ...arquivoParam, servico: { type: "string" }, comando: { type: "string" } },
      ["servico", "comando"],
      async (e) => {
        const servico = texto(e, "servico", 80);
        if (!/^[\w.-]+$/.test(servico)) throw new ErroEntrada("Nome de serviço inválido.");
        const cmd = texto(e, "comando", 4000);
        const r = await compose(wt, projeto, alvoDe(e), ["exec", "-T", servico, "sh", "-c", cmd], TEMPO_COMANDO_MS);
        auditar("agente", "comando no ambiente", wt.branch, `${servico}: ${cmd.slice(0, 300)} → saída ${r.codigo ?? "interrompido"}`);
        return { texto: formatar(r), erro: r.codigo !== 0 };
      },
    ),
    ferramenta(
      "ambiente_logs",
      "Mostra os logs do ambiente (de um serviço ou de todos), para entender por que algo não subiu ou falhou.",
      { ...arquivoParam, servico: { type: "string" }, linhas: { type: "number" } },
      [],
      async (e) => {
        const servico = typeof e.servico === "string" && /^[\w.-]+$/.test(e.servico) ? [e.servico] : [];
        const linhas = String(Math.min(500, Math.max(10, Number(e.linhas) || 120)));
        return { texto: formatar(await compose(wt, projeto, alvoDe(e), ["logs", "--no-color", "--tail", linhas, ...servico], 60_000)) };
      },
    ),
    ferramenta("ambiente_descer", "Desce o ambiente do card e apaga os volumes dele (o banco de teste volta do zero na próxima subida).", arquivoParam, [], async (e) => {
      const r = await compose(wt, projeto, alvoDe(e), ["down", "-v", "--remove-orphans"], 5 * 60_000);
      usados.delete(projeto);
      return { texto: formatar(r) };
    }),
  ];
}
