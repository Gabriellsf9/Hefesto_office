import { mkdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, normalize, sep } from "node:path";
import { ehSegredo } from "../agentes/arquivos.ts";
import { ErroEntrada, ferramenta, texto, type Ferramenta } from "../agentes/loop.ts";
import { ErroComando, rodarComando } from "./comandos.ts";
import { codigoDoCard, type Worktree } from "./workspace.ts";
import { auditar } from "../confianca/auditoria.ts";
import { lerCard } from "../tarefas.ts";

// Ferramentas de escrita e de comandos dentro da cópia isolada (Fase 4).

const MAX_ARQUIVO = 400_000;

/** Caminho relativo seguro dentro do worktree: sem .., sem .git, sem arquivos de segredo. */
async function alvoSeguro(raiz: string, rel: string): Promise<string> {
  const limpo = normalize(rel).replace(/^(\.\/)+/, "");
  if (!limpo || limpo.startsWith("..") || limpo.startsWith("/") || limpo.split(sep).includes("..")) throw new ErroEntrada("Use um caminho relativo dentro do projeto.");
  if (limpo.split(sep).some((p) => p === ".git")) throw new ErroEntrada("A pasta .git é do servidor: não pode ser alterada.");
  if (ehSegredo(limpo)) throw new ErroEntrada("Arquivo de segredo: os agentes não podem criar nem alterar. Use um exemplo (ex.: .env.example).");
  const base = await realpath(raiz);
  const alvo = join(base, limpo);
  // A pasta existente mais próxima do destino precisa estar dentro do projeto (protege contra links simbólicos
  // que apontem para fora, mesmo quando as subpastas finais ainda não existem).
  let dir = dirname(alvo);
  for (;;) {
    const real = await realpath(dir).catch(() => null);
    if (real) {
      if (real !== base && !real.startsWith(base + sep)) throw new ErroEntrada("Caminho fora do projeto.");
      break;
    }
    if (dir === base || dir === dirname(dir)) break;
    dir = dirname(dir);
  }
  // O próprio arquivo, se já existir, não pode ser um link para fora.
  const proprio = await realpath(alvo).catch(() => null);
  if (proprio && !proprio.startsWith(base + sep)) throw new ErroEntrada("Caminho fora do projeto.");
  return alvo;
}

export function ferramentasDeEscrita(wt: Worktree): Ferramenta[] {
  return [
    ferramenta(
      "escrever_arquivo",
      "Cria ou substitui um arquivo inteiro na cópia isolada do projeto (sua branch). Para mudar só um trecho, prefira editar_arquivo.",
      { caminho: { type: "string" }, conteudo: { type: "string" } },
      ["caminho", "conteudo"],
      async (e) => {
        const alvo = await alvoSeguro(wt.caminho, texto(e, "caminho", 500));
        const conteudo = typeof e.conteudo === "string" ? e.conteudo : "";
        if (conteudo.length > MAX_ARQUIVO) throw new ErroEntrada("Arquivo grande demais; divida em arquivos menores.");
        await mkdir(dirname(alvo), { recursive: true });
        await writeFile(alvo, conteudo);
        return { texto: `Gravado: ${e.caminho} (${conteudo.split("\n").length} linhas).` };
      },
    ),
    ferramenta(
      "editar_arquivo",
      "Troca um trecho exato de um arquivo por outro. O trecho_antigo precisa aparecer exatamente uma vez (copie com espaços e quebras de linha).",
      { caminho: { type: "string" }, trecho_antigo: { type: "string" }, trecho_novo: { type: "string" } },
      ["caminho", "trecho_antigo", "trecho_novo"],
      async (e) => {
        const alvo = await alvoSeguro(wt.caminho, texto(e, "caminho", 500));
        const atual = await readFile(alvo, "utf8").catch(() => {
          throw new ErroEntrada(`Não existe: ${e.caminho}. Use escrever_arquivo para criar.`);
        });
        const antigo = typeof e.trecho_antigo === "string" ? e.trecho_antigo : "";
        const novo = typeof e.trecho_novo === "string" ? e.trecho_novo : "";
        if (!antigo) throw new ErroEntrada("trecho_antigo vazio.");
        const n = atual.split(antigo).length - 1;
        if (n === 0) throw new ErroEntrada("trecho_antigo não encontrado. Leia o arquivo de novo e copie o trecho exato.");
        if (n > 1) throw new ErroEntrada(`trecho_antigo aparece ${n} vezes; inclua mais linhas para ficar único.`);
        await writeFile(alvo, atual.replace(antigo, () => novo));
        return { texto: `Editado: ${e.caminho}.` };
      },
    ),
    ferramenta(
      "apagar_arquivo",
      "Apaga um arquivo da cópia isolada (fica no histórico do git).",
      { caminho: { type: "string" } },
      ["caminho"],
      async (e) => {
        const alvo = await alvoSeguro(wt.caminho, texto(e, "caminho", 500));
        const info = await stat(alvo).catch(() => null);
        if (!info?.isFile()) throw new ErroEntrada("Não é um arquivo existente.");
        await rm(alvo);
        return { texto: `Apagado: ${e.caminho}.` };
      },
    ),
  ];
}

/** Rodar testes, build e lint na cópia isolada (sandbox do macOS, sem shell, com tempo máximo). */
export function ferramentaDeComando(wt: Worktree): Ferramenta {
  return ferramenta(
    "rodar_comando",
    "Roda um comando de desenvolvimento na cópia isolada do projeto, numa sandbox: testes, build, lint, typecheck e instalação de dependências pelo lockfile (ex.: \"npm test\", \"pnpm install\", \"pytest -q\", \"go test ./...\"). Sem shell (nada de && | >), só caminhos relativos e sem rede, exceto na instalação.",
    { comando: { type: "string" } },
    ["comando"],
    async (e) => {
      try {
        const cmd = texto(e, "comando", 500);
        const r = await rodarComando(wt.caminho, cmd);
        auditar("agente", "rodou comando", wt.branch, `${cmd} → saída ${r.codigo ?? "interrompido"}${r.rede ? " (com rede)" : ""}`);
        return { texto: `código de saída: ${r.codigo ?? "interrompido"} · ${(r.ms / 1000).toFixed(1)} s${r.rede ? " · com rede (instalação)" : ""}\n${r.saida || "(sem saída)"}` };
      } catch (err) {
        if (err instanceof ErroComando) throw new ErroEntrada(err.message);
        throw err;
      }
    },
  );
}

/** O diff da branch do card desde o início (para revisores, segurança e QA). */
export function ferramentaDeDiff(cardId: number): Ferramenta {
  return ferramenta("ver_diff", "Mostra tudo o que mudou na branch deste card (arquivos, estatística e o diff).", {}, [], async () => {
    const c = await codigoDoCard(lerCard(cardId));
    if (!c) return { texto: "Este card não tem código." };
    return { texto: `branch: ${c.branch}\n\n${c.stat || "(nenhuma mudança)"}\n\n${c.patch}` };
  });
}
