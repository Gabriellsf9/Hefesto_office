import {
  colunaDeTrabalho, colunaDeValidacao, fluxoDaSala, fluxos, type AgentStatus, type Card, type FluxoId, type RoomId, fluxoPadrao } from "@empresa/shared";
import { agentById, agentsByRoom, roomById, rooms, salaDe } from "@empresa/org";
import { emit, focus, postFeed, resetAll, setAgentStatus } from "./bus.ts";
import { projetoAtivo } from "./projetos.ts";
import { abrirBug, comentar, criarCard, marcarValidacao, mover, registrarDevolucao } from "./tarefas.ts";

// Modo demonstração (Fase 1): sem chamar a IA, encena o ciclo real de uma entrega
// para o escritório ganhar vida e para testar câmera, painéis e eventos.
// Na Fase 2 o motor de agentes emite exatamente os mesmos eventos.

const tarefas: Partial<Record<RoomId, string[]>> = {
  diretoria: ["Quebrando o pedido do CEO em etapas", "Montando o resumo semanal da empresa", "Definindo prioridades do trimestre"],
  produto: ["Escrevendo histórias do módulo de agendamento", "Priorizando o backlog da sprint", "Detalhando critérios de aceite do login"],
  design: ["Desenhando o fluxo de checkout", "Montando protótipo navegável da home", "Atualizando tokens de cor do design system"],
  arquitetura: ["Escrevendo ADR sobre fila de mensagens", "Dividindo o épico de pagamentos em tarefas", "Desenhando o modelo de dados"],
  desenvolvimento: ["Implementando endpoint POST /agendamentos", "Criando tela de login em React", "Escrevendo testes unitários do carrinho", "Integrando Pix no backend"],
  "code-review": ["Revisando o PR #42 — autenticação", "Revisando o PR #43 — tela de perfil"],
  qa: ["Rodando smoke test da versão 0.3", "Testando contrato da API de pedidos", "Rodando teste de carga com 500 usuários", "Auditando contraste e navegação por teclado"],
  seguranca: ["Auditando dependências com vulnerabilidades", "Revisando o fluxo de login pela ótica OWASP"],
  devops: ["Configurando pipeline de CI", "Preparando ambiente de homologação", "Criando alertas de latência"],
  dados: ["Criando migração da tabela de agendamentos", "Otimizando query lenta de relatórios", "Montando dashboard de conversão", "Configurando backup e replicação do Postgres"],
  docs: ["Documentando o fluxo de agendamento", "Escrevendo o treinamento da tela de login", "Atualizando o guia de primeiros passos"],
  infraestrutura: ["Aplicando patches de segurança nos servidores", "Renovando certificados TLS", "Provisionando servidor de homologação com Terraform", "Revisando regras do firewall"],
  marketing: ["Criando carrossel sobre automação para o Instagram", "Escrevendo post de autoridade para o LinkedIn", "Estruturando campanha de Meta Ads", "Pesquisando palavras-chave para o blog", "Separando 10 posts relevantes para comentar"],
  comercial: ["Montando lista de 30 leads qualificados", "Escrevendo proposta comercial"],
  cs: ["Escrevendo artigo da base de conhecimento", "Montando roteiro de onboarding do cliente"],
  administrativo: ["Calculando custo de API do mês", "Revisando termos de uso e LGPD", "Escrevendo a descrição de cargo do novo agente"],
};

const statusDeTrabalho: Partial<Record<RoomId, AgentStatus>> = { qa: "testando" };

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sorteia = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]!;

let ativo = false;
const ocupados = new Set<string>();

const tipoDoFluxo: Record<FluxoId, Card["tipo"]> = {
  software: "historia", marketing: "conteudo", comercial: "lead", operacoes: "tarefa", geral: "tarefa",
};

const motivosDeDevolucao = [
  "Faltou cobrir o caso de erro. Ajusta e me chama de novo.",
  "Está bom, mas o critério de aceite 2 não foi atendido.",
  "Precisa de mais clareza no texto antes de seguir.",
  "Encontrei um ponto de atenção de performance. Vamos revisar juntos.",
];

async function episodio(sala: RoomId) {
  const room = salaDe(sala);
  const membros = agentsByRoom(sala).filter((a) => !ocupados.has(a.id));
  if (!room.validador || membros.length === 0) return;
  const autor = sorteia(membros);
  const validador = agentById[room.validador]!;
  if (ocupados.has(validador.id)) return;
  ocupados.add(autor.id);
  ocupados.add(validador.id);

  const tarefa = sorteia(tarefas[sala] ?? ["Trabalhando"]);
  const fluxo = fluxoPadrao(sala);
  const sorte = Math.random();
  try {
    // 1. Card criado na fila e pego pelo autor
    let card = criarCard(
      {
        titulo: tarefa,
        sala,
        tipo: tipoDoFluxo[fluxo],
        dono: autor.id,
        validador: validador.id,
        nivel: sorte < 0.3 ? "N0" : sorte < 0.8 ? "N1" : "N2",
        prioridade: sorteia(["P1", "P2", "P2", "P3"] as const),
        projetoId: fluxo === "software" ? projetoAtivo() : null,
        demo: true,
      },
      autor.id,
    );
    focus(sala, autor.id);
    setAgentStatus(autor.id, "pensando", `Planejando: ${tarefa.toLowerCase()}`);
    postFeed(sala, autor.id, `${autor.nome} pegou o ${card.chave}: ${tarefa}`);
    await espera(2500 + Math.random() * 2000);
    if (!ativo) return;

    // 2. Trabalhando
    const trabalho = colunaDeTrabalho(fluxo, sala);
    card = mover(card.id, trabalho, autor.id);
    setAgentStatus(autor.id, statusDeTrabalho[sala] ?? "trabalhando", tarefa);
    await espera(5000 + Math.random() * 4000);
    if (!ativo) return;

    // 3. Debate com o validador: às vezes devolve antes de aprovar
    const validacao = colunaDeValidacao(fluxo, sala);
    const rodadas = Math.random() < 0.45 ? 2 : 1;
    for (let r = 1; r <= rodadas; r++) {
      card = validacao ? mover(card.id, validacao, autor.id) : card;
      marcarValidacao(card.id, true);
      // O validador vai andando até a mesa do autor; os dois debatem lá.
      setAgentStatus(autor.id, "em-reuniao", `Apresentando ${card.chave} para ${validador.nome}`, validador.id);
      setAgentStatus(validador.id, "validando", `Validando ${card.chave} de ${autor.nome}`, autor.id);
      postFeed(sala, validador.id, `${validador.nome} (${validador.cargo}) está validando o ${card.chave}`);
      await espera(14000 + Math.random() * 4000);
      if (!ativo) return;
      if (r < rodadas) {
        registrarDevolucao(card.id, validador.id, sorteia(motivosDeDevolucao), trabalho);
        postFeed(sala, validador.id, `${validador.nome} devolveu o ${card.chave} com ajustes para ${autor.nome}`);
        setAgentStatus(validador.id, "ocioso", null);
        setAgentStatus(autor.id, statusDeTrabalho[sala] ?? "trabalhando", `Ajustando ${card.chave}`);
        await espera(3500 + Math.random() * 2000);
        if (!ativo) return;
      }
    }
    setAgentStatus(validador.id, "ocioso", null);
    comentar(card.id, validador.id, "aprovacao", "Validado. Pode seguir.");

    // 4. Software do Squad 1: depois do review vai para o QA, que às vezes acha bug
    if (sala === "desenvolvimento") {
      card = mover(card.id, "em-qa", validador.id);
      setAgentStatus(autor.id, "ocioso", null);
      await espera(6000 + Math.random() * 3000);
      if (!ativo) return;
      if (Math.random() < 0.4) {
        const bug = abrirBug(card.id, { titulo: `Erro ao salvar em ${tarefa.toLowerCase()}`, severidade: sorteia(["S2", "S3"] as const) }, "qa-e2e");
        registrarDevolucao(card.id, "qa-e2e", `Bug encontrado: ${bug.chave}. Voltando para o dev.`, "em-dev");
        postFeed("qa", "qa-e2e", `Bruno (QA) encontrou o bug ${bug.chave} no ${card.chave}`);
        setAgentStatus(autor.id, "trabalhando", `Corrigindo ${bug.chave}`);
        mover(bug.id, "em-dev", autor.id);
        await espera(7000 + Math.random() * 3000);
        if (!ativo) return;
        mover(bug.id, "concluido", "qa-e2e");
        card = mover(card.id, "em-qa", autor.id);
        setAgentStatus(autor.id, "ocioso", null);
        await espera(4000);
        if (!ativo) return;
      }
      comentar(card.id, "qa-lead", "aprovacao", "QA aprovado: smoke, E2E e API ok.");
    }

    // 5. N0 o validador conclui; N1/N2 vão para a sua caixa de aprovações
    if (card.nivel === "N0") {
      mover(card.id, fluxos[fluxo]!.aprovarPara, validador.id);
      postFeed(sala, validador.id, `${validador.nome} concluiu o ${card.chave} (nível N0, não precisa do CEO)`);
      setAgentStatus(autor.id, "ocioso", null);
    } else {
      mover(card.id, "aguardando-ceo", validador.id);
      postFeed(sala, validador.id, `${card.chave} validado por ${validador.nome}. Aguardando sua aprovação.`);
      setAgentStatus(autor.id, "aguardando-aprovacao", `Aguardando seu OK no ${card.chave}`);
      await espera(6000);
      if (!ativo) return;
      setAgentStatus(autor.id, "ocioso", null);
    }
  } finally {
    ocupados.delete(autor.id);
    ocupados.delete(validador.id);
  }
}

async function loop() {
  while (ativo) {
    if (ocupados.size < 10) {
      const sala = sorteia(rooms.filter((r) => r.validador)).id;
      void episodio(sala);
    }
    await espera(6000 + Math.random() * 4000);
  }
}

export function isDemoActive() {
  return ativo;
}

export function setDemo(on: boolean) {
  if (on === ativo) return;
  ativo = on;
  emit({ type: "demo", ativo });
  if (on) void loop();
  else {
    ocupados.clear();
    resetAll();
  }
}
