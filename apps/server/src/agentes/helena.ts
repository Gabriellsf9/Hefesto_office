import { colunaDe, fluxoDaSala, fluxos, type RoomId, fluxoPadrao } from "@empresa/shared";
import { agentById, roomById, nomeDaSala } from "@empresa/org";
import { emit, focus, postChat, postFeed, setAgentStatus } from "../bus.ts";
import { clienteClaude } from "../custo.ts";
import { recentChat } from "../db.ts";
import { projetoAtivo } from "../projetos.ts";
import { criarCard, listarCards } from "../tarefas.ts";
import { agenteChamado, conversarComAgente } from "./conversa.ts";
import { iniciarProspeccao } from "../prospeccao.ts";
import { filtrarImagens, imagensEmMarkdown } from "../imagens.ts";
import { arquivosEmMarkdown, filtrarArquivos, nomeOriginal } from "../arquivos.ts";
import { coordenadorDe, definicaoDe, escritorioDe, escritorioDoFluxoId, fluxosDe, SEDE } from "@empresa/org";
import { ferramentaMemoria } from "../memoria.ts";
import { ferramentasDeConectores } from "../mcp/ferramentas.ts";
import { ferramentaDeTerminal, podeUsarMaquina } from "../maquina/terminal.ts";
import { ErroEntrada, ferramenta, rodarAgente, texto } from "./loop.ts";
import { colunaDeEntrada } from "./motor.ts";
import { modeloDisponivel, modeloDoAgente } from "../provedores.ts";
import { sistemaHelena } from "./prompts.ts";

// Helena (Chief of Staff) atende o CEO no chat: transforma pedidos em cards e
// distribui; responde perguntas de andamento com base na board.

const HELENA = "chief-of-staff";
let fila: Promise<void> = Promise.resolve();

/**
 * Os pedidos são atendidos um de cada vez, na ordem em que chegam. Se o CEO
 * chamar alguém pelo nome ("Rafael, como está o login?"), quem responde é essa pessoa.
 */
export function pedirParaHelena(textoDoCeo: string, imagensBrutas: unknown = [], arquivosBrutos: unknown = [], escritorioBruto: unknown = SEDE) {
  const escritorio = typeof escritorioBruto === "string" && definicaoDe(escritorioBruto) ? escritorioBruto : SEDE;
  const imagens = filtrarImagens(imagensBrutas);
  const arquivos = filtrarArquivos(arquivosBrutos);
  const limpo = textoDoCeo.trim().slice(0, 8000) || (imagens.length ? "(imagem)" : arquivos.length ? "(arquivo)" : "");
  if (!limpo) return;
  postChat("voce", limpo, imagens, arquivos.map((url) => ({ url, nome: nomeOriginal(url.split("/").pop()!) })));
  const coord = coordenadorDe(escritorio)?.id ?? HELENA;
  const chamado = agenteChamado(limpo, escritorio);
  const tarefa = chamado && chamado.agente.id !== coord ? () => conversarComAgente(chamado.agente, chamado.pergunta, imagens, arquivos) : () => atender(limpo, imagens, arquivos, escritorio);
  fila = fila.then(tarefa).catch(() => {});
}

/** Plano da semana aprovado: a Helena transforma as entregas propostas em cards. */
export function transformarPlanoEmCards(chave: string, plano: string) {
  const pedido = `O CEO aprovou o ${chave} (plano da semana). Transforme as entregas propostas abaixo em cards com criar_cards, respeitando donos, prioridades, níveis e a ordem (use depende_de), e confirme ao CEO em uma frase.\n\n${plano}`;
  fila = fila.then(() => atender(pedido)).catch(() => {});
}

function resumoDaBoard(escritorio = SEDE): string {
  const cards = listarCards().filter((c) => !c.demo && escritorioDoFluxoId(c.fluxo) === escritorio);
  if (!cards.length) return "A board está vazia.";
  const abertos = cards.filter((c) => colunaDe(c.fluxo, c.coluna)?.tipo !== "feito").slice(-40);
  const linhas = abertos.map((c) => {
    const col = colunaDe(c.fluxo, c.coluna)?.nome ?? c.coluna;
    const dono = c.dono ? agentById[c.dono]?.nome : "sem dono";
    const flags = [c.emValidacao && "em validação", c.bloqueado && "BLOQUEADO", c.devolucoes && `devolvido ${c.devolucoes}×`].filter(Boolean).join(", ");
    return `- ${c.chave} [${col}] ${c.titulo} — ${dono}${flags ? ` (${flags})` : ""}`;
  });
  const feitos = cards.length - abertos.length;
  return `${linhas.join("\n")}\n(${feitos} cards concluídos no total)`;
}

function conversaRecente(): string {
  return recentChat(16)
    .slice(0, -1) // a última é o pedido atual
    .map((m) => {
      const opcoes = m.opcoes?.length
        ? `\n(opções dadas ao CEO: ${m.opcoes.join(" | ")}${m.recomendacao ? `; recomendada: ${m.opcoes[m.recomendacao.opcao]}` : ""})`
        : "";
      return `${m.de === "voce" ? "CEO" : (agentById[m.de]?.nome ?? m.de)}: ${m.texto}${opcoes}`;
    })
    .join("\n");
}

export interface PerguntaAoCeo {
  texto: string;
  /** A recomendada vem primeiro. */
  opcoes: string[];
  motivo: string;
}

/**
 * Na dúvida, a coordenadora pergunta em vez de adivinhar: a pergunta vai ao chat com as opções em botões
 * (o clique responde como se o CEO tivesse escrito a opção) e uma delas recomendada, com o porquê.
 * Termina a vez sem criar card.
 */
export function ferramentaPerguntar(aoPerguntar: (p: PerguntaAoCeo) => void) {
  return ferramenta(
    "perguntar_ao_ceo",
    "Pergunta ao CEO quando o pedido é ambíguo e cada leitura levaria a um trabalho diferente (ex.: atividade nova ou continuação de um card que já existe; escopo de um projeto inteiro ou de uma parte). Antes de perguntar, analise a board, a memória e o Livro e diga qual opção você recomenda e por quê. Não crie card antes da resposta. As opções viram botões no chat (a recomendada em destaque); o CEO também pode escrever outra coisa.",
    {
      pergunta: { type: "string", description: "Uma pergunta curta, dizendo o que ficou em dúvida" },
      opcoes: {
        type: "array",
        minItems: 2,
        maxItems: 4,
        items: { type: "string" },
        description: "2 a 4 respostas prontas, escritas como o CEO diria (ex.: \"Atividade nova: pentest do Parliamo inteiro\")",
      },
      recomendada: { type: "integer", minimum: 0, maximum: 3, description: "Índice (começando em 0) da opção que você considera a melhor depois de analisar" },
      motivo: { type: "string", description: "Por que essa é a melhor, em uma frase, com o que você viu na board, na memória ou no Livro" },
    },
    ["pergunta", "opcoes", "recomendada", "motivo"],
    (e) => {
      const brutas = Array.isArray(e.opcoes) ? e.opcoes : [];
      const recomendadaBruta = typeof e.recomendada === "number" ? brutas[e.recomendada] : undefined;
      const limpa = (o: unknown) => (typeof o === "string" ? o.trim().slice(0, 120) : "");
      const recomendada = limpa(recomendadaBruta);
      if (!recomendada) throw new ErroEntrada("Diga em recomendada o índice de uma das opções.");
      const outras = brutas.filter((o) => o !== recomendadaBruta).map(limpa).filter((o) => o && o !== recomendada);
      const opcoes = [recomendada, ...outras].slice(0, 4);
      if (opcoes.length < 2) throw new ErroEntrada("Envie de 2 a 4 opções em opcoes.");
      aoPerguntar({ texto: texto(e, "pergunta", 600), opcoes, motivo: texto(e, "motivo", 300) });
      return { texto: "Pergunta enviada ao CEO. Espere a resposta.", fim: true };
    },
  );
}

async function atender(pedido: string, imagens: string[] = [], arquivos: string[] = [], escritorio = SEDE) {
  const client = clienteClaude();
  // Quem atende é o coordenador do escritório (na sede, a Helena).
  const coord = coordenadorDe(escritorio) ?? agentById[HELENA]!;
  const HELENA_ = coord.id;
  const naSede = escritorio === SEDE;
  focus(coord.sala, HELENA_);
  const modelo = modeloDoAgente(coord, "coordenador");
  if (!modeloDisponivel(modelo)) {
    postChat(HELENA_, "Para eu e a equipe trabalharmos de verdade, configure a chave da API no botão \"Chave\" do topo.");
    return;
  }
  setAgentStatus(HELENA_, "pensando", "Lendo o pedido do CEO");
  const criados: string[] = [];
  let pergunta: PerguntaAoCeo | null = null;
  // Num escritório criado por você, o projeto é o do escritório (não o ativo da sede).
  const ativo = escritorio === SEDE ? projetoAtivo() : (definicaoDe(escritorio)?.projetoId ?? null);

  const criarCards = ferramenta(
    "criar_cards",
    "Cria cards na board e distribui para as áreas. A equipe começa sozinha assim que o card estiver livre de dependências.",
    {
      cards: {
        type: "array",
        minItems: 1,
        maxItems: 12,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["titulo", "sala", "dono", "descricao", "criterios"],
          properties: {
            titulo: { type: "string" },
            sala: { type: "string", description: "Id da sala" },
            dono: { type: "string", description: "Id do agente responsável (da mesma sala)" },
            descricao: { type: "string", description: "Contexto completo para o dono trabalhar sozinho" },
            criterios: { type: "string", description: "Critérios de aceite verificáveis, em tópicos" },
            prioridade: { type: "string", enum: ["P0", "P1", "P2", "P3"] },
            nivel: { type: "string", enum: ["N0", "N1", "N2", "N3"] },
            tipo: { type: "string", enum: ["epico", "historia", "tarefa", "bug", "lead", "conteudo"] },
            depende_de: { type: "integer", description: "Índice (começando em 0) de outro card desta mesma lista que precisa terminar antes" },
            depende_tambem_de: { type: "array", items: { type: "integer" }, description: "Outros índices desta lista que também precisam terminar antes (quando depende de mais de um, ex.: o frontend espera o backend E o protótipo)" },
            data: { type: "string", description: "Prazo ou data de publicação em ISO (2026-11-03 ou 2026-11-03T18:30). Use nos posts do calendário editorial" },
            usar_projeto_ativo: { type: "boolean", description: "Liga o card ao projeto ativo do CEO, se houver" },
          },
        },
      },
    },
    ["cards"],
    (e) => {
      const lista = e.cards;
      if (!Array.isArray(lista) || !lista.length) throw new ErroEntrada("Envie pelo menos um card em cards.");
      const ids: (number | undefined)[] = [];
      const chaves: string[] = [];
      const erros: string[] = [];
      // Cada card é independente: um inválido não desfaz nem duplica os outros (o modelo reenvia só o que falhou).
      lista.slice(0, 12).forEach((bruto, i) => {
        try {
          const c = bruto as Record<string, unknown>;
          const sala = texto(c, "sala", 40) as RoomId;
          if (!roomById[sala] || escritorioDe(sala) !== escritorio) throw new ErroEntrada(`Card ${i}: sala inválida "${sala}" (use as salas do diretório).`);
          const donoPedido = typeof c.dono === "string" ? c.dono : "";
          const dono = agentById[donoPedido]?.sala === sala ? donoPedido : undefined;
          const dep = typeof c.depende_de === "number" && c.depende_de >= 0 && c.depende_de < i ? ids[c.depende_de] : undefined;
          const fluxo = fluxoPadrao(sala);
          const card = criarCard(
            {
              titulo: texto(c, "titulo", 200),
              descricao: texto(c, "descricao", 20_000) + imagensEmMarkdown(imagens) + arquivosEmMarkdown(arquivos),
              criterios: typeof c.criterios === "string" ? c.criterios : "",
              sala,
              fluxo,
              coluna: colunaDeEntrada(fluxo),
              dono: dono ?? Object.values(agentById).find((a) => a.sala === sala && a.lider)?.id ?? null,
              prioridade: (["P0", "P1", "P2", "P3"].includes(c.prioridade as string) ? c.prioridade : "P2") as "P2",
              nivel: (["N0", "N1", "N2", "N3"].includes(c.nivel as string) ? c.nivel : "N1") as "N1",
              tipo: (["epico", "historia", "tarefa", "bug", "lead", "conteudo"].includes(c.tipo as string) ? c.tipo : "tarefa") as "tarefa",
              dependeDe: dep ?? null,
            dependencias: (Array.isArray(c.depende_tambem_de) ? c.depende_tambem_de : [])
              .filter((j): j is number => typeof j === "number" && j >= 0 && j < i)
              .map((j) => ids[j])
              .filter((x): x is number => typeof x === "number"),
              prazo: typeof c.data === "string" && Number.isFinite(Date.parse(c.data)) ? Date.parse(c.data.length === 10 ? `${c.data}T09:00:00` : c.data) : null,
              projetoId: c.usar_projeto_ativo ? ativo : null,
            },
            HELENA_,
          );
          ids.push(card.id);
          chaves.push(`${card.chave} → ${nomeDaSala(sala)} (${card.dono ? agentById[card.dono]!.nome : "sem dono"})${donoPedido && !dono ? ` [o dono "${donoPedido}" não é dessa sala; ficou com o líder]` : ""}${dep ? `, depois do ${`EMP-${dep}`}` : ""}`);
        } catch (err) {
          ids.push(undefined);
          erros.push(`Card ${i}: ${err instanceof Error ? err.message : String(err)}`);
        }
      });
      if (!chaves.length) throw new ErroEntrada(`Nenhum card criado.\n${erros.join("\n")}`);
      criados.push(...chaves);
      postFeed(coord.sala, HELENA_, `${coord.nome} criou ${chaves.length} card(s) a partir do pedido do CEO`);
      return {
        texto: `Cards criados:\n${chaves.join("\n")}${erros.length ? `\n\nNÃO criados (corrija e reenvie só estes, sem repetir os criados):\n${erros.join("\n")}` : "\nAgora responda ao CEO em poucas linhas."}`,
      };
    },
  );

  const prospectar = ferramenta(
    "iniciar_prospeccao",
    "Abre uma campanha de prospecção de clientes: o SDR pesquisa empresas públicas que combinam com o cliente ideal e cria um card por lead; mensagens são escritas e validadas; o CEO aprova e envia. Use quando o CEO pedir clientes, leads ou prospecção.",
    {
      produto: { type: "string", description: "O que vamos vender (produto/serviço e proposta de valor), com base no Livro da Empresa e no pedido" },
      cliente_ideal: { type: "string", description: "Segmento, porte, dores e sinais de compra do cliente ideal" },
      regiao: { type: "string", description: "Cidade, estado ou bairros" },
      quantidade: { type: "integer", minimum: 1, maximum: 40 },
    },
    ["produto", "cliente_ideal", "regiao", "quantidade"],
    (e) => {
      const { campanha, card } = iniciarProspeccao({ produto: e.produto, clienteIdeal: e.cliente_ideal, regiao: e.regiao, quantidade: e.quantidade }, HELENA_);
      criados.push(`${card.chave} → Comercial (Daniel): prospecção de ${campanha.quantidade} leads em ${campanha.regiao}`);
      return { texto: `Campanha #${campanha.id} aberta (${card.chave}). Agora responda ao CEO em poucas linhas: o que vai acontecer e que ele aprova as mensagens antes de qualquer contato.` };
    },
  );

  const mensagem = `## Conversa recente
${conversaRecente() || "(início da conversa)"}

## Board agora
${resumoDaBoard(escritorio)}

## Projeto ativo
${ativo ? `Sim (id ${ativo}). Use usar_projeto_ativo nos cards de software que mexem nele.` : "Nenhum."}

## Fluxos
${fluxosDe(escritorio).map((f) => `- ${f.nome}: ${f.colunas.map((c) => c.nome).join(" → ")}`).join("\n")}

## Novo pedido do CEO
${pedido}${imagens.length ? `\n\n(O CEO anexou ${imagens.length} imagem(ns), acima. Os cards que você criar levam as imagens junto, para quem for trabalhar neles.)` : ""}${arquivos.length ? `\n\n(O CEO anexou ${arquivos.length} arquivo(s), acima. Os cards que você criar levam os arquivos junto.)` : ""}

Se for um pedido de trabalho, crie os cards com criar_cards e depois responda. ${naSede ? "Se for um pedido de clientes ou leads, use iniciar_prospeccao (se faltar a região, pergunte antes). " : ""}Se for pergunta, responda direto. Se o pedido der para entender de mais de um jeito e cada jeito levar a um trabalho diferente, não adivinhe: use perguntar_ao_ceo.`;

  try {
    setAgentStatus(HELENA_, "trabalhando", "Respondendo ao CEO");
    const r = await rodarAgente({
      client,
      modelo,
      sistema: sistemaHelena(escritorio),
      mensagem,
      ferramentas: [
        ferramentaMemoria,
        criarCards,
        ferramentaPerguntar((p) => (pergunta = p)),
        // Prospecção e conectores são da empresa: só pela sede.
        ...(naSede ? [prospectar] : []),
        ...ferramentasDeConectores(agentById[HELENA_]!, null),
        ...(podeUsarMaquina(agentById[HELENA_]!, "terminal") ? [ferramentaDeTerminal(agentById[HELENA_]!, null)] : []),
      ],
      imagens,
      arquivos,
      lembrete: "Responda ao CEO agora, em poucas linhas.",
      exigeFerramenta: false,
      onTexto: (parcial) => emit({ type: "chat.parcial", de: HELENA_, texto: parcial }),
      maxRodadas: 4,
    });
    emit({ type: "chat.parcial", de: HELENA_, texto: "" });
    const p = pergunta as PerguntaAoCeo | null;
    if (p) {
      postChat(HELENA_, p.texto, undefined, undefined, p.opcoes, p.motivo ? { opcao: 0, motivo: p.motivo } : undefined);
      return;
    }
    const resposta = r.texto.trim() || (criados.length ? `Feito. Criei e distribuí:\n${criados.map((c) => `- ${c}`).join("\n")}` : "");
    postChat(HELENA_, resposta || "Não consegui responder agora. Pode repetir?");
  } catch (err) {
    emit({ type: "chat.parcial", de: HELENA_, texto: "" });
    postChat(HELENA_, `Tive um problema para responder: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    setAgentStatus(HELENA_, "ocioso", null);
  }
}
