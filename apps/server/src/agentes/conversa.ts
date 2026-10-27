import { colunaDe, type Agent } from "@empresa/shared";
import { agentesDe, nomeDaSala, SEDE } from "@empresa/org";
import { emit, focus, postChat, setAgentStatus } from "../bus.ts";
import { clienteClaude } from "../custo.ts";
import { listarCards, listarComentarios, ultimaEntrega } from "../tarefas.ts";
import { rodarAgente } from "./loop.ts";
import { playbookDe } from "./prompts.ts";
import { ferramentasDeConectores } from "../mcp/ferramentas.ts";
import { ferramentaMemoria } from "../memoria.ts";

// "Rafael, como está o login?": o CEO chama um agente pelo nome e ele mesmo
// responde, curto e falado, sobre o trabalho dele. Usa o Haiku (conversa rápida,
// como no plano); o trabalho de verdade continua no motor.

const MODELO_CONVERSA = "claude-haiku-5-5";

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Descobre se a fala começa chamando alguém pelo nome ("Rafael, …", "oi Ana …").
 * O reconhecimento de voz nem sempre põe vírgula, então basta o nome ser a primeira palavra.
 */
export function agenteChamado(texto: string, escritorio = SEDE): { agente: Agent; pergunta: string } | null {
  const m = /^\s*(?:(?:oi|olá|ola|ei|e aí|e ai|fala)[,!\s]+)?([\p{L}]+)[,:!?\s]+(.+)$/isu.exec(texto);
  if (!m) return null;
  const nome = semAcento(m[1]!);
  const agente = agentesDe(escritorio).find((a) => semAcento(a.nome) === nome);
  return agente ? { agente, pergunta: m[2]!.trim() } : null;
}

function contextoDoAgente(agente: Agent): string {
  const meus = listarCards().filter((c) => !c.demo && (c.dono === agente.id || c.validador === agente.id));
  if (!meus.length) return "Você não tem nenhum card agora.";
  return meus
    .slice(-15)
    .map((c) => {
      const col = colunaDe(c.fluxo, c.coluna)?.nome ?? c.coluna;
      const papel = c.dono === agente.id ? "dono" : "validador";
      const entrega = ultimaEntrega(c.id);
      const ultimoDebate = listarComentarios(c.id).filter((x) => x.tipo !== "movimento").at(-1);
      return [
        `- ${c.chave} "${c.titulo}" — coluna ${col}, você é ${papel}${c.emValidacao ? ", em validação" : ""}${c.bloqueado ? ", BLOQUEADO" : ""}${c.devolucoes ? `, devolvido ${c.devolucoes}×` : ""}`,
        entrega ? `  Última entrega (v${entrega.versao}): ${entrega.resumo}` : "",
        ultimoDebate ? `  Último comentário: ${ultimoDebate.texto.slice(0, 300)}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");
}

export async function conversarComAgente(agente: Agent, pergunta: string, imagens: string[] = [], arquivos: string[] = []) {
  const client = clienteClaude();
  focus(agente.sala, agente.id);
  if (!client) {
    postChat(agente.id, "Configure a chave da API para eu poder responder.");
    return;
  }
  setAgentStatus(agente.id, "pensando", "Respondendo ao CEO");
  const sistema = `Você é ${agente.nome}, ${agente.cargo} do Hefesto (área ${nomeDaSala(agente.sala)}). ${agente.persona}

O CEO está falando com você por voz. Responda como numa conversa rápida de corredor: em português do Brasil, 2 a 4 frases curtas, sem listas, sem títulos, sem Markdown e sem emojis (a resposta vai ser lida em voz alta). Fale só do que está nos seus cards; se não souber, diga que não sabe e o que vai fazer. Não invente progresso.

Seu padrão de trabalho, para referência:
${playbookDe(agente.sala)}`;

  try {
    const conectores = [ferramentaMemoria, ...ferramentasDeConectores(agente, null)];
    const r = await rodarAgente({
      client,
      modelo: MODELO_CONVERSA,
      sistema,
      mensagem: `## Seus cards agora\n${contextoDoAgente(agente)}\n\n## O CEO pergunta\n${pergunta}${imagens.length || arquivos.length ? "\n\n(O CEO anexou imagens ou arquivos, acima.)" : ""}`,
      imagens,
      arquivos,
      // Conectores da sala (ex.: "Vanessa, quantos tickets abertos?" lendo do sistema de suporte).
      ferramentas: conectores,
      esforco: "low",
      fallback: false,
      exigeFerramenta: false,
      lembrete: "",
      maxRodadas: conectores.length ? 4 : 1,
      onTexto: (parcial) => emit({ type: "chat.parcial", de: agente.id, texto: parcial }),
    });
    emit({ type: "chat.parcial", de: agente.id, texto: "" });
    postChat(agente.id, r.texto.trim() || "Agora não consegui responder. Pode repetir?");
  } catch (err) {
    emit({ type: "chat.parcial", de: agente.id, texto: "" });
    postChat(agente.id, `Não consegui responder agora: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    setAgentStatus(agente.id, "ocioso", null);
  }
}
