import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { db, getSetting, setSetting } from "./db.ts";
import { ErroCard } from "./tarefas.ts";

// Acesso remoto (celular, outro computador, Tailscale): pelo próprio computador nada muda; por um endereço que você
// liberou, só com senha. A sessão fica num cookie HttpOnly + SameSite=Strict (um site malicioso não consegue usá-la,
// nem com DNS rebinding: o cookie é do endereço liberado). Apps (cliente MCP, scripts) usam uma chave de acesso no
// cabeçalho Authorization. Endereço que não está na lista continua bloqueado, como sempre foi.

const CHAVE = "acesso_remoto";
const DIA = 86_400_000;
const VALIDADE_SESSAO = 30 * DIA;
const HOST_LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
const ORIGEM_LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
export const COOKIE = "hefesto_sessao";

db.exec(`CREATE TABLE IF NOT EXISTS sessoes_remotas (
  hash TEXT PRIMARY KEY, tipo TEXT NOT NULL, nome TEXT NOT NULL, ip TEXT, criada INTEGER NOT NULL, ultimo_uso INTEGER NOT NULL, expira INTEGER
)`);

interface Config {
  senha?: { sal: string; hash: string };
  enderecos: string[];
}

const config = (): Config => {
  try {
    return { enderecos: [], ...(JSON.parse(getSetting(CHAVE) ?? "{}") as Partial<Config>) };
  } catch {
    return { enderecos: [] };
  }
};
const salvar = (c: Config) => setSetting(CHAVE, JSON.stringify(c));
const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
const hashSenha = (senha: string, sal: string) => scryptSync(senha.normalize("NFKC"), sal, 64).toString("hex");

export const remotoLigado = () => !!config().senha;

export function estadoAcessoRemoto() {
  const c = config();
  const agora = Date.now();
  const sessoes = (db.prepare("SELECT hash, tipo, nome, ip, criada, ultimo_uso FROM sessoes_remotas WHERE expira IS NULL OR expira > ? ORDER BY ultimo_uso DESC").all(agora) as {
    hash: string; tipo: string; nome: string; ip: string | null; criada: number; ultimo_uso: number;
  }[]).map((s) => ({ id: s.hash.slice(0, 12), tipo: s.tipo as "sessao" | "chave", nome: s.nome, ip: s.ip, criada: s.criada, ultimoUso: s.ultimo_uso }));
  return { ligado: !!c.senha, enderecos: c.enderecos, sessoes };
}

/** Liga (ou troca a senha), muda os endereços liberados, ou desliga (senha null: apaga a senha e todas as sessões). */
export function configurarAcessoRemoto(corpo: { senha?: string | null; enderecos?: unknown }) {
  const c = config();
  if (corpo.senha === null) {
    delete c.senha;
    db.prepare("DELETE FROM sessoes_remotas").run();
  } else if (typeof corpo.senha === "string") {
    if (corpo.senha.length < 10) throw new ErroCard("Use uma senha de pelo menos 10 caracteres.");
    const sal = randomBytes(16).toString("hex");
    c.senha = { sal, hash: hashSenha(corpo.senha, sal) };
    db.prepare("DELETE FROM sessoes_remotas WHERE tipo = 'sessao'").run(); // senha nova: quem entrou com a antiga sai
  }
  if (Array.isArray(corpo.enderecos)) {
    const lista = corpo.enderecos.map((e) => String(e).trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "")).filter(Boolean);
    const invalido = lista.find((e) => !/^[a-z0-9.-]+(:\d+)?$|^\[[0-9a-f:]+\](:\d+)?$/.test(e) || HOST_LOCAL.test(e));
    if (invalido) throw new ErroCard(`Endereço inválido: ${invalido} (ex.: meu-pc.tailnet.ts.net ou 192.168.0.10:4417).`);
    c.enderecos = [...new Set(lista)].slice(0, 10);
  }
  salvar(c);
  return estadoAcessoRemoto();
}

export function revogar(id: string | "todas") {
  if (id === "todas") db.prepare("DELETE FROM sessoes_remotas").run();
  else db.prepare("DELETE FROM sessoes_remotas WHERE substr(hash, 1, 12) = ?").run(id);
  return estadoAcessoRemoto();
}

/** Chave de acesso para apps (cliente MCP, scripts): mostrada uma vez só; aqui fica o hash. */
export function criarChaveDeAcesso(nome: string): string {
  if (!remotoLigado()) throw new ErroCard("Ligue o acesso remoto (com senha) antes de criar uma chave.");
  const chave = `hfst_${randomBytes(24).toString("base64url")}`;
  const agora = Date.now();
  db.prepare("INSERT INTO sessoes_remotas (hash, tipo, nome, ip, criada, ultimo_uso, expira) VALUES (?, 'chave', ?, NULL, ?, ?, NULL)").run(hashToken(chave), nome.trim().slice(0, 60) || "App", agora, agora);
  return chave;
}

/* ---------- Entrar ---------- */

const tentativas = new Map<string, number[]>();
const JANELA = 10 * 60_000;
const MAX_POR_IP = 5;
const MAX_GERAL = 20;

/** Confere a senha (com limite de tentativas por IP e no geral) e devolve o token da sessão nova. */
export function entrar(senha: unknown, ip: string, aparelho: string): string {
  const c = config();
  if (!c.senha) throw new ErroCard("O acesso remoto está desligado.", 403);
  const agora = Date.now();
  const recentes = (k: string) => (tentativas.get(k) ?? []).filter((t) => agora - t < JANELA);
  if (recentes(ip).length >= MAX_POR_IP || recentes("*").length >= MAX_GERAL) throw new ErroCard("Muitas tentativas. Espere 10 minutos.", 429);
  const ok = typeof senha === "string" && timingSafeEqual(Buffer.from(hashSenha(senha, c.senha.sal), "hex"), Buffer.from(c.senha.hash, "hex"));
  if (!ok) {
    tentativas.set(ip, [...recentes(ip), agora]);
    tentativas.set("*", [...recentes("*"), agora]);
    throw new ErroCard("Senha incorreta.", 401);
  }
  tentativas.delete(ip);
  const token = randomBytes(32).toString("base64url");
  db.prepare("INSERT INTO sessoes_remotas (hash, tipo, nome, ip, criada, ultimo_uso, expira) VALUES (?, 'sessao', ?, ?, ?, ?, ?)").run(
    hashToken(token), aparelhoLegivel(aparelho), ip, agora, agora, agora + VALIDADE_SESSAO,
  );
  return token;
}

export function sair(token: string | undefined) {
  if (token) db.prepare("DELETE FROM sessoes_remotas WHERE hash = ?").run(hashToken(token));
}

const aparelhoLegivel = (ua: string) => {
  const so = /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "Aparelho";
  const nav = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "";
  return `${so}${nav ? ` · ${nav}` : ""}`;
};

/** Sessão ou chave válida? Atualiza o último uso (no máximo uma escrita por minuto). */
function credencialValida(token: string): boolean {
  const agora = Date.now();
  const s = db.prepare("SELECT ultimo_uso FROM sessoes_remotas WHERE hash = ? AND (expira IS NULL OR expira > ?)").get(hashToken(token), agora) as { ultimo_uso: number } | undefined;
  if (!s) return false;
  if (agora - s.ultimo_uso > 60_000) db.prepare("UPDATE sessoes_remotas SET ultimo_uso = ? WHERE hash = ?").run(agora, hashToken(token));
  return true;
}

export const lerCookie = (cabecalho: string | undefined, nome: string) =>
  cabecalho?.split(";").map((p) => p.trim().split("=")).find(([k]) => k === nome)?.[1];

/* ---------- A regra de cada pedido ---------- */

export interface Pedido {
  host: string;
  origin?: string;
  secFetchSite?: string;
  secFetchMode?: string;
  method: string;
  url: string;
  cookie?: string;
  authorization?: string;
  /** Chegou por proxy (X-Forwarded-For/Forwarded): Tailscale serve, Caddy… Nunca conta como local. */
  encaminhado?: boolean;
  /** X-Forwarded-Host do proxy, quando ele troca o Host pelo endereço interno. */
  hostEncaminhado?: string;
}
export type Decisao = { ok: true; remoto: boolean } | { ok: false; status: number; erro: string; entrar?: boolean };

const LIVRES_REMOTO = new Set(["/entrar", "/api/entrar", "/manifest.webmanifest", "/icone.svg"]);

export function decidirAcesso(p: Pedido): Decisao {
  // O Host vem de quem pede: sozinho não prova nada. Local é Host local E sem proxy no meio (a porta do Docker só
  // escuta no 127.0.0.1; o que vem de fora chega pelo proxy, que sempre marca o pedido).
  const local = HOST_LOCAL.test(p.host) && !p.encaminhado;
  const host = (p.encaminhado ? (p.hostEncaminhado ?? p.host) : p.host).toLowerCase();
  const c = local ? null : config();
  // Pelo proxy, o Host pode ter virado o endereço interno (localhost): vale se o remoto estiver ligado (com senha).
  const liberado = !local && !!c?.senha && (c.enderecos.includes(host) || (!!p.encaminhado && HOST_LOCAL.test(host)));
  if (!local && !liberado) return { ok: false, status: 403, erro: "Acesso só pelo próprio computador (localhost). Para usar de outro aparelho, ligue o acesso remoto em Configurações." };
  // Origin, se houver: local só com origem local; remoto só com a origem de um endereço liberado. Nada de outro site.
  if (p.origin !== undefined) {
    const origemHost = p.origin.toLowerCase().replace(/^https?:\/\//, "");
    const ok = local ? ORIGEM_LOCAL.test(p.origin) : /^https?:\/\//i.test(p.origin) && (origemHost === host || !!c?.enderecos.includes(origemHost));
    if (!ok) return { ok: false, status: 403, erro: "Origem não permitida." };
  }
  const navegacao = p.method === "GET" && p.secFetchMode === "navigate";
  if (p.secFetchSite === "cross-site" && !navegacao) return { ok: false, status: 403, erro: "Pedido entre sites bloqueado." };
  if (local) return { ok: true, remoto: false };

  const caminho = p.url.split("?")[0]!;
  if (LIVRES_REMOTO.has(caminho)) return { ok: true, remoto: true };
  const bearer = /^Bearer\s+(\S+)$/i.exec(p.authorization ?? "")?.[1];
  const token = bearer ?? lerCookie(p.cookie, COOKIE);
  if (token && credencialValida(token)) return { ok: true, remoto: true };
  // Sem sessão: a página leva para a tela de entrar; a API responde 401 (a interface redireciona).
  return { ok: false, status: 401, erro: "Entre com a senha do Hefesto.", entrar: navegacao };
}

/** Tela de entrar (HTML simples, sem depender do app: funciona antes de ter sessão). */
export const PAGINA_ENTRAR = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Entrar · Hefesto</title><meta name="color-scheme" content="light dark">
<style>
:root{--bg:#f6f5f2;--card:#fff;--fg:#1c1b19;--fg2:#6b6862;--linha:#dedbd4;--acento:#c2410c;--erro:#b42318}
@media (prefers-color-scheme:dark){:root{--bg:#141312;--card:#1e1d1b;--fg:#f2f0ec;--fg2:#a29e96;--linha:#38352f;--acento:#f97316;--erro:#f97066}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;padding:16px}
form{width:100%;max-width:360px;background:var(--card);border:1px solid var(--linha);border-radius:14px;padding:28px}
h1{margin:0 0 4px;font-size:20px}p{margin:0 0 20px;color:var(--fg2);font-size:14px}
label{display:block;font-size:13px;font-weight:600;margin-bottom:6px}
input{width:100%;padding:10px 12px;border:1px solid var(--linha);border-radius:8px;background:transparent;color:inherit;font:inherit}
input:focus{outline:2px solid var(--acento);outline-offset:1px}
button{margin-top:16px;width:100%;padding:10px;border:0;border-radius:8px;background:var(--acento);color:#fff;font:inherit;font-weight:600;cursor:pointer}
button:disabled{opacity:.6}#erro{min-height:20px;margin-top:10px;color:var(--erro);font-size:13px}
</style></head><body>
<form id="f"><h1>Hefesto</h1><p>Acesso remoto. Entre com a senha que você definiu em Configurações.</p>
<label for="s">Senha</label><input id="s" type="password" autocomplete="current-password" required autofocus>
<button id="b">Entrar</button><div id="erro" role="alert"></div></form>
<script>
const f=document.getElementById("f"),b=document.getElementById("b"),e=document.getElementById("erro");
f.addEventListener("submit",async(ev)=>{ev.preventDefault();b.disabled=true;e.textContent="";
try{const r=await fetch("/api/entrar",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({senha:document.getElementById("s").value})});
if(r.ok){location.replace("/");return}const j=await r.json().catch(()=>({}));e.textContent=j.erro||"Não deu para entrar."}
catch{e.textContent="Sem conexão com o Hefesto."}b.disabled=false});
</script></body></html>`;
