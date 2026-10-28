import { colunaDeEntrada, fluxoPadrao, type Card, type RoomId } from "@empresa/shared";
import { agentById, roomById } from "@empresa/org";
import { criarCard, ErroCard } from "./tarefas.ts";
import { postFeed } from "./bus.ts";

// Modelos de projeto: uma sequência de cards pronta, com as dependências, para tipos de trabalho
// que se repetem (MVP, migração de integração, auditoria de segurança, lançamento). Você escolhe o
// modelo, descreve o contexto em uma frase e a equipe começa pela primeira etapa.

interface Etapa {
  titulo: string;
  sala: RoomId;
  descricao: string;
  criterios: string;
  nivel: Card["nivel"];
  tipo?: Card["tipo"];
  /** Índice (ou índices) das etapas anteriores de que esta depende: um card pode esperar por vários. */
  depoisDe?: number | number[];
}

export interface ModeloDeProjeto {
  id: string;
  nome: string;
  descricao: string;
  etapas: Etapa[];
}

export const MODELOS_DE_PROJETO: ModeloDeProjeto[] = [
  {
    id: "mvp",
    nome: "MVP de uma funcionalidade",
    descricao: "Escopo → protótipo → plano técnico → backend → frontend → QA. Para uma funcionalidade nova num projeto seu.",
    etapas: [
      { titulo: "Escopo e histórias", sala: "produto", nivel: "N0", tipo: "historia", descricao: "Escreva o problema, as histórias com critérios de aceite (Gherkin), o que fica fora e as métricas de sucesso.", criterios: "- Histórias INVEST com critérios\n- Fora de escopo explícito\n- Métrica de sucesso" },
      { titulo: "Protótipo e estados de tela", sala: "design", nivel: "N0", depoisDe: 0, descricao: "Protótipo das telas com estados (vazio, carregando, erro, sucesso), acessibilidade e textos.", criterios: "- Todos os estados\n- WCAG AA\n- Textos finais" },
      { titulo: "Plano técnico", sala: "arquitetura", nivel: "N0", depoisDe: 0, descricao: "Contrato de API, dados, decisões (ADRs), riscos e como testar e reverter.", criterios: "- Contrato de API\n- Plano de dados e migração\n- Rollback" },
      { titulo: "Backend", sala: "desenvolvimento", nivel: "N1", depoisDe: 2, descricao: "Implemente o backend conforme o plano técnico, com testes.", criterios: "- Contrato do plano\n- Testes do caminho feliz e de erro" },
      { titulo: "Frontend", sala: "desenvolvimento", nivel: "N1", depoisDe: [3, 1], descricao: "Implemente as telas do protótipo ligadas ao backend, com testes.", criterios: "- Fiel ao protótipo\n- Estados de erro e carregamento\n- Testes" },
      { titulo: "QA de ponta a ponta", sala: "qa", nivel: "N1", depoisDe: 4, descricao: "Teste o fluxo completo: E2E, API, acessibilidade e regressão.", criterios: "- Roteiro executado\n- Bugs abertos com passos" },
    ],
  },
  {
    id: "migracao",
    nome: "Migrar ou trocar uma integração",
    descricao: "Raio-x → plano com convivência e rollback → schema e script → código → QA → rollout.",
    etapas: [
      { titulo: "Raio-x da integração atual", sala: "arquitetura", nivel: "N0", descricao: "Mapeie onde a integração atual é usada, dados, contratos e dependências, citando os arquivos.", criterios: "- Pontos de uso citados\n- Dados envolvidos" },
      { titulo: "Plano de migração com convivência e rollback", sala: "arquitetura", nivel: "N1", depoisDe: 0, descricao: "Fases (convivência, corte, desligamento), dono da verdade em cada fase, rollback testável e riscos.", criterios: "- Fases claras\n- Rollback testável\n- Riscos e mitigação" },
      { titulo: "Schema e script de migração", sala: "dados", nivel: "N1", depoisDe: 1, descricao: "Migrations reversíveis, script idempotente de migração de dados e conciliação.", criterios: "- Up e down\n- Idempotente\n- Relatório de conciliação" },
      { titulo: "Implementação no código", sala: "desenvolvimento", nivel: "N1", depoisDe: 1, descricao: "Implemente a nova integração atrás de uma flag, com testes.", criterios: "- Atrás de flag\n- Testes" },
      { titulo: "QA da migração", sala: "qa", nivel: "N1", depoisDe: 3, descricao: "Teste a convivência, o corte e o rollback.", criterios: "- Rollback exercitado\n- Sem perda de dados" },
      { titulo: "Rollout e desligamento", sala: "devops", nivel: "N2", depoisDe: 4, descricao: "Runbook de rollout em etapas, monitoramento e desligamento da integração antiga.", criterios: "- Runbook\n- Alertas\n- Plano de desligamento" },
    ],
  },
  {
    id: "auditoria-seguranca",
    nome: "Auditoria de segurança",
    descricao: "Raio-x → revisão de código seguro → pentest no seu app local ou staging → plano de correção.",
    etapas: [
      { titulo: "Raio-x de superfície de ataque", sala: "arquitetura", nivel: "N0", descricao: "Liste entradas, autenticação, dados sensíveis, dependências e segredos (sem ler valores).", criterios: "- Superfície mapeada\n- Dados sensíveis" },
      { titulo: "Revisão de código seguro", sala: "seguranca", nivel: "N1", depoisDe: 0, descricao: "OWASP Top 10, autenticação, autorização, injeção, segredos e dependências.", criterios: "- Achados com severidade\n- Arquivo e linha" },
      { titulo: "Pentest no app local ou de staging", sala: "seguranca", nivel: "N2", depoisDe: 0, descricao: "Teste só o seu app (local ou staging) com os sites de teste liberados.", criterios: "- Só alvos liberados\n- Evidências" },
      { titulo: "Plano de correção priorizado", sala: "seguranca", nivel: "N1", depoisDe: 1, descricao: "Junte os achados num plano de correção por risco, com estimativa.", criterios: "- Priorizado por risco\n- Dono e prazo" },
    ],
  },
  {
    id: "lancamento",
    nome: "Lançamento de produto ou funcionalidade",
    descricao: "Posicionamento → página → peças para redes → e-mail → plano de mídia.",
    etapas: [
      { titulo: "Posicionamento e mensagem", sala: "marketing", nivel: "N0", descricao: "Público, dor, promessa, provas e tom (do Livro da Empresa).", criterios: "- Público e dor\n- Promessa e provas" },
      { titulo: "Página do lançamento", sala: "marketing", nivel: "N1", depoisDe: 0, descricao: "Texto da página com SEO, CTA e FAQ.", criterios: "- SEO\n- CTA claro" },
      { titulo: "Peças para redes sociais", sala: "marketing", nivel: "N2", depoisDe: 0, tipo: "conteudo", descricao: "Posts para Instagram e LinkedIn com roteiro visual e datas.", criterios: "- Formato por canal\n- Datas" },
      { titulo: "E-mail de lançamento", sala: "marketing", nivel: "N2", depoisDe: 0, descricao: "E-mail com assunto, pré-cabeçalho e opção de sair.", criterios: "- Assunto testável\n- Opt-out" },
    ],
  },
];

const liderDe = (sala: RoomId) =>
  Object.values(agentById).find((a) => a.sala === sala && a.lider)?.id ?? Object.values(agentById).find((a) => a.sala === sala)?.id ?? null;

/** Cria os cards do modelo, encadeados pelas dependências. */
export function criarProjetoDoModelo(id: string, contexto: string, projetoId: number | null): Card[] {
  const m = MODELOS_DE_PROJETO.find((x) => x.id === id);
  if (!m) throw new ErroCard("Modelo de projeto não encontrado.");
  const ctx = contexto.trim().slice(0, 4000);
  if (!ctx) throw new ErroCard("Descreva em uma frase do que se trata.");
  const criados: Card[] = [];
  for (const e of m.etapas) {
    if (!roomById[e.sala]) throw new ErroCard(`A sala ${e.sala} não existe neste escritório.`);
    const fluxo = fluxoPadrao(e.sala);
    criados.push(
      criarCard(
        {
          titulo: `${e.titulo}: ${ctx.slice(0, 80)}`,
          descricao: `${e.descricao}\n\n## Contexto\n${ctx}\n\n(Etapa de "${m.nome}".)`,
          criterios: e.criterios,
          sala: e.sala,
          fluxo,
          coluna: colunaDeEntrada(fluxo),
          dono: liderDe(e.sala),
          nivel: e.nivel,
          tipo: e.tipo ?? "tarefa",
          prioridade: "P2",
          projetoId,
          dependeDe: e.depoisDe !== undefined ? criados[[e.depoisDe].flat()[0]!]!.id : null,
          dependencias: [e.depoisDe ?? []].flat().slice(1).map((j) => criados[j]!.id),
        },
        "chief-of-staff",
      ),
    );
  }
  postFeed("diretoria", "chief-of-staff", `Projeto "${m.nome}" criado a partir do modelo: ${criados.length} cards encadeados`);
  return criados;
}
