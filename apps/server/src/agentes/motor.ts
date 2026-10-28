import Anthropic from "@anthropic-ai/sdk";
import {
  colunaDe, colunaDeEntrada, colunaDeTrabalho, colunaDeValidacao, ehCardDeCodigo, fluxoDaSala, fluxos, prioridades, type Agent, type Card, type EstadoMotor,
  type FluxoId, type ProvedorIa, type RoomId, type TrabalhoEmAndamento, fluxoPadrao, colunaDoCeo } from "@empresa/shared";
import { agentById, roomById, nomeDaSala, agentesDe, coordenadorDe, escritorioDe, etapaDoCodigoDe, etapasDoCodigoDe, projetoDoCard, SEDE } from "@empresa/org";
import { emit, focus, postChat, postFeed, setAgentStatus } from "../bus.ts";
import { clienteClaude, custoHoje, limitePorCard, modoCusto, orcamentoDiario, limitePorCardDeCodigo } from "../custo.ts";
import { foraDoArAte, marcarForaDoAr, modeloDisponivel, modeloDoAgente, provedorDe, provedorForaDoAr } from "../provedores.ts";
import { ErroNaoCabe, ErroProvedor } from "./compat.ts";
import { db, getSetting, setSetting } from "../db.ts";
import { fichaDoProjeto } from "../projetos.ts";
import { configCritica, criarConhecimento, extrairLicao } from "../conhecimento.ts";
import { conferirEntregaDeLead, ferramentasDeProspeccao } from "../prospeccao.ts";
import { codigoDoCard, commitar, g as gitEm, garantirCopiaDeReferencia, garantirWorktree, registroDoCard, worktreeDoCard, type Worktree } from "../fabrica/workspace.ts";
import { ferramentaDeComando, ferramentaDeDiff, ferramentasDeEscrita } from "../fabrica/ferramentas.ts";
import { ferramentaDeCaptura, ferramentaGerarImagem } from "../fabrica/capturas.ts";
import { execucoesDoCard } from "../confianca/execucoes.ts";
import { ambienteAtivo, ferramentasDeAmbiente, HOST_DO_AMBIENTE } from "../fabrica/ambiente.ts";
import { ferramentaDeNavegador } from "../fabrica/navegador.ts";
import { imagensDoTexto } from "../imagens.ts";
import { arquivosDoTexto, ferramentaGerarArquivo } from "../arquivos.ts";
import { ferramentaMemoria } from "../memoria.ts";
import { ferramentaPrevia, urlDaPrevia } from "../fabrica/previa.ts";
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
  comentar, criarCard, decisaoDoCeo, destravarCardsNoTeto, PREFIXO_PILOTO, editarCard, ErroCard, ETIQUETA_LIMITE, lerCard, listarCards, listarComentarios, listarEntregas, marcarValidacao, mover, registrarDevolucao, registrarEntrega, repassadosEm, tetoDoCard,
  ultimaEntrega,
} from "../tarefas.ts";
import { NO_MAC } from "../plataforma.ts";
import { podeVerificar } from "../fabrica/nuvem.ts";
import { ErroEntrada, ErroInterrompido, ErroLimiteCard, ErroOrcamentoProjeto, ErroSemEntrega, ErroSemOrcamento, ferramenta, ferramentasDeProjeto, ferramentasWeb, rodarAgente, texto, type Ferramenta } from "./loop.ts";
import { diferencaDeTexto, semelhanca } from "./diferenca.ts";
import { comandoDeTestes, testarCard, verificarCopia } from "../fabrica/testes.ts";
import { fecharSessao } from "../fabrica/navegador.ts";
import { modeloEscalonado, modeloMaisBarato, registrarResultadoAB, registrarSombra, sombraPct } from "../aprendizado.ts";
import { arquivosDoDiff, relatorioVarredura, varrerSegredos, verificarLicencas } from "../confianca/varredura.ts";
import { atacar, escolherAtacante, jaAtacado, precisaDeAtaque } from "../confianca/atacante.ts";
import { auditar } from "../confianca/auditoria.ts";
import { ETIQUETA_ORCAMENTO_PROJETO, projetoSemOrcamento } from "../planejamento.ts";
import { ferramentaDePesquisa } from "./pesquisa.ts";
import { ETIQUETA_PARTE, mensagemAdvogado, mensagemExecutar, mensagemValidar, sistemaAdvogado, sistemaAutor, sistemaValidador } from "./prompts.ts";

// Motor de agentes (Fase 2c). A cada poucos segundos olha a board e põe agentes
// livres para trabalhar nos cards prontos:
//   executar: o dono faz o trabalho e entrega;
//   validar:  o validador aprova (segue o fluxo) ou devolve (volta para o dono).
// Sem consenso depois de MAX_RODADAS devoluções, o card sobe para o CEO.

// 3, não 4: com advogado e validador convergindo (tudo de uma vez), a 4ª rodada quase só repetia custo.
const MAX_RODADAS = 3;
const INTERVALO_MS = 3000;
/** Pedidos a outras áreas: por vez de trabalho e profundidade (pedido de pedido de pedido…). */
const MAX_PEDIDOS_POR_VEZ = 3;
const MAX_PEDIDOS_POR_CARD = 6;
const MAX_PROFUNDIDADE = 2;
const MAX_PARTES = 4;

const emAndamento = new Map<number, TrabalhoEmAndamento>();
const controles = new Map<number, AbortController>();
const falhas = new Map<number, number>();
/**
 * O provedor pediu para esperar (limite de uso ou sobrecarga): fica fora do ar até lá, por provedor, e os agentes
 * dele usam o modelo reserva (modeloDoAgente). Só espera quem não tem reserva disponível.
 */
const esperaMs = new Map<ProvedorIa, number>();
const provedorDoAgente = (agenteId: string): ProvedorIa => provedorDe(modeloDoAgente(agentById[agenteId]!, "autor")).provedor;
let naFila = 0;
let semOrcamentoAntes = false;
let timer: NodeJS.Timeout | null = null;

/* ---------- Configuração e estado ---------- */

export function estadoMotor(): EstadoMotor {
  const orcamento = orcamentoDiario();
  return {
    pausado: getSetting("motor_pausado") === "1",
    semOrcamento: custoHoje() >= orcamento,
    orcamentoDiarioUsd: orcamento,
    maxSimultaneos: Number(getSetting("motor_max_simultaneos") ?? "3"),
    emAndamento: [...emAndamento.values()],
    naFila,
    // O cabeçalho mostra "Esperando a API" quando o principal (Claude) espera; os outros avisam no feed.
    esperandoApiAte: foraDoArAte("claude"),
    modoCusto: modoCusto(),
    limiteCardUsd: limitePorCard(),
    limiteCodigoUsd: limitePorCardDeCodigo(),
  };
}

/* ---------- Modo plano ---------- */

/** Card marcado: o agente primeiro propõe um plano (só lendo), o card para e o CEO aprova ou ajusta comentando. */
export const ETIQUETA_PLANO = "plano-primeiro";
const PREFIXO_PLANO = "📋 Plano proposto";
/** Ferramentas que esperam o plano ser aprovado (mexem em arquivos, sobem ambientes ou entregam). */
const DEPOIS_DO_PLANO = new Set(["entregar", "escrever_arquivo", "editar_arquivo", "apagar_arquivo", "ambiente_subir", "ambiente_comando", "ambiente_descer", "dividir_em_partes", "pedir_para_outra_area", "rodar_comando"]);

export type EstadoDoPlano = { fase: "propor" } | { fase: "executar"; plano: string; ajustes: string[] };

/** Sem plano proposto: propor. Proposto: executar com o plano e o que o CEO comentou depois dele. */
export function estadoDoPlano(card: Card): EstadoDoPlano | null {
  if (!card.etiquetas.includes(ETIQUETA_PLANO)) return null;
  const coms = listarComentarios(card.id);
  const i = coms.map((c) => c.texto.startsWith(PREFIXO_PLANO)).lastIndexOf(true);
  if (i < 0) return { fase: "propor" };
  return {
    fase: "executar",
    plano: coms[i]!.texto.slice(coms[i]!.texto.indexOf("\n") + 1),
    ajustes: coms.slice(i + 1).filter((c) => c.autor === "voce" && c.tipo === "comentario").map((c) => c.texto),
  };
}

const PEDIR_PLANO = `

## Modo plano: proponha antes de fazer
Este card pede um plano antes da execução. Agora só leia e entenda (projeto, card, telas): não altere nada. Depois chame propor_plano com: o que vai fazer, em passos; os arquivos e telas que vai mexer; o que vai testar; riscos e dúvidas. O card para e o CEO aprova ou ajusta; só então você executa.`;

const comPlanoAprovado = (p: Extract<EstadoDoPlano, { fase: "executar" }>) => `

## Plano aprovado pelo CEO (siga)
${p.plano}${p.ajustes.length ? `

### Ajustes do CEO ao plano (valem mais que o plano)
${p.ajustes.map((a) => `- ${a}`).join("\n")}` : ""}`;

/* ---------- Conduzir no meio do trabalho ---------- */

const orientacoes = new Map<number, string[]>();

/**
 * Mensagem do CEO para um card cujo autor está trabalhando agora: entra na próxima rodada dele, sem reiniciar.
 * Devolve false se ninguém está executando o card (aí fica só como comentário, lido na próxima vez).
 */
export function orientarCard(cardId: number, texto: string): boolean {
  if (emAndamento.get(cardId)?.tipo !== "executar") return false;
  orientacoes.set(cardId, [...(orientacoes.get(cardId) ?? []), texto]);
  return true;
}
function pegarOrientacoes(cardId: number): string[] {
  const lista = orientacoes.get(cardId) ?? [];
  orientacoes.delete(cardId);
  return lista;
}

/** O CEO mexeu no card (moveu, bloqueou, trocou o responsável, apagou) ou pausou a empresa: quem estava nele para. */
export function interromper(cardId: number, motivo: string) {
  controles.get(cardId)?.abort(motivo);
  // O CEO mudou o card: a conversa salva de antes não vale mais.
  apagarRetomada(cardId);
}

/** Card que um agente acabou de passar para outro: espera a entrega em mãos no 3D antes de começar. */
function esperandoEntrega(cardId: number) {
  const liberaEm = repassadosEm.get(cardId);
  if (liberaEm === undefined) return false;
  if (Date.now() < liberaEm) return true;
  repassadosEm.delete(cardId);
  return false;
}

/** Lê outro card do mesmo escritório pelo número: descrição, critérios e a última entrega completa. */
function ferramentaLerCard(daqui: Card): Ferramenta {
  return ferramenta(
    "ler_card",
    "Lê outro card pelo número (ex.: EMP-12): título, coluna, descrição, critérios de aceite e a ÚLTIMA ENTREGA COMPLETA. Use quando precisar do texto inteiro de um plano, contrato, schema ou entrega de outra área (a busca na memória só traz trechos). Entregas longas vêm em partes de 60 mil caracteres: continue com a_partir_de.",
    { chave: { type: "string", description: "Número do card, ex.: EMP-12 ou 12" }, a_partir_de: { type: "integer", minimum: 0, description: "Caractere da entrega onde começar (para ler o resto de uma entrega longa)" } },
    ["chave"],
    (e) => {
      const n = Number(texto(e, "chave", 20).replace(/\D/g, ""));
      let alvo: Card;
      try {
        alvo = lerCard(n);
      } catch {
        throw new ErroEntrada(`Card ${e.chave} não encontrado.`);
      }
      if (escritorioDe(alvo.sala) !== escritorioDe(daqui.sala)) throw new ErroEntrada("Esse card é de outro escritório.");
      const ent = ultimaEntrega(alvo.id);
      const col = colunaDe(alvo.fluxo, alvo.coluna)?.nome ?? alvo.coluna;
      // Entrega longa em partes, avisando o que falta (antes era cortada em silêncio e o agente não sabia).
      const PARTE = 60_000;
      const ini = Math.min(Math.max(0, Number(e.a_partir_de) || 0), ent?.conteudo.length ?? 0);
      const trecho = ent ? ent.conteudo.slice(ini, ini + PARTE) : "";
      const resto = ent && ini + PARTE < ent.conteudo.length ? `\n\n(A entrega tem ${ent.conteudo.length} caracteres; você leu de ${ini} a ${ini + PARTE}. Para continuar, chame ler_card com a_partir_de: ${ini + PARTE}.)` : "";
      const cabecalho = `# ${alvo.chave} · ${alvo.titulo}\nColuna: ${col} · Responsável: ${alvo.dono ? (agentById[alvo.dono]?.nome ?? alvo.dono) : "—"}`;
      if (ini > 0) return { texto: `${cabecalho}\n\n## Última entrega (versão ${ent!.versao}), a partir do caractere ${ini}\n${trecho}${resto}` };
      return {
        texto: `${cabecalho}\n\n## Descrição\n${alvo.descricao || "(vazia)"}\n\n## Critérios de aceite\n${alvo.criterios || "(nenhum)"}\n\n## Última entrega${ent ? ` (versão ${ent.versao}): ${ent.resumo}\n${trecho}${resto}` : "\n(ainda sem entrega)"}`,
      };
    },
  );
}

/* ---------- Retomada depois de uma pausa por gasto ---------- */

// Quando o card para no limite de gasto (ou o orçamento do dia acaba), a conversa do agente fica salva.
// Ao liberar, ele continua dela, sem refazer leituras e raciocínio (o que já foi pago não se perde).
db.exec(`CREATE TABLE IF NOT EXISTS retomadas (
  card_id INTEGER NOT NULL, tipo TEXT NOT NULL, agente TEXT NOT NULL, modelo TEXT NOT NULL, mensagens TEXT NOT NULL, ts INTEGER NOT NULL,
  PRIMARY KEY (card_id, tipo)
)`);
const RETOMADA_VALE_MS = 3 * 24 * 60 * 60_000;

function salvarRetomada(cardId: number, tipo: "executar" | "validar", agente: string, modelo: string, mensagens: unknown[]) {
  const json = JSON.stringify(mensagens);
  if (json.length > 8_000_000) return; // grande demais (muitas imagens): recomeça do zero
  db.prepare("INSERT OR REPLACE INTO retomadas (card_id, tipo, agente, modelo, mensagens, ts) VALUES (?, ?, ?, ?, ?, ?)").run(cardId, tipo, agente, modelo, json, Date.now());
}

/** Só retoma o mesmo agente, no mesmo modelo (o raciocínio salvo é do modelo que o escreveu), há pouco tempo. */
function lerRetomada(cardId: number, tipo: "executar" | "validar", agente: string, modelo: string) {
  const r = db.prepare("SELECT agente, modelo, mensagens, ts FROM retomadas WHERE card_id = ? AND tipo = ?").get(cardId, tipo) as
    | { agente: string; modelo: string; mensagens: string; ts: number }
    | undefined;
  if (!r || r.agente !== agente || r.modelo !== modelo || Date.now() - r.ts > RETOMADA_VALE_MS) return null;
  const mensagens = JSON.parse(r.mensagens) as Anthropic.Beta.BetaMessageParam[];
  // O que você comentou depois da pausa (ex.: "contorne o problema") entra na conversa retomada.
  const novos = listarComentarios(cardId).filter((c) => decisaoDoCeo(c) && c.ts > r.ts && c.tipo === "comentario");
  if (novos.length) mensagens.push({ role: "user", content: `Comentários do CEO desde a pausa:\n${novos.map((c) => `- ${c.texto}`).join("\n")}` });
  return mensagens;
}

const apagarRetomada = (cardId: number) => db.prepare("DELETE FROM retomadas WHERE card_id = ?").run(cardId);

/** Etiqueta que liga o "melhor de N" num card de código. */
export const ETIQUETA_MELHOR_DE = "melhor-de-3";

/**
 * Melhor de N: o autor faz N tentativas ao mesmo tempo, cada uma na sua cópia (branch própria a partir
 * da mesma base). Cada tentativa passa pela verificação (tipos → lint → testes); vence a que passa com
 * o menor diff. A cópia do card vai para o commit da vencedora e as outras são apagadas.
 */
async function melhorDeN(client: Anthropic | null, card: Card, agente: Agent, wt: Worktree, n: number, sinal: AbortSignal) {
  const base = await gitEm(wt.caminho, "rev-parse", "HEAD");
  const modelo = modeloDoAgente(agente, "autor");
  postFeed(card.sala, agente.id, `${agente.nome} faz ${n} tentativas do ${card.chave} em paralelo; os testes escolhem a melhor`);
  const tentativas = await Promise.allSettled(
    Array.from({ length: n }, async (_, i) => {
      const v: Worktree = { ...wt, caminho: `${wt.caminho}-t${i + 1}`, branch: `${wt.branch}-t${i + 1}` };
      await gitEm(wt.repo, "worktree", "add", "-b", v.branch, v.caminho, base);
      let entrega: { resumo: string; conteudo: string } | null = null;
      const ferramentas: Ferramenta[] = [
        ferramentaMemoria,
        ferramentaLerCard(card),
        ...ferramentasDeProjeto(v.caminho),
        ...ferramentasDeEscrita(v),
        ...(agente.ferramentas.includes("terminal") ? [ferramentaDeComando(v)] : []),
        ferramenta("entregar", "Entrega esta tentativa (código já escrito na cópia + o que você fez). Termina a sua vez.", { resumo: { type: "string" }, conteudo: { type: "string" } }, ["resumo", "conteudo"], (e) => {
          entrega = { resumo: texto(e, "resumo", 300), conteudo: texto(e, "conteudo", 100_000) };
          return { texto: "Tentativa entregue.", fim: true };
        }),
      ];
      await rodarAgente({
        client,
        modelo,
        agenteId: agente.id,
        sistema: sistemaAutor(agente),
        mensagem: `${mensagemExecutar(card)}

(Esta é a tentativa ${i + 1} de ${n} feitas em paralelo, cada uma na sua cópia. Vence a que passar nas verificações com a mudança mais enxuta: faça o necessário, sem sobras.)`,
        ferramentas,
        cardId: card.id,
        sinal,
        esforco: "high",
        maxRodadas: 40,
        lembrete: "Chame entregar com a sua tentativa.",
      });
      await commitar(v, agente.id, `${card.chave}: tentativa ${i + 1}`);
      const mudados = (await gitEm(v.caminho, "diff", "--name-only", `${base}..HEAD`).catch(() => "")).split("\n").filter(Boolean);
      const { r: verif } = await verificarCopia({ repo: wt.repo, caminho: v.caminho, base }, mudados);
      const stat = await gitEm(v.caminho, "diff", "--shortstat", `${base}..HEAD`).catch(() => "");
      const linhas = [...stat.matchAll(/(\d+) (insert|delet)/g)].reduce((s, m) => s + Number(m[1]), 0);
      return { i, v, entrega: entrega as { resumo: string; conteudo: string } | null, passou: !!verif?.passou, falha: verif && !verif.passou ? verif.comando : null, linhas };
    }),
  );
  const ok = tentativas.flatMap((t) => (t.status === "fulfilled" ? [t.value] : []));
  const venc = [...ok.filter((t) => t.passou && t.entrega)].sort((a, b) => a.linhas - b.linhas)[0] ?? ok.find((t) => t.entrega) ?? null;
  if (venc) await gitEm(wt.caminho, "reset", "--hard", await gitEm(venc.v.caminho, "rev-parse", "HEAD"));
  // Placar no card e limpeza das cópias das tentativas (as branches também: o código vencedor está na do card).
  const placar = tentativas.map((t, i) =>
    t.status === "rejected"
      ? `- Tentativa ${i + 1}: não terminou (${String((t.reason as Error)?.message ?? t.reason).slice(0, 120)})`
      : `- Tentativa ${i + 1}: ${t.value.passou ? "✅ passou" : `❌ falhou em \`${t.value.falha ?? "?"}\``}, ${t.value.linhas} linhas${venc && t.value.i === venc.i ? " — **vencedora**" : ""}`,
  );
  comentar(card.id, agente.id, "comentario", `Melhor de ${n}:\n${placar.join("\n")}`);
  for (let i = 0; i < n; i++) {
    await gitEm(wt.repo, "worktree", "remove", "--force", `${wt.caminho}-t${i + 1}`).catch(() => {});
    await gitEm(wt.repo, "branch", "-D", `${wt.branch}-t${i + 1}`).catch(() => {});
  }
  if (!venc) {
    const erro = tentativas.find((t) => t.status === "rejected") as PromiseRejectedResult | undefined;
    if (erro) throw erro.reason;
  }
  return venc?.entrega ?? null;
}

/**
 * Teste sombra: um modelo mais barato refaz o card (já aprovado) só com ferramentas de leitura, e um juiz compara
 * as duas entregas contra os critérios. Não mexe em nada; só gera a estatística para sugerir economia.
 */
async function testeSombra(cardId: number, agenteId: string) {
  const card = lerCard(cardId);
  const agente = agentById[agenteId]!;
  const real = ultimaEntrega(cardId);
  const modeloReal = modeloDoAgente(agente, "autor");
  const barato = modeloMaisBarato(modeloReal);
  if (!real || !barato) return;
  let sombra = "";
  const r = await rodarAgente({
    modelo: barato,
    agenteId,
    sistema: sistemaAutor(agente),
    mensagem: mensagemExecutar({ ...card, devolucoes: 0 }).split("## Sua entrega anterior")[0]!,
    ferramentas: [
      ferramentaMemoria,
      ferramentaLerCard(card),
      ferramenta("entregar", "Entrega o trabalho.", { resumo: { type: "string" }, conteudo: { type: "string" } }, ["resumo", "conteudo"], (e) => {
        sombra = texto(e, "conteudo", 100_000);
        return { texto: "Ok.", fim: true };
      }),
    ],
    lembrete: "Chame entregar com o trabalho completo.",
    maxRodadas: 8,
    // Sombra no modelo local: contexto maior só aqui, e sem cair para o Claude (a sombra não pode gastar).
    ...(barato.startsWith("ollama:") ? { contexto: 65_536, semReserva: true } : {}),
  });
  if (!sombra) return;
  let veredito: { resultado: "melhor" | "empate" | "pior"; justificativa: string } | null = null;
  // As duas entregas vão sem dizer qual é qual (A e B em ordem sorteada), para o juiz não favorecer a "oficial".
  const inverte = Math.random() < 0.5;
  const [a, b] = inverte ? [sombra, real.conteudo] : [real.conteudo, sombra];
  await rodarAgente({
    modelo: "claude-sonnet-5-5",
    agenteId: "chief-of-staff",
    esforco: "low",
    sistema: "Você compara duas entregas para o mesmo card, contra a descrição e os critérios de aceite. Seja objetivo: qualidade, completude e correção. Português do Brasil.",
    mensagem: `# ${card.titulo}
${card.descricao.slice(0, 4000)}

## Critérios
${card.criterios || "(nenhum)"}

## Entrega A
${a.slice(0, 30_000)}

## Entrega B
${b.slice(0, 30_000)}

Chame comparar dizendo se B é melhor, igual ou pior que A.`,
    ferramentas: [
      ferramenta("comparar", "Compara B contra A.", { b_em_relacao_a_a: { type: "string", enum: ["melhor", "empate", "pior"] }, justificativa: { type: "string" } }, ["b_em_relacao_a_a", "justificativa"], (e) => {
        const v = String(e.b_em_relacao_a_a) as "melhor" | "empate" | "pior";
        // Resultado sempre do ponto de vista da sombra (o modelo barato).
        const daSombra = inverte ? ({ melhor: "pior", empate: "empate", pior: "melhor" } as const)[v] : v;
        veredito = { resultado: daSombra ?? "empate", justificativa: texto(e, "justificativa", 2000) };
        return { texto: "Ok.", fim: true };
      }),
    ],
    lembrete: "Chame comparar.",
    maxRodadas: 3,
  });
  const v = veredito as { resultado: "melhor" | "empate" | "pior"; justificativa: string } | null;
  if (v) registrarSombra({ cardId, agente: agenteId, modeloReal, modeloBarato: barato, resultado: v.resultado, custoBarato: r.custoUsd, justificativa: v.justificativa });
}

const ocupado = (agenteId: string) => [...emAndamento.values()].some((t) => t.agenteId === agenteId);

const publicar = () => emit({ type: "motor", estado: estadoMotor() });

export function configurarMotor(c: { pausado?: boolean; orcamentoDiarioUsd?: number; maxSimultaneos?: number; modoCusto?: string; limiteCardUsd?: number; limiteCodigoUsd?: number }) {
  if (c.modoCusto === "economico" || c.modoCusto === "equilibrado" || c.modoCusto === "maximo") setSetting("modo_custo", c.modoCusto);
  if (typeof c.limiteCardUsd === "number" && c.limiteCardUsd >= 0.1 && c.limiteCardUsd <= 200) setSetting("motor_limite_card_usd", String(c.limiteCardUsd));
  if (typeof c.limiteCodigoUsd === "number" && c.limiteCodigoUsd >= 0.1 && c.limiteCodigoUsd <= 500) setSetting("motor_limite_codigo_usd", String(c.limiteCodigoUsd));
  if (typeof c.pausado === "boolean") setSetting("motor_pausado", c.pausado ? "1" : "0");
  if (c.pausado === true) for (const ctl of controles.values()) ctl.abort("a empresa foi pausada");
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

/** Dependências satisfeitas: todos os cards de que este depende (um ou vários) já estão concluídos. */
function dependenciaOk(card: Card, porId: Map<number, Card>) {
  const deps = [...(card.dependeDe ? [card.dependeDe] : []), ...(card.dependencias ?? [])];
  return deps.every((id) => {
    const dep = porId.get(id);
    return !dep || tipoColuna(dep) === "feito";
  });
}

/**
 * Os agentes só trabalham nas etapas ANTES da aprovação do CEO. Depois dela
 * (ex.: Comercial "Contatado", "Reunião") quem conduz é você.
 */
function antesDoCeo(card: Card) {
  const cols = fluxos[card.fluxo]!.colunas;
  return cols.findIndex((c) => c.id === card.coluna) < cols.findIndex((c) => c.tipo === "ceo");
}

/** Etiqueta dos cards abertos com pedir_para_outra_area (leads, chamados e bugs também têm pai, mas não são pedidos). */
export const ETIQUETA_PEDIDO = "pedido";

/** Pedidos deste card a outras áreas que ainda não terminaram (o que já foi validado e espera o CEO conta como pronto). */
export function filhosAbertos(cardId: number, cards: Iterable<Card>): Card[] {
  return [...cards].filter(
    (c) => c.paiId === cardId && c.etiquetas.includes(ETIQUETA_PEDIDO) && !["feito", "perdido", "ceo"].includes(tipoColuna(c) ?? ""),
  );
}

export function prontoParaExecutar(card: Card, porId: Map<number, Card>) {
  const tipo = tipoColuna(card);
  // QA, Segurança e Code review trabalham numa coluna de validação ("Em QA", "Segurança"): o card dessas
  // salas parado na própria coluna, sem estar em validação (ex.: devolvido), volta para o dono.
  const naColunaDaSala = tipo === "validacao" && card.coluna === colunaDeTrabalho(card.fluxo, card.sala);
  return (
    !card.demo && !card.bloqueado && !card.emValidacao && !!card.dono && card.coluna !== "backlog" &&
    (tipo === "fila" || tipo === "trabalho" || tipo === "bug" || naColunaDaSala) && antesDoCeo(card) && dependenciaOk(card, porId) &&
    // Quem pediu partes do trabalho a outras áreas espera elas terminarem para continuar com o resultado.
    !filhosAbertos(card.id, porId.values()).length
  );
}

/** Card que escreve no repositório: código da sala de código, ou trabalho de quem mexe em arquivos com git (Dados, DevOps, Cloud). */
const escreveCodigo = (card: Card, agente: Agent) =>
  ehCardDeCodigo(card) || (agente.ferramentas.includes("git") && agente.ferramentas.includes("arquivos") && card.sala !== "arquitetura" && agente.sala === card.sala);

/** Ferramentas de consulta e verificação que o validador precisa saber se o autor usou. */
const CONSULTAS = new Set(["ler_arquivo", "ver_imagem", "buscar_no_codigo", "listar_arquivos", "mapa_do_codigo", "ler_card", "capturar_telas", "ambiente_subir", "ambiente_comando", "rodar_comando", "gerar_imagem", "navegador"]);

/**
 * O que o autor consultou e rodou para fazer a versão atual, tirado do replay (registro do sistema, não da defesa
 * dele): o validador confere fatos antes de afirmar que algo não foi lido, visto ou testado.
 */
export function consultasDoAutor(card: Card): string {
  const desde = listarEntregas(card.id).at(-2)?.ts ?? 0;
  const linhas = execucoesDoCard(card.id)
    .filter((x) => x.agente === card.dono && x.fim >= desde)
    .flatMap((x) => x.passos)
    .filter((p) => p.tipo === "ferramenta" && p.nome && CONSULTAS.has(p.nome))
    .map((p) => {
      let alvo = "";
      try {
        const e = JSON.parse(p.entrada ?? "{}") as Record<string, unknown>;
        alvo = String(e.caminho ?? e.texto ?? e.chave ?? e.comando ?? e.nome ?? e.arquivo ?? e.servico ?? "");
      } catch { /* entrada que não é JSON */ }
      return `- ${p.nome}${alvo ? `: ${alvo.replace(/\s+/g, " ").slice(0, 140)}` : ""}${p.erro ? " (deu erro)" : ""}`;
    });
  if (!linhas.length) return "";
  return `\n\n## O que o autor consultou e rodou nesta versão (registro do sistema)\n${[...new Set(linhas)].slice(0, 60).join("\n")}`;
}

const NOTA_DA_REFERENCIA = `

## App rodando para você ver (cópia de referência)
Você tem uma cópia do projeto como ele está hoje e o Docker dos agentes para subir o app de verdade: ambiente_subir, ambiente_comando, ambiente_logs, ambiente_descer. Com ele no ar, use capturar_telas (http://${HOST_DO_AMBIENTE}:PORTA) para ver e printar as telas reais e se basear nelas. Você tem autonomia: se faltar banco, contas ou dados de teste, crie (compose e .env de TESTE com escrever_arquivo nessa cópia; contas e dados com ambiente_comando). Nada que você escrever nessa cópia vira commit, e o ambiente fica de pé para os próximos cards do projeto (veja com ambiente_logs antes de subir de novo).`;

/**
 * Imagens que o agente vê: as que você pôs no card, os prints da última entrega dele (o validador confere a tela,
 * o autor refaz em cima dela) e os dos cards de que ele depende (o frontend vê o protótipo). Até 6, as mais próximas primeiro.
 */
export function imagensDoCard(card: Card): string[] {
  const deps = [...(card.dependeDe ? [card.dependeDe] : []), ...(card.dependencias ?? [])];
  const textos = [card.descricao, ultimaEntrega(card.id)?.conteudo ?? "", ...deps.map((id) => ultimaEntrega(id)?.conteudo ?? "")];
  return imagensDoTexto(textos.join("\n"));
}

export function prontoParaValidar(card: Card) {
  return !card.demo && !card.bloqueado && card.emValidacao && !!card.validador;
}

/**
 * Card de apoio e o pai mexem na mesma cópia: um só executa quando o outro não está executando.
 * O filho espera a rodada do pai (a cópia ainda não tem os arquivos que o pai está escrevendo) e o pai
 * espera a do filho (os dois escreveriam nos mesmos arquivos ao mesmo tempo).
 */
export function esperaParente(card: Card, porId: Map<number, Card>, rodando: Iterable<TrabalhoEmAndamento>) {
  for (const t of rodando) {
    if (t.tipo !== "executar" || t.cardId === card.id) continue;
    if (t.cardId === card.paiId || porId.get(t.cardId)?.paiId === card.id) return true;
    // Partes do mesmo card também dividem a cópia: uma de cada vez, na ordem.
    const outro = porId.get(t.cardId);
    if (card.paiId && card.etiquetas.includes(ETIQUETA_PARTE) && outro?.paiId === card.paiId && outro.etiquetas.includes(ETIQUETA_PARTE)) return true;
  }
  return false;
}

async function ciclo() {
  const estado = estadoMotor();
  const client = clienteClaude();
  let cards = listarCards();
  // Você subiu o limite por card: quem tinha parado no limite antigo volta sozinho.
  if (destravarCardsNoTeto(cards)) cards = listarCards();
  const porId = new Map(cards.map((c) => [c.id, c]));
  const trabalhos = [
    ...cards.filter(prontoParaValidar).map((card) => ({ card, tipo: "validar" as const, agente: card.validador! })),
    ...cards
      .filter((c) => prontoParaExecutar(c, porId) && !esperandoEntrega(c.id) && !esperaParente(c, porId, emAndamento.values()))
      .map((card) => ({ card, tipo: "executar" as const, agente: card.dono! })),
  ]
    .filter((t) => !emAndamento.has(t.card.id))
    // Validações primeiro (destravam o fluxo), depois por prioridade e idade.
    .sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === "validar" ? -1 : 1) || peso(a.card) - peso(b.card) || a.card.criadoEm - b.card.criadoEm);

  const mudouFila = naFila !== trabalhos.length || semOrcamentoAntes !== estado.semOrcamento;
  naFila = trabalhos.length;
  semOrcamentoAntes = estado.semOrcamento;
  if (estado.pausado || estado.semOrcamento) {
    if (mudouFila) publicar();
    return;
  }

  const ocupados = new Set([...emAndamento.values()].map((t) => t.agenteId));
  for (const t of trabalhos) {
    if (emAndamento.size >= estado.maxSimultaneos) break;
    if (ocupados.has(t.agente) || !agentById[t.agente]) continue; // um card por agente de cada vez
    // O provedor deste agente está fora do ar e não há reserva disponível: espera.
    if (provedorForaDoAr(provedorDoAgente(t.agente))) continue;
    // Modelo local: um trabalho por vez. Dois cards se revezando descartam o cache do Ollama (e trocam o tamanho do
    // contexto, recarregando o modelo), e cada passo relê a conversa inteira do zero: ~2 min por passo em vez de segundos.
    if (provedorDoAgente(t.agente) === "ollama" && [...emAndamento.values()].some((e) => provedorDoAgente(e.agenteId) === "ollama")) continue;
    // De novo aqui: o pai pode ter começado neste mesmo ciclo, depois que a lista foi montada.
    if (t.tipo === "executar" && esperaParente(t.card, porId, emAndamento.values())) continue;
    // Sem chave do provedor do agente (Claude sem chave, OpenAI sem chave…): o card espera.
    if (!modeloDisponivel(modeloDoAgente(agentById[t.agente]!, "autor"))) continue;
    ocupados.add(t.agente);
    void rodar(client, t.card, t.tipo, t.agente);
  }
  if (mudouFila) publicar();
}

async function rodar(client: Anthropic | null, card: Card, tipo: "executar" | "validar", agenteId: string) {
  const controle = new AbortController();
  controles.set(card.id, controle);
  emAndamento.set(card.id, { cardId: card.id, agenteId, tipo, desde: Date.now() });
  naFila = Math.max(0, naFila - 1);
  publicar();
  try {
    // Projeto sem orçamento: nem começa (o card para e espera você aumentar o orçamento).
    if (projetoSemOrcamento(card.id)) throw new ErroOrcamentoProjeto("O projeto deste card chegou ao orçamento.");
    if (tipo === "executar") await executar(client, card, agentById[agenteId]!, controle.signal);
    else await validar(client, card, agentById[agenteId]!, controle.signal);
    falhas.delete(card.id);
    esperaMs.delete(provedorDoAgente(agenteId));
    apagarRetomada(card.id);
  } catch (err) {
    if (controle.signal.aborted || err instanceof ErroInterrompido) avisarInterrupcao(card.id, agenteId, String(controle.signal.reason ?? "interrompido"));
    else tratarFalha(card, agenteId, err);
  } finally {
    controles.delete(card.id);
    emAndamento.delete(card.id);
    // O QA terminou a vez: fecha o navegador do card para o vídeo do teste ficar pronto na atividade.
    if (agenteId.startsWith("qa")) void fecharSessao(card.id).catch(() => {});
    if (!ocupado(agenteId)) setAgentStatus(agenteId, "ocioso", null);
    if (tipo === "validar" && card.dono && !ocupado(card.dono)) setAgentStatus(card.dono, "ocioso", null);
    publicar();
  }
}

/** Parou no meio porque o CEO mexeu: fica registrado no card (se ele ainda existe). */
function avisarInterrupcao(cardId: number, agenteId: string, motivo: string) {
  try {
    lerCard(cardId);
  } catch {
    return; // card apagado
  }
  comentar(cardId, agenteId, "comentario", `Parei o que estava fazendo: ${motivo}.`);
}

/** Erros passageiros da API: limite de uso, sobrecarga, rede. Não são culpa do card. */
const passageiro = (err: unknown) =>
  err instanceof Anthropic.RateLimitError || err instanceof Anthropic.InternalServerError || err instanceof Anthropic.APIConnectionError ||
  (err instanceof Anthropic.APIError && (err.status === 529 || err.status === 503)) ||
  (err instanceof ErroProvedor && err.passageiro);

/** A conta da Anthropic ficou sem crédito: o Claude fica fora do ar por um tempo e os agentes vão para a reserva. */
export const semCreditoNaAnthropic = (err: unknown) =>
  err instanceof Anthropic.APIError && (err.status === 400 || err.status === 402) && /credit balance is too low|billing/i.test(err.message);
const ESPERA_SEM_CREDITO_MS = 30 * 60_000;
const ESPERA_NAO_CABE_MS = 5 * 60_000;

function tratarFalha(card: Card, agenteId: string, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  // O trabalho do card não cabe em nenhum modelo no ar: só ele espera um pouco; os outros cards seguem.
  if (err instanceof ErroNaoCabe) {
    repassadosEm.set(card.id, Date.now() + ESPERA_NAO_CABE_MS);
    postFeed(card.sala, agenteId, `${card.chave} espera um modelo com espaço: ${msg.slice(0, 160)}`);
    return;
  }
  // Sem crédito não é falha do card: o Claude sai do ar (os agentes seguem no Gemini ou no modelo local) e o CEO é avisado.
  if (semCreditoNaAnthropic(err)) {
    const avisar = !provedorForaDoAr("claude");
    marcarForaDoAr("claude", Date.now() + ESPERA_SEM_CREDITO_MS);
    if (avisar) {
      postChat("chief-of-staff", "A conta da Anthropic ficou sem crédito. Enquanto isso, a equipe segue nos modelos reserva (Gemini e o modelo local) e volta ao Claude sozinha quando houver crédito (tento de novo a cada 30 minutos). Para recarregar: console da Anthropic → Plans & Billing.");
      publicar();
    }
    return;
  }
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    configurarMotor({ pausado: true });
    postChat("chief-of-staff", "Pausei a empresa: a chave da API foi recusada. Confira a chave e despause no topo da tela.");
    return;
  }
  if (err instanceof ErroProvedor && (err.status === 401 || err.status === 403)) {
    // Chave de outro provedor recusada: só os agentes dele param; o resto da empresa segue no Claude.
    editarCard(card.id, { bloqueado: true });
    comentar(card.id, agenteId, "comentario", `${msg} Comente aqui para eu tentar de novo depois de corrigir.`);
    return;
  }
  if (err instanceof ErroLimiteCard) {
    const c = lerCard(card.id);
    editarCard(card.id, { bloqueado: true, etiquetas: [...new Set([...c.etiquetas, ETIQUETA_LIMITE])] });
    comentar(card.id, agenteId, "comentario", `Parei para não gastar demais: este card já custou US$ ${c.custoUsd.toFixed(2)} (teto: US$ ${tetoDoCard(c).toFixed(2)}). Clique em "Liberar mais" (aqui, na Caixa de entrada ou no Telegram) e eu continuo exatamente de onde parei.`);
    return;
  }
  if (err instanceof ErroSemOrcamento) {
    comentar(card.id, agenteId, "comentario", "Parei: o orçamento de IA de hoje acabou. Retomo quando houver orçamento.");
    return;
  }
  if (err instanceof ErroOrcamentoProjeto) {
    const c = lerCard(card.id);
    const o = projetoSemOrcamento(card.id);
    editarCard(card.id, { bloqueado: true, etiquetas: [...new Set([...c.etiquetas, ETIQUETA_ORCAMENTO_PROJETO])] });
    comentar(card.id, agenteId, "comentario", `Parei: o projeto${o ? ` ${o.projeto} já gastou US$ ${o.gasto.toFixed(2)} do orçamento de US$ ${o.orcamento.toFixed(2)}` : " chegou ao orçamento"}. Aumente o orçamento em Operação → Projetos e eu continuo de onde parei.`);
    return;
  }
  if (passageiro(err)) {
    // O provedor fica fora do ar (respeitando o retry-after, com recuo exponencial) e os agentes dele seguem no
    // modelo reserva; o card não é penalizado. ErroProvedor só vem de fora do Claude; os erros da Anthropic são do Claude.
    const p: ProvedorIa = err instanceof ErroProvedor ? provedorDoAgente(agenteId) : "claude";
    const pedido = Number((err as { headers?: { get?: (k: string) => string | null } }).headers?.get?.("retry-after"));
    const recuo = Math.min(Math.max((esperaMs.get(p) ?? 0) * 2, 15_000), 5 * 60_000);
    esperaMs.set(p, recuo);
    const ms = Number.isFinite(pedido) && pedido > 0 ? Math.max(pedido * 1000, recuo) : recuo;
    const avisar = !provedorForaDoAr(p);
    marcarForaDoAr(p, Date.now() + ms);
    const agente = agentById[agenteId];
    const reserva = agente ? modeloDoAgente(agente, "autor") : null;
    const enquanto = reserva && provedorDe(reserva).provedor !== p ? `${agente!.nome} segue com ${reserva.replace(/^(ollama|gemini|openai):/, "")} até lá` : "quem não tem reserva espera";
    if (avisar) postFeed(card.sala, agenteId, `O provedor de IA pediu para esperar (${msg.slice(0, 80)}). Volta a ser usado em ${Math.round(ms / 1000)} s; ${enquanto}.`);
    publicar();
    return;
  }
  // A API recusou o pedido (400): a conversa salva não serve mais; a próxima vez recomeça do zero.
  if (err instanceof Anthropic.BadRequestError) apagarRetomada(card.id);
  const n = (falhas.get(card.id) ?? 0) + 1;
  falhas.set(card.id, n);
  comentar(card.id, agenteId, "comentario", `Não consegui concluir agora: ${msg}`);
  if (n >= 2 || !(err instanceof Anthropic.APIError || err instanceof ErroProvedor || err instanceof ErroSemEntrega)) {
    editarCard(card.id, { bloqueado: true });
    comentar(card.id, agenteId, "comentario", "Bloqueei o card depois de falhar. Comente aqui para desbloquear e tentar de novo.");
    falhas.delete(card.id);
  }
}

/* ---------- Executar (autor) ---------- */

export { colunaDeEntrada } from "@empresa/shared";

async function executar(client: Anthropic | null, inicial: Card, agente: Agent, sinal: AbortSignal) {
  let card = inicial;
  const tipo = tipoColuna(card);
  if (tipo === "fila" || tipo === "bug") card = mover(card.id, colunaDeTrabalho(card.fluxo, card.sala), agente.id);
  focus(card.sala, agente.id);
  setAgentStatus(agente.id, agente.sala === "qa" ? "testando" : "trabalhando", `${card.chave}: ${card.titulo}`);
  postFeed(card.sala, agente.id, `${agente.nome} começou o ${card.chave}: ${card.titulo}`);

  // Fábrica de software (Fase 4): card de código num projeto com git trabalha numa cópia isolada.
  const projetoId = projetoDoCard(card);
  const projeto = fichaDoProjeto(projetoId);
  let wt: Worktree | null = null;
  if (projeto && projetoId !== null && escreveCodigo(card, agente)) {
    try {
      wt = await garantirWorktree(card, projeto.caminho, projetoId);
    } catch (e) {
      if (!(e instanceof ErroCard)) throw e;
      comentar(card.id, "devops", "comentario", `${e.message} Por enquanto o código vai só na entrega, sem rodar.`);
    }
  }

  // Escalonamento: o modelo sobe conforme o card falha; com "local primeiro", código verificável começa no local.
  const esc = modeloEscalonado(agente, "autor", card, !!wt && podeVerificar() && !!comandoDeTestes(wt.caminho));
  const modeloAutor = esc.modelo;
  // No modelo local (contexto curto) o card grande pode virar partes pequenas, uma vez só e nunca numa parte.
  const local = provedorDe(modeloAutor).provedor === "ollama";
  const podeDividir =
    local && !card.etiquetas.includes(ETIQUETA_PARTE) && profundidade(card) < MAX_PROFUNDIDADE &&
    !listarCards().some((c) => c.paiId === card.id && c.etiquetas.includes(ETIQUETA_PARTE));

  const plano = estadoDoPlano(card);

  let entregou = false;
  let dividiu = false;
  let propos = false;
  let pedidos = 0;
  // Autocrítica (Fase 2f): a primeira chamada de entregar vira rascunho; o agente confere
  // contra o checklist e chama de novo com a versão final.
  const autocritica = configCritica().autocritica;
  let rascunho: { resumo: string; conteudo: string } | null = null;
  const ferramentas: Ferramenta[] = [
    ferramentaMemoria,
    ferramentaLerCard(card),
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
        esperar_resultado: {
          type: "boolean",
          description: "true (padrão): você precisa do resultado para terminar; a sua entrega espera o pedido e você continua com ele. false: trabalho que segue em paralelo (ex.: bug aberto a partir de um atendimento, que não segura a resposta ao cliente).",
        },
      },
      ["titulo", "sala", "descricao"],
      (e) => {
        const sala = texto(e, "sala", 40) as RoomId;
        if (!roomById[sala]) return { texto: `Sala inválida: ${sala}`, erro: true };
        if (listarCards().filter((c) => c.paiId === card.id && c.etiquetas.includes(ETIQUETA_PEDIDO)).length >= MAX_PEDIDOS_POR_CARD) return { texto: `Este card já abriu ${MAX_PEDIDOS_POR_CARD} pedidos. Siga com o que tem ou use perguntar_ao_ceo.`, erro: true };
        if (pedidos >= MAX_PEDIDOS_POR_VEZ) return { texto: `Você já abriu ${MAX_PEDIDOS_POR_VEZ} pedidos neste card. Junte o que falta num pedido só ou siga com o que tem.`, erro: true };
        if (profundidade(card) >= MAX_PROFUNDIDADE) return { texto: "Este card já nasceu de um pedido de outro pedido. Resolva com a sua equipe ou use perguntar_ao_ceo.", erro: true };
        const dono = typeof e.dono === "string" && agentById[e.dono]?.sala === sala ? e.dono : liderDe(sala);
        const fluxo = fluxoPadrao(sala);
        const novo = criarCard(
          {
            titulo: texto(e, "titulo", 200), descricao: texto(e, "descricao", 20_000), sala, fluxo, coluna: colunaDeEntrada(fluxo),
            dono, nivel: card.nivel === "N0" ? "N0" : "N1", prioridade: card.prioridade, projetoId: card.projetoId, paiId: card.id,
            // Só os pedidos que seguram a entrega levam a etiqueta; atendimento nunca segura a resposta ao cliente.
            etiquetas: (typeof e.esperar_resultado === "boolean" ? e.esperar_resultado : !card.etiquetas.includes("atendimento")) ? [ETIQUETA_PEDIDO] : [],
          },
          agente.id,
        );
        pedidos++;
        comentar(card.id, agente.id, "comentario", `Pedi para ${nomeDaSala(sala)}: ${novo.chave} — ${novo.titulo}`);
        return { texto: `Card ${novo.chave} criado para ${nomeDaSala(sala)}.` };
      },
    ),
  ];
  if (plano?.fase === "propor") {
    ferramentas.push(
      ferramenta(
        "propor_plano",
        "Registra o seu plano para o CEO aprovar antes da execução. Termina a sua vez; o card para até o CEO responder.",
        { plano: { type: "string", description: "Passos, arquivos e telas que vai mexer, o que vai testar, riscos e dúvidas (Markdown)" } },
        ["plano"],
        (e) => {
          const texto_ = texto(e, "plano", 20_000);
          comentar(card.id, agente.id, "comentario", `${PREFIXO_PLANO}
${texto_}`);
          editarCard(card.id, { bloqueado: true });
          postChat(agente.id, `Propus o plano do ${card.chave} (${card.titulo}). Aprove ou ajuste comentando no card: aí eu executo.`);
          propos = true;
          return { texto: "Plano registrado. O card espera o CEO.", fim: true };
        },
      ),
    );
  }
  if (podeDividir) {
    ferramentas.push(
      ferramenta(
        "dividir_em_partes",
        `Divide este card em 2 a ${MAX_PARTES} partes menores, feitas por você, uma de cada vez e validadas cada uma. Quando todas terminarem, você volta a este card para juntar o resultado. Termina a sua vez.`,
        {
          partes: {
            type: "array",
            description: "Na ordem em que devem ser feitas",
            items: {
              type: "object",
              properties: {
                titulo: { type: "string" },
                descricao: { type: "string", description: "O que fazer, onde e em que se basear: completo, para ser feito sem ler este card" },
                criterios: { type: "string", description: "Critérios de aceite verificáveis desta parte" },
              },
              required: ["titulo", "descricao"],
            },
          },
        },
        ["partes"],
        (e) => {
          const lista = (Array.isArray(e.partes) ? e.partes : []).filter(
            (p): p is { titulo: string; descricao: string; criterios?: unknown } => !!p && typeof p.titulo === "string" && p.titulo.trim() !== "" && typeof p.descricao === "string" && p.descricao.trim() !== "",
          );
          if (lista.length < 2 || lista.length > MAX_PARTES) return { texto: `Mande de 2 a ${MAX_PARTES} partes, cada uma com titulo e descricao.`, erro: true };
          // O modelo costuma repetir "Parte 1:" no título; o prefixo já diz qual parte é.
          const titulos = lista.map((p) => p.titulo.trim().replace(/^parte\s*\d+\s*[:.\-–]\s*/i, "").slice(0, 160));
          const criadas = lista.map((p, i) =>
            criarCard(
              {
                titulo: `${card.chave} · parte ${i + 1}/${lista.length}: ${titulos[i]}`,
                descricao: p.descricao.slice(0, 20_000),
                criterios: typeof p.criterios === "string" ? p.criterios.slice(0, 5000) : card.criterios,
                sala: card.sala, fluxo: card.fluxo, coluna: colunaDeEntrada(card.fluxo),
                dono: agente.id, nivel: card.nivel, prioridade: card.prioridade, projetoId: card.projetoId, paiId: card.id,
                etiquetas: [ETIQUETA_PEDIDO, ETIQUETA_PARTE],
              },
              agente.id,
            ),
          );
          // Cada parte sabe das outras (lê com ler_card o que as anteriores entregaram).
          const roteiro = criadas.map((c, i) => `${i + 1}. ${c.chave}: ${titulos[i]}`).join("\n");
          // A descrição que o modelo local escreve costuma ser curta: a parte leva junto o contexto do card principal.
          for (const c of criadas) editarCard(c.id, { descricao: descricaoDaParte(c.descricao, card, roteiro) });
          dividiu = true;
          comentar(card.id, agente.id, "comentario", `Dividi este card em ${criadas.length} partes para caber no modelo local:\n${roteiro}\nQuando todas terminarem, volto aqui para juntar o resultado.`);
          postFeed(card.sala, agente.id, `${agente.nome} dividiu o ${card.chave} em ${criadas.length} partes`);
          return { texto: `Partes criadas: ${criadas.map((c) => c.chave).join(", ")}. Este card espera por elas.`, fim: true };
        },
      ),
    );
  }
  if (agente.ferramentas.includes("web") || card.etiquetas.includes("prospeccao")) ferramentas.push(...ferramentasWeb);
  ferramentas.push(...ferramentasDeProspeccao(card, agente.id), ...ferramentasDeMarketing(card), ...ferramentasDaArea(agente, card));
  // Conectores MCP liberados para a sala (Gmail, GitHub, Stripe…): leitura direta, ações com a aprovação do CEO.
  ferramentas.push(...ferramentasDeConectores(agente, card));
  // Máquina do CEO (salas liberadas em ⋯ → Máquina): terminal com aprovação por comando e controle por sessão.
  if (podeUsarMaquina(agente, "terminal")) ferramentas.push(ferramentaDeTerminal(agente, card));
  if (podeUsarMaquina(agente, "controle")) ferramentas.push(ferramentaDeControle(agente, card));
  // Card que não mexe no código mas nasceu de um card de código: lê a cópia do pai, com o trabalho em andamento.
  const wtDoPai = wt ? null : worktreeDoCard(card);
  if (wt) {
    ferramentas.push(...ferramentasDeProjeto(wt.caminho, { enxuto: local }), ...ferramentasDeEscrita(wt));
    if (podeVerificar() && agente.ferramentas.includes("terminal")) ferramentas.push(ferramentaDeComando(wt));
    // Ambiente do card: o app inteiro rodando no Docker dos agentes, com autonomia para instalar e preparar o que precisar.
    if (ambienteAtivo()) ferramentas.push(...ferramentasDeAmbiente(wt));
  } else if (wtDoPai) ferramentas.push(...ferramentasDeProjeto(wtDoPai.caminho, { enxuto: local }));
  // Card sem código num projeto: a cópia de referência (o projeto como está hoje) para subir o app no ambiente,
  // criar dados de teste e tirar prints das telas reais. Um ambiente por projeto, compartilhado entre os cards.
  let referencia: Worktree | null = null;
  if (!wt && !wtDoPai && projeto && projetoId !== null && ambienteAtivo()) {
    try {
      referencia = await garantirCopiaDeReferencia(card, projeto.caminho, projetoId);
      // Ler e escrever na mesma raiz (a do repositório): com a pasta vinculada para ler e a cópia para escrever, os
      // caminhos não batiam e o agente gravava numa subpasta errada.
      ferramentas.push(
        ...ferramentasDeProjeto(referencia.caminho, { enxuto: local }),
        ...ferramentasDeAmbiente(referencia, `ref-${projetoId}`),
        ...ferramentasDeEscrita(referencia, { envDeTeste: true }),
        ferramentaDeCaptura(card.id, `http://${HOST_DO_AMBIENTE}`),
      );
    } catch (e) {
      if (!(e instanceof ErroCard)) throw e;
    }
  }
  if (!wt && !wtDoPai && projeto && !referencia) ferramentas.push(...ferramentasDeProjeto(projeto.caminho, { enxuto: local }));
  // Pesquisa delegada: um modelo barato (ou local) lê o projeto e devolve só a resposta; o contexto do autor fica pequeno.
  const raizDoProjeto = wt?.caminho ?? wtDoPai?.caminho ?? referencia?.caminho ?? projeto?.caminho;
  const pesquisa = raizDoProjeto ? ferramentaDePesquisa(raizDoProjeto, { cardId: card.id, agenteId: agente.id, sinal }) : null;
  if (pesquisa) ferramentas.push(pesquisa);
  // Treinamento e QA de tela: prints do app rodando na máquina do CEO.
  // Prévia do código deste card (antes do merge): QA, devs e treinamento sobem e testam.
  if (podeVerificar() && wt && ["playwright", "terminal", "navegador", "celular"].some((f) => agente.ferramentas.includes(f as Agent["ferramentas"][number]))) ferramentas.push(ferramentaPrevia(card));
  const urlDoApp = (wt ? urlDaPrevia(card.id, card) : null) ?? projeto?.urlLocal ?? (wt && ambienteAtivo() ? `http://${HOST_DO_AMBIENTE}` : null);
  if (urlDoApp && agente.ferramentas.includes("playwright")) ferramentas.push(ferramentaDeCaptura(card.id, urlDoApp));
  // Navegador do sistema: quem pesquisa na web, testa telas ou usa o navegador.
  if (["navegador", "web", "playwright"].some((f) => agente.ferramentas.includes(f as Agent["ferramentas"][number]))) {
    ferramentas.push(ferramentaDeNavegador(card.id, agente.id, urlDoApp));
  }
  // Documentos de verdade (DOCX, PDF, XLSX, CSV) para anexar à entrega, e imagens (telas, fluxos, diagramas).
  ferramentas.push(ferramentaGerarArquivo(card.id), ferramentaGerarImagem(card.id));
  // Celular de teste (iPhone no Simulador, Android no emulador): QA, Mobile e Treinamento.
  if (NO_MAC && agente.ferramentas.includes("celular")) ferramentas.push(ferramentaDeCelular(agente, card, [wt?.caminho, projeto?.caminho].filter((c): c is string => !!c)));

  // Melhor de N (card marcado, de código, com verificação, primeira versão): tentativas em cópias paralelas;
  // tipos, lint e testes escolhem a vencedora, que vira a entrega (as outras cópias são apagadas).
  if (wt && card.etiquetas.includes(ETIQUETA_MELHOR_DE) && podeVerificar() && comandoDeTestes(wt.caminho) && !ultimaEntrega(card.id)) {
    const venc = await melhorDeN(client, card, agente, wt, 3, sinal);
    if (venc) {
      registrarEntrega(card.id, agente.id, venc.resumo, await comCodigo(wt, agente.id, card, venc.resumo, venc.conteudo));
      entregou = true;
    }
  }

  if (esc.motivo) postFeed(card.sala, agente.id, `${card.chave}: ${esc.motivo}`);
  const r = entregou ? { texto: "", terminou: true, custoUsd: 0 } : await rodarAgente({
    client,
    agenteId: agente.id,
    retomar: lerRetomada(card.id, "executar", agente.id, modeloAutor),
    aoPausar: (m) => salvarRetomada(card.id, "executar", agente.id, modeloAutor, m),
    aoRodada: (m) => salvarRetomada(card.id, "executar", agente.id, modeloAutor, m),
    // Código pede mais raciocínio; o resto fica no esforço médio.
    esforco: wt ? "high" : undefined,
    modelo: modeloAutor,
    sistema: sistemaAutor(agente),
    mensagem: mensagemExecutar(card, { local, podeDividir: podeDividir && plano?.fase !== "propor" }) + (referencia ? NOTA_DA_REFERENCIA : "") + (plano?.fase === "propor" ? PEDIR_PLANO : plano ? comPlanoAprovado(plano) : ""),
    imagens: imagensDoCard(card),
    arquivos: arquivosDoTexto(card.descricao),
    // Antes do plano aprovado: só leitura (e propor_plano).
    ferramentas: plano?.fase === "propor" ? ferramentas.filter((f) => !("name" in f.def && DEPOIS_DO_PLANO.has(f.def.name))) : ferramentas,
    cardId: card.id,
    sinal,
    maxRodadas: wt ? 40 : undefined,
    orientacoes: () => pegarOrientacoes(card.id),
    lembrete: "Você parou sem chamar nenhuma ferramenta. Se ainda falta trabalho, continue agora usando as ferramentas; quando terminar, chame entregar com o trabalho completo (ou perguntar_ao_ceo, se for indispensável).",
  }).finally(() => desligarCelular(card.id));
  if (sinal.aborted) throw new ErroInterrompido(String(sinal.reason));
  // Dividiu em partes: o card espera por elas (filhosAbertos) e volta para juntar quando terminarem.
  if (dividiu) return;
  // Propôs o plano: o card está parado esperando o CEO.
  if (propos) return;

  // Parou depois do rascunho, sem a chamada final: o rascunho vale como entrega.
  const r0 = rascunho as { resumo: string; conteudo: string } | null;
  if (!entregou && r0 && !lerCard(card.id).bloqueado) {
    registrarEntrega(card.id, agente.id, r0.resumo, wt ? await comCodigo(wt, agente.id, card, r0.resumo, r0.conteudo) : r0.conteudo);
    entregou = true;
  }
  // Sem chamar entregar, mas com um texto de verdade: o texto vira a entrega, para não perder trabalho.
  // Uma frase solta ("Vou começar lendo…") não é entrega: tenta de novo (e bloqueia na segunda vez).
  if (!entregou && !lerCard(card.id).bloqueado) {
    const t = r.texto.trim();
    if (t.length < 400) throw new ErroSemEntrega(`O agente parou sem entregar${t ? ` (escreveu só: "${t.slice(0, 120)}")` : ""}.`);
    registrarEntrega(card.id, agente.id, "Entrega (texto final do agente)", r.texto);
    entregou = true;
  }
  if (!entregou) return;

  card = lerCard(card.id);
  const abertos = filhosAbertos(card.id, listarCards());
  if (abertos.length) {
    comentar(card.id, agente.id, "comentario", `Versão salva. Antes da validação, espero os pedidos que fiz terminarem (${abertos.map((c) => c.chave).join(", ")}) e sigo com o resultado deles.`);
    postFeed(card.sala, agente.id, `${agente.nome} aguarda ${abertos.map((c) => c.chave).join(", ")} para terminar o ${card.chave}`);
    return;
  }
  // Verificação determinística (tipos → lint → testes) na branch antes de qualquer revisor gastar com o card:
  // se falhar, o erro real volta para o autor corrigir. Três falhas seguidas: para e pede ajuda ao CEO.
  if (wt && podeVerificar() && comandoDeTestes(wt.caminho)) {
    const v = await testarCard(card.id, agente.id).catch((e: unknown) => {
      comentar(card.id, agente.id, "comentario", `Não consegui rodar a verificação: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    });
    if (v && !v.passou) return voltarParaCorrigir(card, agente);
  }
  // Varredura do diff (segredos barram; licença copyleft vira aviso) e o atacante (red team) antes da revisão.
  if (wt) {
    const diff = await gitEm(wt.caminho, "diff", `${wt.base}..HEAD`).catch(() => "");
    const segredos = varrerSegredos(diff);
    const licencas = verificarLicencas([wt.caminho, wt.repo], diff);
    if (segredos.length || licencas.length) {
      comentar(card.id, agente.id, "comentario", `${segredos.length ? "❌ Verificação falhou (segredo)\n\n" : ""}${relatorioVarredura(segredos, licencas)}`);
      auditar("hefesto", "varredura do diff", card.chave, `${segredos.length} segredo(s), ${licencas.length} licença(s) a conferir`);
    }
    if (segredos.length) return voltarParaCorrigir(card, agente);
    const atacante = escolherAtacante(card);
    if (configCritica().atacante && atacante && precisaDeAtaque(card, arquivosDoDiff(diff)) && !jaAtacado(card)) {
      if (await atacar(client, card, atacante, diff, wt.caminho, sinal)) return voltarParaCorrigir(card, agente);
    }
  }
  auditar(agente.id, "entregou", card.chave, ultimaEntrega(card.id)?.resumo ?? null);
  postFeed(card.sala, agente.id, `${agente.nome} entregou o ${card.chave}`);
  if (card.validador) {
    // Código do Squad 1: vai para a etapa de validação atual (review, performance, segurança ou QA).
    const etapas = etapasDoCodigoDe(card.fluxo, card.dono);
    const etapa = etapaDoCodigoDe(card);
    if (etapa !== null && card.validador !== etapas[etapa]!.validador) {
      card = editarCard(card.id, { validador: etapas[etapa]!.validador });
    }
    // Ninguém valida o próprio trabalho.
    if (card.validador === agente.id) {
      const outro = revisorAlternativo(card, agente.id);
      card = editarCard(card.id, { validador: outro });
      if (!outro) return finalizar(card, agente.id);
    }
    const coluna = etapa !== null ? etapas[etapa]!.coluna : colunaDeValidacao(card.fluxo, card.sala);
    if (coluna) card = mover(card.id, coluna, agente.id);
    marcarValidacao(card.id, true);
    if (card.validador) emit({ type: "repasse", de: agente.id, para: card.validador, cardId: card.id, motivo: "validacao" });
  } else {
    finalizar(card, agente.id);
  }
}

/** A verificação (testes, segredo ou ataque) falhou: o autor corrige. Três falhas seguidas: para e pede ajuda ao CEO. */
function voltarParaCorrigir(card: Card, agente: Agent) {
  let seguidas = 0;
  for (const c of listarComentarios(card.id).reverse()) {
    if (c.texto.startsWith("✅ Verificações passaram") || c.tipo === "aprovacao" || decisaoDoCeo(c) || c.texto.startsWith(PREFIXO_PILOTO)) break;
    if (c.texto.startsWith("❌ Verificação falhou")) seguidas++;
  }
  if (seguidas >= 3) {
    editarCard(card.id, { bloqueado: true });
    comentar(card.id, agente.id, "comentario", "❓ Pergunta para o CEO: a verificação falhou 3 vezes seguidas e não consegui resolver sozinho (saídas acima). Como prefere seguir?");
    postChat(agente.id, `Travei no ${card.chave}: a verificação falhou 3 vezes seguidas. Pode dar uma olhada?`);
    return;
  }
  comentar(card.id, agente.id, "comentario", "Volto a corrigir antes da revisão: a verificação falhou (saída acima).");
}

/** Ferramentas reais das demais áreas (Fase 6), conforme quem é o agente e o card. */
const COM_INFRA = new Set(["devops", "sre", "sysadmin", "engenheiro-cloud", "redes", "appsec", "pentester", "seo", "web-content", "cto"]);
function ferramentasDaArea(agente: Agent, card: Card): Ferramenta[] {
  const out: Ferramenta[] = [...ferramentasDeFinancas(agente.id), ...ferramentasDeAtendimento(card)];
  if (COM_INFRA.has(agente.id)) out.push(...ferramentasDeInfra());
  const projetoId = projetoDoCard(card);
  if (agente.ferramentas.includes("banco-de-dados") && projetoId !== null && conexaoDoProjeto(projetoId)) out.push(ferramentaDeBanco(projetoId));
  return out;
}


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
  const etapa = etapaDoCodigoDe(card);
  return etapa === null ? undefined : etapasDoCodigoDe(card.fluxo, card.dono)[etapa]!.foco;
}

/** Descrição de uma parte de dividir_em_partes: o que o autor escreveu, a ordem das partes e o card principal. */
export function descricaoDaParte(propria: string, pai: Card, roteiro: string): string {
  return [
    propria.trim(),
    `---\nParte do ${pai.chave} (${pai.titulo}). Todas as partes, na ordem:\n${roteiro}\nFaça só esta parte. Antes de começar, leia com ler_card o que as partes anteriores já entregaram e siga o mesmo padrão.`,
    `## Contexto do card principal (${pai.chave})\n${pai.descricao.slice(0, 6000)}`,
    pai.criterios.trim() ? `Critérios de aceite do card principal (cumpra os que cabem nesta parte):\n${pai.criterios.slice(0, 3000)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Quantos pedidos acima deste card (o card de um pedido tem profundidade 1). */
function profundidade(card: Card) {
  let n = 0;
  for (let pai = card.paiId; pai && n < 10; n++) {
    try {
      pai = lerCard(pai).paiId;
    } catch {
      break;
    }
  }
  return n;
}

/** Outro revisor quando o validador seria o próprio autor: líder da sala, um colega, o coordenador do escritório. */
function revisorAlternativo(card: Card, autor: string): string | null {
  const daSala = Object.values(agentById).filter((a) => a.sala === card.sala && a.id !== autor);
  const coord = coordenadorDe(escritorioDe(card.sala));
  return daSala.find((a) => a.lider)?.id ?? daSala[0]?.id ?? (coord && coord.id !== autor ? coord.id : null);
}

/** Devoluções deste validador desde a última aprovação ou decisão do CEO (as rodadas da etapa atual). */
function rodadasDaEtapa(cardId: number, validadorId: string) {
  let n = 0;
  for (const c of listarComentarios(cardId).reverse()) {
    if (decisaoDoCeo(c) || c.tipo === "aprovacao") break;
    if (c.tipo === "devolucao" && c.autor === validadorId) n++;
  }
  return n;
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
  const escritorio = escritorioDe(card.sala);
  // Escritórios criados pelo CEO: os líderes e o coordenador de lá fazem o papel de advogado do diabo.
  const candidatos = escritorio !== SEDE
    ? agentesDe(escritorio).filter((a) => a.lider || a.papel === "coordenador").map((a) => a.id)
    : tecnica ? ["cto", "arquiteto", "appsec"] : negocio ? ["cmo", "pmm", "financeiro"] : ["chief-of-staff", "cto", "cmo"];
  return candidatos.map((id) => agentById[id]).find((a) => a && a.id !== card.dono && a.id !== validador.id);
}

/** Já existe questionamento para a versão atual da entrega? (No código, só a primeira etapa questiona.) */
function jaQuestionado(card: Card) {
  const entrega = ultimaEntrega(card.id);
  if (!entrega) return true;
  return listarComentarios(card.id).some((c) => c.tipo === "critica" && c.ts >= entrega.ts);
}

async function advogadoDoDiabo(client: Anthropic | null, card: Card, validador: Agent, sinal: AbortSignal) {
  const advogado = escolherAdvogado(card, validador);
  if (!advogado) return;
  const autor = card.dono ? agentById[card.dono] : undefined;
  focus(card.sala, advogado.id);
  setAgentStatus(advogado.id, "em-reuniao", `Questionando as premissas do ${card.chave}`, autor?.id ?? null);
  try {
    const r = await rodarAgente({
      client,
      modelo: modeloDoAgente(advogado, "apoio"),
      sistema: sistemaAdvogado(advogado, card.sala),
      mensagem: mensagemAdvogado(card),
      ferramentas: [],
      cardId: card.id,
      sinal,
      agenteId: advogado.id,
      esforco: "medium",
      exigeFerramenta: false,
      lembrete: "",
      maxRodadas: 1,
    });
    const critica = r.texto.trim();
    if (critica) {
      // Sem limite de pontos: todos os questionamentos vêm de uma vez e não podem ser cortados.
      comentar(card.id, advogado.id, "critica", critica.slice(0, 30000));
      postFeed(card.sala, advogado.id, `${advogado.nome} questionou as premissas do ${card.chave} antes da validação`);
    }
  } finally {
    setAgentStatus(advogado.id, "ocioso", null);
  }
}

/* ---------- Validar ---------- */

async function validar(client: Anthropic | null, inicial: Card, validador: Agent, sinal: AbortSignal) {
  const card = inicial;
  if (configCritica().advogado && importante(card) && !jaQuestionado(card)) await advogadoDoDiabo(client, card, validador, sinal);
  const autor = card.dono ? agentById[card.dono] : undefined;
  focus(card.sala, validador.id);
  setAgentStatus(validador.id, "validando", `Validando ${card.chave}`, autor?.id ?? null);
  if (autor) setAgentStatus(autor.id, "em-reuniao", `Apresentando ${card.chave} para ${validador.nome}`, validador.id);

  let decisao: { tipo: "aprovar" | "devolver"; texto: string } | null = null;
  const ferramentas: Ferramenta[] = [
    ferramentaMemoria,
    ferramentaLerCard(card),
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
  const projeto = fichaDoProjeto(projetoDoCard(card));
  // Validador no modelo local: leituras em pedaços menores.
  const local = provedorDe(modeloDoAgente(validador, etapaDoCodigoDe(card) !== null ? "validador-codigo" : "validador")).provedor === "ollama";
  // Código: o validador lê a branch do card, vê o diff e (QA, performance, segurança) roda os testes.
  const wt = worktreeDoCard(card);
  // Fora do código (que já traz o diff da branch), o validador vê o que mudou entre a versão anterior e a atual.
  const versoes = listarEntregas(card.id);
  const mudancas = !worktreeDoCard(card) && versoes.length >= 2 ? await diferencaDeTexto(versoes.at(-2)!.conteudo, versoes.at(-1)!.conteudo) : "";
  let mensagem = mensagemValidar(card, mudancas) + consultasDoAutor(card);
  if (wt) {
    ferramentas.push(...ferramentasDeProjeto(wt.caminho, { enxuto: local }), ferramentaDeDiff(card.id));
    if (podeVerificar() && validador.ferramentas.includes("terminal")) ferramentas.push(ferramentaDeComando(wt));
    // QA sobe o app de verdade no ambiente do card (banco, backend, frontend) e testa no navegador.
    if (validador.id.startsWith("qa") && ambienteAtivo()) ferramentas.push(...ferramentasDeAmbiente(wt));
    const urlQa = projeto?.urlLocal ?? (ambienteAtivo() ? `http://${HOST_DO_AMBIENTE}` : null);
    if (urlQa && validador.id.startsWith("qa")) ferramentas.push(ferramentaDeNavegador(card.id, validador.id, urlQa));
    const c = await codigoDoCard(card);
    if (c) mensagem += `

## Código desta entrega (branch ${c.branch})
\`\`\`
${c.stat}
\`\`\`

\`\`\`diff
${c.patch.slice(0, 20_000)}
\`\`\`${podeVerificar() && validador.ferramentas.includes("terminal") ? "\n\nRode os testes com rodar_comando antes de decidir." : ""}`;
  } else if (projeto) ferramentas.push(...ferramentasDeProjeto(projeto.caminho, { enxuto: local }));

  const modeloValidador = modeloDoAgente(validador, etapaDoCodigoDe(card) !== null ? "validador-codigo" : "validador");
  await rodarAgente({
    client,
    agenteId: validador.id,
    retomar: lerRetomada(card.id, "validar", validador.id, modeloValidador),
    aoPausar: (m) => salvarRetomada(card.id, "validar", validador.id, modeloValidador, m),
    aoRodada: (m) => salvarRetomada(card.id, "validar", validador.id, modeloValidador, m),
    esforco: etapaDoCodigoDe(card) !== null ? "high" : undefined,
    modelo: modeloValidador,
    sistema: sistemaValidador(validador, card.sala, focoDaEtapa(card), card.dono),
    mensagem,
    imagens: imagensDoCard(card),
    arquivos: arquivosDoTexto(card.descricao),
    maxRodadas: wt ? 24 : undefined,
    ferramentas,
    cardId: card.id,
    sinal,
    lembrete: "Você ainda não decidiu. Chame aprovar ou devolver agora.",
  });

  if (sinal.aborted) throw new ErroInterrompido(String(sinal.reason));
  const d = decisao as { tipo: "aprovar" | "devolver"; texto: string } | null;
  if (!d) throw new Error("O validador terminou sem aprovar nem devolver.");
  auditar(validador.id, d.tipo === "aprovar" ? "aprovou" : "devolveu", card.chave, d.texto.slice(0, 500));

  if (d.tipo === "devolver") {
    const devolvido = registrarDevolucao(card.id, validador.id, d.texto, colunaDeTrabalho(card.fluxo, card.sala));
    postFeed(card.sala, validador.id, `${validador.nome} devolveu o ${card.chave} (rodada ${devolvido.devolucoes})`);
    if (card.dono) emit({ type: "repasse", de: validador.id, para: card.dono, cardId: card.id, motivo: "devolucao" });
    // Conta as rodadas desta etapa com este validador (o código tem 4 etapas, cada uma com as suas).
    // Andando em círculo: duas devoluções seguidas dizendo praticamente o mesmo sobem para o CEO mais cedo.
    const minhas = listarComentarios(card.id).filter((c) => c.tipo === "devolucao" && c.autor === validador.id);
    const circulo = minhas.length >= 3 && semelhanca(minhas.at(-1)!.texto, minhas.at(-2)!.texto) >= 0.55 && semelhanca(minhas.at(-2)!.texto, minhas.at(-3)!.texto) >= 0.55;
    if (circulo && rodadasDaEtapa(card.id, validador.id) >= 3) {
      const coord = coordenadorDe(escritorioDe(card.sala))?.id ?? "chief-of-staff";
      comentar(card.id, coord, "comentario", `${validador.nome} devolveu três vezes seguidas pelos mesmos motivos: o autor não está conseguindo resolver sozinho. Decida você: aprove a última versão ou devolva com a sua orientação.`);
      mover(card.id, colunaDoCeo(card.fluxo), coord);
      return;
    }
    if (rodadasDaEtapa(card.id, validador.id) >= MAX_RODADAS) {
      const coord = coordenadorDe(escritorioDe(card.sala))?.id ?? "chief-of-staff";
      comentar(card.id, coord, "comentario", `Sem consenso depois de ${MAX_RODADAS} rodadas entre o autor e ${validador.nome}. Decida você: aprove a última versão ou devolva com a sua orientação.`);
      mover(card.id, colunaDoCeo(card.fluxo), coord);
    }
    return;
  }

  comentar(card.id, validador.id, "aprovacao", d.texto);
  marcarValidacao(card.id, false);
  postFeed(card.sala, validador.id, `${validador.nome} aprovou o ${card.chave}`);

  // Código do Squad 1: segue para a próxima etapa (performance → segurança → QA).
  const atual = lerCard(card.id);
  const etapas = etapasDoCodigoDe(atual.fluxo, atual.dono);
  const etapa = etapaDoCodigoDe(atual);
  if (etapa !== null && etapa < etapas.length - 1) {
    const prox = etapas[etapa + 1]!;
    editarCard(atual.id, { validador: prox.validador });
    mover(atual.id, prox.coluna, validador.id);
    marcarValidacao(atual.id, true);
    emit({ type: "repasse", de: validador.id, para: prox.validador, cardId: atual.id, motivo: "proxima-etapa" });
    postFeed(atual.sala, validador.id, `${atual.chave} seguiu para ${agentById[prox.validador]!.nome} (${prox.foco})`);
    return;
  }
  finalizar(atual, validador.id);
}

/** Depois da validação: N0 conclui; o resto vai para a aprovação do CEO. Código sempre passa por você. */
function finalizar(card: Card, quem: string) {
  // Aprendizado: conta o resultado para a variante de instruções usada (A/B) e, às vezes, roda um teste sombra.
  registrarResultadoAB(lerCard(card.id));
  if (Math.random() * 100 < sombraPct() && !registroDoCard(card.id) && card.dono && agentById[card.dono]) void testeSombra(card.id, card.dono).catch((e) => console.error("Teste sombra:", e));
  if (card.nivel === "N0" && !ehCardDeCodigo(card) && registroDoCard(card.id)?.status !== "ativo") {
    const concluido = mover(card.id, fluxos[card.fluxo]!.aprovarPara, quem);
    postFeed(card.sala, quem, `${card.chave} concluído (N0, não precisa do CEO)`);
    void extrairLicao(concluido).catch((e) => console.error("Falha ao extrair lição:", e));
  } else {
    mover(card.id, colunaDoCeo(card.fluxo), quem);
    postFeed(card.sala, quem, `${card.chave} validado. Aguardando sua aprovação.`);
  }
}
