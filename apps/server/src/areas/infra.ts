import { promises as dns } from "node:dns";
import { connect } from "node:tls";
import { colunaDeEntrada, type Monitor } from "@empresa/shared";
import { db } from "../db.ts";
import { emit, postChat, postFeed } from "../bus.ts";
import { criarCard, ErroCard } from "../tarefas.ts";
import { ferramenta, texto, type Ferramenta } from "../agentes/loop.ts";

// Infraestrutura e SRE (Fase 6): checagens reais e só de leitura (HTTP, certificado TLS, DNS)
// e um monitoramento que roda a cada 5 minutos e avisa no chat quando algo cai, volta ou o
// certificado está para vencer. Queda confirmada (2 falhas seguidas) abre um card de incidente.

db.exec(`
  CREATE TABLE IF NOT EXISTS monitores (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    url             TEXT NOT NULL UNIQUE,
    ativo           INTEGER NOT NULL DEFAULT 1,
    status          TEXT,
    codigo_http     INTEGER,
    ms              INTEGER,
    dias_cert       INTEGER,
    verificado_em   INTEGER,
    falhas_seguidas INTEGER NOT NULL DEFAULT 0,
    aviso_cert_dia  TEXT
  );
`);

const SEM_REDE = process.env.EMPRESA_SEM_REDE === "1";
const CABECALHOS_SEGURANCA = ["strict-transport-security", "content-security-policy", "x-content-type-options", "x-frame-options", "referrer-policy", "permissions-policy"];

/* ---------- Checagens ---------- */

export function diasDoCertificado(host: string, porta = 443): Promise<{ dias: number; emissor: string; validoAte: string } | null> {
  return new Promise((resolve) => {
    const s = connect({ host, port: porta, servername: host, timeout: 6000, rejectUnauthorized: false }, () => {
      const c = s.getPeerCertificate();
      s.end();
      if (!c?.valid_to) return resolve(null);
      const ate = new Date(c.valid_to);
      resolve({ dias: Math.floor((ate.getTime() - Date.now()) / 86_400_000), emissor: String(c.issuer?.O ?? c.issuer?.CN ?? "?"), validoAte: ate.toISOString().slice(0, 10) });
    });
    s.on("error", () => resolve(null));
    s.on("timeout", () => {
      s.destroy();
      resolve(null);
    });
  });
}

export interface ResultadoSite {
  url: string;
  ok: boolean;
  codigo: number | null;
  ms: number | null;
  urlFinal: string | null;
  erro: string | null;
  certificado: { dias: number; emissor: string; validoAte: string } | null;
  cabecalhosFaltando: string[];
}

export async function verificarSite(urlBruta: string): Promise<ResultadoSite> {
  let u: URL;
  try {
    u = new URL(/^https?:\/\//.test(urlBruta) ? urlBruta : `https://${urlBruta}`);
  } catch {
    throw new ErroCard("Endereço inválido.");
  }
  const base: ResultadoSite = { url: u.href, ok: false, codigo: null, ms: null, urlFinal: null, erro: null, certificado: null, cabecalhosFaltando: [] };
  if (SEM_REDE) return { ...base, erro: "sem rede (modo de teste)" };
  const inicio = Date.now();
  try {
    const r = await fetch(u.href, { redirect: "follow", signal: AbortSignal.timeout(10_000), headers: { "user-agent": "EmpresaCompleta-Monitor/1.0" } });
    base.codigo = r.status;
    base.ms = Date.now() - inicio;
    base.urlFinal = r.url;
    base.ok = r.status < 500;
    base.cabecalhosFaltando = CABECALHOS_SEGURANCA.filter((h) => !r.headers.has(h));
    await r.body?.cancel();
  } catch (e) {
    base.erro = e instanceof Error ? e.message : String(e);
  }
  if (u.protocol === "https:") base.certificado = await diasDoCertificado(u.hostname, Number(u.port) || 443);
  return base;
}

export async function consultarDns(dominioBruto: string): Promise<string> {
  const d = dominioBruto.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0]!;
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) throw new ErroCard("Domínio inválido.");
  if (SEM_REDE) return `${d}: sem rede (modo de teste)`;
  const tenta = async <T,>(fn: () => Promise<T>) => fn().catch(() => null);
  const [a, aaaa, mx, ns, txt, dmarc, caa] = await Promise.all([
    tenta(() => dns.resolve4(d)), tenta(() => dns.resolve6(d)), tenta(() => dns.resolveMx(d)), tenta(() => dns.resolveNs(d)),
    tenta(() => dns.resolveTxt(d)), tenta(() => dns.resolveTxt(`_dmarc.${d}`)), tenta(() => dns.resolveCaa(d)),
  ]);
  const txts = (txt ?? []).map((t) => t.join(""));
  const spf = txts.find((t) => t.startsWith("v=spf1"));
  const dm = (dmarc ?? []).map((t) => t.join("")).find((t) => t.startsWith("v=DMARC1"));
  return [
    `Domínio: ${d}`,
    `A: ${a?.join(", ") || "—"}`,
    `AAAA: ${aaaa?.join(", ") || "—"}`,
    `NS: ${ns?.join(", ") || "—"}`,
    `MX: ${mx?.sort((x, y) => x.priority - y.priority).map((m) => `${m.priority} ${m.exchange}`).join(", ") || "— (domínio não recebe e-mail)"}`,
    `SPF: ${spf ?? "— (falta: e-mails podem cair no spam ou ser falsificados)"}`,
    `DMARC: ${dm ?? "— (falta: recomendado p=quarantine ou p=reject)"}`,
    `CAA: ${caa?.map((c) => JSON.stringify(c)).join(", ") || "—"}`,
    `Outros TXT: ${txts.filter((t) => t !== spf).join(" | ") || "—"}`,
  ].join("\n");
}

function siteEmTexto(r: ResultadoSite): string {
  return [
    `URL: ${r.url}${r.urlFinal && r.urlFinal !== r.url ? ` → ${r.urlFinal}` : ""}`,
    `Status: ${r.codigo ?? "sem resposta"}${r.ms !== null ? ` em ${r.ms} ms` : ""}${r.erro ? ` (erro: ${r.erro})` : ""}`,
    `Certificado TLS: ${r.certificado ? `válido até ${r.certificado.validoAte} (${r.certificado.dias} dias), emitido por ${r.certificado.emissor}` : "—"}`,
    `Cabeçalhos de segurança faltando: ${r.cabecalhosFaltando.join(", ") || "nenhum"}`,
  ].join("\n");
}

/** Ferramentas para Infraestrutura, DevOps, SRE, Segurança e SEO/site. */
export function ferramentasDeInfra(): Ferramenta[] {
  return [
    ferramenta("verificar_site", "Checa um site de verdade: status HTTP, tempo de resposta, redirecionamentos, validade do certificado TLS e cabeçalhos de segurança.", { url: { type: "string" } }, ["url"], async (e) => ({
      texto: siteEmTexto(await verificarSite(texto(e, "url", 500))),
    })),
    ferramenta("consultar_dns", "Consulta o DNS de um domínio: A, AAAA, NS, MX, SPF, DMARC, CAA e TXT.", { dominio: { type: "string" } }, ["dominio"], async (e) => ({
      texto: await consultarDns(texto(e, "dominio", 300)),
    })),
  ];
}

/* ---------- Monitoramento ---------- */

type Linha = {
  id: number; url: string; ativo: number; status: string | null; codigo_http: number | null; ms: number | null; dias_cert: number | null;
  verificado_em: number | null; falhas_seguidas: number; aviso_cert_dia: string | null;
};
const deLinha = (r: Linha): Monitor => ({
  id: r.id, url: r.url, ativo: r.ativo === 1, status: r.status as Monitor["status"], codigoHttp: r.codigo_http, ms: r.ms, diasCertificado: r.dias_cert,
  verificadoEm: r.verificado_em, falhasSeguidas: r.falhas_seguidas,
});

export function listarMonitores(): Monitor[] {
  return (db.prepare("SELECT * FROM monitores ORDER BY id").all() as Linha[]).map(deLinha);
}
const publicar = () => emit({ type: "monitores", monitores: listarMonitores() });

export function adicionarMonitor(urlBruta: string): Monitor[] {
  let u: URL;
  try {
    u = new URL(/^https?:\/\//.test(urlBruta.trim()) ? urlBruta.trim() : `https://${urlBruta.trim()}`);
  } catch {
    throw new ErroCard("Endereço inválido.");
  }
  db.prepare("INSERT OR IGNORE INTO monitores (url) VALUES (?)").run(u.href);
  publicar();
  void checarTodos();
  return listarMonitores();
}

export function removerMonitor(id: number): Monitor[] {
  db.prepare("DELETE FROM monitores WHERE id = ?").run(id);
  publicar();
  return listarMonitores();
}

const SRE = "sre";
const hoje = () => new Date().toISOString().slice(0, 10);

/** Uma rodada: checa cada endereço, avisa mudanças e abre incidente quando a queda se confirma. */
export async function checarTodos(verificar = verificarSite) {
  for (const m of (db.prepare("SELECT * FROM monitores WHERE ativo = 1").all() as Linha[])) {
    const r = await verificar(m.url);
    const falhas = r.ok ? 0 : m.falhas_seguidas + 1;
    // Só declara "fora" com 2 falhas seguidas (evita alarme falso por um soluço de rede).
    const status: "ok" | "fora" = r.ok ? "ok" : falhas >= 2 ? "fora" : ((m.status as "ok" | "fora" | null) ?? "ok");
    db.prepare("UPDATE monitores SET status = ?, codigo_http = ?, ms = ?, dias_cert = ?, verificado_em = ?, falhas_seguidas = ? WHERE id = ?")
      .run(status, r.codigo, r.ms, r.certificado?.dias ?? null, Date.now(), falhas, m.id);
    if (status === "fora" && m.status !== "fora") {
      postChat(SRE, `🔴 ${m.url} está fora do ar (${r.codigo ?? r.erro ?? "sem resposta"}). Abri um incidente e estou acompanhando.`);
      postFeed("devops", SRE, `Incidente: ${m.url} fora do ar`);
      criarCard(
        {
          titulo: `Incidente: ${new URL(m.url).hostname} fora do ar`,
          sala: "devops",
          fluxo: "operacoes",
          coluna: colunaDeEntrada("operacoes"),
          tipo: "bug",
          dono: SRE,
          nivel: "N1",
          prioridade: "P0",
          etiquetas: ["incidente"],
          descricao: `O monitoramento detectou ${m.url} fora do ar em ${new Date().toLocaleString("pt-BR")}.\n\n${siteEmTexto(r)}\n\nInvestigue com verificar_site e consultar_dns, proponha a correção (passo a passo para o CEO executar) e, depois que voltar, escreva o postmortem sem culpados.`,
          criterios: "- Causa provável com evidência\n- Correção passo a passo\n- Como evitar que se repita\n- Postmortem quando o site voltar",
        },
        SRE,
      );
    } else if (status === "ok" && m.status === "fora") {
      postChat(SRE, `🟢 ${m.url} voltou (${r.codigo}, ${r.ms} ms).`);
    }
    if (r.certificado && r.certificado.dias <= 15 && m.aviso_cert_dia !== hoje()) {
      db.prepare("UPDATE monitores SET aviso_cert_dia = ? WHERE id = ?").run(hoje(), m.id);
      postChat(SRE, `⚠️ O certificado TLS de ${new URL(m.url).hostname} vence em ${r.certificado.dias} dia(s) (${r.certificado.validoAte}). Renove antes para o site não ficar "não seguro".`);
    }
  }
  publicar();
}

let timer: NodeJS.Timeout | null = null;
export function iniciarMonitoramento() {
  if (timer) return;
  timer = setInterval(() => void checarTodos().catch((e) => console.error("Monitoramento:", e)), 5 * 60_000);
  void checarTodos().catch(() => {});
}
