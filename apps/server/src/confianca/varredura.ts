import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Varredura determinística do diff de um card: segredos que entraram no código (chaves, tokens, chaves
// privadas, .env) e dependências novas com licença que obriga a abrir o seu código (GPL, AGPL, SSPL…).
// Segredo barra a entrega (volta ao autor); licença vira aviso para você decidir na aprovação.

interface Padrao {
  nome: string;
  re: RegExp;
}

const PADROES: Padrao[] = [
  { nome: "chave da Anthropic", re: /sk-ant-[A-Za-z0-9_-]{20,}/ },
  { nome: "chave da OpenAI", re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/ },
  { nome: "chave da AWS", re: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/ },
  { nome: "token do GitHub", re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{40,}/ },
  { nome: "token do Slack", re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/ },
  { nome: "chave do Stripe", re: /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}/ },
  { nome: "chave do Google", re: /\bAIza[A-Za-z0-9_-]{35}\b/ },
  { nome: "token do Telegram", re: /\b\d{8,10}:AA[A-Za-z0-9_-]{33}\b/ },
  { nome: "chave privada", re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/ },
  { nome: "JWT", re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { nome: "URL com senha", re: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:[^\s@/]{6,}@[^\s/]+/i },
  // Atribuição de senha/segredo com valor literal (não variável de ambiente nem placeholder).
  { nome: "senha no código", re: /\b(?:password|passwd|senha|secret|api[_-]?key|token)\b["']?\s*[:=]\s*["'](?![^"']*(?:\$\{|process\.env|<|xxx|\*\*\*|changeme|exemplo|example))[^"'\s]{8,}["']/i },
];

/** Valor exibido sem revelar o segredo: só o começo e o tamanho. */
const mascarar = (s: string) => `${s.slice(0, 4)}…(${s.length} caracteres)`;

/** Troca segredos conhecidos por uma máscara (para logs, replay e comentários). */
export function redigir(texto: string): string {
  let t = texto;
  for (const p of PADROES) t = t.replace(new RegExp(p.re.source, p.re.flags.includes("g") ? p.re.flags : p.re.flags + "g"), (m) => `[${p.nome}: ${mascarar(m)}]`);
  return t;
}

export interface AchadoSegredo {
  arquivo: string;
  linha: number;
  tipo: string;
  trecho: string;
}

/** Arquivos que nunca deveriam entrar no repositório. */
const ARQUIVO_SECRETO = /(^|\/)(\.env(\.[\w-]+)?|id_rsa|id_ed25519|.*\.pem|.*\.p12|.*\.pfx|credentials\.json|\.npmrc|\.pypirc)$/i;
const ARQUIVO_EXEMPLO = /\.(example|sample|template|dist)$|(^|\/)\.env\.(example|sample|template)$/i;

/** Linhas adicionadas no diff (formato unificado do git) com o arquivo e o número da linha. */
function linhasAdicionadas(diff: string): { arquivo: string; linha: number; texto: string }[] {
  const out: { arquivo: string; linha: number; texto: string }[] = [];
  let arquivo = "";
  let n = 0;
  for (const l of diff.split("\n")) {
    if (l.startsWith("+++ ")) {
      arquivo = l.slice(4).replace(/^b\//, "").trim();
      continue;
    }
    const h = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(l);
    if (h) {
      n = Number(h[1]);
      continue;
    }
    if (!arquivo || l.startsWith("---")) continue;
    if (l.startsWith("+")) out.push({ arquivo, linha: n++, texto: l.slice(1) });
    else if (!l.startsWith("-")) n++;
  }
  return out;
}

/** Arquivos novos ou alterados no diff. */
export const arquivosDoDiff = (diff: string) => [...new Set([...diff.matchAll(/^\+\+\+ b\/(.+)$/gm)].map((m) => m[1]!.trim()))];

export function varrerSegredos(diff: string): AchadoSegredo[] {
  const achados: AchadoSegredo[] = [];
  for (const a of arquivosDoDiff(diff)) {
    if (ARQUIVO_SECRETO.test(a) && !ARQUIVO_EXEMPLO.test(a)) achados.push({ arquivo: a, linha: 0, tipo: "arquivo de segredos no repositório", trecho: a });
  }
  for (const l of linhasAdicionadas(diff)) {
    if (ARQUIVO_EXEMPLO.test(l.arquivo) || /(^|\/)(test|tests|__tests__|fixtures?)\//.test(l.arquivo) || /\.lock$|lock\.json$|\.lockb$/.test(l.arquivo)) continue;
    for (const p of PADROES) {
      const m = p.re.exec(l.texto);
      if (m) {
        achados.push({ arquivo: l.arquivo, linha: l.linha, tipo: p.nome, trecho: l.texto.replace(m[0], mascarar(m[0])).trim().slice(0, 160) });
        break;
      }
    }
  }
  return achados.slice(0, 30);
}

/* ---------- Licenças ---------- */

/** Licenças que obrigam a abrir o código de quem usa (ou têm restrição forte de uso comercial). */
const COPYLEFT = /\b(A?GPL|LGPL|SSPL|EUPL|OSL|CPAL|BUSL|Commons-Clause|CC-BY-NC|Elastic-2\.0)\b/i;

export interface AchadoLicenca {
  pacote: string;
  versao: string;
  licenca: string;
}

/** Dependências adicionadas nos package.json do diff (nome → versão pedida). */
function dependenciasNovas(diff: string): { pasta: string; nome: string; versao: string }[] {
  const out: { pasta: string; nome: string; versao: string }[] = [];
  for (const l of linhasAdicionadas(diff)) {
    if (!/(^|\/)package\.json$/.test(l.arquivo)) continue;
    const m = /^\s*"(@?[a-z0-9][\w.-]*(?:\/[\w.-]+)?)"\s*:\s*"([^"]+)"/i.exec(l.texto);
    if (!m || /^(name|version|description|main|type|license|private|scripts?|module|types|author)$/.test(m[1]!)) continue;
    if (/^(node|tsx|vite|tsc|eslint|vitest|jest|prettier)\b/.test(m[2]!)) continue; // é um script, não uma versão
    out.push({ pasta: l.arquivo.replace(/package\.json$/, ""), nome: m[1]!, versao: m[2]! });
  }
  return out;
}

/** Licença de um pacote instalado (node_modules da pasta ou da raiz). */
function licencaInstalada(raizes: string[], pasta: string, nome: string): string | null {
  for (const base of raizes.flatMap((r) => [join(r, pasta), r])) {
    const p = join(base, "node_modules", nome, "package.json");
    if (!existsSync(p)) continue;
    try {
      const pkg = JSON.parse(readFileSync(p, "utf8")) as { license?: string | { type?: string }; licenses?: { type?: string }[] };
      const l = typeof pkg.license === "string" ? pkg.license : pkg.license?.type ?? pkg.licenses?.map((x) => x.type).join(" OR ");
      return l || "sem licença declarada";
    } catch {
      return null;
    }
  }
  return null;
}

/** Dependências novas com licença copyleft (ou sem licença): aviso para a aprovação. Procura nas pastas dadas (cópia e projeto). */
export function verificarLicencas(raizes: string[], diff: string): AchadoLicenca[] {
  const achados: AchadoLicenca[] = [];
  for (const d of dependenciasNovas(diff)) {
    const l = licencaInstalada(raizes, d.pasta, d.nome);
    if (l && (COPYLEFT.test(l) || l === "sem licença declarada" || /UNLICENSED/i.test(l))) achados.push({ pacote: d.nome, versao: d.versao, licenca: l });
  }
  return achados;
}

/** Texto para o card. */
export function relatorioVarredura(segredos: AchadoSegredo[], licencas: AchadoLicenca[]): string {
  const partes: string[] = [];
  if (segredos.length)
    partes.push(
      `🔐 Segredo no diff: ${segredos.length} achado(s). Tire do código e leia de variável de ambiente (sem commitar .env):\n${segredos
        .map((s) => `- \`${s.arquivo}${s.linha ? `:${s.linha}` : ""}\` — ${s.tipo}: ${s.trecho}`)
        .join("\n")}`,
    );
  if (licencas.length)
    partes.push(`⚖️ Licença a conferir: ${licencas.map((l) => `\`${l.pacote}@${l.versao}\` (${l.licenca})`).join(", ")}. Pode obrigar a abrir o seu código; decida na aprovação.`);
  return partes.join("\n\n");
}
