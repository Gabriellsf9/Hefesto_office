import { create } from "zustand";
import type {
  AgentState, Ata, Card, ChatMessage, ContatoWhatsapp, EscritorioDef, EstadoTelegram, EstadoWhatsapp, MensagemWhatsapp, Previa, Comentario, ConfigCritica, Conquista, SessaoNavegador, ServidorMcp, PedidoMcp, SessaoControle, Entrega, ItemConhecimento, Lead, Monitor, Peca, EstadoMotor, EstadoOnboarding, FeedItem, FluxoId, Meta, Projeto, RitualInfo,
  RoomId, SecaoLivro, ServerEvent,
} from "@empresa/shared";

export type ModoBoard = "fechada" | "cheia" | "lado";

export interface EstadoVoz {
  /** Falar as respostas em voz alta. */
  ouvirRespostas: boolean;
  /** "ptt" = segurando para falar; "conversa" = escuta contínua. */
  ouvindo: "nao" | "ptt" | "conversa";
  /** O que está sendo entendido agora (legenda ao vivo). */
  legenda: string;
  /** Agente cuja voz está tocando agora. */
  falando: string | null;
  erro: string | null;
}
import { agentById } from "@empresa/org";
import { definirCardNaRota, navegar, useNav } from "./nav.ts";
import { receberEscritorios } from "./escritorio.ts";

export interface CameraRequest {
  sala: RoomId | null;
  agenteId?: string;
  /** Incrementa a cada pedido, para a câmera reagir mesmo ao mesmo alvo. */
  n: number;
}

interface Store {
  conectado: boolean;
  estados: Record<string, AgentState>;
  feed: FeedItem[];
  chat: ChatMessage[];
  chaveConfigurada: boolean | null;
  demo: boolean;

  salaSelecionada: RoomId | null;
  agenteSelecionado: string | null;
  agenteHover: string | null;
  seguirAtividade: boolean;
  camera: CameraRequest;
  configAberta: boolean;
  /** O que cada agente faz no tempo livre (café, puff, conversa…). Só visual, calculado no navegador. */
  tempoLivre: Record<string, string | null>;

  onboarding: EstadoOnboarding;
  /** Resposta que a Helena está escrevendo agora (streaming). */
  helenaParcial: string;
  erroOnboarding: string | null;
  entrevistaAberta: boolean;
  livro: SecaoLivro[];
  livroAberto: boolean;
  custoHojeUsd: number;

  cards: Record<number, Card>;
  projetos: Projeto[];
  projetoAtivo: number | null;
  modoBoard: ModoBoard;
  fluxoBoard: FluxoId;
  cardAberto: number | null;
  /** Comentários do card aberto (chegam ao vivo pelo WebSocket). */
  comentarios: Comentario[];
  novoCardAberto: boolean;
  /** Entregas (versões) do card aberto. */
  entregas: Entrega[];
  motor: EstadoMotor;
  /** Resposta que a Helena está escrevendo no chat agora. */
  chatParcial: { de: string; texto: string } | null;
  voz: EstadoVoz;
  metas: Meta[];
  rituais: RitualInfo[];
  conhecimento: ItemConhecimento[];
  critica: ConfigCritica;
  /** Leads da prospecção, por card. */
  leads: Record<number, Lead>;
  /** Peças de marketing, por card. */
  pecas: Record<number, Peca>;
  monitores: Monitor[];
  conquistas: Conquista[];
  /** Sessões do navegador dos agentes, por card. */
  navegador: Record<number, SessaoNavegador>;
  navegadorAberto: boolean;
  mcp: ServidorMcp[];
  pedidosMcp: PedidoMcp[];
  conectoresAberto: boolean;
  /** Sessões de controle do Mac, por card. */
  controle: Record<number, SessaoControle>;
  /** Conquista recém-desbloqueada (aparece como aviso por alguns segundos). */
  conquistaNova: Conquista | null;
  /** Aba aberta no painel do Livro. */
  livroAba: "livro" | "conhecimento";
  /** Atas recebidas ao vivo nesta sessão (as antigas o painel busca na API). */
  atasNovas: Ata[];
  rotinaAberta: boolean;
  rotinaAba: "metas" | "indicadores" | "rituais" | "atas" | "operacao" | "conquistas";
  /** Menu Equipe do topo (abre também pelo painel da Diretoria no 3D). */
  equipeAberta: boolean;
  whatsapp: EstadoWhatsapp | null;
  telegram: EstadoTelegram | null;
  /** Prévias do app por card (chegam ao vivo). */
  previas: Record<number, Previa>;
  /** Definições de todos os escritórios (para a página Escritórios e o editor). */
  escritorios: EscritorioDef[];
  contatosWa: Record<string, ContatoWhatsapp>;
  /** Mensagens das conversas já abertas (as outras a tela busca na API). */
  mensagensWa: Record<string, MensagemWhatsapp[]>;
  setMensagensWa: (tel: string, m: MensagemWhatsapp[]) => void;

  aplicar: (e: ServerEvent) => void;
  setConectado: (v: boolean) => void;
  selecionarSala: (sala: RoomId | null) => void;
  selecionarAgente: (id: string | null) => void;
  setHover: (id: string | null) => void;
  setSeguir: (v: boolean) => void;
  setChaveConfigurada: (v: boolean) => void;
  setConfigAberta: (v: boolean) => void;
  visaoGeral: () => void;
  setTempoLivre: (id: string, acao: string | null) => void;
  setEntrevistaAberta: (v: boolean) => void;
  setLivroAberto: (v: boolean, aba?: "livro" | "conhecimento") => void;
  setLivro: (secoes: SecaoLivro[]) => void;
  setModoBoard: (m: ModoBoard) => void;
  setFluxoBoard: (f: FluxoId) => void;
  abrirCard: (id: number | null) => void;
  setComentarios: (c: Comentario[]) => void;
  setNovoCardAberto: (v: boolean) => void;
  setEntregas: (e: Entrega[]) => void;
  setVoz: (v: Partial<EstadoVoz>) => void;
  setRotinaAberta: (v: boolean, aba?: Store["rotinaAba"]) => void;
  setEquipeAberta: (v: boolean) => void;
  /** Leva a câmera até um agente sem abrir o painel (ex.: quando ele fala). */
  focarAgente: (id: string) => void;
}

// Evita a câmera ficar pulando de sala em sala quando várias equipes agem juntas.
const INTERVALO_SEGUIR_MS = 7000;
let ultimoSeguir = 0;

export const useStore = create<Store>((set, get) => ({
  conectado: false,
  estados: {},
  feed: [],
  chat: [],
  chaveConfigurada: null,
  demo: false,

  salaSelecionada: null,
  agenteSelecionado: null,
  agenteHover: null,
  seguirAtividade: true,
  camera: { sala: null, n: 0 },
  configAberta: false,
  tempoLivre: {},

  onboarding: { status: "nao-iniciado", mensagens: [], ocupado: false },
  helenaParcial: "",
  erroOnboarding: null,
  entrevistaAberta: false,
  livro: [],
  livroAberto: false,
  custoHojeUsd: 0,

  cards: {},
  projetos: [],
  projetoAtivo: null,
  modoBoard: "fechada",
  fluxoBoard: "software",
  cardAberto: null,
  comentarios: [],
  novoCardAberto: false,
  entregas: [],
  motor: { pausado: false, semOrcamento: false, orcamentoDiarioUsd: 5, maxSimultaneos: 3, emAndamento: [], naFila: 0 },
  chatParcial: null,
  voz: { ouvirRespostas: true, ouvindo: "nao", legenda: "", falando: null, erro: null },
  metas: [],
  rituais: [],
  conhecimento: [],
  critica: { autocritica: true, advogado: true, licoes: true },
  leads: {},
  pecas: {},
  monitores: [],
  conquistas: [],
  navegador: {},
  navegadorAberto: false,
  mcp: [],
  pedidosMcp: [],
  conectoresAberto: false,
  controle: {},
  conquistaNova: null,
  livroAba: "livro",
  atasNovas: [],
  rotinaAba: "metas",
  equipeAberta: false,
  rotinaAberta: false,
  whatsapp: null,
  telegram: null,
  previas: {},
  escritorios: [],
  contatosWa: {},
  mensagensWa: {},
  setMensagensWa: (tel, m) => set((s) => ({ mensagensWa: { ...s.mensagensWa, [tel]: m } })),

  aplicar: (e) => {
    switch (e.type) {
      case "hello":
        set({
          estados: e.estados,
          feed: e.feed,
          chat: e.chat,
          chaveConfigurada: e.chaveConfigurada,
          demo: e.demo,
          onboarding: e.onboarding,
          livro: e.livro,
          custoHojeUsd: e.custoHojeUsd,
          cards: Object.fromEntries(e.cards.map((c) => [c.id, c])),
          projetos: e.projetos,
          projetoAtivo: e.projetoAtivo,
          motor: e.motor,
          metas: e.metas,
          rituais: e.rituais,
          conhecimento: e.conhecimento,
          critica: e.critica,
          leads: Object.fromEntries(e.leads.map((l) => [l.cardId, l])),
          pecas: Object.fromEntries(e.pecas.map((p) => [p.cardId, p])),
          monitores: e.monitores,
          conquistas: e.conquistas,
          navegador: Object.fromEntries(e.navegador.map((n) => [n.cardId, n])),
          mcp: e.mcp,
          pedidosMcp: e.pedidosMcp,
          controle: Object.fromEntries(e.controle.map((c) => [c.cardId, c])),
          whatsapp: e.whatsapp,
          telegram: e.telegram,
          escritorios: e.escritorios,
          contatosWa: Object.fromEntries(e.contatosWhatsapp.map((c) => [c.telefone, c])),
        });
        receberEscritorios(e.escritorios);
        break;
      case "whatsapp":
        set({ whatsapp: e.estado });
        break;
      case "telegram":
        set({ telegram: e.estado });
        break;
      case "escritorios":
        set({ escritorios: e.definicoes });
        receberEscritorios(e.definicoes);
        break;
      case "previa":
        set((s) => ({ previas: { ...s.previas, [e.previa.cardId]: e.previa } }));
        break;
      case "whatsapp_contato":
        set((s) => ({ contatosWa: { ...s.contatosWa, [e.contato.telefone]: e.contato } }));
        break;
      case "whatsapp_mensagem":
        set((s) => {
          const lista = s.mensagensWa[e.mensagem.telefone];
          if (!lista) return {};
          const i = lista.findIndex((m) => m.id === e.mensagem.id);
          return { mensagensWa: { ...s.mensagensWa, [e.mensagem.telefone]: i >= 0 ? lista.map((m) => (m.id === e.mensagem.id ? e.mensagem : m)) : [...lista, e.mensagem] } };
        });
        break;
      case "controle":
        set((s) => ({ controle: { ...s.controle, [e.sessao.cardId]: e.sessao } }));
        break;
      case "mcp":
        set({ mcp: e.servidores });
        break;
      case "mcp.pedido":
        set((s) => ({ pedidosMcp: s.pedidosMcp.some((p) => p.id === e.pedido.id) ? s.pedidosMcp.map((p) => (p.id === e.pedido.id ? e.pedido : p)) : [e.pedido, ...s.pedidosMcp] }));
        break;
      case "navegador":
        set((s) => ({ navegador: { ...s.navegador, [e.sessao.cardId]: e.sessao } }));
        break;
      case "conquista":
        set((s) => ({ conquistas: s.conquistas.map((c) => (c.id === e.conquista.id ? e.conquista : c)), conquistaNova: e.conquista }));
        break;
      case "monitores":
        set({ monitores: e.monitores });
        break;
      case "peca":
        set((s) => ({ pecas: { ...s.pecas, [e.peca.cardId]: e.peca } }));
        break;
      case "lead":
        set((s) => ({ leads: { ...s.leads, [e.lead.cardId]: e.lead } }));
        break;
      case "lead.removido":
        set((s) => {
          const { [e.cardId]: _, ...resto } = s.leads;
          return { leads: resto };
        });
        break;
      case "conhecimento":
        set({ conhecimento: e.itens });
        break;
      case "critica":
        set({ critica: e.config });
        break;
      case "metas":
        set({ metas: e.metas });
        break;
      case "rituais":
        set({ rituais: e.rituais });
        break;
      case "ata":
        set((s) => ({ atasNovas: [e.ata, ...s.atasNovas] }));
        break;
      case "motor":
        set({ motor: e.estado });
        break;
      case "entrega":
        set((s) => (s.cardAberto === e.entrega.cardId ? { entregas: [...s.entregas, e.entrega] } : {}));
        break;
      case "chat.parcial":
        set({ chatParcial: e.texto ? { de: e.de, texto: e.texto } : null });
        break;
      case "card":
        set((s) => ({ cards: { ...s.cards, [e.card.id]: e.card } }));
        break;
      case "card.removido":
        set((s) => {
          const { [e.id]: _, ...resto } = s.cards;
          return { cards: resto, ...(s.cardAberto === e.id ? { cardAberto: null } : {}) };
        });
        break;
      case "cards":
        set((s) => ({
          cards: Object.fromEntries(e.cards.map((c) => [c.id, c])),
          ...(s.cardAberto !== null && !e.cards.some((c) => c.id === s.cardAberto) ? { cardAberto: null } : {}),
        }));
        break;
      case "comentario":
        set((s) => (s.cardAberto === e.comentario.cardId ? { comentarios: [...s.comentarios, e.comentario] } : {}));
        break;
      case "projetos":
        set({ projetos: e.projetos, projetoAtivo: e.projetoAtivo });
        break;
      case "onboarding":
        set({ onboarding: e.estado, ...(e.estado.ocupado ? { erroOnboarding: null } : {}) });
        break;
      case "onboarding.parcial":
        set({ helenaParcial: e.texto });
        break;
      case "onboarding.erro":
        set({ erroOnboarding: e.erro });
        break;
      case "livro":
        set({ livro: e.secoes });
        break;
      case "custo":
        set({ custoHojeUsd: e.hojeUsd });
        break;
      case "agent.status":
        set((s) => ({ estados: { ...s.estados, [e.agenteId]: e.estado } }));
        break;
      case "feed":
        set((s) => ({ feed: [...s.feed.slice(-199), e.item] }));
        break;
      case "chat":
        set((s) => ({ chat: [...s.chat.slice(-99), e.mensagem] }));
        break;
      case "demo":
        set({ demo: e.ativo });
        break;
      case "chave":
        set({ chaveConfigurada: e.configurada });
        break;
      case "focus": {
        if (!get().seguirAtividade) break;
        const agora = Date.now();
        if (agora - ultimoSeguir < INTERVALO_SEGUIR_MS) break;
        ultimoSeguir = agora;
        set((s) => ({ salaSelecionada: e.sala, agenteSelecionado: null, camera: { sala: e.sala, n: s.camera.n + 1 } }));
        break;
      }
    }
  },
  setConectado: (conectado) => set({ conectado }),
  selecionarSala: (sala) =>
    set((s) => ({ salaSelecionada: sala, agenteSelecionado: null, camera: { sala, n: s.camera.n + 1 } })),
  selecionarAgente: (id) =>
    set((s) => {
      if (!id) return { agenteSelecionado: null };
      const sala = agentById[id]!.sala;
      return { agenteSelecionado: id, salaSelecionada: sala, camera: { sala, agenteId: id, n: s.camera.n + 1 } };
    }),
  setHover: (agenteHover) => set({ agenteHover }),
  setSeguir: (seguirAtividade) => set({ seguirAtividade }),
  setChaveConfigurada: (chaveConfigurada) => set({ chaveConfigurada }),
  setConfigAberta: (configAberta) => {
    if (configAberta) navegar("config", "geral");
  },
  visaoGeral: () =>
    set((s) => ({ salaSelecionada: null, agenteSelecionado: null, camera: { sala: null, n: s.camera.n + 1 } })),
  setTempoLivre: (id, acao) => set((s) => ({ tempoLivre: { ...s.tempoLivre, [id]: acao } })),
  setEntrevistaAberta: (entrevistaAberta) => set({ entrevistaAberta, ...(entrevistaAberta ? { livroAberto: false } : {}) }),
  // As janelas antigas viraram páginas: os abridores agora navegam (DESIGN-INTERFACE.md §3).
  setLivroAberto: (livroAberto, aba) => {
    set(aba ? { livroAba: aba } : {});
    if (livroAberto) navegar("empresa", aba === "conhecimento" ? "conhecimento" : "livro");
  },
  setLivro: (livro) => set({ livro }),
  setModoBoard: (modoBoard) => {
    if (modoBoard !== "fechada") navegar("trabalho", get().fluxoBoard);
    else if (useNav.getState().rota.area === "trabalho") navegar("escritorio");
  },
  setFluxoBoard: (fluxoBoard) => set({ fluxoBoard }),
  abrirCard: (cardAberto) => {
    if (get().cardAberto !== cardAberto) set({ cardAberto, comentarios: [], entregas: [] });
    definirCardNaRota(cardAberto);
  },
  setComentarios: (comentarios) => set({ comentarios }),
  setNovoCardAberto: (novoCardAberto) => set({ novoCardAberto }),
  setEntregas: (entregas) => set({ entregas }),
  setVoz: (v) => set((s) => ({ voz: { ...s.voz, ...v } })),
  setRotinaAberta: (rotinaAberta, aba) => {
    if (!rotinaAberta) return;
    if (aba === "operacao") navegar("operacao", "monitoramento");
    else navegar("empresa", aba ?? "metas");
  },
  setEquipeAberta: (equipeAberta) => set({ equipeAberta }),
  focarAgente: (id) =>
    set((s) => {
      const sala = agentById[id]?.sala;
      return sala ? { camera: { sala, agenteId: id, n: s.camera.n + 1 } } : {};
    }),
}));

// Só em desenvolvimento: acesso à store pelo console para depurar.
if (import.meta.env.DEV) (window as unknown as { __store: typeof useStore }).__store = useStore;
