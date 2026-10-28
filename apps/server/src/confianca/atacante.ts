import type Anthropic from "@anthropic-ai/sdk";
import type { Agent, Card } from "@empresa/shared";
import { agentById } from "@empresa/org";
import { postFeed, setAgentStatus } from "../bus.ts";
import { modeloDoAgente } from "../provedores.ts";
import { modoCusto } from "../custo.ts";
import { comentar, listarComentarios, ultimaEntrega } from "../tarefas.ts";
import { ferramenta, ferramentasDeProjeto, rodarAgente } from "../agentes/loop.ts";
import { auditar } from "./auditoria.ts";

// Atacante (red team): antes da revisão, alguém de segurança lê o diff do card tentando explorá-lo
// (injeção, autorização quebrada, XSS, SSRF, segredo, upload, criptografia fraca…). Achado crítico ou
// alto volta para o autor como falha de verificação; médio e baixo ficam no card para o revisor.

/** Caminhos que pedem ataque mesmo em card comum. */
const SENSIVEL = /auth|login|logout|senha|password|token|sess(ao|ion)|cookie|jwt|oauth|crypt|hash|permiss|role|admin|acl|sql|query|upload|webhook|pagamento|payment|checkout|cors|csrf|redirect|middleware|api\/|routes?\//i;

export const PREFIXO_ATAQUE = "❌ Verificação falhou (ataque)";

export function precisaDeAtaque(card: Card, arquivos: string[]): boolean {
  const importante = card.nivel === "N2" || card.nivel === "N3" || card.tipo === "epico" || card.prioridade === "P0";
  return importante || arquivos.some((a) => SENSIVEL.test(a));
}

/** Já houve ataque nesta versão da entrega? */
export function jaAtacado(card: Card): boolean {
  const e = ultimaEntrega(card.id);
  if (!e) return true;
  return listarComentarios(card.id).some((c) => c.ts >= e.ts && (c.texto.startsWith(PREFIXO_ATAQUE) || c.texto.startsWith("🛡️ Ataque")));
}

/** Quem ataca: o pentester, o appsec ou outro da segurança que não seja o autor. */
export function escolherAtacante(card: Card): Agent | undefined {
  return ["pentester", "appsec", "security-champion"].map((id) => agentById[id]).find((a) => a && a.id !== card.dono);
}

interface Achado {
  severidade: "critica" | "alta" | "media" | "baixa";
  arquivo: string;
  descricao: string;
  exploracao: string;
  correcao: string;
}

const campo = (a: Record<string, unknown>, k: string, max: number) => (typeof a[k] === "string" ? (a[k] as string).trim().slice(0, max) : "");

const SEV: Record<Achado["severidade"], string> = { critica: "🔴 Crítica", alta: "🟠 Alta", media: "🟡 Média", baixa: "⚪ Baixa" };

/** Roda o ataque. Devolve true se barrou (achado crítico ou alto: volta para o autor). */
export async function atacar(client: Anthropic | null, card: Card, atacante: Agent, patch: string, raiz: string, sinal: AbortSignal): Promise<boolean> {
  let achados: Achado[] | null = null;
  setAgentStatus(atacante.id, "em-reuniao", `Atacando o código do ${card.chave}`, card.dono ?? null);
  try {
    await rodarAgente({
      client,
      // Custo: Opus só no modo Qualidade máxima; nos outros, Sonnet basta para ler um diff atrás de falhas.
      modelo: /opus/i.test(modeloDoAgente(atacante, "apoio")) && modoCusto() !== "maximo" ? "claude-sonnet-5-5" : modeloDoAgente(atacante, "apoio"),
      agenteId: atacante.id,
      cardId: card.id,
      sinal,
      esforco: "medium",
      sistema: `Você é ${atacante.nome}, ${atacante.cargo}, no papel de atacante (red team) do código da própria empresa. Português do Brasil.
Leia o diff tentando quebrá-lo como um atacante faria: injeção (SQL, comando, template), autorização quebrada (IDOR, falta de checagem de dono ou papel), autenticação, XSS, SSRF, CSRF, path traversal, upload sem validação, deserialização, segredo no código, criptografia fraca, vazamento de dados em log ou resposta, condição de corrida em dinheiro ou estoque.
Só relate o que der para explorar de verdade com este código (cite arquivo e o caminho do ataque). Nada de boas práticas genéricas. Leia os arquivos ao redor quando precisar confirmar (ex.: se já existe um middleware de autenticação). Não rode nada: só leitura.
Severidade: critica (explora sem login ou vaza dados de todos), alta (explora com uma conta comum), media (exige condição rara), baixa (endurecimento).
Termine chamando relatar (lista vazia se não achou nada explorável).`,
      mensagem: `# ${card.chave} — ${card.titulo}\n\n${card.descricao.slice(0, 3000)}\n\n## Diff\n\`\`\`diff\n${patch.slice(0, 40_000)}\n\`\`\``,
      ferramentas: [
        ...ferramentasDeProjeto(raiz),
        ferramenta(
          "relatar",
          "Relata os achados exploráveis (vazio se nenhum). Termina o ataque.",
          {
            achados: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  severidade: { type: "string", enum: ["critica", "alta", "media", "baixa"] },
                  arquivo: { type: "string" },
                  descricao: { type: "string" },
                  exploracao: { type: "string", description: "Como explorar, passo a passo" },
                  correcao: { type: "string" },
                },
                required: ["severidade", "arquivo", "descricao", "exploracao", "correcao"],
              },
            },
          },
          ["achados"],
          (e) => {
            const lista = Array.isArray(e.achados) ? (e.achados as Record<string, unknown>[]) : [];
            achados = lista.slice(0, 20).map((a) => ({
              severidade: (["critica", "alta", "media", "baixa"].includes(String(a.severidade)) ? a.severidade : "media") as Achado["severidade"],
              arquivo: campo(a, "arquivo", 300),
              descricao: campo(a, "descricao", 1500),
              exploracao: campo(a, "exploracao", 1500),
              correcao: campo(a, "correcao", 1500),
            }));
            return { texto: "Registrado.", fim: true };
          },
        ),
      ],
      lembrete: "Chame relatar com os achados (ou lista vazia).",
      maxRodadas: 10,
    });
  } finally {
    setAgentStatus(atacante.id, "ocioso", null);
  }
  const lista = (achados as Achado[] | null) ?? [];
  const graves = lista.filter((a) => a.severidade === "critica" || a.severidade === "alta");
  const item = (a: Achado) => `- **${SEV[a.severidade]}** \`${a.arquivo}\` — ${a.descricao}\n  - Ataque: ${a.exploracao}\n  - Correção: ${a.correcao}`;
  auditar(atacante.id, "ataque ao código", card.chave, `${lista.length} achado(s), ${graves.length} grave(s)`);
  if (graves.length) {
    comentar(card.id, atacante.id, "comentario", `${PREFIXO_ATAQUE}: ${atacante.nome} conseguiu explorar o código. Corrija antes da revisão:\n${lista.map(item).join("\n")}`);
    postFeed(atacante.sala, atacante.id, `${atacante.nome} achou ${graves.length} falha(s) grave(s) no ${card.chave} e devolveu ao autor`);
    return true;
  }
  comentar(card.id, atacante.id, "comentario", lista.length ? `🛡️ Ataque: nada grave. Pontos para o revisor:\n${lista.map(item).join("\n")}` : "🛡️ Ataque: tentei explorar o diff e não achei nada explorável.");
  return false;
}
