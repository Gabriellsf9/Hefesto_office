import { isAbsolute, relative } from "node:path";
import { ErroEntrada, ferramenta, texto, type Ferramenta } from "../agentes/loop.ts";
import { auditar } from "../confianca/auditoria.ts";
import { ambienteAtivo, docker } from "./ambiente.ts";
import { comandoDeTestes, verificacoesDaPasta } from "./testes.ts";

// Estação de trabalho: um contêiner por card (ou conversa) no Docker dos agentes, com a linguagem do projeto e a
// cópia montada no mesmo caminho. Terminal completo (pipes, &&, variáveis, servidor em segundo plano), como o Bash
// do Claude Code, sem tocar na máquina do CEO: a sandbox do rodar_comando não aceita nada disso e travava os
// agentes (a Ana não conseguiu nem rodar um node -e). O contêiner some quando fica parado por horas.

const MEMORIA = "2g";
const CPUS = "2";
const TEMPO_PADRAO_S = 300;
const TEMPO_MAX_S = 1200;
/** Estação sem uso há este tempo é removida (a cópia continua; só o contêiner some). */
const OCIOSA_MS = 3 * 3600_000;

const usadas = new Map<string, number>();
const nomeDe = (chave: string) => `hefesto-estacao-${chave.replace(/[^a-z0-9-]/gi, "-").toLowerCase()}`;

/**
 * Imagem da linguagem do projeto: a da raiz; num monorepo, a do subprojeto cujo nome bate com a área do agente
 * (dev-backend → backend/, dev-frontend → frontend/), senão a do primeiro. Sem nada reconhecido, Node (Debian, com
 * apt). Antes era sempre a do primeiro: no Parliamo o Rafael (backend em Go) ficava sem Go na estação.
 */
export function imagemDoProjeto(pasta: string, area?: string): string {
  const raiz = verificacoesDaPasta(pasta)?.imagem;
  if (raiz) return raiz;
  try {
    const subs = (comandoDeTestes(pasta) ?? []).filter((s) => s.imagem);
    const partes = new Set((area ?? "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
    return (subs.find((s) => partes.has(s.dir.toLowerCase())) ?? subs[0])?.imagem ?? "node:22";
  } catch {
    return "node:22";
  }
}

const dentroDasCopias = (pasta: string) => {
  const raiz = process.env.EMPRESA_WORKSPACE_DIR ?? "/workspace";
  const r = relative(raiz, pasta);
  return r === "" || (!r.startsWith("..") && !isAbsolute(r));
};

/** Sobe a estação se ela não está no ar (a primeira vez baixa a imagem: pode levar alguns minutos). */
export async function garantirEstacao(chave: string, pasta: string, imagem: string): Promise<string> {
  if (!ambienteAtivo()) throw new ErroEntrada("O Docker dos agentes está desligado: sem estação de trabalho.");
  if (!dentroDasCopias(pasta)) throw new ErroEntrada("A estação só monta pastas das cópias dos projetos.");
  const nome = nomeDe(chave);
  usadas.set(chave, Date.now());
  const estado = await docker(["inspect", "-f", "{{.State.Running}} {{.Config.Image}}", nome], pasta, 30_000);
  const [rodando, imagemAtual] = estado.saida.trim().split(" ");
  // Estação de outra imagem (criada antes de a escolha mudar): refaz com a certa.
  if (estado.codigo === 0 && imagemAtual && imagemAtual !== imagem) {
    await docker(["rm", "-f", nome], pasta, 60_000);
  } else if (estado.codigo === 0 && rodando === "true") return nome;
  else if (estado.codigo === 0) {
    const r = await docker(["start", nome], pasta, 60_000);
    if (r.codigo === 0) return nome;
  }
  const r = await docker(
    ["run", "-d", "--name", nome, "--label", "hefesto.estacao=1", "--memory", MEMORIA, "--cpus", CPUS, "-v", `${pasta}:${pasta}`, "-w", pasta, "-e", "CI=1", imagem, "sh", "-c", "sleep infinity"],
    pasta,
    15 * 60_000,
  );
  if (r.codigo !== 0) throw new ErroEntrada(`Não consegui subir a estação (${imagem}): ${r.saida.slice(-800)}`);
  return nome;
}

let contadorFundo = 0;

export function ferramentasDeEstacao(chave: string, pasta: string, o: { imagem?: string; enxuto?: boolean; area?: string } = {}): Ferramenta[] {
  if (!ambienteAtivo()) return [];
  const imagem = o.imagem ?? imagemDoProjeto(pasta, o.area);
  const max = o.enxuto ? 8000 : 16_000;
  return [
    ferramenta(
      "terminal",
      `Terminal completo numa estação de trabalho só sua (contêiner ${imagem}, com o projeto montado na pasta atual): pipes, &&, variáveis, instalar pacotes (apt-get, npm, pip, go), rodar testes e scripts, node -e, curl. Com segundo_plano: true, o comando fica rodando (ex.: um servidor) e a saída vai para um log que você lê depois com outro comando (tail). Nada aqui toca a máquina do CEO. Não há docker nesta estação: para subir, consultar e ver os logs de contêineres (banco, serviços do compose), use ambiente_subir, ambiente_comando e ambiente_logs.`,
      {
        comando: { type: "string" },
        segundo_plano: { type: "boolean", description: "true para servidores e processos longos (devolve o caminho do log)" },
        tempo_s: { type: "integer", minimum: 5, maximum: TEMPO_MAX_S, description: `Tempo máximo (padrão ${TEMPO_PADRAO_S} s)` },
      },
      ["comando"],
      async (e) => {
        const comando = texto(e, "comando", 8000);
        const nome = await garantirEstacao(chave, pasta, imagem);
        auditar("agente", "terminal da estação", chave, comando.slice(0, 300));
        if (e.segundo_plano === true) {
          const log = `/tmp/hefesto-fundo-${++contadorFundo}.log`;
          const r = await docker(["exec", "-d", nome, "sh", "-lc", `${comando} > ${log} 2>&1`], pasta, 60_000);
          if (r.codigo !== 0) return { texto: `Não consegui iniciar: ${r.saida.slice(-1000)}`, erro: true };
          return { texto: `Rodando em segundo plano. Para ver a saída: terminal com "tail -n 60 ${log}".` };
        }
        const tempo = Math.min(TEMPO_MAX_S, Math.max(5, Number(e.tempo_s) || TEMPO_PADRAO_S)) * 1000;
        const t0 = Date.now();
        const r = await docker(["exec", nome, "sh", "-lc", comando], pasta, tempo);
        const saida = r.saida.length > max ? `…(início cortado)\n${r.saida.slice(-max)}` : r.saida;
        return { texto: `código de saída: ${r.codigo ?? "interrompido (tempo máximo)"} · ${((Date.now() - t0) / 1000).toFixed(1)} s\n${saida || "(sem saída)"}`, erro: r.codigo !== 0 };
      },
    ),
  ];
}

/** Remove as estações paradas há horas (ou de cards que não estão mais na lista de ativos). */
export async function limparEstacoes(ativas: Set<string> = new Set()): Promise<number> {
  if (!ambienteAtivo()) return 0;
  const lista = await docker(["ps", "-a", "--filter", "label=hefesto.estacao=1", "--format", "{{.Names}}"], "/", 30_000);
  if (lista.codigo !== 0) return 0;
  let n = 0;
  for (const nome of lista.saida.split("\n").map((l) => l.trim()).filter(Boolean)) {
    const chave = [...usadas.keys()].find((k) => nomeDe(k) === nome);
    const ociosa = !chave || Date.now() - (usadas.get(chave) ?? 0) > OCIOSA_MS;
    if (ociosa && !(chave && ativas.has(chave))) {
      await docker(["rm", "-f", nome], "/", 60_000);
      if (chave) usadas.delete(chave);
      n++;
    }
  }
  return n;
}
