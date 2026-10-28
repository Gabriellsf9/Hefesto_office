import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getSetting, setSetting } from "../db.ts";
import { apagarSegredo, lerSegredo, salvarSegredo } from "../secrets.ts";
import { auditar } from "../confianca/auditoria.ts";
import { podeRodarComandos } from "../plataforma.ts";

// Sandbox na nuvem (opcional, desligada por padrão): os comandos dos agentes (testes, build, lint) rodam
// num executor remoto em vez da sandbox do Mac/contêiner. Serve para máquinas sem sandbox local ou para
// rodar várias verificações pesadas ao mesmo tempo. O código da cópia isolada sai do seu Mac: só liga com
// a sua URL e o seu token.
//
// Protocolo (qualquer executor que siga isto serve: um worker seu, um contêiner na sua nuvem…):
//   POST {url}/v1/executar   Authorization: Bearer {token}
//   { "comando": ["npm", "test"], "rede": false, "tempoMaxS": 300, "arquivos": "<tar.gz em base64>" }
//   → 200 { "codigo": 0, "saida": "…", "ms": 1234 }
// O executor deve: abrir os arquivos num diretório novo, rodar sem shell, sem rede (exceto rede: true na
// instalação de dependências), com o tempo máximo, e apagar tudo no fim.

const run = promisify(execFile);
const SEG = "nuvem_token";
const LIMITE_BYTES = 50 * 1024 * 1024;

export interface EstadoNuvem {
  ativo: boolean;
  url: string | null;
  temToken: boolean;
}

export const estadoNuvem = (): EstadoNuvem => ({ ativo: getSetting("nuvem_ativo") === "1" && !!getSetting("nuvem_url") && !!lerSegredo(SEG), url: getSetting("nuvem_url") || null, temToken: !!lerSegredo(SEG) });
export const nuvemAtiva = () => estadoNuvem().ativo;

/** https sempre; http só para um executor na própria máquina. */
const URL_OK = /^(https:\/\/[^\s/]+|http:\/\/(127\.0\.0\.1|localhost)(:\d+)?)(\/[^\s]*)?$/i;

export function configurarNuvem(c: { ativo?: boolean; url?: string | null; token?: string | null }): EstadoNuvem {
  if (c.url !== undefined) {
    const u = (c.url ?? "").trim().replace(/\/$/, "");
    if (u && !URL_OK.test(u)) throw new Error("Use uma URL https:// (ou http://127.0.0.1 para um executor local).");
    setSetting("nuvem_url", u);
  }
  if (c.token === null) apagarSegredo(SEG);
  else if (typeof c.token === "string" && c.token.trim()) {
    if (c.token.trim().length < 16) throw new Error("Token curto demais.");
    salvarSegredo(SEG, c.token.trim());
  }
  if (typeof c.ativo === "boolean") setSetting("nuvem_ativo", c.ativo ? "1" : "0");
  const e = estadoNuvem();
  if (c.ativo && !e.ativo) throw new Error("Para ligar, informe a URL do executor e o token.");
  auditar("voce", "sandbox na nuvem", null, e.ativo ? `ligada: ${e.url}` : "desligada");
  return e;
}

/** Os arquivos da cópia (versionados e novos, sem os ignorados como node_modules) num tar.gz. */
async function empacotar(pasta: string): Promise<Buffer> {
  const { stdout: lista } = await run("git", ["-C", pasta, "ls-files", "-z", "-co", "--exclude-standard"], { maxBuffer: 50 * 1024 * 1024 });
  const arquivos = lista.split("\0").filter(Boolean);
  if (!arquivos.length) throw new Error("A cópia não tem arquivos para enviar.");
  return new Promise((resolve, reject) => {
    const p = execFile("tar", ["-czf", "-", "--null", "-T", "-"], { cwd: pasta, encoding: "buffer", maxBuffer: LIMITE_BYTES + 1 }, (err, stdout) => {
      if (err) return reject(new Error(`Não consegui empacotar a cópia: ${err.message.slice(0, 200)}`));
      resolve(stdout);
    });
    p.stdin!.end(arquivos.join("\0"));
  });
}

export async function rodarNaNuvem(pasta: string, argv: string[], rede: boolean, tempoMaxMs: number): Promise<{ codigo: number | null; saida: string; ms: number; rede: boolean }> {
  const e = estadoNuvem();
  const token = lerSegredo(SEG);
  if (!e.ativo || !e.url || !token) throw new Error("Sandbox na nuvem desligada.");
  const inicio = Date.now();
  const tar = await empacotar(pasta);
  if (tar.length > LIMITE_BYTES) throw new Error(`A cópia ficou grande demais para a nuvem (${Math.round(tar.length / 1e6)} MB; limite 50 MB).`);
  const res = await fetch(`${e.url}/v1/executar`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ comando: argv, rede, tempoMaxS: Math.round(tempoMaxMs / 1000), arquivos: tar.toString("base64") }),
    signal: AbortSignal.timeout(tempoMaxMs + 60_000),
  }).catch((err: Error) => {
    throw new Error(`O executor na nuvem não respondeu: ${err.message.slice(0, 200)}`);
  });
  const json = (await res.json().catch(() => ({}))) as { codigo?: number | null; saida?: string; ms?: number; erro?: string };
  if (!res.ok) throw new Error(`O executor na nuvem recusou (${res.status}): ${json.erro ?? ""}`.trim());
  return { codigo: typeof json.codigo === "number" ? json.codigo : null, saida: `${String(json.saida ?? "").slice(-12_000)}\n(rodou na sandbox na nuvem)`.trim(), ms: Number(json.ms) || Date.now() - inicio, rede };
}

/** Dá para rodar testes e comandos: sandbox local (Mac ou contêiner) ou a da nuvem, se você ligou. */
export const podeVerificar = () => podeRodarComandos() || nuvemAtiva();
