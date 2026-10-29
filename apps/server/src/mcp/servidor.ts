import type { IncomingMessage, ServerResponse } from "node:http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { agentById, agents } from "@empresa/org";
import { colunaDe, colunaDeEntrada, fluxoPadrao, type RoomId } from "@empresa/shared";
import { comentarComoCeo, criarCard, listarCards, listarComentarios, ultimaEntrega } from "../tarefas.ts";
import { estadoMotor, orientarCard } from "../agentes/motor.ts";
import { listarAlertas } from "../vigia.ts";
import { criarConversa, enviarMensagem, lerConversa, listarMensagens } from "../conversas.ts";
import { listarProjetos } from "../projetos.ts";

// O Hefesto como servidor MCP (HTTP em /mcp): o Claude Code, o Cursor, o VS Code ou qualquer cliente MCP usa a
// empresa de dentro do editor: ver e criar cards, comentar (o agente rodando recebe na hora), conversar com qualquer
// agente e ver o estado. Ex.: claude mcp add --transport http hefesto http://localhost:4417/mcp

type Args = Record<string, unknown>;
const txt = (v: unknown, max = 20_000) => (typeof v === "string" ? v.trim().slice(0, max) : "");

const FERRAMENTAS = [
  {
    name: "status",
    description: "Estado da empresa: o que está rodando, a fila, quantos cards concluídos e os alertas de saúde abertos.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "listar_cards",
    description: "Lista os cards (chave, coluna, dono, título). Filtre por projeto (nome) ou só os que não terminaram.",
    inputSchema: { type: "object", properties: { projeto: { type: "string" }, abertos: { type: "boolean" } } },
  },
  {
    name: "ler_card",
    description: "Um card: descrição, critérios, a última entrega e os últimos comentários.",
    inputSchema: { type: "object", properties: { chave: { type: "string", description: "Ex.: EMP-7" } }, required: ["chave"] },
  },
  {
    name: "criar_card",
    description: "Cria um card no board (a equipe pega sozinha). sala: produto, design, desenvolvimento, qa, devops… (padrão: desenvolvimento).",
    inputSchema: {
      type: "object",
      properties: { titulo: { type: "string" }, descricao: { type: "string" }, criterios: { type: "string" }, sala: { type: "string" }, projeto: { type: "string" } },
      required: ["titulo", "descricao"],
    },
  },
  {
    name: "comentar_card",
    description: "Comenta num card como o CEO. Se o agente estiver trabalhando nele, recebe na próxima rodada, sem reiniciar.",
    inputSchema: { type: "object", properties: { chave: { type: "string" }, texto: { type: "string" } }, required: ["chave", "texto"] },
  },
  {
    name: "conversar",
    description: "Conversa com um agente da empresa (id, ex.: dev-backend, pm, arquiteto) e espera a resposta (até alguns minutos). Mande conversa_id para continuar a mesma conversa.",
    inputSchema: {
      type: "object",
      properties: { agente: { type: "string" }, mensagem: { type: "string" }, conversa_id: { type: "integer" }, projeto: { type: "string" } },
      required: ["mensagem"],
    },
  },
];

const porChave = (chave: string) => listarCards().find((c) => c.chave.toUpperCase() === chave.trim().toUpperCase());
const projetoPorNome = (nome: string) => listarProjetos().find((p) => p.nome.toLowerCase() === nome.trim().toLowerCase());

/** Executa uma ferramenta do servidor MCP (separado do transporte para testar direto). */
export async function chamarFerramentaMcp(nome: string, a: Args): Promise<string> {
  if (nome === "status") {
    const m = estadoMotor();
    const cards = listarCards().filter((c) => !c.demo);
    const feitos = cards.filter((c) => colunaDe(c.fluxo, c.coluna)?.tipo === "feito").length;
    const rodando = m.emAndamento.map((t) => `${cards.find((c) => c.id === t.cardId)?.chave ?? t.cardId} (${t.agenteId})`).join(", ") || "nada";
    const alertas = listarAlertas().map((x) => `- ${x.texto}`).join("\n");
    return `Concluídos: ${feitos}/${cards.length} · rodando: ${rodando} · na fila: ${m.naFila}${m.pausado ? " · PAUSADA" : ""}\n${alertas ? `Alertas:\n${alertas}` : "Sem alertas."}`;
  }
  if (nome === "listar_cards") {
    const p = txt(a.projeto) ? projetoPorNome(txt(a.projeto)) : null;
    const lista = listarCards().filter((c) => !c.demo && (!p || c.projetoId === p.id) && (a.abertos !== true || colunaDe(c.fluxo, c.coluna)?.tipo !== "feito"));
    return lista.map((c) => `${c.chave} [${colunaDe(c.fluxo, c.coluna)?.nome ?? c.coluna}] ${c.dono ?? "-"}: ${c.titulo}`).join("\n") || "Nenhum card.";
  }
  if (nome === "ler_card") {
    const c = porChave(txt(a.chave));
    if (!c) return "Card não encontrado.";
    const e = ultimaEntrega(c.id);
    const coms = listarComentarios(c.id).filter((x) => x.tipo !== "movimento").slice(-6);
    return [
      `# ${c.chave} · ${c.titulo}`,
      `Coluna: ${colunaDe(c.fluxo, c.coluna)?.nome ?? c.coluna} · dono: ${c.dono ?? "-"}`,
      `## Descrição\n${c.descricao}`,
      c.criterios ? `## Critérios\n${c.criterios}` : "",
      e ? `## Última entrega (v${e.versao})\n${e.conteudo.slice(0, 8000)}` : "",
      coms.length ? `## Comentários recentes\n${coms.map((x) => `- ${agentById[x.autor]?.nome ?? (x.autor === "voce" ? "CEO" : x.autor)}: ${x.texto.slice(0, 500)}`).join("\n")}` : "",
    ].filter(Boolean).join("\n\n");
  }
  if (nome === "criar_card") {
    const sala = (txt(a.sala) || "desenvolvimento") as RoomId;
    const p = txt(a.projeto) ? projetoPorNome(txt(a.projeto)) : null;
    const dono = agents.find((x) => x.sala === sala && x.lider)?.id ?? agents.find((x) => x.sala === sala)?.id;
    if (!dono) return `Sala inválida: ${sala}.`;
    const fluxo = fluxoPadrao(sala);
    const c = criarCard({ titulo: txt(a.titulo, 200), descricao: txt(a.descricao), criterios: txt(a.criterios, 5000), sala, fluxo, coluna: colunaDeEntrada(fluxo), dono, projetoId: p?.id ?? null, nivel: "N1", prioridade: "P2" });
    return `Card ${c.chave} criado (${sala}, dono ${dono}).`;
  }
  if (nome === "comentar_card") {
    const c = porChave(txt(a.chave));
    if (!c) return "Card não encontrado.";
    comentarComoCeo(c.id, txt(a.texto, 5000));
    return orientarCard(c.id, txt(a.texto, 5000)) ? "Comentado; o agente recebe na próxima rodada." : "Comentado.";
  }
  if (nome === "conversar") {
    const p = txt(a.projeto) ? projetoPorNome(txt(a.projeto)) : null;
    const id = typeof a.conversa_id === "number" ? lerConversa(a.conversa_id).id : criarConversa({ agente: txt(a.agente) || "chief-of-staff", projetoId: p?.id ?? null }).id;
    const enviada = enviarMensagem(id, txt(a.mensagem));
    // Espera a resposta do agente (até 10 min; o modelo local pode demorar).
    const ate = Date.now() + 10 * 60_000;
    while (Date.now() < ate) {
      const resposta = listarMensagens(id).find((m) => m.papel === "agente" && m.id > enviada.id);
      if (resposta) return `${resposta.texto}\n\n(conversa_id: ${id})`;
      await new Promise((ok) => setTimeout(ok, 1500));
    }
    return `O agente ainda está respondendo. Continue com conversa_id ${id} ou veja em Conversas no Hefesto.`;
  }
  throw new Error(`Ferramenta desconhecida: ${nome}`);
}

function novoServidor(): Server {
  const s = new Server({ name: "hefesto", version: "1.0.0" }, { capabilities: { tools: {} } });
  s.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: FERRAMENTAS }));
  s.setRequestHandler(CallToolRequestSchema, async (req) => {
    try {
      return { content: [{ type: "text", text: await chamarFerramentaMcp(req.params.name, (req.params.arguments ?? {}) as Args) }] };
    } catch (e) {
      return { content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }], isError: true };
    }
  });
  return s;
}

/** Atende um pedido MCP (modo sem sessão: um servidor e um transporte por pedido). */
export async function atenderMcp(req: IncomingMessage, res: ServerResponse, corpo: unknown) {
  const transporte = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  const servidor = novoServidor();
  res.on("close", () => {
    void transporte.close();
    void servidor.close();
  });
  await servidor.connect(transporte);
  await transporte.handleRequest(req, res, corpo);
}
