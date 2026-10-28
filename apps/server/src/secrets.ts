import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deleteSetting, getSetting, setSetting } from "./db.ts";
import { DATA_DIR } from "./paths.ts";

// A chave da Anthropic fica cifrada (AES-256-GCM) no SQLite local. A chave mestra
// fica num arquivo separado só com permissão do usuário. Nada disso sai da máquina
// nem é devolvido ao navegador.

const MASTER_PATH = join(DATA_DIR, "master.key");
const SETTING = "anthropic_api_key";

function masterKey(): Buffer {
  if (!existsSync(MASTER_PATH)) writeFileSync(MASTER_PATH, randomBytes(32), { mode: 0o600 });
  return readFileSync(MASTER_PATH);
}

/** Guarda um segredo cifrado (chave da API, conexão de banco…). Nunca volta para o navegador. */
export function salvarSegredo(nome: string, valor: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  const enc = Buffer.concat([cipher.update(valor, "utf8"), cipher.final()]);
  setSetting(nome, [iv, cipher.getAuthTag(), enc].map((b) => b.toString("base64")).join("."));
}

export function lerSegredo(nome: string): string | null {
  const stored = getSetting(nome);
  if (!stored) return null;
  const [iv, tag, enc] = stored.split(".").map((p) => Buffer.from(p, "base64"));
  if (!iv || !tag || !enc) return null;
  const decipher = createDecipheriv("aes-256-gcm", masterKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

export const apagarSegredo = (nome: string) => deleteSetting(nome);

export const saveApiKey = (apiKey: string) => salvarSegredo(SETTING, apiKey);
export const loadApiKey = (): string | null => lerSegredo(SETTING);

export function clearApiKey() {
  deleteSetting(SETTING);
}

export function apiKeyHint(apiKey: string | null): string | null {
  if (!apiKey) return null;
  return `${apiKey.slice(0, 7)}…${apiKey.slice(-4)}`;
}

/** Confere a chave fazendo uma chamada leve à API (lista de modelos). */
export async function validateApiKey(apiKey: string): Promise<{ ok: true } | { ok: false; erro: string }> {
  try {
    // Respeita ANTHROPIC_BASE_URL (proxy, gateway corporativo ou testes), como o cliente do SDK.
    const base = (process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com").replace(/\/$/, "");
    const res = await fetch(`${base}/v1/models?limit=1`, {
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    });
    if (res.ok) return { ok: true };
    if (res.status === 401 || res.status === 403) return { ok: false, erro: "Chave inválida ou sem permissão." };
    return { ok: false, erro: `A Anthropic respondeu ${res.status}. Tente de novo em instantes.` };
  } catch {
    return { ok: false, erro: "Não consegui falar com a API da Anthropic. Verifique sua internet." };
  }
}
