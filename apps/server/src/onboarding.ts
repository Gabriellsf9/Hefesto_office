import Anthropic from "@anthropic-ai/sdk";
import { secoesLivro, type EstadoOnboarding, type MensagemEntrevista, type StatusOnboarding } from "@empresa/shared";
import { db, getSetting, setSetting } from "./db.ts";
import { emit, focus, postFeed, setAgentStatus } from "./bus.ts";
import { clienteClaude, registrarUso } from "./custo.ts";
import { ehSecao, lerLivro, salvarSecao, secoesFaltando } from "./livro.ts";

// Fase 2a: a Helena (Chief of Staff) entrevista o CEO e escreve o Livro da Empresa.
// O histórico é guardado exatamente como foi enviado à API e só cresce (nunca é
// editado), o que mantém o cache de prompt e os blocos de raciocínio válidos.

const MODELO = "claude-opus-5-5";
const HELENA = "chief-of-staff";

const SISTEMA = `Você é Helena, Chief of Staff do Hefesto: uma empresa formada por 45 agentes de IA sêniores (produto, design, desenvolvimento, QA, dados, infraestrutura, marketing, comercial, customer success, administrativo) que trabalham para o CEO, a pessoa com quem você está falando.

Agora você conduz a entrevista de onboarding. O objetivo é conhecer o negócio do CEO a fundo para escrever o Livro da Empresa: o documento que todos os agentes vão ler antes de trabalhar. Um Livro raso faz os agentes produzirem trabalho genérico; um Livro concreto (nomes, números, exemplos, palavras do próprio CEO) faz eles trabalharem como se fossem da casa.

A entrevista tem sete blocos, nesta ordem. Cada um vira uma seção do Livro:
${secoesLivro.map((s, i) => `${i + 1}. ${s.titulo} (id "${s.id}"): ${s.objetivo}.`).join("\n")}

Como conduzir:
- Fale em português do Brasil, com o tom de uma executiva experiente: calorosa, direta e curiosa. Mensagens curtas no chat (até umas 80 palavras), sem títulos nem listas longas.
- Faça uma ou duas perguntas por vez. Quando a resposta for vaga no que é essencial, peça um exemplo, um número ou um nome. Se o CEO não souber ou não quiser responder, aceite, registre como "a definir" e siga em frente.
- Quando o CEO mandar um link (site, página do produto, Instagram), use web_fetch para ler e confirme com ele o que você entendeu, em vez de perguntar o que já está escrito lá.
- Ao fechar um bloco, chame registrar_secao com a seção consolidada em Markdown: tópicos objetivos com os fatos ditos pelo CEO e o que você leu nos links (cite o link). Não invente nada; o que for dedução sua, marque com "(inferido)". Depois diga em uma frase o que registrou e passe ao próximo bloco.
- Se o CEO corrigir algo de um bloco já registrado, chame registrar_secao de novo para aquela seção com a versão completa já corrigida.
- O CEO pode pausar e voltar depois. Ao retomar, continue de onde parou, sem repetir perguntas já respondidas.
- Depois de registrar os sete blocos, faça um resumo de três ou quatro linhas do que aprendeu e pergunte se ele quer ajustar algo. Quando ele confirmar que está bom, chame concluir_entrevista e diga que o Livro está pronto para ele revisar no botão "Livro" do topo da tela.`;

const FERRAMENTAS: Anthropic.Beta.BetaToolUnion[] = [
  {
    name: "registrar_secao",
    description:
      "Grava (ou regrava por inteiro) uma seção do Livro da Empresa com o que foi aprendido no bloco. Use ao fechar cada bloco e quando o CEO corrigir uma seção já gravada.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        secao: { type: "string", enum: secoesLivro.map((s) => s.id), description: "Id da seção" },
        conteudo: { type: "string", description: "Conteúdo completo da seção em Markdown" },
      },
      required: ["secao", "conteudo"],
      additionalProperties: false,
    },
  },
  {
    name: "concluir_entrevista",
    description: "Encerra a entrevista depois que as sete seções foram gravadas e o CEO confirmou que está tudo certo.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: { resumo: { type: "string", description: "Resumo de duas ou três linhas do que foi aprendido" } },
      required: ["resumo"],
      additionalProperties: false,
    },
  },
  { type: "web_fetch_20260209", name: "web_fetch", max_uses: 5 },
];

/* ---------- Persistência ---------- */

interface Linha {
  id: number;
  ts: number;
  papel: "user" | "assistant";
  conteudo: string;
  texto: string;
  visivel: number;
}

function linhas(): Linha[] {
  return db.prepare("SELECT id, ts, papel, conteudo, texto, visivel FROM onboarding_msgs ORDER BY id").all() as unknown as Linha[];
}

function anexar(papel: "user" | "assistant", conteudo: Anthropic.Beta.BetaMessageParam["content"], texto: string, visivel: boolean) {
  db.prepare("INSERT INTO onboarding_msgs (ts, papel, conteudo, texto, visivel) VALUES (?, ?, ?, ?, ?)").run(
    Date.now(), papel, JSON.stringify(conteudo), texto, visivel ? 1 : 0,
  );
}

const historico = (): Anthropic.Beta.BetaMessageParam[] =>
  linhas().map((l) => ({ role: l.papel, content: JSON.parse(l.conteudo) }));

export function statusOnboarding(): StatusOnboarding {
  return (getSetting("onboarding_status") as StatusOnboarding | null) ?? "nao-iniciado";
}

let ocupado = false;

export function estadoOnboarding(): EstadoOnboarding {
  const mensagens: MensagemEntrevista[] = linhas()
    .filter((l) => l.visivel && l.texto.trim())
    .map((l) => ({ id: l.id, ts: l.ts, de: l.papel === "user" ? "voce" : "helena", texto: l.texto }));
  return { status: statusOnboarding(), mensagens, ocupado };
}

const publicar = () => emit({ type: "onboarding", estado: estadoOnboarding() });

/* ---------- Conversa ---------- */

/** Sem chave não grava nada: a mensagem ficaria no histórico sem a Helena poder responder. */
function semChave() {
  if (clienteClaude()) return false;
  emit({ type: "onboarding.erro", erro: "Configure a chave da API (botão no topo) para a Helena poder conversar." });
  return true;
}

export async function iniciarEntrevista() {
  if (linhas().length > 0) return publicar();
  if (semChave()) return;
  setSetting("onboarding_status", "em-andamento");
  anexar(
    "user",
    [{ type: "text", text: "O CEO acabou de abrir a entrevista pela primeira vez. Apresente-se em poucas linhas, diga para que serve o Livro da Empresa e comece pelo bloco Negócio." }],
    "",
    false,
  );
  await conversar();
}

export async function responder(texto: string) {
  const limpo = texto.trim().slice(0, 8000);
  if (!limpo || ocupado || semChave()) return;
  if (statusOnboarding() === "nao-iniciado") setSetting("onboarding_status", "em-andamento");
  anexar("user", [{ type: "text", text: limpo }], limpo, true);
  publicar();
  await conversar();
}

/** Executa o laço de ferramentas até a Helena terminar a vez dela. */
async function conversar() {
  const client = clienteClaude();
  if (!client) return;
  ocupado = true;
  publicar();
  focus("diretoria", HELENA);
  setAgentStatus(HELENA, "pensando", "Entrevistando o CEO");

  let tentativasJson = 0;
  try {
    for (let rodada = 0; rodada < 12; rodada++) {
      let parcial = "";
      const stream = client.beta.messages.stream({
        model: MODELO,
        max_tokens: 64000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium" },
        cache_control: { type: "ephemeral" },
        system: SISTEMA,
        tools: FERRAMENTAS,
        messages: historico(),
      });
      stream.on("text", (delta) => {
        if (!parcial) setAgentStatus(HELENA, "trabalhando", "Conversando com o CEO");
        parcial += delta;
        emit({ type: "onboarding.parcial", texto: parcial });
      });

      let msg: Anthropic.Beta.BetaMessage;
      try {
        msg = await stream.finalMessage();
        tentativasJson = 0;
      } catch (err) {
        // Com eager_input_streaming, uma entrada de ferramenta ilegível rejeita aqui. Só isso é repetido.
        if (err instanceof Anthropic.APIError || tentativasJson++ >= 2) throw err;
        continue;
      }
      registrarUso(MODELO, msg.usage);

      // Recusa e corte por limite não entram no histórico: uma ferramenta pela metade
      // deixaria uma chamada sem resultado e quebraria as próximas requisições.
      const usos = msg.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (msg.stop_reason === "refusal") {
        emit({ type: "onboarding.erro", erro: "A Helena não conseguiu responder a essa mensagem. Tente reformular." });
        break;
      }
      if (msg.stop_reason === "max_tokens" && usos.length) {
        emit({ type: "onboarding.erro", erro: "A resposta da Helena ficou longa demais e foi cortada. Tente de novo." });
        break;
      }

      const texto = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
      anexar("assistant", msg.content as Anthropic.Beta.BetaContentBlockParam[], texto, true);
      emit({ type: "onboarding.parcial", texto: "" });
      publicar();

      if (msg.stop_reason === "pause_turn") continue; // web_fetch longo: continua de onde parou
      if (msg.stop_reason !== "tool_use" || usos.length === 0) break;

      const resultados: Anthropic.Beta.BetaToolResultBlockParam[] = usos.map((u) => executar(u));
      anexar("user", resultados, "", false);
    }
  } catch (err) {
    emit({ type: "onboarding.erro", erro: mensagemDeErro(err) });
  } finally {
    ocupado = false;
    emit({ type: "onboarding.parcial", texto: "" });
    setAgentStatus(HELENA, "ocioso", null);
    publicar();
  }
}

function executar(u: Anthropic.Beta.BetaToolUseBlock): Anthropic.Beta.BetaToolResultBlockParam {
  const entrada = u.input as Record<string, unknown>;
  const erro = (texto: string): Anthropic.Beta.BetaToolResultBlockParam => ({
    type: "tool_result", tool_use_id: u.id, is_error: true, content: texto,
  });

  if (u.name === "registrar_secao") {
    const { secao, conteudo } = entrada;
    if (typeof secao !== "string" || !ehSecao(secao) || typeof conteudo !== "string" || !conteudo.trim()) {
      return erro(`Entrada inválida. Esperado: secao (uma de ${secoesLivro.map((s) => s.id).join(", ")}) e conteudo em Markdown.`);
    }
    salvarSecao(secao, conteudo.trim(), false);
    const titulo = secoesLivro.find((s) => s.id === secao)!.titulo;
    postFeed("diretoria", HELENA, `Helena registrou a seção "${titulo}" no Livro da Empresa`);
    const faltam = secoesFaltando().map((id) => secoesLivro.find((s) => s.id === id)!.titulo);
    return { type: "tool_result", tool_use_id: u.id, content: faltam.length ? `Seção "${titulo}" gravada. Faltam: ${faltam.join(", ")}.` : `Seção "${titulo}" gravada. Todas as sete seções estão gravadas.` };
  }

  if (u.name === "concluir_entrevista") {
    const faltam = secoesFaltando();
    if (faltam.length) return erro(`Ainda faltam seções: ${faltam.join(", ")}. Grave-as antes de concluir.`);
    setSetting("onboarding_status", "concluido");
    postFeed("diretoria", HELENA, "Helena concluiu a entrevista: o Livro da Empresa está pronto para revisão");
    return { type: "tool_result", tool_use_id: u.id, content: `Entrevista concluída. ${lerLivro().length} seções gravadas.` };
  }

  return erro(`Ferramenta desconhecida: ${u.name}`);
}

function mensagemDeErro(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "A chave da API foi recusada. Confira em \"Chave da API\".";
  if (err instanceof Anthropic.PermissionDeniedError) return "A chave não tem permissão para usar este modelo.";
  if (err instanceof Anthropic.RateLimitError) return "Limite de uso da API atingido. Tente de novo em alguns instantes.";
  if (err instanceof Anthropic.APIConnectionError) return "Sem conexão com a API da Anthropic. Verifique sua internet.";
  if (err instanceof Anthropic.APIError) return `A API respondeu com erro ${err.status ?? ""}: ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}
