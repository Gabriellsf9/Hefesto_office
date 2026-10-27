// Tipos compartilhados entre o escritório 3D (web) e o servidor.

export * from "./board.ts";
import type { Ata, Card, Comentario, ConfigCritica, Conquista, ContatoWhatsapp, EstadoWhatsapp, MensagemWhatsapp, SessaoNavegador, ServidorMcp, PedidoMcp, SessaoControle, Entrega, EstadoMotor, ItemConhecimento, Lead, Meta, Monitor, Peca, Projeto, RitualInfo } from "./board.ts";

export type RoomId =
  | "diretoria"
  | "produto"
  | "design"
  | "arquitetura"
  | "desenvolvimento"
  | "code-review"
  | "qa"
  | "seguranca"
  | "devops"
  | "dados"
  | "infraestrutura"
  | "docs"
  | "marketing"
  | "comercial"
  | "cs"
  | "administrativo"
  | "reuniao";

export type ModelTier = "claude-opus-5-5" | "claude-sonnet-5-5" | "claude-haiku-5-5";

export type AgentTool =
  | "arquivos"
  | "terminal"
  | "git"
  | "navegador"
  | "playwright"
  | "celular"
  | "k6"
  | "web"
  | "imagens"
  | "redes-sociais"
  | "anuncios"
  | "planilhas"
  | "banco-de-dados"
  | "ssh";

export interface Room {
  id: RoomId;
  nome: string;
  descricao: string;
  /** Cor do piso/destaque da sala (hex). */
  cor: string;
  /**
   * Agente (de preferência de outra área) que valida toda entrega desta sala
   * antes de ela chegar ao CEO para a aprovação final.
   */
  validador: string | null;
}

export interface Agent {
  id: string;
  nome: string;
  cargo: string;
  sala: RoomId;
  modelo: ModelTier;
  lider: boolean;
  persona: string;
  ferramentas: AgentTool[];
  /** Ids dos agentes ou salas que este agente costuma acionar. */
  podeChamar: string[];
  aparencia: { camisa: string; pele: string; cabelo: string };
}

export type AgentStatus =
  | "ocioso"
  | "pensando"
  | "trabalhando"
  | "em-reuniao"
  | "testando"
  | "validando"
  | "aguardando-aprovacao";

/**
 * Ciclo de vida de toda entrega, em qualquer área:
 * autor produz → validador debate e devolve até concordar → CEO aprova ou devolve.
 */
export type DeliveryStage =
  | "em-producao"
  | "em-validacao"
  | "devolvida-pelo-validador"
  | "aguardando-ceo"
  | "devolvida-pelo-ceo"
  | "aprovada";

export interface AgentState {
  status: AgentStatus;
  /** O que o agente está fazendo agora, em uma frase. */
  atividade: string | null;
  /** Agente com quem está interagindo agora (ex.: o validador vai até a mesa dele). */
  com?: string | null;
  desde: number;
}

export interface FeedItem {
  id: string;
  ts: number;
  sala: RoomId;
  agenteId: string | null;
  texto: string;
}

export interface ChatMessage {
  id: string;
  ts: number;
  /** "voce" quando é o usuário; senão o id do agente. */
  de: string;
  texto: string;
  /** Imagens anexadas (endereços /api/midia/chat/…). */
  imagens?: string[];
}

/* ---------- Livro da Empresa e entrevista de onboarding (Fase 2a) ---------- */

export type SecaoLivroId = "negocio" | "clientes" | "marca" | "mercado" | "ativos" | "metas" | "limites";

/** Ordem e objetivo de cada bloco da entrevista; cada bloco vira uma seção do Livro. */
export const secoesLivro: { id: SecaoLivroId; titulo: string; objetivo: string }[] = [
  { id: "negocio", titulo: "Negócio", objetivo: "O que a empresa vende, para quem, preço, diferencial e estágio atual" },
  { id: "clientes", titulo: "Clientes", objetivo: "Perfil do cliente ideal, dores, objeções e onde esses clientes estão" },
  { id: "marca", titulo: "Marca", objetivo: "Tom de voz, cores, palavras que usa e evita, referências de que o CEO gosta" },
  { id: "mercado", titulo: "Mercado", objetivo: "Concorrentes, referências e posicionamento desejado" },
  { id: "ativos", titulo: "Ativos", objetivo: "Site, redes sociais, repositórios e materiais que já existem" },
  { id: "metas", titulo: "Metas", objetivo: "O que precisa acontecer nos próximos 3 e 12 meses" },
  { id: "limites", titulo: "Limites", objetivo: "Orçamento mensal de API e de mídia, temas proibidos e o que o CEO não quer delegar" },
];

export interface SecaoLivro {
  id: SecaoLivroId;
  conteudo: string;
  atualizadoEm: number;
  /** O CEO conferiu esta seção depois da entrevista. */
  revisada: boolean;
}

export type StatusOnboarding = "nao-iniciado" | "em-andamento" | "concluido";

export interface MensagemEntrevista {
  id: number;
  ts: number;
  de: "voce" | "helena";
  texto: string;
}

export interface EstadoOnboarding {
  status: StatusOnboarding;
  mensagens: MensagemEntrevista[];
  /** A Helena está respondendo agora. */
  ocupado: boolean;
}

export type ServerEvent =
  | {
      type: "hello";
      estados: Record<string, AgentState>;
      feed: FeedItem[];
      chat: ChatMessage[];
      chaveConfigurada: boolean;
      demo: boolean;
      onboarding: EstadoOnboarding;
      livro: SecaoLivro[];
      custoHojeUsd: number;
      cards: Card[];
      projetos: Projeto[];
      projetoAtivo: number | null;
      motor: EstadoMotor;
      metas: Meta[];
      rituais: RitualInfo[];
      conhecimento: ItemConhecimento[];
      critica: ConfigCritica;
      leads: Lead[];
      pecas: Peca[];
      monitores: Monitor[];
      conquistas: Conquista[];
      navegador: SessaoNavegador[];
      mcp: ServidorMcp[];
      pedidosMcp: PedidoMcp[];
      controle: SessaoControle[];
      whatsapp: EstadoWhatsapp;
      contatosWhatsapp: ContatoWhatsapp[];
    }
  | { type: "whatsapp"; estado: EstadoWhatsapp }
  | { type: "whatsapp_contato"; contato: ContatoWhatsapp }
  | { type: "whatsapp_mensagem"; mensagem: MensagemWhatsapp }
  | { type: "controle"; sessao: SessaoControle }
  | { type: "mcp"; servidores: ServidorMcp[] }
  | { type: "mcp.pedido"; pedido: PedidoMcp }
  | { type: "navegador"; sessao: SessaoNavegador }
  | { type: "conquista"; conquista: Conquista }
  | { type: "monitores"; monitores: Monitor[] }
  | { type: "peca"; peca: Peca }
  | { type: "lead"; lead: Lead }
  | { type: "lead.removido"; cardId: number }
  | { type: "conhecimento"; itens: ItemConhecimento[] }
  | { type: "critica"; config: ConfigCritica }
  | { type: "metas"; metas: Meta[] }
  | { type: "rituais"; rituais: RitualInfo[] }
  | { type: "ata"; ata: Ata }
  | { type: "entrega"; entrega: Entrega }
  | { type: "motor"; estado: EstadoMotor }
  /** Texto parcial de uma resposta no chat (a Helena escrevendo). */
  | { type: "chat.parcial"; de: string; texto: string }
  | { type: "card"; card: Card }
  | { type: "card.removido"; id: number }
  | { type: "cards"; cards: Card[] }
  | { type: "comentario"; comentario: Comentario }
  | { type: "projetos"; projetos: Projeto[]; projetoAtivo: number | null }
  | { type: "onboarding"; estado: EstadoOnboarding }
  /** Texto parcial da resposta que a Helena está escrevendo agora. */
  | { type: "onboarding.parcial"; texto: string }
  | { type: "onboarding.erro"; erro: string }
  | { type: "livro"; secoes: SecaoLivro[] }
  | { type: "custo"; hojeUsd: number }
  | { type: "agent.status"; agenteId: string; estado: AgentState }
  | { type: "feed"; item: FeedItem }
  | { type: "chat"; mensagem: ChatMessage }
  | { type: "focus"; sala: RoomId; agenteId?: string }
  | { type: "demo"; ativo: boolean }
  | { type: "chave"; configurada: boolean };

export type ClientEvent =
  | { type: "command"; texto: string; imagens?: string[] }
  | { type: "demo"; ativo: boolean }
  | { type: "onboarding.iniciar" }
  | { type: "onboarding.responder"; texto: string };

export interface StatusResponse {
  chaveConfigurada: boolean;
  /** Ex.: "sk-ant-…a1b2". Nunca a chave inteira. */
  dicaChave: string | null;
}
