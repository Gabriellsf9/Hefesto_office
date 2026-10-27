import type { PresetMcp } from "@empresa/shared";

// Atalhos para conectores oficiais (endereços conferidos na documentação de cada empresa em 27/10/2026).
// "Personalizado" aceita qualquer servidor MCP: um comando local (stdio) ou um endereço (HTTP).

export const presets: PresetMcp[] = [
  {
    id: "github",
    nome: "GitHub",
    descricao: "Repositórios, issues, pull requests e busca de código.",
    tipo: "http",
    url: "https://api.githubcopilot.com/mcp/",
    autenticacao: "token",
    campos: [{ id: "token", rotulo: "Token de acesso pessoal (PAT)", secreto: true, ajuda: "github.com → Settings → Developer settings → Fine-grained tokens, só com os repositórios e permissões necessários." }],
    salasSugeridas: ["desenvolvimento", "code-review", "devops", "qa", "arquitetura"],
    ajuda: "Servidor oficial do GitHub. Criar issue, comentar e abrir PR pedem a sua aprovação.",
  },
  {
    id: "stripe",
    nome: "Stripe",
    descricao: "Clientes, cobranças, assinaturas, faturas e relatórios.",
    tipo: "http",
    url: "https://mcp.stripe.com",
    autenticacao: "token",
    campos: [{ id: "token", rotulo: "Agent API key do Stripe", secreto: true, ajuda: "Dashboard → Desenvolvedores → Chaves de API → chave de agente (badge Agent), só com as permissões necessárias. Chaves secretas comuns deixam de funcionar em 30/11/2026." }],
    salasSugeridas: ["administrativo", "diretoria", "dados"],
    ajuda: "Servidor oficial do Stripe. Leituras rodam direto; criar, alterar, estornar ou cobrar pedem a sua aprovação.",
  },
  ...(["gmail", "drive", "calendar"] as const).map((g): PresetMcp => {
    const nome = { gmail: "Gmail", drive: "Google Drive", calendar: "Google Agenda" }[g];
    return {
      id: g,
      nome,
      descricao: { gmail: "Ler e responder e-mails, rascunhos e etiquetas.", drive: "Buscar, ler e criar arquivos e documentos.", calendar: "Ver agenda, criar e mover reuniões." }[g],
      tipo: "http",
      url: `https://${g}mcp.googleapis.com/mcp/v1`,
      autenticacao: "oauth",
      campos: [
        { id: "client_id", rotulo: "Client ID (OAuth)", secreto: false, ajuda: "Google Cloud → APIs e serviços → Credenciais → ID do cliente OAuth (aplicativo da Web)." },
        { id: "client_secret", rotulo: "Client secret", secreto: true },
        { id: "escopos", rotulo: "Escopos (opcional, separados por espaço)", secreto: false },
      ],
      salasSugeridas: g === "gmail" ? ["comercial", "cs", "diretoria"] : g === "calendar" ? ["diretoria", "comercial", "cs"] : ["diretoria", "docs", "administrativo", "marketing"],
      ajuda: `Servidor oficial do Google Workspace. No Google Cloud: ative a API e o serviço "${nome} MCP", crie um cliente OAuth do tipo Web com o endereço de retorno http://127.0.0.1:4317/api/mcp/oauth/callback e cole o ID e o secret aqui. Depois clique em Autorizar e entre na sua conta.`,
    };
  }),
  {
    id: "notion",
    nome: "Notion",
    descricao: "Páginas, bancos de dados e busca no seu workspace.",
    tipo: "http",
    url: "https://mcp.notion.com/mcp",
    autenticacao: "oauth",
    campos: [],
    salasSugeridas: ["produto", "docs", "diretoria"],
    ajuda: "Servidor oficial do Notion. Clique em Autorizar e escolha as páginas que a empresa pode acessar.",
  },
  {
    id: "personalizado",
    nome: "Personalizado",
    descricao: "Qualquer servidor MCP: um comando na sua máquina ou um endereço na internet.",
    tipo: "stdio",
    autenticacao: "nenhuma",
    campos: [],
    salasSugeridas: [],
    ajuda: "Use só servidores de quem você confia: um comando local roda no seu Mac com as permissões do seu usuário.",
  },
];

export const presetPorId = (id: string) => presets.find((p) => p.id === id);
