import { loadApiKey } from "./secrets.ts";
import { estadoGithub } from "./fabrica/github.ts";
import { estadoProducao, vinculoDoProjeto } from "./fabrica/producao.ts";
import { estadoNuvem } from "./fabrica/nuvem.ts";
import { estadoTelegram } from "./telegram.ts";
import { estadoWhatsapp } from "./whatsapp/whatsapp.ts";
import { estadoProvedores } from "./provedores.ts";
import { listarServidores } from "./mcp/conectores.ts";
import { listarProjetos } from "./projetos.ts";
import { podeRodarComandos } from "./plataforma.ts";

// Integrações num lugar só: o que está ligado, o que falta e onde ligar. Só lê o estado de cada uma
// (nada de segredo sai daqui: só "tem token" ou não).

export interface Integracao {
  id: string;
  nome: string;
  estado: "ok" | "atencao" | "desligado";
  /** O que está ligado agora, ou o que falta. */
  detalhe: string;
  /** O que ela destrava na equipe. */
  para: string;
  /** Onde configurar (área e seção da interface). */
  onde: { area: string; sub?: string };
  essencial?: boolean;
}

export async function listarIntegracoes(): Promise<Integracao[]> {
  const prov = await estadoProvedores().catch(() => null);
  const prod = estadoProducao();
  const tg = estadoTelegram();
  const wa = estadoWhatsapp();
  const nuvem = estadoNuvem();
  const mcp = listarServidores();
  const projetos = listarProjetos();
  const vinculos = projetos.map((p) => vinculoDoProjeto(p.id));
  const comVercel = vinculos.filter((v) => v.vercel).length;
  const comSentry = vinculos.filter((v) => v.sentry).length;
  const mcpOk = mcp.filter((s) => s.status === "conectado").length;
  const mcpErro = mcp.filter((s) => s.status === "erro" || s.status === "autorizar").length;
  const localOk = podeRodarComandos();

  return [
    {
      id: "anthropic", nome: "Claude (Anthropic)", essencial: true,
      estado: loadApiKey() ? "ok" : "atencao",
      detalhe: loadApiKey() ? "Chave configurada." : "Sem chave: a equipe não trabalha.",
      para: "Todos os agentes.",
      onde: { area: "config", sub: "geral" },
    },
    {
      id: "sandbox", nome: "Verificação de código",
      estado: localOk || nuvem.ativo ? "ok" : "atencao",
      detalhe: localOk ? "Sandbox local pronta (testes, build e lint rodam isolados)." : nuvem.ativo ? "Roda na sandbox na nuvem." : "Sem sandbox: testes e build não rodam. Use o Docker ou ligue a sandbox na nuvem.",
      para: "Testes de verdade em cada entrega de código, melhor de N, prévia do app.",
      onde: { area: "config", sub: "permissoes" },
    },
    {
      id: "github", nome: "GitHub",
      estado: estadoGithub().configurado ? "ok" : "desligado",
      detalhe: estadoGithub().configurado ? "Token configurado." : "Sem token.",
      para: "Abrir pull request e publicar a branch para a prévia na Vercel.",
      onde: { area: "config", sub: "integracoes" },
    },
    {
      id: "vercel", nome: "Vercel",
      estado: !prod.vercel.configurado ? "desligado" : comVercel ? "ok" : "atencao",
      detalhe: !prod.vercel.configurado ? "Sem token." : comVercel ? `Ligada em ${comVercel} projeto(s).` : "Token salvo, mas nenhum projeto vinculado.",
      para: "Prévia publicada por card, com link no card e no Telegram.",
      onde: { area: "operacao", sub: "projetos" },
    },
    {
      id: "sentry", nome: "Sentry",
      estado: !prod.sentry.configurado ? "desligado" : comSentry ? "ok" : "atencao",
      detalhe: !prod.sentry.configurado ? "Sem token." : comSentry ? `Vigiando ${comSentry} projeto(s) depois do merge.` : "Token salvo, mas nenhum projeto vinculado.",
      para: "Erro novo em produção nas 48 h depois do merge vira card de bug.",
      onde: { area: "operacao", sub: "projetos" },
    },
    {
      id: "telegram", nome: "Telegram",
      estado: !tg.temToken || !tg.ativo ? "desligado" : tg.status === "erro" ? "atencao" : tg.chatId ? "ok" : "atencao",
      detalhe: !tg.temToken ? "Sem bot." : !tg.ativo ? "Desligado." : tg.status === "erro" ? `Erro: ${tg.erro ?? "sem conexão"}` : tg.chatId ? "Pareado." : "Esperando o pareamento do chat.",
      para: "Aprovar pelo celular e avisar as pessoas do time.",
      onde: { area: "config", sub: "celular" },
    },
    {
      id: "whatsapp", nome: "WhatsApp (API oficial)",
      estado: !wa.ativo ? "desligado" : wa.status === "conectado" ? "ok" : "atencao",
      detalhe: !wa.ativo ? "Desligado." : wa.status === "conectado" ? `Conectado${wa.numero ? ` (${wa.numero})` : ""}.` : wa.status === "erro" ? `Erro: ${wa.erro ?? "sem conexão"}` : "Conectando…",
      para: "A Lorena atende clientes, com aprovação sua.",
      onde: { area: "config", sub: "whatsapp" },
    },
    {
      id: "ollama", nome: "Modelos locais (Ollama)",
      estado: !prov ? "desligado" : prov.ollama.online && prov.ollama.modelos.length ? "ok" : prov.ollama.online ? "atencao" : "desligado",
      detalhe: !prov || !prov.ollama.online ? "Ollama fora do ar." : prov.ollama.modelos.length ? `${prov.ollama.modelos.length} modelo(s) instalado(s).` : "No ar, sem modelos instalados.",
      para: "Tarefas simples, testes sombra e código com testes sem custo de API.",
      onde: { area: "config", sub: "modelos" },
    },
    {
      id: "outros", nome: "OpenAI e Gemini",
      estado: prov && (prov.openai.temChave || prov.gemini.temChave) ? "ok" : "desligado",
      detalhe: !prov ? "Sem informação." : [prov.openai.temChave && "OpenAI", prov.gemini.temChave && "Gemini"].filter(Boolean).join(" e ") || "Sem chaves.",
      para: "Outros modelos para tarefas específicas (opcional).",
      onde: { area: "config", sub: "modelos" },
    },
    {
      id: "mcp", nome: "Conectores (MCP)",
      estado: mcpErro ? "atencao" : mcpOk ? "ok" : "desligado",
      detalhe: !mcp.length ? "Nenhum conector." : `${mcpOk} de ${mcp.length} conectado(s)${mcpErro ? `; ${mcpErro} pedindo atenção` : ""}.`,
      para: "Ferramentas externas para os agentes (Notion, Linear, bancos…).",
      onde: { area: "config", sub: "conectores" },
    },
    {
      id: "nuvem", nome: "Sandbox na nuvem",
      estado: nuvem.ativo ? "ok" : "desligado",
      detalhe: nuvem.ativo ? `Ligada: ${nuvem.url}` : "Desligada (opcional).",
      para: "Rodar verificações num executor seu, fora do Mac.",
      onde: { area: "config", sub: "permissoes" },
    },
  ];
}
