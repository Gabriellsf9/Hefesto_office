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
import { ferramentaMemoria } from "../memoria.ts";
import { ferramentasDeConectores } from "../mcp/ferramentas.ts";
import { ferramentaDeTerminal, podeUsarMaquina } from "../maquina/terminal.ts";
import { ErroEntrada, ferramenta, rodarAgente, texto } from "./loop.ts";
import { colunaDeEntrada } from "./motor.ts";
import { sistemaHelena } from "./prompts.ts";

// Helena (Chief of Staff) atende o CEO no chat: transforma pedidos em cards e
// distribui; responde perguntas de andamento com base na board.

const HELENA = "chief-of-staff";
let fila: Promise<void> = Promise.resolve();

/**
 * Os pedidos são atendidos um de cada vez, na ordem em que chegam. Se o CEO
 * chamar alguém pelo nome ("Rafael, como está o login?"), quem responde é essa pessoa.
 */
export function pedirParaHelena(textoDoCeo: string, imagensBrutas: unknown = [], arquivosBrutos: unknown = []) {
  const imagens = filtrarImagens(imagensBrutas);
  const arquivos = filtrarArquivos(arquivosBrutos);
  const limpo = textoDoCeo.trim().slice(0, 8000) || (imagens.length ? "(imagem)" : arquivos.length ? "(arquivo)" : "");
  if (!limpo) return;
  postChat("voce", limpo, imagens, arquivos.map((url) => ({ url, nome: nomeOriginal(url.split("/").pop()!) })));
  const chamado = agenteChamado(limpo);
  const tarefa = chamado && chamado.agente.id !== HELENA ? () => conversarComAgente(chamado.agente, chamado.pergunta, imagens, arquivos) : () => atender(limpo, imagens, arquivos);
  fila = fila.then(tarefa).catch(() => {});
}

/** Plano da semana aprovado: a Helena transforma as entregas propostas em cards. */
export function transformarPlanoEmCards(chave: string, plano: string) {
  const pedido = `O CEO aprovou o ${chave} (plano da semana). Transforme as entregas propostas abaixo em cards com criar_cards, respeitando donos, prioridades, níveis e a ordem (use depende_de), e confirme ao CEO em uma frase.\n\n${plano}`;
  fila = fila.then(() => atender(pedido)).catch(() => {});
}

function resumoDaBoard(): string {
  const cards = listarCards().filter((c) => !c.demo);
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
    .map((m) => `${m.de === "voce" ? "CEO" : (agentById[m.de]?.nome ?? m.de)}: ${m.texto}`)
    .join("\n");
}

async function atender(pedido: string, imagens: string[] = [], arquivos: string[] = []) {
  const client = clienteClaude();
  focus("diretoria", HELENA);
  if (!client) {
    postChat(HELENA, "Para eu e a equipe trabalharmos de verdade, configure a chave da API no botão \"Chave\" do topo.");
    return;
  }
  setAgentStatus(HELENA, "pensando", "Lendo o pedido do CEO");
  const criados: string[] = [];
  const ativo = projetoAtivo();

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
      const ids: number[] = [];
      const chaves: string[] = [];
      lista.slice(0, 12).forEach((bruto, i) => {
        const c = bruto as Record<string, unknown>;
        const sala = texto(c, "sala", 40) as RoomId;
        if (!roomById[sala]) throw new ErroEntrada(`Card ${i}: sala inválida "${sala}".`);
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
            prazo: typeof c.data === "string" && Number.isFinite(Date.parse(c.data)) ? Date.parse(c.data.length === 10 ? `${c.data}T09:00:00` : c.data) : null,
            projetoId: c.usar_projeto_ativo ? ativo : null,
          },
          HELENA,
        );
        ids.push(card.id);
        chaves.push(`${card.chave} → ${nomeDaSala(sala)} (${card.dono ? agentById[card.dono]!.nome : "sem dono"})${dep ? `, depois do ${`EMP-${dep}`}` : ""}`);
      });
      criados.push(...chaves);
      postFeed("diretoria", HELENA, `Helena criou ${chaves.length} card(s) a partir do pedido do CEO`);
      return { texto: `Cards criados:\n${chaves.join("\n")}\nAgora responda ao CEO em poucas linhas.` };
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
      const { campanha, card } = iniciarProspeccao({ produto: e.produto, clienteIdeal: e.cliente_ideal, regiao: e.regiao, quantidade: e.quantidade }, HELENA);
      criados.push(`${card.chave} → Comercial (Daniel): prospecção de ${campanha.quantidade} leads em ${campanha.regiao}`);
      return { texto: `Campanha #${campanha.id} aberta (${card.chave}). Agora responda ao CEO em poucas linhas: o que vai acontecer e que ele aprova as mensagens antes de qualquer contato.` };
    },
  );

  const mensagem = `## Conversa recente
${conversaRecente() || "(início da conversa)"}

## Board agora
${resumoDaBoard()}

## Projeto ativo
${ativo ? `Sim (id ${ativo}). Use usar_projeto_ativo nos cards de software que mexem nele.` : "Nenhum."}

## Fluxos
${Object.values(fluxos).map((f) => `- ${f.nome}: ${f.colunas.map((c) => c.nome).join(" → ")}`).join("\n")}

## Novo pedido do CEO
${pedido}${imagens.length ? `\n\n(O CEO anexou ${imagens.length} imagem(ns), acima. Os cards que você criar levam as imagens junto, para quem for trabalhar neles.)` : ""}${arquivos.length ? `\n\n(O CEO anexou ${arquivos.length} arquivo(s), acima. Os cards que você criar levam os arquivos junto.)` : ""}

Se for um pedido de trabalho, crie os cards com criar_cards e depois responda. Se for um pedido de clientes ou leads, use iniciar_prospeccao (se faltar a região, pergunte antes). Se for pergunta, responda direto.`;

  try {
    setAgentStatus(HELENA, "trabalhando", "Respondendo ao CEO");
    const r = await rodarAgente({
      client,
      modelo: agentById[HELENA]!.modelo,
      sistema: sistemaHelena(),
      mensagem,
      ferramentas: [
        ferramentaMemoria,
        criarCards,
        prospectar,
        ...ferramentasDeConectores(agentById[HELENA]!, null),
        ...(podeUsarMaquina(agentById[HELENA]!, "terminal") ? [ferramentaDeTerminal(agentById[HELENA]!, null)] : []),
      ],
      imagens,
      arquivos,
      lembrete: "Responda ao CEO agora, em poucas linhas.",
      exigeFerramenta: false,
      onTexto: (parcial) => emit({ type: "chat.parcial", de: HELENA, texto: parcial }),
      maxRodadas: 4,
    });
    emit({ type: "chat.parcial", de: HELENA, texto: "" });
    const resposta = r.texto.trim() || (criados.length ? `Feito. Criei e distribuí:\n${criados.map((c) => `- ${c}`).join("\n")}` : "");
    postChat(HELENA, resposta || "Não consegui responder agora. Pode repetir?");
  } catch (err) {
    emit({ type: "chat.parcial", de: HELENA, texto: "" });
    postChat(HELENA, `Tive um problema para responder: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    setAgentStatus(HELENA, "ocioso", null);
  }
}
