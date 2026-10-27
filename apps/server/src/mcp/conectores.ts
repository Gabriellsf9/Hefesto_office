import { randomBytes } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { UnauthorizedError, type OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthClientInformationMixed, OAuthClientMetadata, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { FerramentaMcp, PoliticaMcp, RoomId, ServidorMcp } from "@empresa/shared";
import { roomById } from "@empresa/org";
import { db } from "../db.ts";
import { emit } from "../bus.ts";
import { apagarSegredo, lerSegredo, salvarSegredo } from "../secrets.ts";
import { ErroCard } from "../tarefas.ts";
import { presetPorId } from "./catalogo.ts";

// Conectores MCP: servidores locais (um comando no seu Mac, stdio) ou remotos (HTTP), com token ou
// login OAuth. Segredos (tokens, variáveis, client secret, tokens OAuth) ficam cifrados; a tela só
// vê nome, endereço e status. Cada conector é liberado para as salas que você escolher.

db.exec(`
  CREATE TABLE IF NOT EXISTS mcp_servidores (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    nome       TEXT NOT NULL,
    preset     TEXT NOT NULL,
    tipo       TEXT NOT NULL,
    comando    TEXT,
    args       TEXT NOT NULL,
    url        TEXT,
    auth       TEXT NOT NULL,
    salas      TEXT NOT NULL,
    politicas  TEXT NOT NULL,
    criado_em  INTEGER NOT NULL
  );
`);

type Linha = {
  id: number; nome: string; preset: string; tipo: "stdio" | "http"; comando: string | null; args: string; url: string | null; auth: ServidorMcp["autenticacao"];
  salas: string; politicas: string; criado_em: number;
};

/** Segredos de um conector: variáveis de ambiente (stdio), cabeçalhos (HTTP), credenciais OAuth. */
interface Segredos {
  env?: Record<string, string>;
  headers?: Record<string, string>;
  clientId?: string;
  clientSecret?: string;
  escopos?: string;
}
const chaveSegredos = (id: number) => `mcp_segredos_${id}`;
const chaveOauth = (id: number) => `mcp_oauth_${id}`;
const lerSegredos = (id: number): Segredos => JSON.parse(lerSegredo(chaveSegredos(id)) ?? "{}");

interface Conexao {
  cliente: Client | null;
  transporte: StreamableHTTPClientTransport | StdioClientTransport | null;
  ferramentas: Tool[];
  status: ServidorMcp["status"];
  erro: string | null;
  autorizarUrl: string | null;
}
const conexoes = new Map<number, Conexao>();

/* ---------- Leitura e publicação ---------- */

function linhas(): Linha[] {
  return db.prepare("SELECT * FROM mcp_servidores ORDER BY id").all() as Linha[];
}
function linha(id: number): Linha {
  const r = db.prepare("SELECT * FROM mcp_servidores WHERE id = ?").get(id) as Linha | undefined;
  if (!r) throw new ErroCard("Conector não encontrado.", 404);
  return r;
}

/** Política padrão: o que só lê roda direto; o resto pede a sua aprovação. */
const politicaPadrao = (t: Tool): PoliticaMcp => (t.annotations?.readOnlyHint === true && t.annotations?.destructiveHint !== true ? "auto" : "aprovar");

function paraTela(r: Linha): ServidorMcp {
  const c = conexoes.get(r.id);
  const politicas: Record<string, PoliticaMcp> = JSON.parse(r.politicas);
  const ferramentas: FerramentaMcp[] = (c?.ferramentas ?? []).map((t) => ({
    nome: t.name,
    descricao: (t.description ?? "").slice(0, 300),
    leitura: t.annotations?.readOnlyHint === true,
    politica: politicas[t.name] ?? politicaPadrao(t),
  }));
  return {
    id: r.id, nome: r.nome, preset: r.preset, tipo: r.tipo, comando: r.comando, args: JSON.parse(r.args), url: r.url, autenticacao: r.auth,
    salas: JSON.parse(r.salas), status: c?.status ?? "desconectado", erro: c?.erro ?? null, autorizarUrl: c?.autorizarUrl ?? null, ferramentas,
  };
}

export const listarServidores = (): ServidorMcp[] => linhas().map(paraTela);
const publicar = () => emit({ type: "mcp", servidores: listarServidores() });

/* ---------- OAuth ---------- */

const portaApi = () => Number(process.env.API_PORT ?? 4317);
export const redirectOauth = () => `http://127.0.0.1:${portaApi()}/api/mcp/oauth/callback`;
/** state do OAuth → id do conector (para o retorno saber de quem é o código). */
const estadosOauth = new Map<string, number>();

interface DadosOauth {
  tokens?: OAuthTokens;
  cliente?: OAuthClientInformationMixed;
  verificador?: string;
}
const lerOauth = (id: number): DadosOauth => JSON.parse(lerSegredo(chaveOauth(id)) ?? "{}");
const gravarOauth = (id: number, d: DadosOauth) => salvarSegredo(chaveOauth(id), JSON.stringify(d));

function provedorOauth(id: number, preset: string): OAuthClientProvider {
  const seg = lerSegredos(id);
  return {
    get redirectUrl() {
      return redirectOauth();
    },
    get clientMetadata(): OAuthClientMetadata {
      return {
        client_name: "Hefesto",
        redirect_uris: [redirectOauth()],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: seg.clientSecret ? "client_secret_post" : "none",
        ...(seg.escopos ? { scope: seg.escopos } : {}),
      };
    },
    state() {
      const s = `${id}.${randomBytes(16).toString("hex")}`;
      estadosOauth.set(s, id);
      return s;
    },
    // Google e afins: cliente criado por você (ID e secret). Outros: registro dinâmico, guardado cifrado.
    clientInformation: () => (seg.clientId ? { client_id: seg.clientId, ...(seg.clientSecret ? { client_secret: seg.clientSecret } : {}) } : lerOauth(id).cliente),
    saveClientInformation: (info) => gravarOauth(id, { ...lerOauth(id), cliente: info }),
    tokens: () => lerOauth(id).tokens,
    saveTokens: (tokens) => gravarOauth(id, { ...lerOauth(id), tokens }),
    redirectToAuthorization: (url) => {
      // Google só devolve refresh token (para não pedir login de hora em hora) com access_type=offline.
      if (["gmail", "drive", "calendar"].includes(preset)) {
        url.searchParams.set("access_type", "offline");
        url.searchParams.set("prompt", "consent");
      }
      const c = conexoes.get(id);
      if (c) c.autorizarUrl = url.href;
    },
    saveCodeVerifier: (v) => gravarOauth(id, { ...lerOauth(id), verificador: v }),
    codeVerifier: () => {
      const v = lerOauth(id).verificador;
      if (!v) throw new Error("Sem verificador PKCE; clique em Autorizar de novo.");
      return v;
    },
  };
}

/* ---------- Conexão ---------- */

function criarTransporte(r: Linha) {
  const seg = lerSegredos(r.id);
  if (r.tipo === "stdio") {
    if (!r.comando) throw new ErroCard("Informe o comando do servidor.");
    // PATH com Homebrew (apps abertos pelo Finder não herdam o PATH do terminal).
    const base = getDefaultEnvironment();
    return new StdioClientTransport({
      command: r.comando,
      args: JSON.parse(r.args),
      env: { ...base, PATH: `/opt/homebrew/bin:/usr/local/bin:${base.PATH ?? ""}`, ...(seg.env ?? {}) },
      stderr: "ignore",
    });
  }
  if (!r.url) throw new ErroCard("Informe o endereço do servidor.");
  return new StreamableHTTPClientTransport(new URL(r.url), {
    requestInit: { headers: seg.headers ?? {} },
    ...(r.auth === "oauth" ? { authProvider: provedorOauth(r.id, r.preset) } : {}),
  });
}

async function listarTodas(cliente: Client): Promise<Tool[]> {
  const out: Tool[] = [];
  let cursor: string | undefined;
  do {
    const r = await cliente.listTools(cursor ? { cursor } : undefined);
    out.push(...r.tools);
    cursor = r.nextCursor;
  } while (cursor && out.length < 500);
  return out;
}

export async function conectar(id: number): Promise<ServidorMcp> {
  const r = linha(id);
  await desconectar(id, false);
  const c: Conexao = { cliente: null, transporte: null, ferramentas: [], status: "desconectado", erro: null, autorizarUrl: null };
  conexoes.set(id, c);
  try {
    const transporte = criarTransporte(r);
    c.transporte = transporte;
    const cliente = new Client({ name: "hefesto", version: "1.0.0" });
    await cliente.connect(transporte);
    c.cliente = cliente;
    c.ferramentas = await listarTodas(cliente);
    c.status = "conectado";
    transporte.onclose = () => {
      if (conexoes.get(id) === c && c.status === "conectado") {
        c.status = "desconectado";
        publicar();
      }
    };
  } catch (e) {
    if (e instanceof UnauthorizedError || c.autorizarUrl) {
      c.status = "autorizar";
      c.erro = "Precisa autorizar o acesso (login na conta).";
    } else {
      c.status = "erro";
      c.erro = e instanceof Error ? e.message.slice(0, 300) : String(e);
    }
  }
  publicar();
  return paraTela(r);
}

export async function desconectar(id: number, avisar = true) {
  const c = conexoes.get(id);
  conexoes.delete(id);
  await c?.cliente?.close().catch(() => {});
  if (avisar) publicar();
}

/** Volta do login OAuth: troca o código pelos tokens e conecta. */
export async function concluirOauth(estado: string, codigo: string): Promise<string> {
  const id = estadosOauth.get(estado) ?? Number(estado.split(".")[0]);
  estadosOauth.delete(estado);
  const c = conexoes.get(id);
  if (!c || !(c.transporte instanceof StreamableHTTPClientTransport)) throw new ErroCard("Pedido de autorização expirado. Clique em Autorizar de novo.");
  await c.transporte.finishAuth(codigo);
  const s = await conectar(id);
  return s.nome;
}

/** Conecta todos ao iniciar o servidor (sem travar a subida). */
export function iniciarConectores() {
  for (const r of linhas()) void conectar(r.id).catch(() => {});
}

/* ---------- Cadastro ---------- */

const SALAS_VALIDAS = (salas: unknown): RoomId[] => (Array.isArray(salas) ? salas.filter((s): s is RoomId => typeof s === "string" && !!roomById[s as RoomId]) : []);

export async function criarServidor(d: {
  preset?: string; nome?: string; tipo?: string; comando?: string; args?: unknown; url?: string; salas?: unknown; campos?: Record<string, string>;
  env?: Record<string, string>; headers?: Record<string, string>; autenticacao?: string;
}): Promise<ServidorMcp> {
  const p = presetPorId(d.preset ?? "personalizado");
  if (!p) throw new ErroCard("Atalho desconhecido.");
  const campos = d.campos ?? {};
  const tipo = p.id === "personalizado" ? (d.tipo === "http" ? "http" : "stdio") : p.tipo;
  const url = p.url ?? (tipo === "http" ? d.url?.trim() : null) ?? null;
  if (tipo === "http") {
    try {
      const u = new URL(url ?? "");
      if (u.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(u.hostname)) throw new Error();
    } catch {
      throw new ErroCard("Endereço inválido: use https:// (ou http://localhost para servidores locais).");
    }
  }
  const comando = tipo === "stdio" ? (d.comando ?? "").trim() : null;
  if (tipo === "stdio" && !comando) throw new ErroCard("Informe o comando (ex.: npx).");
  const args = Array.isArray(d.args) ? d.args.filter((a): a is string => typeof a === "string") : typeof d.args === "string" ? d.args.split(" ").filter(Boolean) : (p.args ?? []);
  const auth = p.id === "personalizado" ? (d.autenticacao === "oauth" ? "oauth" : d.autenticacao === "token" ? "token" : "nenhuma") : p.autenticacao;
  const seg: Segredos = { env: d.env, headers: { ...(d.headers ?? {}) } };
  if (campos.token) seg.headers!.Authorization = `Bearer ${campos.token.trim()}`;
  if (campos.client_id) seg.clientId = campos.client_id.trim();
  if (campos.client_secret) seg.clientSecret = campos.client_secret.trim();
  if (campos.escopos) seg.escopos = campos.escopos.trim();
  if (p.autenticacao === "token" && !campos.token) throw new ErroCard(`Informe ${p.campos[0]?.rotulo ?? "o token"}.`);
  if (["gmail", "drive", "calendar"].includes(p.id) && (!seg.clientId || !seg.clientSecret)) throw new ErroCard("Informe o Client ID e o Client secret do OAuth.");
  const salas = SALAS_VALIDAS(d.salas).length ? SALAS_VALIDAS(d.salas) : p.salasSugeridas;
  const r = db
    .prepare("INSERT INTO mcp_servidores (nome, preset, tipo, comando, args, url, auth, salas, politicas, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '{}', ?)")
    .run((d.nome?.trim() || p.nome).slice(0, 60), p.id, tipo, comando, JSON.stringify(args), url, auth, JSON.stringify(salas), Date.now());
  const id = Number(r.lastInsertRowid);
  salvarSegredo(chaveSegredos(id), JSON.stringify(seg));
  return conectar(id);
}

export function atualizarServidor(id: number, d: { nome?: string; salas?: unknown; politicas?: Record<string, PoliticaMcp> }): ServidorMcp {
  const r = linha(id);
  const nome = d.nome?.trim() ? d.nome.trim().slice(0, 60) : r.nome;
  const salas = d.salas !== undefined ? SALAS_VALIDAS(d.salas) : JSON.parse(r.salas);
  const politicas = { ...JSON.parse(r.politicas), ...Object.fromEntries(Object.entries(d.politicas ?? {}).filter(([, v]) => ["auto", "aprovar", "bloqueada"].includes(v))) };
  db.prepare("UPDATE mcp_servidores SET nome = ?, salas = ?, politicas = ? WHERE id = ?").run(nome, JSON.stringify(salas), JSON.stringify(politicas), id);
  publicar();
  return paraTela(linha(id));
}

export async function removerServidor(id: number) {
  linha(id);
  await desconectar(id, false);
  db.prepare("DELETE FROM mcp_servidores WHERE id = ?").run(id);
  apagarSegredo(chaveSegredos(id));
  apagarSegredo(chaveOauth(id));
  publicar();
}

/* ---------- Uso pelas ferramentas ---------- */

export interface FerramentaDisponivel {
  servidorId: number;
  servidor: string;
  ferramenta: Tool;
  politica: PoliticaMcp;
}

/** Ferramentas dos conectores conectados e liberados para esta sala (sem as bloqueadas). */
export function ferramentasParaSala(sala: RoomId): FerramentaDisponivel[] {
  const out: FerramentaDisponivel[] = [];
  for (const r of linhas()) {
    const c = conexoes.get(r.id);
    if (c?.status !== "conectado" || !(JSON.parse(r.salas) as RoomId[]).includes(sala)) continue;
    const politicas: Record<string, PoliticaMcp> = JSON.parse(r.politicas);
    for (const t of c.ferramentas) {
      const politica = politicas[t.name] ?? politicaPadrao(t);
      if (politica !== "bloqueada") out.push({ servidorId: r.id, servidor: r.nome, ferramenta: t, politica });
    }
  }
  return out;
}

/** Chama a ferramenta no servidor e devolve texto (e a primeira imagem, se houver). */
export async function chamarFerramenta(servidorId: number, nome: string, args: Record<string, unknown>) {
  const c = conexoes.get(servidorId);
  if (!c?.cliente || c.status !== "conectado") throw new Error("O conector está desconectado. Reconecte em Conectores.");
  const r = await c.cliente.callTool({ name: nome, arguments: args }, undefined, { timeout: 120_000 });
  const blocos = (r.content ?? []) as { type: string; text?: string; data?: string; mimeType?: string; resource?: { text?: string; uri?: string } }[];
  const texto = blocos
    .map((b) => (b.type === "text" ? b.text : b.type === "resource" ? (b.resource?.text ?? b.resource?.uri ?? "") : b.type === "image" ? "(imagem)" : `(${b.type})`))
    .filter(Boolean)
    .join("\n")
    .slice(0, 40_000);
  const img = blocos.find((b) => b.type === "image" && (b.mimeType === "image/png" || b.mimeType === "image/jpeg"));
  return {
    texto: texto || (r.structuredContent ? JSON.stringify(r.structuredContent).slice(0, 40_000) : "(sem conteúdo)"),
    erro: r.isError === true,
    imagem: img?.data ? { media: img.mimeType as "image/png" | "image/jpeg", base64: img.data } : undefined,
  };
}
