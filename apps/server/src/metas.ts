import { randomUUID } from "node:crypto";
import { colunaDe, type Card, type IndicadorArea, type Indicadores, type Meta, type ResultadoChave, type RoomId } from "@empresa/shared";
import { agentById, roomById, rooms } from "@empresa/org";
import { db } from "./db.ts";
import { emit } from "./bus.ts";
import { clienteClaude, custoHoje } from "./custo.ts";
import { ErroCard, listarCards } from "./tarefas.ts";
import { ErroEntrada, ferramenta, rodarAgente, texto } from "./agentes/loop.ts";
import { sistemaHelena } from "./agentes/prompts.ts";

// Metas do trimestre e indicadores por área (PLANO.md, seção 4.2-C).

db.exec(`
  CREATE TABLE IF NOT EXISTS metas (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    trimestre  TEXT NOT NULL,
    objetivo   TEXT NOT NULL,
    resultados TEXT NOT NULL,
    confirmada INTEGER NOT NULL DEFAULT 1,
    criado_em  INTEGER NOT NULL,
    atualizado_em INTEGER NOT NULL
  );
`);

export const trimestreAtual = (d = new Date()) => `${d.getFullYear()}-T${Math.floor(d.getMonth() / 3) + 1}`;

type Linha = { id: number; trimestre: string; objetivo: string; resultados: string; confirmada: number; criado_em: number; atualizado_em: number };
const deLinha = (r: Linha): Meta => ({
  id: r.id, trimestre: r.trimestre, objetivo: r.objetivo, resultados: JSON.parse(r.resultados), confirmada: r.confirmada === 1,
  criadoEm: r.criado_em, atualizadoEm: r.atualizado_em,
});

export function listarMetas(): Meta[] {
  return (db.prepare("SELECT * FROM metas ORDER BY trimestre DESC, id").all() as Linha[]).map(deLinha);
}

const publicar = () => emit({ type: "metas", metas: listarMetas() });

function validarResultados(rs: unknown): ResultadoChave[] {
  if (!Array.isArray(rs)) throw new ErroCard("Resultados-chave inválidos.");
  return rs.slice(0, 8).map((r) => {
    const x = r as Partial<ResultadoChave>;
    if (typeof x.descricao !== "string" || !x.descricao.trim()) throw new ErroCard("Cada resultado-chave precisa de descrição.");
    const num = (v: unknown, padrao: number) => (typeof v === "number" && Number.isFinite(v) ? v : padrao);
    return {
      id: typeof x.id === "string" && x.id ? x.id : randomUUID(),
      descricao: x.descricao.trim().slice(0, 300),
      atual: num(x.atual, 0),
      alvo: num(x.alvo, 1),
      unidade: typeof x.unidade === "string" ? x.unidade.slice(0, 30) : "",
      sala: x.sala && roomById[x.sala as RoomId] ? (x.sala as RoomId) : null,
    };
  });
}

export function salvarMeta(dados: Partial<Meta> & { objetivo: string }, id?: number): Meta {
  if (typeof dados.objetivo !== "string" || !dados.objetivo.trim()) throw new ErroCard("Escreva o objetivo.");
  const resultados = validarResultados(dados.resultados ?? []);
  const agora = Date.now();
  const trimestre = typeof dados.trimestre === "string" && /^\d{4}-T[1-4]$/.test(dados.trimestre) ? dados.trimestre : trimestreAtual();
  const confirmada = dados.confirmada === false ? 0 : 1;
  if (id) {
    if (!db.prepare("SELECT 1 FROM metas WHERE id = ?").get(id)) throw new ErroCard("Meta não encontrada.", 404);
    db.prepare("UPDATE metas SET trimestre = ?, objetivo = ?, resultados = ?, confirmada = ?, atualizado_em = ? WHERE id = ?").run(
      trimestre, dados.objetivo.trim().slice(0, 300), JSON.stringify(resultados), confirmada, agora, id,
    );
  } else {
    id = Number(
      db.prepare("INSERT INTO metas (trimestre, objetivo, resultados, confirmada, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?)").run(
        trimestre, dados.objetivo.trim().slice(0, 300), JSON.stringify(resultados), confirmada, agora, agora,
      ).lastInsertRowid,
    );
  }
  publicar();
  return listarMetas().find((m) => m.id === id)!;
}

export function removerMeta(id: number) {
  db.prepare("DELETE FROM metas WHERE id = ?").run(id);
  publicar();
}

/** Metas em texto, para os prompts dos agentes e dos rituais. */
export function metasEmTexto(): string {
  const metas = listarMetas().filter((m) => m.trimestre === trimestreAtual());
  if (!metas.length) return "Nenhuma meta definida para este trimestre.";
  return metas
    .map((m) => {
      const krs = m.resultados
        .map((r) => {
          const pct = r.alvo ? Math.round((r.atual / r.alvo) * 100) : 0;
          return `  - ${r.descricao}: ${r.atual}/${r.alvo} ${r.unidade} (${pct}%)${r.sala ? ` — ${roomById[r.sala].nome}` : ""}`;
        })
        .join("\n");
      return `- ${m.objetivo}${m.confirmada ? "" : " (sugerida, ainda não confirmada pelo CEO)"}\n${krs}`;
    })
    .join("\n");
}

/* ---------- Indicadores calculados da board ---------- */

const DIA = 86_400_000;
const tipo = (c: Card) => colunaDe(c.fluxo, c.coluna)?.tipo;

export function calcularIndicadores(agora = Date.now()): Indicadores {
  const cards = listarCards().filter((c) => !c.demo);
  const areas: IndicadorArea[] = rooms
    .filter((r) => r.id !== "reuniao")
    .map((r) => {
      const daSala = cards.filter((c) => c.sala === r.id);
      const feitos30 = daSala.filter((c) => (tipo(c) === "feito" || tipo(c) === "ceo") && agora - c.atualizadoEm < 30 * DIA);
      const concluidos = daSala.filter((c) => tipo(c) === "feito" && agora - c.atualizadoEm < 30 * DIA);
      return {
        sala: r.id,
        concluidos7d: daSala.filter((c) => tipo(c) === "feito" && agora - c.atualizadoEm < 7 * DIA).length,
        emAndamento: daSala.filter((c) => c.coluna !== "backlog" && !["feito", "perdido", "ceo"].includes(tipo(c) ?? "")).length,
        aguardandoCeo: daSala.filter((c) => tipo(c) === "ceo").length,
        aprovacaoPrimeira: feitos30.length ? Math.round((feitos30.filter((c) => c.devolucoes === 0).length / feitos30.length) * 100) : null,
        devolucoesMedias: feitos30.length ? Math.round((feitos30.reduce((s, c) => s + c.devolucoes, 0) / feitos30.length) * 10) / 10 : null,
        bugsAbertos: cards.filter((c) => c.tipo === "bug" && tipo(c) !== "feito" && (c.sala === r.id || (r.id === "qa" && c.sala === "desenvolvimento"))).length,
        tempoMedioHoras: concluidos.length
          ? Math.round(concluidos.reduce((s, c) => s + (c.atualizadoEm - c.criadoEm), 0) / concluidos.length / 3_600_000)
          : null,
        custo7dUsd: daSala.filter((c) => agora - c.atualizadoEm < 7 * DIA).reduce((s, c) => s + c.custoUsd, 0),
      };
    });
  const desde = (dias: number) => new Date(agora - dias * DIA).toLocaleDateString("sv-SE");
  const soma = (deDia: string) => (db.prepare("SELECT COALESCE(SUM(usd), 0) AS t FROM uso WHERE dia >= ?").get(deDia) as { t: number }).t;
  const inicioMes = new Date(agora).toLocaleDateString("sv-SE").slice(0, 8) + "01";
  return { areas, custoHojeUsd: custoHoje(), custo7dUsd: soma(desde(6)), custoMesUsd: soma(inicioMes) };
}

/* ---------- Helena sugere metas a partir do Livro ---------- */

export async function sugerirMetas(): Promise<Meta[]> {
  const client = clienteClaude();
  if (!client) throw new ErroCard("Configure a chave da API para a Helena sugerir metas.");
  const criadas: Meta[] = [];
  const propor = ferramenta(
    "propor_metas",
    "Registra de 1 a 3 objetivos do trimestre, cada um com 2 a 4 resultados-chave mensuráveis.",
    {
      metas: {
        type: "array",
        minItems: 1,
        maxItems: 3,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["objetivo", "resultados"],
          properties: {
            objetivo: { type: "string" },
            resultados: {
              type: "array",
              minItems: 1,
              maxItems: 4,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["descricao", "alvo", "unidade"],
                properties: {
                  descricao: { type: "string" },
                  alvo: { type: "number" },
                  atual: { type: "number" },
                  unidade: { type: "string" },
                  sala: { type: "string", description: "Id da sala responsável" },
                },
              },
            },
          },
        },
      },
    },
    ["metas"],
    (e) => {
      if (!Array.isArray(e.metas) || !e.metas.length) throw new ErroEntrada("Envie pelo menos uma meta.");
      for (const m of e.metas.slice(0, 3) as Record<string, unknown>[]) {
        criadas.push(salvarMeta({ objetivo: texto(m, "objetivo", 300), resultados: m.resultados as ResultadoChave[], confirmada: false }));
      }
      return { texto: `${criadas.length} meta(s) registrada(s) como sugestão.`, fim: true };
    },
  );
  await rodarAgente({
    client,
    modelo: agentById["chief-of-staff"]!.modelo,
    sistema: sistemaHelena(),
    mensagem: `Com base no Livro da Empresa (principalmente o bloco Metas e Limites), proponha as metas do trimestre ${trimestreAtual()}: de 1 a 3 objetivos, cada um com resultados-chave mensuráveis (número, alvo e unidade) e a área responsável. Metas ambiciosas, mas realistas para o tamanho e o orçamento da empresa. Chame propor_metas.`,
    ferramentas: [propor],
    lembrete: "Chame propor_metas agora.",
  });
  if (!criadas.length) throw new ErroCard("A Helena não conseguiu propor metas agora. Tente de novo.");
  return criadas;
}
