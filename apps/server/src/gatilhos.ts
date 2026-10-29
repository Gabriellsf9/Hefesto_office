import { baseDoFluxo, colunaDeEntrada, ehCardDeCodigo, fluxoDaSala, type Card, fluxoPadrao } from "@empresa/shared";
import { getSetting, setSetting } from "./db.ts";
import { postFeed } from "./bus.ts";
import { aoAprovar, comentar, criarCard, ultimaEntrega } from "./tarefas.ts";

// Funcionalidade aprovada pelo CEO → a empresa mantém tudo em dia sozinha:
// site (Renan, N2: publicar é externo), documentação (Rebeca), treinamento (Hugo),
// plano de medição (Igor), revisão dos textos (Clara) e, se houver dado pessoal, privacidade (Luana).

export type GatilhoId = "site" | "documentacao" | "treinamento" | "metricas" | "textos" | "privacidade";

export interface Gatilho {
  id: GatilhoId;
  nome: string;
  descricao: string;
  ativo: boolean;
}

const definicoes: Omit<Gatilho, "ativo">[] = [
  { id: "site", nome: "Atualizar o site", descricao: "O Renan propõe as mudanças no site para refletir a funcionalidade (você aprova antes de publicar)." },
  { id: "documentacao", nome: "Documentar", descricao: "A Rebeca atualiza a documentação do sistema." },
  { id: "treinamento", nome: "Material de treinamento", descricao: "O Hugo escreve o treinamento da funcionalidade: tela por tela, botão por botão, com roteiro de prints e vídeos." },
  { id: "metricas", nome: "Medir o resultado", descricao: "O Igor monta o plano de medição (eventos, funil, métrica de sucesso) e a leitura do resultado em 30 dias." },
  { id: "textos", nome: "Revisar os textos", descricao: "A Clara revisa botões, mensagens de erro e estados vazios e atualiza o glossário do produto." },
  { id: "privacidade", nome: "Revisão de privacidade (LGPD)", descricao: "Quando a funcionalidade mexe com dado pessoal, a Luana mapeia os dados e atualiza a política de privacidade." },
];

/** Sinais de que a funcionalidade coleta ou usa dado pessoal. */
const DADO_PESSOAL = /dados? pessoa|cpf|cnpj|e-?mail|telefone|whatsapp|endere[cç]o|cadastr|login|senha|perfil|nascimento|localiza[cç][aã]o|foto|pagamento|cart[aã]o|sa[uú]de|biometri/i;

export function listarGatilhos(): Gatilho[] {
  return definicoes.map((d) => ({ ...d, ativo: (getSetting(`gatilho_${d.id}`) ?? "1") === "1" }));
}

export function configurarGatilho(id: GatilhoId, ativo: boolean) {
  if (!definicoes.some((d) => d.id === id)) throw new Error("Gatilho inexistente.");
  setSetting(`gatilho_${id}`, ativo ? "1" : "0");
  return listarGatilhos();
}

/**
 * Só funcionalidades de verdade: épicos de software e histórias que viraram código. Bugs, tarefas internas e histórias
 * de outras salas (protótipo do design, especificação do produto) não: o protótipo do EMP-3 aprovado abriu site,
 * documentação, treinamento, medição e textos para uma tela que ainda nem existia.
 */
export const ehFuncionalidade = (c: Card) => !c.demo && baseDoFluxo(c.fluxo) === "software" && (c.tipo === "epico" || (c.tipo === "historia" && ehCardDeCodigo(c)));

aoAprovar.push((card) => {
  if (!ehFuncionalidade(card)) return;
  const ativos = new Set(listarGatilhos().filter((g) => g.ativo).map((g) => g.id));
  if (!ativos.size) return;
  const entrega = ultimaEntrega(card.id);
  const contexto = `Funcionalidade aprovada pelo CEO: ${card.chave} — ${card.titulo}

## Descrição
${card.descricao || "(sem descrição)"}

## Critérios de aceite
${card.criterios || "(não definidos)"}

## Entrega aprovada
${entrega?.conteudo ?? "(sem entrega registrada)"}`;

  const comuns = { prioridade: "P2" as const, projetoId: card.projetoId, paiId: card.id, etiquetas: ["apos-funcionalidade"] };
  const criados: string[] = [];

  if (ativos.has("site")) {
    criados.push(
      criarCard(
        {
          ...comuns,
          titulo: `Atualizar o site: ${card.titulo}`,
          sala: "marketing",
          fluxo: "marketing",
          coluna: colunaDeEntrada("marketing"),
          tipo: "conteudo",
          dono: "web-content",
          nivel: "N2",
          descricao: `${contexto}\n\nVeja o site atual (link no Livro da Empresa, bloco Ativos) e proponha as mudanças para ele refletir esta funcionalidade: páginas afetadas, textos novos prontos, prints necessários e ajustes de SEO. Não publique: o CEO aprova e publica.`,
          criterios: "- Lista de páginas afetadas\n- Texto final pronto para colar em cada uma\n- Prints ou imagens necessários\n- Título e meta description revisados",
        },
        "chief-of-staff",
      ).chave,
    );
  }
  if (ativos.has("documentacao")) {
    criados.push(
      criarCard(
        {
          ...comuns,
          titulo: `Documentar: ${card.titulo}`,
          sala: "docs",
          fluxo: "geral",
          coluna: colunaDeEntrada("geral"),
          tipo: "tarefa",
          dono: "tech-writer",
          nivel: "N1",
          descricao: `${contexto}\n\nAtualize a documentação do sistema para esta funcionalidade, no padrão Diátaxis, conferindo no código quando houver projeto.`,
          criterios: "- Guia prático da tarefa principal\n- Referência de telas, campos e regras\n- O que mudou em relação à versão anterior\n- Arquivos e cards de origem citados",
        },
        "chief-of-staff",
      ).chave,
    );
  }
  if (ativos.has("treinamento")) {
    criados.push(
      criarCard(
        {
          ...comuns,
          titulo: `Treinamento: ${card.titulo}`,
          sala: "docs",
          fluxo: "geral",
          coluna: colunaDeEntrada("geral"),
          tipo: "tarefa",
          dono: "treinamento",
          nivel: "N1",
          descricao: `${contexto}\n\nCrie o material de treinamento desta funcionalidade: cada tela, cada campo e cada botão explicados, passo a passo das tarefas, roteiro de prints e vídeos curtos, exercícios e FAQ.`,
          criterios: "- Objetivo de aprendizagem\n- Cada tela, campo e botão explicados\n- Passo a passo numerado\n- Roteiro de prints e vídeos marcado no texto\n- Exercícios e FAQ",
        },
        "chief-of-staff",
      ).chave,
    );
  }
  if (ativos.has("metricas")) {
    criados.push(
      criarCard(
        {
          ...comuns,
          titulo: `Medir o resultado: ${card.titulo}`,
          sala: "dados",
          fluxo: fluxoPadrao("dados"),
          coluna: colunaDeEntrada(fluxoPadrao("dados")),
          tipo: "tarefa",
          dono: "product-analytics",
          nivel: "N1",
          descricao: `${contexto}\n\nMonte o plano de medição desta funcionalidade e como o CEO vai saber, em 30 dias, se ela deu resultado. Se os eventos ainda não existem no código, descreva exatamente o que o Dev precisa implementar.`,
          criterios: "- Métrica de sucesso e métricas de proteção\n- Eventos (nome, propriedades, onde disparam)\n- Funil e meta\n- Como e quando ler o resultado\n- O que o Dev precisa implementar, se faltar",
        },
        "chief-of-staff",
      ).chave,
    );
  }
  if (ativos.has("textos")) {
    criados.push(
      criarCard(
        {
          ...comuns,
          titulo: `Revisar os textos: ${card.titulo}`,
          sala: "design",
          fluxo: fluxoPadrao("design"),
          coluna: colunaDeEntrada(fluxoPadrao("design")),
          tipo: "tarefa",
          dono: "ux-writer",
          nivel: "N1",
          descricao: `${contexto}\n\nRevise todos os textos de interface desta funcionalidade (botões, rótulos, mensagens de erro, estados vazios, confirmações, e-mails) contra o tom da marca e o glossário do produto. Entregue a tabela de textos com o atual e o proposto.`,
          criterios: "- Tabela tela → elemento → texto atual → texto proposto\n- Mensagens de erro dizem como resolver\n- Glossário atualizado\n- O que o Dev precisa trocar",
        },
        "chief-of-staff",
      ).chave,
    );
  }
  if (ativos.has("privacidade") && DADO_PESSOAL.test(`${card.titulo}\n${card.descricao}\n${card.criterios}\n${entrega?.conteudo ?? ""}`)) {
    criados.push(
      criarCard(
        {
          ...comuns,
          titulo: `Privacidade (LGPD): ${card.titulo}`,
          sala: "administrativo",
          fluxo: fluxoPadrao("administrativo"),
          coluna: colunaDeEntrada(fluxoPadrao("administrativo")),
          tipo: "tarefa",
          dono: "dpo",
          nivel: "N1",
          prioridade: "P1",
          descricao: `${contexto}\n\nEsta funcionalidade parece coletar ou usar dado pessoal. Mapeie os dados, a base legal, a retenção e quem acessa; aponte riscos e o que corrigir antes de ir para produção; proponha as mudanças na política de privacidade e nos avisos da tela.`,
          criterios: "- Inventário dos dados pessoais (dado, finalidade, base legal, retenção, acesso)\n- Riscos e correções antes da produção\n- Texto proposto para a política de privacidade e avisos\n- O que precisa de parecer de advogado",
        },
        "chief-of-staff",
      ).chave,
    );
  }
  comentar(card.id, "chief-of-staff", "comentario", `Funcionalidade aprovada. Abri para manter tudo em dia: ${criados.join(", ")}.`);
  postFeed("diretoria", "chief-of-staff", `${card.chave} aprovado: ${criados.length} cards de acompanhamento na fila (${criados.join(", ")})`);
});
