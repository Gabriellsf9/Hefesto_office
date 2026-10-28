import { readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import type { Card, Projeto } from "@empresa/shared";
import { db } from "./db.ts";
import { adicionarProjeto, listarProjetos } from "./projetos.ts";
import { criarCard, ErroCard } from "./tarefas.ts";
import { comandoDeTestes } from "./fabrica/testes.ts";
import { raizDoRepositorio } from "./fabrica/workspace.ts";
import { atualizarIndice } from "./agentes/indice.ts";
import { IGNORAR } from "./agentes/arquivos.ts";

// Projeto recém-vinculado (qualquer stack): na hora, um perfil técnico automático (linguagens, subprojetos, como
// verificar) vira a Ficha do Projeto até o raio-x do Arquiteto ficar pronto; o índice do código é montado em segundo
// plano e o card de raio-x já é aberto. Os agentes começam sabendo onde estão, em vez de descobrir no primeiro card.

const NOME_LINGUAGEM: Record<string, string> = {
  ".ts": "TypeScript", ".tsx": "TypeScript", ".js": "JavaScript", ".jsx": "JavaScript", ".mjs": "JavaScript", ".py": "Python", ".go": "Go",
  ".rs": "Rust", ".java": "Java", ".kt": "Kotlin", ".swift": "Swift", ".rb": "Ruby", ".php": "PHP", ".cs": "C#", ".dart": "Dart",
  ".sql": "SQL", ".vue": "Vue", ".svelte": "Svelte", ".css": "CSS", ".scss": "CSS",
};

/** Quantos arquivos de cada linguagem (até 20 mil arquivos, sem dependências e builds). */
async function linguagensDe(raiz: string): Promise<[string, number][]> {
  const contagem = new Map<string, number>();
  let vistos = 0;
  const andar = async (pasta: string, nivel: number) => {
    if (nivel > 10 || vistos > 20_000) return;
    for (const it of await readdir(pasta, { withFileTypes: true }).catch(() => [])) {
      if (IGNORAR.has(it.name) || it.name.startsWith(".")) continue;
      if (it.isDirectory()) await andar(join(pasta, it.name), nivel + 1);
      else {
        vistos++;
        const l = NOME_LINGUAGEM[extname(it.name).toLowerCase()];
        if (l) contagem.set(l, (contagem.get(l) ?? 0) + 1);
      }
    }
  };
  await andar(raiz, 0);
  return [...contagem].sort((a, b) => b[1] - a[1]);
}

export async function perfilAutomatico(projeto: Pick<Projeto, "nome" | "caminho" | "sinais">): Promise<string> {
  const raiz = await raizDoRepositorio(projeto.caminho).catch(() => projeto.caminho);
  const linguagens = await linguagensDe(raiz);
  const subs = (() => {
    try {
      return comandoDeTestes(raiz) ?? [];
    } catch {
      return [];
    }
  })();
  return [
    `# Ficha do Projeto ${projeto.nome} (perfil automático)`,
    "_Gerado ao vincular o projeto. O raio-x do Arquiteto substitui esta ficha quando for aprovado._",
    "",
    `- Repositório: \`${raiz}\`${raiz !== projeto.caminho ? ` (dentro de \`${projeto.caminho}\`)` : ""}`,
    `- Linguagens (arquivos): ${linguagens.length ? linguagens.slice(0, 8).map(([l, n]) => `${l} ${n}`).join(", ") : "não identificadas"}`,
    `- Manifestos na raiz: ${projeto.sinais.length ? projeto.sinais.join(", ") : "nenhum"}`,
    "",
    "## Como verificar (o Hefesto roda isto nos cards de código)",
    ...(subs.length
      ? subs.map((s) => `- \`${s.dir}\`: ${[s.instalar, ...s.etapas].filter(Boolean).map((c) => `\`${c}\``).join(" → ")}${s.imagem ? ` (sem a ferramenta aqui, roda em \`${s.imagem}\`)` : ""}`)
      : ["- Nenhuma verificação automática encontrada (sem testes, typecheck ou lint reconhecidos)."]),
    "",
    "Para achar código, use buscar_no_indice (pergunta em palavras) e pesquisar_no_projeto.",
  ].join("\n");
}

/** Abre o card de raio-x do Arquiteto para um projeto. */
export function criarRaioX(id: number): Card {
  const projeto = listarProjetos().find((p) => p.id === id);
  if (!projeto) throw new ErroCard("Projeto não encontrado.", 404);
  return criarCard({
    titulo: `Raio-x do projeto ${projeto.nome}`,
    sala: "arquitetura",
    fluxo: "software",
    coluna: "a-fazer",
    tipo: "tarefa",
    dono: "arquiteto",
    nivel: "N1",
    prioridade: "P1",
    projetoId: id,
    etiquetas: ["raio-x"],
    descricao: `Leia o projeto em ${projeto.caminho} (somente leitura) e escreva a Ficha do Projeto, que todos os agentes vão usar como contexto.`,
    criterios: [
      "- Stack, linguagens, frameworks e versões principais",
      "- Estrutura de pastas e responsabilidade de cada parte",
      "- Como rodar, testar e fazer build (comandos)",
      "- Funcionalidades e regras de negócio encontradas no código",
      "- Integrações externas e dados sensíveis tratados",
      "- Qualidade: testes existentes, pontos de atenção e riscos (incluindo segurança)",
      "- Tudo citando os arquivos onde foi visto",
    ].join("\n"),
  });
}

/**
 * Vincula a pasta. Se o projeto é novo: perfil automático na ficha (na hora), índice do código (em segundo plano)
 * e o card de raio-x. Vincular de novo uma pasta já vinculada só a deixa ativa.
 */
export async function vincularPasta(caminho: string): Promise<Projeto> {
  const antes = new Set(listarProjetos().map((p) => p.id));
  const projeto = await adicionarProjeto(caminho);
  if (antes.has(projeto.id)) return projeto;
  const perfil = await perfilAutomatico(projeto).catch(() => null);
  if (perfil) db.prepare("UPDATE projetos SET ficha = ? WHERE id = ? AND ficha IS NULL").run(perfil, projeto.id);
  void raizDoRepositorio(projeto.caminho)
    .catch(() => projeto.caminho)
    .then((raiz) => atualizarIndice(raiz))
    .catch((e: unknown) => console.error("Índice do projeto novo:", e));
  criarRaioX(projeto.id);
  return listarProjetos().find((p) => p.id === projeto.id) ?? projeto;
}
