import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { basename, join, relative, sep } from "node:path";

// Leitura do projeto do CEO pelos agentes (raio-x, contexto de tarefas).
// Somente leitura, presa à pasta do projeto, e sem tocar em arquivos de segredo.

const IGNORAR = new Set([
  "node_modules", ".git", "dist", "build", ".next", ".nuxt", "out", "target", "vendor", ".venv", "venv", "__pycache__",
  ".turbo", ".cache", "coverage", ".idea", ".vscode", "Pods", ".gradle", ".dart_tool",
  // Ferramentas de IA guardam ali cópias inteiras do projeto em outras branches (worktrees): ler essas
  // cópias faz o agente citar código desatualizado como se fosse o atual.
  ".claude", ".codex", ".cursor", ".worktrees",
]);

const SEGREDO = /^\.env|\.(pem|key|p12|pfx|keystore|jks)$|^id_(rsa|ed25519|ecdsa|dsa)|^credentials|secret|^\.npmrc$|^\.netrc$|^\.pgpass$/i;

export const ehSegredo = (nome: string) => SEGREDO.test(basename(nome));

const MAX_LEITURA = 120_000;

export class ErroArquivo extends Error {}

/** Resolve um caminho relativo garantindo que ele fica dentro da raiz do projeto. */
async function dentro(raiz: string, rel: string) {
  const base = await realpath(raiz);
  let alvo: string;
  try {
    alvo = await realpath(join(base, rel || "."));
  } catch {
    throw new ErroArquivo(`Não existe: ${rel}`);
  }
  if (alvo !== base && !alvo.startsWith(base + sep)) throw new ErroArquivo("Caminho fora do projeto.");
  return { base, alvo };
}

export async function listarArquivos(raiz: string, rel = ".", profundidade = 2): Promise<string> {
  const { base, alvo } = await dentro(raiz, rel);
  const linhas: string[] = [];
  const andar = async (dir: string, nivel: number) => {
    if (linhas.length >= 400) return;
    const itens = (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
    for (const it of itens) {
      if (linhas.length >= 400) {
        linhas.push("… (lista cortada em 400 itens)");
        return;
      }
      if (IGNORAR.has(it.name)) continue;
      const caminho = join(dir, it.name);
      const recuo = "  ".repeat(nivel);
      if (it.isDirectory()) {
        linhas.push(`${recuo}${it.name}/`);
        if (nivel + 1 < profundidade) await andar(caminho, nivel + 1);
      } else {
        linhas.push(`${recuo}${it.name}${ehSegredo(it.name) ? "  (segredo: não pode ser lido)" : ""}`);
      }
    }
  };
  await andar(alvo, 0);
  return `${relative(base, alvo) || "."}/\n${linhas.join("\n")}`;
}

export async function lerArquivo(raiz: string, rel: string, inicio?: number, fim?: number): Promise<string> {
  if (ehSegredo(rel)) throw new ErroArquivo("Arquivo de segredo: os agentes não podem ler. Peça ao CEO se for realmente necessário.");
  const { alvo } = await dentro(raiz, rel);
  const info = await stat(alvo);
  if (!info.isFile()) throw new ErroArquivo("Não é um arquivo.");
  const buf = await readFile(alvo);
  if (buf.subarray(0, 8000).includes(0)) throw new ErroArquivo("Arquivo binário.");
  const todas = buf.toString("utf8").split("\n");
  const a = Math.max(1, inicio ?? 1);
  const b = Math.min(todas.length, fim ?? todas.length);
  let saida = "";
  for (let i = a; i <= b; i++) {
    const linha = `${i}\t${todas[i - 1]}\n`;
    if (saida.length + linha.length > MAX_LEITURA) {
      saida += `… (cortado na linha ${i - 1} de ${todas.length}; peça um intervalo com inicio/fim)`;
      break;
    }
    saida += linha;
  }
  return saida || "(arquivo vazio)";
}

export async function buscarNoCodigo(raiz: string, texto: string): Promise<string> {
  const base = await realpath(raiz);
  const q = texto.toLowerCase();
  const achados: string[] = [];
  let arquivos = 0;
  const andar = async (dir: string) => {
    for (const it of await readdir(dir, { withFileTypes: true })) {
      if (achados.length >= 100 || arquivos >= 4000) return;
      if (IGNORAR.has(it.name)) continue;
      const caminho = join(dir, it.name);
      if (it.isDirectory()) await andar(caminho);
      else if (it.isFile() && !ehSegredo(it.name)) {
        arquivos++;
        const info = await stat(caminho);
        if (info.size > 500_000) continue;
        const buf = await readFile(caminho);
        if (buf.subarray(0, 8000).includes(0)) continue;
        buf.toString("utf8").split("\n").forEach((linha, i) => {
          if (achados.length < 100 && linha.toLowerCase().includes(q)) {
            achados.push(`${relative(base, caminho)}:${i + 1}: ${linha.trim().slice(0, 200)}`);
          }
        });
      }
    }
  };
  await andar(base);
  return achados.length ? achados.join("\n") : "Nada encontrado.";
}

/* ---------- Mapa do código (contexto cirúrgico) ---------- */

const EXT_CODIGO = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|py|go)$/;
const MAX_MAPA = 40_000;

/** Assinaturas de um arquivo TS/JS pela árvore sintática (sem o corpo das funções). */
async function mapaTs(nome: string, texto: string): Promise<string[]> {
  const ts = (await import("typescript")).default;
  const kind = /\.tsx$/.test(nome) ? ts.ScriptKind.TSX : /\.jsx$/.test(nome) ? ts.ScriptKind.JSX : /\.(js|mjs|cjs)$/.test(nome) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(nome, texto, ts.ScriptTarget.Latest, true, kind);
  const curto = (n: object | undefined, max = 140) => (n ? (n as { getText: (s: typeof sf) => string }).getText(sf).replace(/\s+/g, " ").slice(0, max) : "");
  const exportado = (n: { modifiers?: readonly { kind: number }[] } & object) =>
    "modifiers" in n && n.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ? "export " : "";
  const params = (ps: readonly object[]) => ps.map((p) => curto(p, 60)).join(", ");
  const out: string[] = [];
  const imports: string[] = [];
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st)) imports.push((st.moduleSpecifier as { text?: string }).text ?? "");
    else if (ts.isFunctionDeclaration(st) && st.name) out.push(`${exportado(st)}function ${st.name.text}(${params(st.parameters)})${st.type ? `: ${curto(st.type, 80)}` : ""}`);
    else if (ts.isClassDeclaration(st)) {
      const membros = st.members
        .map((m) => (ts.isMethodDeclaration(m) && m.name ? `${curto(m.name, 40)}(${params(m.parameters)})` : ts.isPropertyDeclaration(m) && m.name ? curto(m.name, 40) : ""))
        .filter(Boolean)
        .slice(0, 25);
      out.push(`${exportado(st)}class ${st.name?.text ?? "(anônima)"} { ${membros.join("; ")} }`);
    } else if (ts.isInterfaceDeclaration(st)) out.push(`${exportado(st)}interface ${st.name.text} { ${st.members.map((m) => curto(m, 50)).slice(0, 20).join(" ")} }`);
    else if (ts.isTypeAliasDeclaration(st)) out.push(`${exportado(st)}type ${st.name.text} = ${curto(st.type, 120)}`);
    else if (ts.isEnumDeclaration(st)) out.push(`${exportado(st)}enum ${st.name.text}`);
    else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        const nomeVar = curto(d.name, 50);
        if (!nomeVar) continue;
        const ini = d.initializer;
        if (ini && (ts.isArrowFunction(ini) || ts.isFunctionExpression(ini))) out.push(`${exportado(st)}const ${nomeVar} = (${params(ini.parameters)})${ini.type ? `: ${curto(ini.type, 80)}` : ""} =>`);
        else out.push(`${exportado(st)}const ${nomeVar}${d.type ? `: ${curto(d.type, 80)}` : ""}`);
      }
    } else if (ts.isExportAssignment(st)) out.push(`export default ${curto(st.expression, 60)}`);
  }
  if (imports.length) out.unshift(`importa: ${imports.join(", ")}`);
  return out;
}

/** Assinaturas de Python e Go (por padrão de linha: def/class e func). */
function mapaPorLinha(nome: string, texto: string): string[] {
  const re = nome.endsWith(".go") ? /^func\s+(\([^)]*\)\s*)?[A-Za-z_]\w*\s*\([^)]*\)[^{]*/ : /^\s{0,4}(async\s+)?(def|class)\s+\w+[^:]*/;
  return texto
    .split("\n")
    .filter((l) => re.test(l))
    .map((l) => l.replace(/\s+/g, " ").trim().slice(0, 160))
    .slice(0, 60);
}

/**
 * Mapa do código: para cada arquivo, os imports e as assinaturas (funções, classes, tipos), sem o corpo.
 * Os agentes enxergam a estrutura do projeto inteiro gastando pouco contexto e só depois leem o que precisam.
 */
export async function mapaDoCodigo(raiz: string, rel = "."): Promise<string> {
  const { base, alvo } = await dentro(raiz, rel);
  const arquivos: string[] = [];
  const andar = async (pasta: string, nivel: number) => {
    if (nivel > 8 || arquivos.length >= 400) return;
    for (const it of await readdir(pasta, { withFileTypes: true }).catch(() => [])) {
      if (IGNORAR.has(it.name) || it.name.startsWith(".")) continue;
      const p = join(pasta, it.name);
      if (it.isDirectory()) await andar(p, nivel + 1);
      else if (EXT_CODIGO.test(it.name) && !ehSegredo(it.name) && !/\.(test|spec)\.|\.d\.ts$|\.min\.js$/.test(it.name)) arquivos.push(p);
    }
  };
  if ((await stat(alvo)).isDirectory()) await andar(alvo, 0);
  else arquivos.push(alvo);
  const partes: string[] = [];
  let total = 0;
  for (const a of arquivos.sort()) {
    const info = await stat(a);
    if (info.size > 300_000) continue;
    const texto = await readFile(a, "utf8");
    const linhas = /\.(py|go)$/.test(a) ? mapaPorLinha(a, texto) : await mapaTs(a, texto).catch(() => mapaPorLinha(a, texto));
    if (!linhas.length) continue;
    const limpas = linhas.filter((l) => l.trim());
    const bloco = `## ${relative(base, a)}\n${limpas.map((l) => `- ${l}`).join("\n")}`;
    if (total + bloco.length > MAX_MAPA) {
      partes.push(`…(mapa cortado em ${partes.length} de ${arquivos.length} arquivos: peça um caminho mais específico)`);
      break;
    }
    partes.push(bloco);
    total += bloco.length;
  }
  return partes.length ? partes.join("\n\n") : "Nenhum arquivo de código (TS, JS, Python ou Go) encontrado aqui.";
}
