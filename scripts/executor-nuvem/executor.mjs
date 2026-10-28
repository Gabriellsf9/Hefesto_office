#!/usr/bin/env node
// Executor de referência da sandbox na nuvem do Hefesto (Configurações → Permissões → Sandbox na nuvem).
// Roda numa máquina sua (uma VM só para isso, com Docker e Node 22+), atrás de HTTPS. Cada comando roda
// num contêiner descartável: sem rede (exceto a instalação de dependências), sem privilégios, com limite
// de memória, CPU, processos e tempo. Sem dependências: só o Node e o Docker.
//
//   HEFESTO_EXECUTOR_TOKEN=<token longo> node executor.mjs
//
// Protocolo (o mesmo descrito no README do Hefesto):
//   GET  /v1/saude                       → { ok, versao, imagem, paralelo, ocupados }
//   POST /v1/executar  { comando: ["npm","test"], rede: false, tempoMaxS: 300, arquivos: "<tar.gz base64>", sessao?: "…" }
//                                         → { codigo, saida, ms }
// Os dois pedem Authorization: Bearer <token>.
//
// Sessão: o Hefesto manda um id por cópia isolada. Entre chamadas da mesma sessão, o executor guarda só as
// pastas de dependências (node_modules, .venv, target…); o código é trocado inteiro a cada chamada. Assim o
// "npm ci" de uma chamada serve para o "npm test" da seguinte. Sessão parada por 60 min é apagada.

import http from "node:http";
import { execFile, spawn } from "node:child_process";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { lstatSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const env = process.env;
const TOKEN = env.HEFESTO_EXECUTOR_TOKEN ?? "";
if (TOKEN.length < 16) {
  console.error("Defina HEFESTO_EXECUTOR_TOKEN com pelo menos 16 caracteres (ex.: openssl rand -hex 32).");
  process.exit(1);
}
const PORTA = Number(env.PORT ?? 8787);
const HOST = env.HOST ?? "127.0.0.1";
const IMAGEM = env.HEFESTO_EXECUTOR_IMAGEM ?? "node:22-bookworm";
const PARALELO = Math.max(1, Number(env.HEFESTO_EXECUTOR_PARALELO ?? 2));
const MEMORIA = env.HEFESTO_EXECUTOR_MEMORIA ?? "2g";
const CPUS = env.HEFESTO_EXECUTOR_CPUS ?? "2";
const SESSAO_MS = Number(env.HEFESTO_EXECUTOR_SESSAO_MIN ?? 60) * 60_000;
const RAIZ = join(env.HEFESTO_EXECUTOR_DIR ?? join(tmpdir(), "hefesto-executor"), "sessoes");
const LIMITE_CORPO = 80 * 1024 * 1024;
const LIMITE_SAIDA = 1024 * 1024;
const VERSAO = 1;
// O contêiner roda com o mesmo usuário do executor (os arquivos da sessão continuam dele); se o executor
// estiver como root, o comando roda como nobody e a pasta da sessão passa a ser de nobody.
const COMO_ROOT = process.getuid?.() === 0;
const USUARIO = COMO_ROOT ? "65534:65534" : `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`;
/** Pastas que sobrevivem entre chamadas da mesma sessão (em qualquer nível, para monorepos). */
const DEPENDENCIAS = new Set(["node_modules", ".pnpm-store", ".venv", "venv", "target", ".gradle", ".dart_tool"]);

rmSync(RAIZ, { recursive: true, force: true });
mkdirSync(RAIZ, { recursive: true });

/* ---------- Fila: no máximo PARALELO comandos ao mesmo tempo ---------- */
let ocupados = 0;
const espera = [];
const vaga = () => (ocupados < PARALELO ? (ocupados++, Promise.resolve()) : new Promise((r) => espera.push(r)));
const liberar = () => (espera.length ? espera.shift()() : ocupados--);

/* ---------- Sessões ---------- */
const sessoes = new Map(); // id → { usadoEm, fila: Promise }
function emSessao(id, fn) {
  const s = sessoes.get(id) ?? { usadoEm: Date.now(), fila: Promise.resolve() };
  sessoes.set(id, s);
  const vez = s.fila.then(fn, fn);
  s.fila = vez.catch(() => {});
  s.usadoEm = Date.now();
  return vez.finally(() => (s.usadoEm = Date.now()));
}
setInterval(() => {
  for (const [id, s] of sessoes) {
    if (Date.now() - s.usadoEm < SESSAO_MS) continue;
    sessoes.delete(id);
    void s.fila.then(() => rmSync(join(RAIZ, id), { recursive: true, force: true }));
  }
}, 5 * 60_000).unref();

/** Apaga tudo da pasta da sessão menos as pastas de dependências (sem seguir links). */
function limpar(pasta) {
  for (const nome of readdirSync(pasta)) {
    const p = join(pasta, nome);
    const st = lstatSync(p);
    if (st.isDirectory() && !st.isSymbolicLink()) {
      if (DEPENDENCIAS.has(nome)) continue;
      limpar(p);
      if (!readdirSync(p).length) rmSync(p, { recursive: true, force: true });
    } else rmSync(p, { force: true });
  }
}

function extrair(pasta, tar) {
  return new Promise((resolve, reject) => {
    // tar recusa ".." e "/" no início por padrão; sem dono nem permissões especiais do pacote.
    const p = execFile("tar", ["-xzf", "-", "-C", pasta, "--no-same-owner", "--no-same-permissions"], (err, _o, stderr) =>
      err ? reject(Object.assign(new Error(`Pacote de arquivos inválido: ${String(stderr || err.message).slice(0, 300)}`), { status: 400 })) : resolve(),
    );
    p.stdin.end(tar);
  });
}

function rodar(pasta, comando, rede, tempoMaxS) {
  const nome = `hefesto-exec-${randomUUID().slice(0, 12)}`;
  const args = [
    "run", "--rm", "--name", nome, "--network", rede ? "bridge" : "none",
    "--memory", MEMORIA, "--cpus", CPUS, "--pids-limit", "512",
    "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--user", USUARIO,
    "-e", "HOME=/tmp", "-e", "CI=1", "-e", "FORCE_COLOR=0", "-e", "LANG=C.UTF-8",
    "-v", `${pasta}:/work`, "-w", "/work", "--entrypoint", comando[0], IMAGEM, ...comando.slice(1),
  ];
  return new Promise((resolve) => {
    const inicio = Date.now();
    const p = spawn("docker", args, { stdio: ["ignore", "pipe", "pipe"] });
    let saida = "";
    const juntar = (b) => {
      saida += b.toString("utf8");
      if (saida.length > LIMITE_SAIDA) saida = saida.slice(-LIMITE_SAIDA);
    };
    p.stdout.on("data", juntar);
    p.stderr.on("data", juntar);
    let estourou = false;
    const t = setTimeout(() => {
      estourou = true;
      execFile("docker", ["kill", nome], () => {});
    }, tempoMaxS * 1000);
    p.on("close", (codigo) => {
      clearTimeout(t);
      if (estourou) saida += `\n(parado: passou de ${tempoMaxS} s)`;
      resolve({ codigo: estourou ? null : codigo, saida: saida.slice(-200_000), ms: Date.now() - inicio });
    });
    p.on("error", (e) => {
      clearTimeout(t);
      resolve({ codigo: null, saida: `Não consegui chamar o Docker: ${e.message}`, ms: Date.now() - inicio });
    });
  });
}

/* ---------- HTTP ---------- */
const autorizado = (req) => {
  const a = Buffer.from(String(req.headers.authorization ?? ""));
  const b = Buffer.from(`Bearer ${TOKEN}`);
  return a.length === b.length && timingSafeEqual(a, b);
};
const responder = (res, status, corpo) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(corpo));
};
const lerCorpo = (req) =>
  new Promise((resolve, reject) => {
    const partes = [];
    let n = 0;
    req.on("data", (c) => {
      n += c.length;
      if (n > LIMITE_CORPO) {
        reject(Object.assign(new Error("Pedido grande demais."), { status: 413 }));
        req.destroy();
      } else partes.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(partes).toString("utf8")));
    req.on("error", reject);
  });

function validar(c) {
  if (!c || typeof c !== "object") throw new Error("Corpo inválido.");
  if (!Array.isArray(c.comando) || !c.comando.length || c.comando.length > 200 || c.comando.some((x) => typeof x !== "string" || !x || x.length > 4000 || x.includes("\0")))
    throw new Error("comando deve ser uma lista de argumentos (texto).");
  if (typeof c.arquivos !== "string" || !c.arquivos) throw new Error("arquivos (tar.gz em base64) é obrigatório.");
  if (c.sessao !== undefined && !/^[A-Za-z0-9_-]{8,80}$/.test(String(c.sessao))) throw new Error("sessao inválida.");
  return {
    comando: c.comando,
    rede: c.rede === true,
    tempoMaxS: Math.min(3600, Math.max(1, Math.round(Number(c.tempoMaxS) || 300))),
    tar: Buffer.from(c.arquivos, "base64"),
    sessao: c.sessao ? String(c.sessao) : null,
  };
}

const servidor = http.createServer(async (req, res) => {
  try {
    if (!autorizado(req)) return responder(res, 401, { erro: "Token inválido." });
    if (req.method === "GET" && req.url === "/v1/saude") return responder(res, 200, { ok: true, versao: VERSAO, imagem: IMAGEM, paralelo: PARALELO, ocupados });
    if (req.method !== "POST" || req.url !== "/v1/executar") return responder(res, 404, { erro: "Rota desconhecida." });
    let pedido;
    try {
      pedido = validar(JSON.parse(await lerCorpo(req)));
    } catch (e) {
      return responder(res, e.status ?? 400, { erro: e.message });
    }
    const id = pedido.sessao ?? `avulsa-${randomUUID()}`;
    const pasta = join(RAIZ, id);
    const r = await emSessao(id, async () => {
      await vaga();
      try {
        mkdirSync(pasta, { recursive: true });
        limpar(pasta);
        await extrair(pasta, pedido.tar);
        if (COMO_ROOT) await new Promise((r) => execFile("chown", ["-R", USUARIO, pasta], r));
        return await rodar(pasta, pedido.comando, pedido.rede, pedido.tempoMaxS);
      } finally {
        liberar();
        if (!pedido.sessao) {
          sessoes.delete(id);
          rmSync(pasta, { recursive: true, force: true });
        }
      }
    });
    responder(res, 200, r);
  } catch (e) {
    responder(res, e?.status ?? 500, { erro: String(e?.message ?? e).slice(0, 500) });
  }
});
servidor.requestTimeout = 0;
servidor.listen(PORTA, HOST, () => console.log(`Executor do Hefesto em http://${HOST}:${PORTA} (imagem ${IMAGEM}, ${PARALELO} por vez)`));
