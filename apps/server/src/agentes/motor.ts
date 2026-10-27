import Anthropic from "@anthropic-ai/sdk";
import {
  colunaDe, colunaDeEntrada, colunaDeTrabalho, colunaDeValidacao, etapaDoCodigo, etapasDoCodigo, fluxoDaSala, fluxos, prioridades, type Agent, type Card, type EstadoMotor,
  type FluxoId, type RoomId, type TrabalhoEmAndamento,
} from "@empresa/shared";
import { agentById, roomById } from "@empresa/org";
import { emit, focus, postChat, postFeed, setAgentStatus } from "../bus.ts";
import { clienteClaude, custoHoje } from "../custo.ts";
import { getSetting, setSetting } from "../db.ts";
import { fichaDoProjeto } from "../projetos.ts";
import { configCritica, criarConhecimento, extrairLicao } from "../conhecimento.ts";
import { conferirEntregaDeLead, ferramentasDeProspeccao } from "../prospeccao.ts";
import { codigoDoCard, commitar, garantirWorktree, worktreeDoCard, type Worktree } from "../fabrica/workspace.ts";
import { ferramentaDeComando, ferramentaDeDiff, ferramentasDeEscrita } from "../fabrica/ferramentas.ts";
import { ferramentaDeCaptura } from "../fabrica/capturas.ts";
import { ferramentaDeNavegador } from "../fabrica/navegador.ts";
import { imagensDoTexto } from "../imagens.ts";
import { ferramentasDeConectores } from "../mcp/ferramentas.ts";
import { ferramentaDeTerminal, podeUsarMaquina } from "../maquina/terminal.ts";
import { ferramentaDeControle } from "../maquina/controle.ts";
import { desligar as desligarCelular, ferramentaDeCelular } from "../maquina/celular.ts";
import { conferirEntregaDePeca, ferramentasDeMarketing } from "../marketing.ts";
import { conexaoDoProjeto, ferramentaDeBanco } from "../areas/dados.ts";
import { ferramentasDeInfra } from "../areas/infra.ts";
import { ferramentasDeFinancas } from "../areas/financas.ts";
import { ferramentasDeAtendimento } from "../areas/atendimento.ts";
import {
  comentar, criarCard, editarCard, ErroCard, lerCard, listarCards, listarComentarios, marcarValidacao, mover, registrarDevolucao, registrarEntrega,
  ultimaEntrega,
} from "../tarefas.ts";
import { ErroEntrada, ferramenta, ferramentasDeProjeto, ferramentasWeb, rodarAgente, texto, type Ferramenta } from "./loop.ts";
import { mensagemAdvogado, mensagemExecutar, mensagemValidar, sistemaAdvogado, sistemaAutor, sistemaValidador } from "./prompts.ts";

// Motor de agentes (Fase 2c). A cada poucos segundos olha a board e põe agentes
// livres para trabalhar nos cards prontos:
//   executar: o dono faz o trabalho e entrega;
//   validar:  o validador aprova (segue o fluxo) ou devolve (volta para o dono).
// Sem consenso depois de MAX_RODADAS devoluções, o card sobe para o CEO.

const MAX_RODADAS = 4;
const INTERVALO_MS = 3000;

const emAndamento = new Map<number, TrabalhoEmAndamento>();
const falhas = new Map<number, number>();
let naFila = 0;
let semOrcamentoAntes = false;
let timer: NodeJS.Timeout | null = null;

/* ---------- Configuração e estado ---------- */

export function estadoMotor(): EstadoMotor {
  const orcamento = Number(getSetting("motor_orcamento_usd") ?? "5");
  return {
    pausado: getSetting("motor_pausado") === "1",
    semOrcamento: custoHoje() >= orcamento,
    orcamentoDiarioUsd: orcamento,
    maxSimultaneos: Number(getSetting("motor_max_simultaneos") ?? "3"),
    emAndamento: [...emAndamento.values()],
    naFila,
  };
}

const publicar = () => emit({ type: "motor", estado: estadoMotor() });

export function configurarMotor(c: { pausado?: boolean; orcamentoDiarioUsd?: number; maxSimultaneos?: number }) {
  if (typeof c.pausado === "boolean") setSetting("motor_pausado", c.pausado ? "1" : "0");
  if (typeof c.orcamentoDiarioUsd === "number" && c.orcamentoDiarioUsd >= 0 && c.orcamentoDiarioUsd <= 1000) {
    setSetting("motor_orcamento_usd", String(c.orcamentoDiarioUsd));
  }
  if (typeof c.maxSimultaneos === "number" && c.maxSimultaneos >= 1 && c.maxSimultaneos <= 8) {
    setSetting("motor_max_simultaneos", String(Math.round(c.maxSimultaneos)));
  }
  publicar();
  return estadoMotor();
}

export function iniciarMotor() {
  if (!timer) timer = setInterval(() => void ciclo(), INTERVALO_MS);
}

/* ---------- Agendador ---------- */

const peso = (c: Card) => prioridades.findIndex((p) => p.id === c.prioridade);
const tipoColuna = (c: Card) => colunaDe(c.fluxo, c.coluna)?.tipo;

/** Dependência satisfeita: o card de que este depende já está concluído. */
function dependenciaOk(card: Card, porId: Map<number, Card>) {
  if (!card.dependeDe) return true;
  const dep = porId.get(card.dependeDe);
  return !dep || tipoColuna(dep) === "feito";
}

/**
 * Os agentes só trabalham nas etapas ANTES da aprovação do CEO. Depois dela
 * (ex.: Comercial "Contatado", "Reunião") quem conduz é você.
 */
function antesDoCeo(card: Card) {
  const cols = fluxos[card.fluxo].colunas;
  return cols.findIndex((c) => c.id === card.coluna) < cols.findIndex((c) => c.tipo === "ceo");
}

export function prontoParaExecutar(card: Card, porId: Map<number, Card>) {
  const tipo = tipoColuna(card);
  return (
    !card.demo && !card.bloqueado && !card.emValidacao && !!card.dono && card.coluna !== "backlog" &&
    (tipo === "fila" || tipo === "trabalho" || tipo === "bug") && antesDoCeo(card) && dependenciaOk(card, porId)
  );
}

export function prontoParaValidar(card: Card) {
  return !card.demo && !card.bloqueado && card.emValidacao && !!card.validador;
}

async function ciclo() {
  const estado = estadoMotor();
  const client = clienteClaude();
  const cards = listarCards();
  const porId = new Map(cards.map((c) => [c.id, c]));
  const trabalhos = [
    ...cards.filter(prontoParaValidar).map((card) => ({ card, tipo: "validar" as const, agente: card.validador! })),
    ...cards.filter((c) => prontoParaExecutar(c, porId)).map((card) => ({ card, tipo: "executar" as const, agente: card.dono! })),
  ]
    .filter((t) => !emAndamento.has(t.card.id))
    // Validações primeiro (destravam o fluxo), depois por prioridade e idade.
    .sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === "validar" ? -1 : 1) || peso(a.card) - peso(b.card) || a.card.criadoEm - b.card.criadoEm);

  const mudouFila = naFila !== trabalhos.length || semOrcamentoAntes !== estado.semOrcamento;
  naFila = trabalhos.length;
  semOrcamentoAntes = estado.semOrcamento;
  if (!client || estado.pausado || estado.semOrcamento) {
    if (mudouFila) publicar();
    return;
  }

  const ocupados = new Set([...emAndamento.values()].map((t) => t.agenteId));
  for (const t of trabalhos) {
    if (emAndamento.size >= estado.maxSimultaneos) break;
    if (ocupados.has(t.agente) || !agentById[t.agente]) continue; // um card por agente de cada vez
    ocupados.add(t.agente);
    void rodar(client, t.card, t.tipo, t.agente);
  }
  if (mudouFila) publicar();
}

async function rodar(client: Anthropic, card: Card, tipo: "executar" | "validar", agenteId: string) {
  emAndamento.set(card.id, { cardId: card.id, agenteId, tipo, desde: Date.now() });
  naFila = Math.max(0, naFila - 1);
  publicar();
  try {
    if (tipo === "executar") await executar(client, card, agentById[agenteId]!);
    else await validar(client, card, agentById[agenteId]!);
    falhas.delete(card.id);
  } catch (err) {
    tratarFalha(card, agenteId, err);
  } finally {
    emAndamento.delete(card.id);
    setAgentStatus(agenteId, "ocioso", null);
    if (tipo === "validar" && card.dono) setAgentStatus(card.dono, "ocioso", null);
    publicar();
  }
}

function tratarFalha(card: Card, agenteId: string, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    configurarMotor({ pausado: true });
    postChat("chief-of-staff", "Pausei a empresa: a chave da API foi recusada. Confira a chave e despause no topo da tela.");
    return;
  }
  const n = (falhas.get(card.id) ?? 0) + 1;
  falhas.set(card.id, n);
  comentar(card.id, agenteId, "comentario", `Não consegui concluir agora: ${msg}`);
  if (n >= 2 || !(err instanceof Anthropic.APIError)) {
    editarCard(card.id, { bloqueado: true });
    comentar(card.id, agenteId, "comentario", "Bloqueei o card depois de falhar. Comente aqui para desbloquear e tentar de novo.");
    falhas.delete(card.id);
  }
}

/* ---------- Executar (autor) ---------- */

export { colunaDeEntrada } from "@empresa/shared";

async function executar(client: Anthropic, inicial: Card, agente: Agent) {
  let card = inicial;
  const tipo = tipoColuna(card);
  if (tipo === "fila" || tipo === "bug") card = mover(card.id, colunaDeTrabalho(card.fluxo, card.sala), agente.id);
  focus(card.sala, agente.id);
  setAgentStatus(agente.id, agente.sala === "qa" ? "testando" : "trabalhando", `${card.chave}: ${card.titulo}`);
  postFeed(card.sala, agente.id, `${agente.nome} começou o ${card.chave}: ${card.titulo}`);

  // Fábrica de software (Fase 4): card de código num projeto com git trabalha numa cópia isolada.
  const projeto = fichaDoProjeto(card.projetoId);
  let wt: Worktree | null = null;
  if (projeto && card.projetoId !== null && ehCardDeCodigo(card)) {
    try {
      wt = await garantirWorktree(card, projeto.caminho, card.projetoId);
    } catch (e) {
      if (!(e instanceof ErroCard)) throw e;
      comentar(card.id, "devops", "comentario", `${e.message} Por enquanto o código vai só na entrega, sem rodar.`);
    }
  }

  let entregou = false;
  // Autocrítica (Fase 2f): a primeira chamada de entregar vira rascunho; o agente confere
  // contra o checklist e chama de novo com a versão final.
  const autocritica = configCritica().autocritica;
  let rascunho: { resumo: string; conteudo: string } | null = null;
  const ferramentas: Ferramenta[] = [
    ferramenta(
      "entregar",
      autocritica
        ? "Entrega o trabalho completo deste card. A primeira chamada é tratada como rascunho e pede a sua autocrítica; a segunda (com autocritica preenchida) entrega de verdade e termina a sua vez."
        : "Entrega o trabalho completo deste card. Termina a sua vez; o validador confere em seguida.",
      {
        resumo: { type: "string", description: "Uma frase dizendo o que foi entregue" },
        conteudo: { type: "string", description: "O trabalho completo, em Markdown, pronto para uso" },
        ...(autocritica
          ? {
              autocritica: { type: "string", description: "Só na chamada final: o que você conferiu, item por item, e o que corrigiu" },
              sem_mudancas: { type: "boolean", description: "Só na chamada final: true se a autocrítica não mudou nada (aí o conteúdo do rascunho é usado)" },
            }
          : {}),
      },
      ["resumo"],
      async (e) => {
        conferirEntregaDeLead(card);
        conferirEntregaDePeca(card);
        const resumo = texto(e, "resumo", 300);
        const conteudo = e.sem_mudancas === true && rascunho ? rascunho.conteudo : texto(e, "conteudo", 200_000);
        if (autocritica && !rascunho) {
          rascunho = { resumo, conteudo };
          setAgentStatus(agente.id, "trabalhando", `${card.chave}: revisando a própria entrega`);
          return {
            texto:
              "Rascunho recebido, ainda NÃO entregue. Faça a autocrítica como o validador faria: confira item por item o checklist da sua área, a sua especialidade, os critérios de aceite do card e as devoluções e questionamentos anteriores. Corrija o que não atender. Depois chame entregar de novo com autocritica (o que conferiu e o que corrigiu) e com o conteúdo completo corrigido, ou com sem_mudancas: true se nada precisou mudar.",
          };
        }
        if (rascunho && typeof e.autocritica === "string" && e.autocritica.trim()) {
          comentar(card.id, agente.id, "autocritica", e.autocritica.trim().slice(0, 5000));
        }
        registrarEntrega(card.id, agente.id, resumo, wt ? await comCodigo(wt, agente.id, card, resumo, conteudo) : conteudo);
        entregou = true;
        return { texto: "Entrega registrada.", fim: true };
      },
    ),
    ferramenta(
      "registrar_conhecimento",
      "Propõe ao CEO um padrão, guia ou modelo para a base de conhecimento da sua área (vale para os próximos trabalhos). Não termina a sua vez.",
      {
        tipo: { type: "string", enum: ["padrao", "guia", "modelo"] },
        titulo: { type: "string", description: "Até 80 caracteres" },
        conteudo: { type: "string", description: "O padrão, guia ou modelo, pronto para ser seguido" },
      },
      ["tipo", "titulo", "conteudo"],
      (e) => {
        try {
          const item = criarConhecimento({ sala: agente.sala, tipo: e.tipo, titulo: e.titulo, conteudo: e.conteudo }, agente.id, card.id);
          postFeed(agente.sala, agente.id, `${agente.nome} propôs para a base de conhecimento: ${item.titulo}`);
          return { texto: `Proposta registrada: ${item.titulo}. Vale depois que o CEO aprovar.` };
        } catch (err) {
          if (err instanceof ErroCard) throw new ErroEntrada(err.message);
          throw err;
        }
      },
    ),
    ferramenta(
      "perguntar_ao_ceo",
      "Pausa este card e faz uma pergunta ao CEO. Use só quando a entrega não faz sentido sem a resposta.",
      { pergunta: { type: "string" } },
      ["pergunta"],
      (e) => {
        const pergunta = texto(e, "pergunta", 2000);
        comentar(card.id, agente.id, "comentario", `❓ Pergunta para o CEO: ${pergunta}`);
        editarCard(card.id, { bloqueado: true });
        postChat(agente.id, `Tenho uma dúvida no ${card.chave} (${card.titulo}): ${pergunta}\nResponda comentando no card.`);
        return { texto: "Pergunta enviada. O card fica pausado até o CEO responder.", fim: true };
      },
    ),
    ferramenta(
      "pedir_para_outra_area",
      "Abre um card para outra área fazer uma parte do trabalho. Não termina a sua vez.",
      {
        titulo: { type: "string" },
        sala: { type: "string", description: "Id da sala (ver diretório)" },
        descricao: { type: "string", description: "Contexto suficiente para a outra área trabalhar sozinha" },
        dono: { type: "string", description: "Id do agente (opcional; padrão: líder da sala)" },
      },
      ["titulo", "sala", "descricao"],
      (e) => {
        const sala = texto(e, "sala", 40) as RoomId;
        if (!roomById[sala]) return { texto: `Sala inválida: ${sala}`, erro: true };
        const dono = typeof e.dono === "string" && agentById[e.dono]?.sala === sala ? e.dono : liderDe(sala);
        const fluxo = fluxoDaSala[sala];
        const novo = criarCard(
          {
            titulo: texto(e, "titulo", 200), descricao: texto(e, "descricao", 20_000), sala, fluxo, coluna: colunaDeEntrada(fluxo),
            dono, nivel: card.nivel === "N0" ? "N0" : "N1", prioridade: card.prioridade, projetoId: card.projetoId, paiId: card.id,
          },
          agente.id,
        );
        comentar(card.id, agente.id, "comentario", `Pedi para ${roomById[sala].nome}: ${novo.chave} — ${novo.titulo}`);
        return { texto: `Card ${novo.chave} criado para ${roomById[sala].nome}.` };
      },
    ),
  ];
  if (agente.ferramentas.includes("web") || card.etiquetas.includes("prospeccao")) ferramentas.push(...ferramentasWeb);
  ferramentas.push(...ferramentasDeProspeccao(card, agente.id), ...ferramentasDeMarketing(card), ...ferramentasDaArea(agente, card));
  // Conectores MCP liberados para a sala (Gmail, GitHub, Stripe…): leitura direta, ações com a aprovação do CEO.
  ferramentas.push(...ferramentasDeConectores(agente, card));
  // Máquina do CEO (salas liberadas em ⋯ → Máquina): terminal com aprovação por comando e controle por sessão.
  if (podeUsarMaquina(agente, "terminal")) ferramentas.push(ferramentaDeTerminal(agente, card));
  if (podeUsarMaquina(agente, "controle")) ferramentas.push(ferramentaDeControle(agente, card));
  if (wt) {
    ferramentas.push(...ferramentasDeProjeto(wt.caminho), ...ferramentasDeEscrita(wt));
    if (agente.ferramentas.includes("terminal")) ferramentas.push(ferramentaDeComando(wt));
  } else if (projeto) ferramentas.push(...ferramentasDeProjeto(projeto.caminho));
  // Treinamento e QA de tela: prints do app rodando na máquina do CEO.
  if (projeto?.urlLocal && agente.ferramentas.includes("playwright")) ferramentas.push(ferramentaDeCaptura(card.id, projeto.urlLocal));
  // Navegador do sistema: quem pesquisa na web, testa telas ou usa o navegador.
  if (["navegador", "web", "playwright"].some((f) => agente.ferramentas.includes(f as Agent["ferramentas"][number]))) {
    ferramentas.push(ferramentaDeNavegador(card.id, agente.id, projeto?.urlLocal ?? null));
  }
  // Celular de teste (iPhone no Simulador, Android no emulador): QA, Mobile e Treinamento.
  if (agente.ferramentas.includes("celular")) ferramentas.push(ferramentaDeCelular(agente, card, [wt?.caminho, projeto?.caminho].filter((c): c is string => !!c)));

  const r = await rodarAgente({
    client,
    modelo: agente.modelo,
    sistema: sistemaAutor(agente),
    mensagem: mensagemExecutar(card),
    imagens: imagensDoTexto(card.descricao),
    ferramentas,
    cardId: card.id,
    maxRodadas: wt ? 40 : undefined,
    lembrete: "Você ainda não chamou entregar. Chame entregar agora com o trabalho completo (ou perguntar_ao_ceo, se for indispensável).",
  }).finally(() => desligarCelular(card.id));

  // Parou depois do rascunho, sem a chamada final: o rascunho vale como entrega.
  const r0 = rascunho as { resumo: string; conteudo: string } | null;
  if (!entregou && r0 && !lerCard(card.id).bloqueado) {
    registrarEntrega(card.id, agente.id, r0.resumo, wt ? await comCodigo(wt, agente.id, card, r0.resumo, r0.conteudo) : r0.conteudo);
    entregou = true;
  }
  // Sem chamar entregar, mas com texto: o texto vira a entrega, para não perder trabalho.
  if (!entregou && !lerCard(card.id).bloqueado) {
    if (!r.texto.trim()) throw new Error("O agente terminou sem entregar.");
    registrarEntrega(card.id, agente.id, "Entrega (texto final do agente)", r.texto);
    entregou = true;
  }
  if (!entregou) return;

  card = lerCard(card.id);
  postFeed(card.sala, agente.id, `${agente.nome} entregou o ${card.chave}`);
  if (card.validador) {
    // Código do Squad 1: vai para a etapa de validação atual (review, performance, segurança ou QA).
    const etapa = etapaDoCodigo(card);
    if (etapa !== null && card.validador !== etapasDoCodigo[etapa]!.validador) {
      card = editarCard(card.id, { validador: etapasDoCodigo[etapa]!.validador });
    }
    const coluna = etapa !== null ? etapasDoCodigo[etapa]!.coluna : colunaDeValidacao(card.fluxo, card.sala);
    if (coluna) card = mover(card.id, coluna, agente.id);
    marcarValidacao(card.id, true);
  } else {
    finalizar(card, agente.id);
  }
}

/** Ferramentas reais das demais áreas (Fase 6), conforme quem é o agente e o card. */
const COM_INFRA = new Set(["devops", "sre", "sysadmin", "engenheiro-cloud", "redes", "appsec", "pentester", "seo", "web-content", "cto"]);
function ferramentasDaArea(agente: Agent, card: Card): Ferramenta[] {
  const out: Ferramenta[] = [...ferramentasDeFinancas(agente.id), ...ferramentasDeAtendimento(card)];
  if (COM_INFRA.has(agente.id)) out.push(...ferramentasDeInfra());
  if (agente.ferramentas.includes("banco-de-dados") && card.projetoId !== null && conexaoDoProjeto(card.projetoId)) out.push(ferramentaDeBanco(card.projetoId));
  return out;
}

/** Cards que mexem no código do projeto: trabalho do Desenvolvimento e bugs. */
const ehCardDeCodigo = (c: Card) => c.fluxo === "software" && (c.sala === "desenvolvimento" || c.tipo === "bug");

/** Commit automático da entrega e o resumo do que mudou, anexado ao texto da entrega. */
async function comCodigo(wt: Worktree, autor: string, card: Card, resumo: string, conteudo: string): Promise<string> {
  const sha = await commitar(wt, autor, `${card.chave}: ${resumo}`);
  const c = await codigoDoCard(card);
  return `${conteudo}

---
**Código:** branch \`${wt.branch}\`${sha ? `, commit ${sha}` : " (nenhuma mudança nesta versão)"}

\`\`\`
${c?.stat || "(sem mudanças desde o início)"}
\`\`\``;
}

/** Qual checklist o validador usa: o da especialidade da etapa (código) ou o da área do card. */
function focoDaEtapa(card: Card) {
  const etapa = etapaDoCodigo(card);
  return etapa === null ? undefined : etapasDoCodigo[etapa]!.foco;
}

const liderDe = (sala: RoomId) =>
  Object.values(agentById).find((a) => a.sala === sala && a.lider)?.id ?? Object.values(agentById).find((a) => a.sala === sala)!.id;

/* ---------- Validar ---------- */

/* ---------- Advogado do diabo ---------- */

/** Entregas importantes: efeito externo ou dinheiro (N2/N3), épicos e urgências. */
const importante = (c: Card) => c.nivel === "N2" || c.nivel === "N3" || c.tipo === "epico" || c.prioridade === "P0";

/** Um sênior de fora da conversa entre autor e validador, com repertório para questionar aquele tipo de entrega. */
function escolherAdvogado(card: Card, validador: Agent): Agent | undefined {
  const tecnica = ["arquitetura", "desenvolvimento", "code-review", "qa", "seguranca", "devops", "dados", "infraestrutura"].includes(card.sala);
  const negocio = ["marketing", "comercial", "cs"].includes(card.sala);
  const candidatos = tecnica ? ["cto", "arquiteto", "appsec"] : negocio ? ["cmo", "pmm", "financeiro"] : ["chief-of-staff", "cto", "cmo"];
  return candidatos.map((id) => agentById[id]).find((a) => a && a.id !== card.dono && a.id !== validador.id);
}

/** Já existe questionamento para a versão atual da entrega? (No código, só a primeira etapa questiona.) */
function jaQuestionado(card: Card) {
  const entrega = ultimaEntrega(card.id);
  if (!entrega) return true;
  return listarComentarios(card.id).some((c) => c.tipo === "critica" && c.ts >= entrega.ts);
}

async function advogadoDoDiabo(client: Anthropic, card: Card, validador: Agent) {
  const advogado = escolherAdvogado(card, validador);
  if (!advogado) return;
  const autor = card.dono ? agentById[card.dono] : undefined;
  focus(card.sala, advogado.id);
  setAgentStatus(advogado.id, "em-reuniao", `Questionando as premissas do ${card.chave}`, autor?.id ?? null);
  try {
    const r = await rodarAgente({
      client,
      modelo: advogado.modelo,
      sistema: sistemaAdvogado(advogado, card.sala),
      mensagem: mensagemAdvogado(card),
      ferramentas: [],
      cardId: card.id,
      esforco: "medium",
      exigeFerramenta: false,
      lembrete: "",
      maxRodadas: 1,
    });
    const critica = r.texto.trim();
    if (critica) {
      comentar(card.id, advogado.id, "critica", critica.slice(0, 8000));
      postFeed(card.sala, advogado.id, `${advogado.nome} questionou as premissas do ${card.chave} antes da validação`);
    }
  } finally {
    setAgentStatus(advogado.id, "ocioso", null);
  }
}

/* ---------- Validar ---------- */

async function validar(client: Anthropic, inicial: Card, validador: Agent) {
  const card = inicial;
  if (configCritica().advogado && importante(card) && !jaQuestionado(card)) await advogadoDoDiabo(client, card, validador);
  const autor = card.dono ? agentById[card.dono] : undefined;
  focus(card.sala, validador.id);
  setAgentStatus(validador.id, "validando", `Validando ${card.chave}`, autor?.id ?? null);
  if (autor) setAgentStatus(autor.id, "em-reuniao", `Apresentando ${card.chave} para ${validador.nome}`, validador.id);

  let decisao: { tipo: "aprovar" | "devolver"; texto: string } | null = null;
  const ferramentas: Ferramenta[] = [
    ferramenta(
      "aprovar",
      "Aprova a entrega: ela está pronta para seguir. Termina a validação.",
      { parecer: { type: "string", description: "O que você conferiu e por que está bom" } },
      ["parecer"],
      (e) => {
        decisao = { tipo: "aprovar", texto: texto(e, "parecer", 5000) };
        return { texto: "Aprovado.", fim: true };
      },
    ),
    ferramenta(
      "devolver",
      "Devolve a entrega para o autor ajustar. Termina a validação.",
      { motivos: { type: "string", description: "Motivos numerados, específicos e acionáveis" } },
      ["motivos"],
      (e) => {
        decisao = { tipo: "devolver", texto: texto(e, "motivos", 10_000) };
        return { texto: "Devolvido ao autor.", fim: true };
      },
    ),
  ];
  const projeto = fichaDoProjeto(card.projetoId);
  // Código: o validador lê a branch do card, vê o diff e (QA, performance, segurança) roda os testes.
  const wt = worktreeDoCard(card);
  let mensagem = mensagemValidar(card);
  if (wt) {
    ferramentas.push(...ferramentasDeProjeto(wt.caminho), ferramentaDeDiff(card.id));
    if (validador.ferramentas.includes("terminal")) ferramentas.push(ferramentaDeComando(wt));
    if (projeto?.urlLocal && validador.id.startsWith("qa")) ferramentas.push(ferramentaDeNavegador(card.id, validador.id, projeto.urlLocal));
    const c = await codigoDoCard(card);
    if (c) mensagem += `

## Código desta entrega (branch ${c.branch})
\`\`\`
${c.stat}
\`\`\`

\`\`\`diff
${c.patch.slice(0, 20_000)}
\`\`\`${validador.ferramentas.includes("terminal") ? "\n\nRode os testes com rodar_comando antes de decidir." : ""}`;
  } else if (projeto) ferramentas.push(...ferramentasDeProjeto(projeto.caminho));

  await rodarAgente({
    client,
    modelo: validador.modelo,
    sistema: sistemaValidador(validador, card.sala, focoDaEtapa(card), card.dono),
    mensagem,
    imagens: imagensDoTexto(card.descricao),
    maxRodadas: wt ? 24 : undefined,
    ferramentas,
    cardId: card.id,
    lembrete: "Você ainda não decidiu. Chame aprovar ou devolver agora.",
  });

  const d = decisao as { tipo: "aprovar" | "devolver"; texto: string } | null;
  if (!d) throw new Error("O validador terminou sem aprovar nem devolver.");

  if (d.tipo === "devolver") {
    const devolvido = registrarDevolucao(card.id, validador.id, d.texto, colunaDeTrabalho(card.fluxo, card.sala));
    postFeed(card.sala, validador.id, `${validador.nome} devolveu o ${card.chave} (rodada ${devolvido.devolucoes})`);
    // O código passa por 4 etapas: tem mais rodadas antes de subir para o CEO.
    if (devolvido.devolucoes >= (etapaDoCodigo(card) !== null ? MAX_RODADAS + 2 : MAX_RODADAS)) {
      comentar(card.id, "chief-of-staff", "comentario", `Sem consenso depois de ${MAX_RODADAS} rodadas entre o autor e ${validador.nome}. Decida você: aprove a última versão ou devolva com a sua orientação.`);
      mover(card.id, "aguardando-ceo", "chief-of-staff");
    }
    return;
  }

  comentar(card.id, validador.id, "aprovacao", d.texto);
  marcarValidacao(card.id, false);
  postFeed(card.sala, validador.id, `${validador.nome} aprovou o ${card.chave}`);

  // Código do Squad 1: segue para a próxima etapa (performance → segurança → QA).
  const atual = lerCard(card.id);
  const etapa = etapaDoCodigo(atual);
  if (etapa !== null && etapa < etapasDoCodigo.length - 1) {
    const prox = etapasDoCodigo[etapa + 1]!;
    editarCard(atual.id, { validador: prox.validador });
    mover(atual.id, prox.coluna, validador.id);
    marcarValidacao(atual.id, true);
    postFeed(atual.sala, validador.id, `${atual.chave} seguiu para ${agentById[prox.validador]!.nome} (${prox.foco})`);
    return;
  }
  finalizar(atual, validador.id);
}

/** Depois da validação: N0 conclui; o resto vai para a aprovação do CEO. */
function finalizar(card: Card, quem: string) {
  if (card.nivel === "N0") {
    const concluido = mover(card.id, fluxos[card.fluxo].aprovarPara, quem);
    postFeed(card.sala, quem, `${card.chave} concluído (N0, não precisa do CEO)`);
    void extrairLicao(concluido).catch((e) => console.error("Falha ao extrair lição:", e));
  } else {
    mover(card.id, "aguardando-ceo", quem);
    postFeed(card.sala, quem, `${card.chave} validado. Aguardando sua aprovação.`);
  }
}
