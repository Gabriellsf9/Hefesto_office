import type { Conquista } from "@empresa/shared";
import { db, getSetting } from "./db.ts";
import { emit, postFeed } from "./bus.ts";

// Conquistas (Fase 7): marcos da empresa calculados a partir do que aconteceu de verdade
// (cards, entregas, merges, leads, posts, lições). Ao desbloquear, aparecem na tela e no feed.

db.exec(`
  CREATE TABLE IF NOT EXISTS conquistas (
    id TEXT PRIMARY KEY,
    em INTEGER NOT NULL
  );
`);

const conta = (sql: string, ...args: (string | number)[]) => {
  try {
    return (db.prepare(sql).get(...args) as { n: number } | undefined)?.n ?? 0;
  } catch {
    return 0; // tabela de uma fase que ainda não rodou nesta instalação
  }
};
const SEMANA = 7 * 86_400_000;

interface Definicao {
  id: string;
  nome: string;
  descricao: string;
  icone: string;
  atingiu: () => boolean;
}

const DEFINICOES: Definicao[] = [
  { id: "primeiro-pedido", nome: "Primeiro pedido", descricao: "A Helena transformou um pedido seu em cards.", icone: "🚀", atingiu: () => conta("SELECT count(*) AS n FROM comentarios WHERE autor = 'chief-of-staff' AND tipo = 'movimento' AND texto LIKE 'Criou o card%'") > 0 },
  { id: "primeira-aprovacao", nome: "Carimbo do CEO", descricao: "Você aprovou a primeira entrega.", icone: "✅", atingiu: () => conta("SELECT count(*) AS n FROM comentarios WHERE autor = 'voce' AND tipo = 'aprovacao'") > 0 },
  { id: "dez-entregas", nome: "Engrenando", descricao: "10 entregas feitas pela equipe.", icone: "⚙️", atingiu: () => conta("SELECT count(*) AS n FROM entregas") >= 10 },
  { id: "cem-entregas", nome: "Fábrica a todo vapor", descricao: "100 entregas feitas pela equipe.", icone: "🏭", atingiu: () => conta("SELECT count(*) AS n FROM entregas") >= 100 },
  { id: "primeiro-merge", nome: "Código no ar", descricao: "O primeiro merge da fábrica entrou no seu projeto.", icone: "🔀", atingiu: () => conta("SELECT count(*) AS n FROM worktrees WHERE status = 'mesclado'") > 0 },
  { id: "primeiro-contato", nome: "Porta aberta", descricao: "Você contatou o primeiro lead da prospecção.", icone: "📞", atingiu: () => conta("SELECT count(*) AS n FROM cards WHERE fluxo = 'comercial' AND coluna IN ('contatado','respondeu','reuniao','proposta','fechado')") > 0 },
  { id: "primeira-venda", nome: "Primeira venda", descricao: "Um lead virou cliente (Fechado).", icone: "🔔", atingiu: () => conta("SELECT count(*) AS n FROM cards WHERE fluxo = 'comercial' AND coluna = 'fechado'") > 0 },
  { id: "primeiro-post", nome: "No ar", descricao: "A primeira peça de marketing foi publicada.", icone: "📣", atingiu: () => conta("SELECT count(*) AS n FROM pecas WHERE publicado_em IS NOT NULL") > 0 },
  { id: "licao-aprendida", nome: "Empresa que aprende", descricao: "Você aprovou a primeira lição aprendida.", icone: "🧠", atingiu: () => conta("SELECT count(*) AS n FROM conhecimento WHERE tipo = 'licao' AND aprovado = 1") > 0 },
  { id: "livro-completo", nome: "Livro da Empresa", descricao: "As 7 seções do Livro revisadas por você.", icone: "📘", atingiu: () => conta("SELECT count(*) AS n FROM livro WHERE revisada = 1") >= 7 },
  { id: "sentinela", nome: "Sentinela", descricao: "O primeiro site está sendo monitorado.", icone: "🛰️", atingiu: () => conta("SELECT count(*) AS n FROM monitores") > 0 },
  {
    id: "semana-sem-bug",
    nome: "Semana sem bug",
    descricao: "Uma semana entregando software sem nenhum bug novo.",
    icone: "🐞",
    atingiu: () =>
      conta("SELECT count(*) AS n FROM cards WHERE fluxo = 'software' AND coluna = 'concluido' AND atualizado_em >= ?", Date.now() - SEMANA) > 0 &&
      conta("SELECT count(*) AS n FROM cards WHERE tipo = 'bug' AND criado_em >= ?", Date.now() - SEMANA) === 0 &&
      conta("SELECT count(*) AS n FROM cards WHERE criado_em < ?", Date.now() - SEMANA) > 0,
  },
  {
    id: "no-orcamento",
    nome: "Contas em dia",
    descricao: "Cinco dias de trabalho seguidos dentro do orçamento diário de IA.",
    icone: "💰",
    atingiu: () => {
      const orcamento = Number(getSetting("motor_orcamento_usd") ?? "5");
      try {
        const dias = db.prepare("SELECT usd FROM uso ORDER BY dia DESC LIMIT 5").all() as { usd: number }[];
        return dias.length === 5 && dias.every((d) => d.usd > 0 && d.usd <= orcamento);
      } catch {
        return false;
      }
    },
  },
];

function desbloqueadas(): Map<string, number> {
  return new Map((db.prepare("SELECT id, em FROM conquistas").all() as { id: string; em: number }[]).map((r) => [r.id, r.em]));
}

export function listarConquistas(): Conquista[] {
  const feitas = desbloqueadas();
  return DEFINICOES.map((d) => ({ id: d.id, nome: d.nome, descricao: d.descricao, icone: d.icone, em: feitas.get(d.id) ?? null }));
}

/** Confere o que foi atingido desde a última vez e anuncia as novas. */
export function conferirConquistas() {
  const feitas = desbloqueadas();
  for (const d of DEFINICOES) {
    if (feitas.has(d.id) || !d.atingiu()) continue;
    const em = Date.now();
    db.prepare("INSERT OR IGNORE INTO conquistas (id, em) VALUES (?, ?)").run(d.id, em);
    emit({ type: "conquista", conquista: { id: d.id, nome: d.nome, descricao: d.descricao, icone: d.icone, em } });
    postFeed("diretoria", "chief-of-staff", `Conquista desbloqueada: ${d.icone} ${d.nome}`);
  }
}

let timer: NodeJS.Timeout | null = null;
export function iniciarConquistas() {
  if (timer) return;
  conferirConquistas();
  timer = setInterval(conferirConquistas, 30_000);
}
