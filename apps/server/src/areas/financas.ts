import { db } from "../db.ts";
import { ErroEntrada, ferramenta, type Ferramenta } from "../agentes/loop.ts";

// Administrativo (Fase 6): cálculos que não podem depender de "achismo" da IA.
// - Simples Nacional (LC 123/2006 com as faixas da LC 155/2016): Fator R, anexo III ou V,
//   alíquota efetiva e DAS estimado do mês. É estimativa: o contador responsável confere.
// - Custo real de IA da própria empresa (o que foi registrado em cada resposta).

type Faixa = { ate: number; aliquota: number; deduzir: number };

const ANEXO_III: Faixa[] = [
  { ate: 180_000, aliquota: 0.06, deduzir: 0 },
  { ate: 360_000, aliquota: 0.112, deduzir: 9_360 },
  { ate: 720_000, aliquota: 0.135, deduzir: 17_640 },
  { ate: 1_800_000, aliquota: 0.16, deduzir: 35_640 },
  { ate: 3_600_000, aliquota: 0.21, deduzir: 125_640 },
  { ate: 4_800_000, aliquota: 0.33, deduzir: 648_000 },
];
const ANEXO_V: Faixa[] = [
  { ate: 180_000, aliquota: 0.155, deduzir: 0 },
  { ate: 360_000, aliquota: 0.18, deduzir: 4_500 },
  { ate: 720_000, aliquota: 0.195, deduzir: 9_900 },
  { ate: 1_800_000, aliquota: 0.205, deduzir: 17_100 },
  { ate: 3_600_000, aliquota: 0.23, deduzir: 62_100 },
  { ate: 4_800_000, aliquota: 0.305, deduzir: 540_000 },
];

export interface CalculoSimples {
  fatorR: number;
  anexo: "III" | "V";
  faixa: number;
  aliquotaNominal: number;
  aliquotaEfetiva: number;
  dasMes: number;
  comparacao: { anexoIII: number; anexoV: number };
  avisos: string[];
}

function efetiva(tabela: Faixa[], rbt12: number) {
  const i = tabela.findIndex((f) => rbt12 <= f.ate);
  const f = tabela[i === -1 ? tabela.length - 1 : i]!;
  // Primeira faixa: alíquota nominal. Demais: (RBT12 × alíquota − parcela a deduzir) / RBT12.
  const ef = rbt12 <= 0 ? f.aliquota : (rbt12 * f.aliquota - f.deduzir) / rbt12;
  return { faixa: (i === -1 ? tabela.length - 1 : i) + 1, nominal: f.aliquota, efetiva: Math.max(0, ef) };
}

/** Simples Nacional para serviços de software (anexos III/V conforme o Fator R). */
export function calcularSimples(receita12m: number, folha12m: number, receitaMes: number): CalculoSimples {
  if (![receita12m, folha12m, receitaMes].every((v) => Number.isFinite(v) && v >= 0)) throw new ErroEntrada("Valores precisam ser números positivos (em reais).");
  const avisos: string[] = [];
  if (receita12m > 4_800_000) avisos.push("Receita de 12 meses acima de R$ 4,8 milhões: a empresa sai do Simples Nacional.");
  else if (receita12m > 3_600_000) avisos.push("Acima de R$ 3,6 milhões, ISS e ICMS passam a ser recolhidos fora do DAS (sublimite).");
  const fatorR = receita12m > 0 ? folha12m / receita12m : 0;
  const anexo = fatorR >= 0.28 ? "III" : "V";
  const iii = efetiva(ANEXO_III, receita12m);
  const v = efetiva(ANEXO_V, receita12m);
  const escolhido = anexo === "III" ? iii : v;
  if (anexo === "V" && receita12m > 0) {
    const folhaPara28 = Math.max(0, 0.28 * receita12m - folha12m);
    avisos.push(`Com mais R$ ${folhaPara28.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} de folha (pró-labore incluso) em 12 meses, o Fator R chega a 28% e a empresa vai para o Anexo III.`);
  }
  avisos.push("Estimativa para planejamento: confirme com o contador responsável (atividade, CNAE e município podem mudar o enquadramento).");
  return {
    fatorR,
    anexo,
    faixa: escolhido.faixa,
    aliquotaNominal: escolhido.nominal,
    aliquotaEfetiva: escolhido.efetiva,
    dasMes: receitaMes * escolhido.efetiva,
    comparacao: { anexoIII: receitaMes * iii.efetiva, anexoV: receitaMes * v.efetiva },
    avisos,
  };
}

const reais = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (n: number) => `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

export function custosDeIa(dias = 30): string {
  const linhas = db.prepare("SELECT dia, usd FROM uso ORDER BY dia DESC LIMIT ?").all(dias) as { dia: string; usd: number }[];
  if (!linhas.length) return "Nenhum gasto de IA registrado ainda.";
  const total = linhas.reduce((s, l) => s + l.usd, 0);
  const cards = db.prepare("SELECT 'EMP-' || id AS chave, titulo, custo_usd FROM cards WHERE custo_usd > 0 ORDER BY custo_usd DESC LIMIT 10").all() as { chave: string; titulo: string; custo_usd: number }[];
  return [
    `Gasto de IA nos últimos ${linhas.length} dias com uso: US$ ${total.toFixed(2)} (média US$ ${(total / linhas.length).toFixed(2)}/dia).`,
    ...linhas.map((l) => `- ${l.dia}: US$ ${l.usd.toFixed(2)}`),
    "",
    "Cards que mais custaram:",
    ...cards.map((c) => `- ${c.chave} ${c.titulo}: US$ ${c.custo_usd.toFixed(2)}`),
  ].join("\n");
}

export function ferramentasDeFinancas(agenteId: string): Ferramenta[] {
  const out: Ferramenta[] = [];
  if (["contador", "financeiro", "pmm"].includes(agenteId)) {
    out.push(
      ferramenta(
        "calcular_simples",
        "Calcula o Simples Nacional de serviços de software: Fator R, anexo (III ou V), faixa, alíquota efetiva e DAS estimado do mês, com a comparação entre os anexos. Valores em reais.",
        {
          receita_12m: { type: "number", description: "Receita bruta dos últimos 12 meses (RBT12)" },
          folha_12m: { type: "number", description: "Folha dos últimos 12 meses, com pró-labore e encargos" },
          receita_mes: { type: "number", description: "Receita do mês a apurar" },
        },
        ["receita_12m", "folha_12m", "receita_mes"],
        (e) => {
          const c = calcularSimples(Number(e.receita_12m), Number(e.folha_12m), Number(e.receita_mes));
          return {
            texto: [
              `Fator R: ${pct(c.fatorR)} → Anexo ${c.anexo}, faixa ${c.faixa}`,
              `Alíquota nominal ${pct(c.aliquotaNominal)}, efetiva ${pct(c.aliquotaEfetiva)}`,
              `DAS estimado do mês: ${reais(c.dasMes)} (Anexo III seria ${reais(c.comparacao.anexoIII)}; Anexo V seria ${reais(c.comparacao.anexoV)})`,
              ...c.avisos.map((a) => `Obs.: ${a}`),
            ].join("\n"),
          };
        },
      ),
    );
  }
  if (["financeiro", "chief-of-staff", "contador"].includes(agenteId)) {
    out.push(ferramenta("custos_de_ia", "Mostra quanto a empresa gastou de verdade com IA por dia (últimos 30 dias) e os cards que mais custaram.", {}, [], () => ({ texto: custosDeIa() })));
  }
  return out;
}
