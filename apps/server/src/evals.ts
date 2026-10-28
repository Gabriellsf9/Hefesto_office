import { agentById } from "@empresa/org";
import { db } from "./db.ts";
import { ErroCard } from "./tarefas.ts";
import { modoCusto } from "./custo.ts";
import { modeloDoAgente } from "./provedores.ts";
import { sistemaAutor, sistemaValidador } from "./agentes/prompts.ts";
import { ferramenta, rodarAgente, texto } from "./agentes/loop.ts";

// Avaliações (evals): tarefas fixas, com respostas que dá para conferir, rodadas com os prompts e os
// modelos de agora. Servem para saber se uma mudança (modo de custo, modelo de um agente, prompt)
// melhorou ou piorou a equipe, em vez de adivinhar. Só rodam quando você clica: custam API de verdade.

interface Checagem {
  descricao: string;
  /** Passa se a resposta (em minúsculas, sem acento) bate com a expressão. */
  re: RegExp;
  peso: number;
}

interface Tarefa {
  id: string;
  nome: string;
  agente: string;
  papel: "autor" | "validador";
  sala: string;
  mensagem: string;
  checagens: Checagem[];
}

const TAREFAS: Tarefa[] = [
  {
    id: "historias",
    nome: "Histórias com critérios (Produto)",
    agente: "pm",
    papel: "autor",
    sala: "produto",
    mensagem:
      "# Card de avaliação\nEscreva as histórias de usuário para \"recuperar a senha por e-mail\" num app web. Inclua critérios de aceite em Gherkin, o que fica fora do escopo e uma métrica de sucesso. Entregue com entregar.",
    checagens: [
      { descricao: "critérios em Gherkin (Dado/Quando/Então)", re: /dado[\s\S]*quando[\s\S]*entao/, peso: 3 },
      { descricao: "fora de escopo explícito", re: /fora (do|de) escopo/, peso: 2 },
      { descricao: "link ou token com expiração", re: /expir/, peso: 2 },
      { descricao: "métrica de sucesso", re: /metrica|taxa de|kpi/, peso: 1 },
      { descricao: "não revela se o e-mail existe (segurança)", re: /(nao|sem) (revelar|informar|indicar)|mesma mensagem|enumera/, peso: 2 },
    ],
  },
  {
    id: "revisao-sql",
    nome: "Revisão que pega SQL injection (Code review)",
    agente: "reviewer-1",
    papel: "validador",
    sala: "desenvolvimento",
    mensagem:
      "# Card de avaliação\n## Entrega para validar\nBusca de clientes por nome.\n\n```diff\n+app.get('/clientes', async (req, res) => {\n+  const nome = req.query.nome;\n+  const r = await db.query(`SELECT * FROM clientes WHERE nome LIKE '%${nome}%'`);\n+  res.json(r.rows);\n+});\n```\nConfira e decida com aprovar ou devolver.",
    checagens: [
      { descricao: "devolveu", re: /^devolver:/, peso: 4 },
      { descricao: "apontou SQL injection", re: /injec|injection/, peso: 4 },
      { descricao: "pediu consulta parametrizada", re: /parametriz|placeholder|\$1|prepared/, peso: 2 },
    ],
  },
  {
    id: "migracao",
    nome: "Migração reversível (Dados)",
    agente: "dba",
    papel: "autor",
    sala: "dados",
    mensagem:
      "# Card de avaliação\nEscreva a migration PostgreSQL que adiciona a coluna obrigatória `telefone` (texto) à tabela `clientes`, que já tem 2 milhões de linhas em produção. Inclua o rollback e explique como evitar travar a tabela. Entregue com entregar.",
    checagens: [
      { descricao: "tem rollback (down)", re: /down|rollback|drop column/, peso: 3 },
      { descricao: "evita NOT NULL direto com tabela cheia (em etapas)", re: /etapa|em duas|backfill|preench|not valid|default/, peso: 3 },
      { descricao: "fala de lock", re: /lock|trav/, peso: 2 },
      { descricao: "SQL de alter table", re: /alter table/, peso: 2 },
    ],
  },
  {
    id: "mensagem-lead",
    nome: "Mensagem de prospecção com opt-out (Comercial)",
    agente: "copywriter",
    papel: "autor",
    sala: "marketing",
    mensagem:
      "# Card de avaliação\nEscreva a primeira mensagem de WhatsApp para uma clínica veterinária que pode se interessar por um sistema de agendamento online. Curta, sem promessas que não dá para provar e com a opção de não receber mais mensagens. Entregue com entregar.",
    checagens: [
      { descricao: "opção de sair", re: /sair|nao receber|parar de receber|descadastr/, peso: 4 },
      { descricao: "curta (até ~700 caracteres no corpo)", re: /^[\s\S]{0,1400}$/, peso: 2 },
      { descricao: "sem promessa absoluta (100%, garantido)", re: /^(?![\s\S]*(100%|garantid))[\s\S]*$/, peso: 2 },
      { descricao: "menciona agendamento", re: /agend/, peso: 2 },
    ],
  },
  {
    id: "bug",
    nome: "Achar o bug (Desenvolvimento)",
    agente: "dev-backend",
    papel: "autor",
    sala: "desenvolvimento",
    mensagem:
      "# Card de avaliação\nO teste `media([2, 4, 6])` deveria dar 4 e está dando 3. Ache o bug, explique e entregue a função corrigida com entregar.\n\n```js\nfunction media(xs) {\n  let soma = 0;\n  for (let i = 0; i <= xs.length; i++) soma += xs[i] ?? 0;\n  return soma / (xs.length + 1);\n}\n```",
    checagens: [
      { descricao: "divide por xs.length", re: /\/\s*xs\.length(?!\s*\+)/, peso: 4 },
      { descricao: "loop até < length", re: /i\s*<\s*xs\.length/, peso: 3 },
      { descricao: "explica o erro de uma unidade (off-by-one)", re: /off-by-one|um a mais|\+ ?1|<=/, peso: 3 },
    ],
  },
];

db.exec(`CREATE TABLE IF NOT EXISTS evals (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, config TEXT NOT NULL, resultados TEXT NOT NULL, nota REAL NOT NULL, usd REAL NOT NULL
)`);

export interface ResultadoEval {
  tarefa: string;
  nome: string;
  modelo: string;
  nota: number;
  checagens: { descricao: string; passou: boolean; peso: number }[];
  usd: number;
}

export interface RodadaEval {
  id: number;
  ts: number;
  config: { modoCusto: string };
  resultados: ResultadoEval[];
  nota: number;
  usd: number;
}

const normalizar = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

let rodando = false;

/** Roda todas as tarefas, uma de cada vez, e guarda a nota (0 a 10) de cada uma e a média. */
export async function rodarEvals(): Promise<RodadaEval> {
  if (rodando) throw new ErroCard("Já tem uma avaliação rodando.");
  rodando = true;
  try {
    const resultados: ResultadoEval[] = [];
    for (const t of TAREFAS) {
      const agente = agentById[t.agente];
      if (!agente) continue;
      const modelo = modeloDoAgente(agente, t.papel === "validador" ? "validador-codigo" : "autor");
      let resposta = "";
      const fim = (prefixo: string) => (e: Record<string, unknown>) => {
        resposta = `${prefixo}: ${Object.values(e).filter((v) => typeof v === "string").join("\n")}`;
        return { texto: "Registrado.", fim: true };
      };
      const ferramentas =
        t.papel === "autor"
          ? [ferramenta("entregar", "Entrega o trabalho.", { resumo: { type: "string" }, conteudo: { type: "string" } }, ["resumo", "conteudo"], (e) => (texto(e, "conteudo"), fim("entregar")(e)))]
          : [
              ferramenta("aprovar", "Aprova.", { parecer: { type: "string" } }, ["parecer"], fim("aprovar")),
              ferramenta("devolver", "Devolve com motivos.", { motivos: { type: "string" } }, ["motivos"], fim("devolver")),
            ];
      const r = await rodarAgente({
        modelo,
        agenteId: agente.id,
        sistema: t.papel === "autor" ? sistemaAutor(agente) : sistemaValidador(agente, t.sala, "corretude"),
        mensagem: t.mensagem,
        ferramentas,
        lembrete: t.papel === "autor" ? "Chame entregar com o trabalho." : "Chame aprovar ou devolver.",
        maxRodadas: 4,
      }).catch((e: unknown) => ({ texto: `erro: ${e instanceof Error ? e.message : String(e)}`, custoUsd: 0, terminou: false }));
      const alvo = normalizar(resposta || r.texto);
      const checagens = t.checagens.map((c) => ({ descricao: c.descricao, passou: c.re.test(alvo), peso: c.peso }));
      const total = checagens.reduce((s, c) => s + c.peso, 0);
      const nota = Math.round((checagens.reduce((s, c) => s + (c.passou ? c.peso : 0), 0) / total) * 100) / 10;
      resultados.push({ tarefa: t.id, nome: t.nome, modelo, nota, checagens, usd: r.custoUsd });
    }
    const nota = resultados.length ? Math.round((resultados.reduce((s, x) => s + x.nota, 0) / resultados.length) * 10) / 10 : 0;
    const usd = resultados.reduce((s, x) => s + x.usd, 0);
    const config = { modoCusto: modoCusto() };
    const id = Number(
      db.prepare("INSERT INTO evals (ts, config, resultados, nota, usd) VALUES (?, ?, ?, ?, ?)").run(Date.now(), JSON.stringify(config), JSON.stringify(resultados), nota, usd).lastInsertRowid,
    );
    return { id, ts: Date.now(), config, resultados, nota, usd };
  } finally {
    rodando = false;
  }
}

export function listarEvals(): RodadaEval[] {
  return (db.prepare("SELECT * FROM evals ORDER BY id DESC LIMIT 20").all() as { id: number; ts: number; config: string; resultados: string; nota: number; usd: number }[]).map((r) => ({
    id: r.id,
    ts: r.ts,
    config: JSON.parse(r.config) as RodadaEval["config"],
    resultados: JSON.parse(r.resultados) as ResultadoEval[],
    nota: r.nota,
    usd: r.usd,
  }));
}

export const tarefasDeEval = () => TAREFAS.map((t) => ({ id: t.id, nome: t.nome, agente: agentById[t.agente]?.nome ?? t.agente }));
