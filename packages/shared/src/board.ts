import type { RoomId } from "./index.ts";

// Backlog central e board estilo Jira (Fase 2b). Toda tarefa da empresa é um card;
// cada área trabalha num fluxo (conjunto de colunas) que faz sentido para ela.

/** Id de um fluxo. Os da sede são software, marketing, comercial, operacoes e geral; escritórios novos têm ids próprios. */
export type FluxoId = string;
/** Comportamento base do fluxo (o que o sistema faz de especial nele: código, leads, peças…). */
export type BaseFluxo = "software" | "marketing" | "comercial" | "operacoes" | "geral" | "conteudo" | "atendimento" | "pedidos" | "personalizado";

/** Papel da coluna no fluxo: define regras (aprovação, bugs, conclusão). */
export type TipoColuna = "fila" | "trabalho" | "validacao" | "bug" | "ceo" | "feito" | "perdido";

export interface Coluna {
  id: string;
  nome: string;
  tipo: TipoColuna;
  /** Sala que trabalha nesta coluna (o 3D acende quando um card entra nela). */
  sala?: RoomId;
}

export interface Fluxo {
  id: FluxoId;
  nome: string;
  /** Comportamento base (o dos fluxos da sede é o próprio id). */
  base?: BaseFluxo;
  colunas: Coluna[];
  /** Para onde o card volta quando você devolve com comentário. */
  devolverPara: string;
  /** Para onde o card vai quando você aprova. */
  aprovarPara: string;
}

/** Todos os fluxos de todos os escritórios (o registro de escritórios acrescenta os novos). */
export const fluxos: Record<FluxoId, Fluxo> = {
  software: {
    id: "software",
    nome: "Software",
    devolverPara: "em-dev",
    aprovarPara: "concluido",
    colunas: [
      { id: "backlog", nome: "Backlog", tipo: "fila" },
      { id: "a-fazer", nome: "A fazer", tipo: "fila", sala: "produto" },
      { id: "design", nome: "Design", tipo: "trabalho", sala: "design" },
      { id: "em-dev", nome: "Em dev", tipo: "trabalho", sala: "desenvolvimento" },
      { id: "code-review", nome: "Code review", tipo: "validacao", sala: "code-review" },
      { id: "seguranca", nome: "Segurança", tipo: "validacao", sala: "seguranca" },
      { id: "em-qa", nome: "Em QA", tipo: "validacao", sala: "qa" },
      { id: "bug", nome: "Bug", tipo: "bug", sala: "desenvolvimento" },
      { id: "aguardando-ceo", nome: "Aguardando CEO", tipo: "ceo", sala: "diretoria" },
      { id: "concluido", nome: "Concluído", tipo: "feito" },
    ],
  },
  marketing: {
    id: "marketing",
    nome: "Marketing",
    devolverPara: "producao",
    aprovarPara: "agendado",
    colunas: [
      { id: "ideias", nome: "Ideias", tipo: "fila" },
      { id: "roteiro", nome: "Roteiro / Copy", tipo: "trabalho", sala: "marketing" },
      { id: "producao", nome: "Produção", tipo: "trabalho", sala: "marketing" },
      { id: "validacao", nome: "Validação (CMO)", tipo: "validacao", sala: "diretoria" },
      { id: "aguardando-ceo", nome: "Aguardando CEO", tipo: "ceo", sala: "diretoria" },
      { id: "agendado", nome: "Agendado", tipo: "feito" },
      { id: "publicado", nome: "Publicado", tipo: "feito" },
    ],
  },
  comercial: {
    id: "comercial",
    nome: "Comercial",
    devolverPara: "qualificado",
    aprovarPara: "pronto-contato",
    colunas: [
      { id: "encontrado", nome: "Encontrado", tipo: "fila" },
      { id: "qualificado", nome: "Qualificado", tipo: "trabalho", sala: "comercial" },
      { id: "mensagem-pronta", nome: "Mensagem pronta", tipo: "validacao", sala: "comercial" },
      { id: "aguardando-ceo", nome: "Aguardando CEO", tipo: "ceo", sala: "diretoria" },
      { id: "pronto-contato", nome: "Pronto para contato", tipo: "trabalho", sala: "comercial" },
      { id: "contatado", nome: "Contatado", tipo: "trabalho", sala: "comercial" },
      { id: "respondeu", nome: "Respondeu", tipo: "trabalho", sala: "comercial" },
      { id: "reuniao", nome: "Reunião", tipo: "trabalho", sala: "comercial" },
      { id: "proposta", nome: "Proposta", tipo: "trabalho", sala: "comercial" },
      { id: "fechado", nome: "Fechado", tipo: "feito" },
      { id: "perdido", nome: "Perdido", tipo: "perdido" },
    ],
  },
  operacoes: {
    id: "operacoes",
    nome: "Infra & Dados",
    devolverPara: "em-andamento",
    aprovarPara: "aplicado",
    colunas: [
      { id: "pedido", nome: "Pedido", tipo: "fila" },
      { id: "em-andamento", nome: "Em andamento", tipo: "trabalho" },
      { id: "validacao", nome: "Validação", tipo: "validacao" },
      { id: "aguardando-ceo", nome: "Aguardando CEO", tipo: "ceo", sala: "diretoria" },
      { id: "aplicado", nome: "Aplicado", tipo: "feito" },
    ],
  },
  geral: {
    id: "geral",
    nome: "Geral",
    devolverPara: "em-andamento",
    aprovarPara: "concluido",
    colunas: [
      { id: "backlog", nome: "Backlog", tipo: "fila" },
      { id: "a-fazer", nome: "A fazer", tipo: "fila" },
      { id: "em-andamento", nome: "Em andamento", tipo: "trabalho" },
      { id: "validacao", nome: "Validação", tipo: "validacao" },
      { id: "aguardando-ceo", nome: "Aguardando CEO", tipo: "ceo", sala: "diretoria" },
      { id: "concluido", nome: "Concluído", tipo: "feito" },
    ],
  },
};

/** Fluxo padrão de cada sala, usado ao criar cards. */
/** Fluxo padrão de cada sala, de todos os escritórios (o registro acrescenta os novos). */
export const fluxoDaSala: Record<RoomId, FluxoId> = {
  diretoria: "geral",
  produto: "software",
  design: "software",
  arquitetura: "software",
  desenvolvimento: "software",
  "code-review": "software",
  qa: "software",
  seguranca: "software",
  devops: "operacoes",
  dados: "operacoes",
  infraestrutura: "operacoes",
  docs: "geral",
  marketing: "marketing",
  comercial: "comercial",
  cs: "geral",
  administrativo: "geral",
  reuniao: "geral",
};

/** Coluna "Aguardando CEO" do fluxo (todo fluxo tem uma). */
export const colunaDoCeo = (fluxo: FluxoId): string => fluxos[fluxo]?.colunas.find((c) => c.tipo === "ceo")?.id ?? "aguardando-ceo";

/** Fluxo padrão de uma sala (ao criar cards). */
export const fluxoPadrao = (sala: RoomId): FluxoId => fluxoDaSala[sala] ?? "geral";

export const colunaDe = (fluxo: FluxoId, coluna: string) => fluxos[fluxo]?.colunas.find((c) => c.id === coluna);
/** Comportamento base de um fluxo (software, comercial, marketing…). */
export const baseDoFluxo = (fluxo: FluxoId): BaseFluxo => fluxos[fluxo]?.base ?? (fluxo as BaseFluxo);

// Em que coluna da board de software cada sala trabalha e valida.
const colunaSoftware: Partial<Record<RoomId, string>> = {
  produto: "a-fazer", arquitetura: "a-fazer", design: "design", desenvolvimento: "em-dev",
  "code-review": "code-review", seguranca: "seguranca", qa: "em-qa",
};

/** Onde um card novo entra para a equipe pegar sozinha: a primeira fila que não é o Backlog. */
export function colunaDeEntrada(fluxo: FluxoId): string {
  const cols = fluxos[fluxo]!.colunas;
  return (cols.find((c) => c.tipo === "fila" && c.id !== "backlog") ?? cols[0]!).id;
}

/** Coluna onde a sala trabalha no fluxo. */
export function colunaDeTrabalho(fluxo: FluxoId, sala: RoomId): string {
  if (fluxo === "software" && colunaSoftware[sala]) return colunaSoftware[sala];
  const cols = fluxos[fluxo]!.colunas;
  // Em fluxos criados por você, a coluna de trabalho da sala (se houver) ou a primeira de trabalho.
  return (cols.find((c) => c.tipo === "trabalho" && c.sala === sala) ?? cols.find((c) => c.tipo === "trabalho")!).id;
}

/**
 * Código do Squad 1 passa por quatro validações em sequência (cada uma com seu especialista).
 * Se uma etapa devolve, o dev corrige e a MESMA etapa confere de novo antes de seguir.
 */
export const etapasDoCodigo: { coluna: string; validador: string; foco: "corretude" | "performance" | "seguranca" | "qa" }[] = [
  { coluna: "code-review", validador: "reviewer-1", foco: "corretude" },
  { coluna: "code-review", validador: "perf", foco: "performance" },
  { coluna: "seguranca", validador: "secure-code", foco: "seguranca" },
  { coluna: "em-qa", validador: "qa-lead", foco: "qa" },
];

/** Etapa atual de um card de código, pelo validador (ou null se não é um card do pipeline). */
export function etapaDoCodigo(card: Pick<Card, "fluxo" | "sala" | "validador">) {
  if (card.fluxo !== "software" || card.sala !== "desenvolvimento") return null;
  const i = etapasDoCodigo.findIndex((e) => e.validador === card.validador);
  return i >= 0 ? i : 0;
}

/** Coluna de validação da sala no fluxo, se houver; senão a validação é só um selo no card. */
export function colunaDeValidacao(fluxo: FluxoId, sala: RoomId): string | null {
  if (fluxo === "software") return sala === "desenvolvimento" ? "code-review" : null;
  const cols = fluxos[fluxo]!.colunas;
  return (cols.find((c) => c.tipo === "validacao" && c.sala === sala) ?? cols.find((c) => c.tipo === "validacao"))?.id ?? null;
}

export type TipoCard = "epico" | "historia" | "tarefa" | "subtarefa" | "bug" | "lead" | "conteudo";
export const tiposCard: { id: TipoCard; nome: string; cor: string; icone: string }[] = [
  { id: "epico", nome: "Épico", cor: "#7c3aed", icone: "⚡" },
  { id: "historia", nome: "História", cor: "#16a34a", icone: "▣" },
  { id: "tarefa", nome: "Tarefa", cor: "#2563eb", icone: "✓" },
  { id: "subtarefa", nome: "Subtarefa", cor: "#0891b2", icone: "↳" },
  { id: "bug", nome: "Bug", cor: "#dc2626", icone: "🐞" },
  { id: "lead", nome: "Lead", cor: "#ca8a04", icone: "◎" },
  { id: "conteudo", nome: "Conteúdo", cor: "#db2777", icone: "✎" },
];

export type Prioridade = "P0" | "P1" | "P2" | "P3";
export const prioridades: { id: Prioridade; nome: string; cor: string }[] = [
  { id: "P0", nome: "Urgente", cor: "#dc2626" },
  { id: "P1", nome: "Alta", cor: "#ea580c" },
  { id: "P2", nome: "Média", cor: "#2563eb" },
  { id: "P3", nome: "Baixa", cor: "#64748b" },
];

/** Níveis de autonomia (PLANO.md, seção 4.2-E). */
export type NivelAutonomia = "N0" | "N1" | "N2" | "N3";
export const niveis: { id: NivelAutonomia; nome: string; descricao: string }[] = [
  { id: "N0", nome: "Interno", descricao: "Reversível e interno: só o validador aprova" },
  { id: "N1", nome: "Revisão em lote", descricao: "Você aprova, pode ser em lote" },
  { id: "N2", nome: "Aprovação individual", descricao: "Efeito externo: você aprova item por item" },
  { id: "N3", nome: "Só você executa", descricao: "Dinheiro, contratos, redes: o agente prepara e você faz" },
];

export type Severidade = "S1" | "S2" | "S3" | "S4";
export const severidades: { id: Severidade; nome: string }[] = [
  { id: "S1", nome: "Bloqueante" },
  { id: "S2", nome: "Grave" },
  { id: "S3", nome: "Moderado" },
  { id: "S4", nome: "Cosmético" },
];

export interface Card {
  id: number;
  /** Ex.: EMP-128. */
  chave: string;
  fluxo: FluxoId;
  coluna: string;
  /** Posição dentro da coluna (menor = mais acima). */
  ordem: number;
  tipo: TipoCard;
  titulo: string;
  descricao: string;
  criterios: string;
  prioridade: Prioridade;
  nivel: NivelAutonomia;
  sala: RoomId;
  dono: string | null;
  validador: string | null;
  /** O validador está conferindo agora (badge no card). */
  emValidacao: boolean;
  etiquetas: string[];
  prazo: number | null;
  /** Card pai (épico de uma história, história de uma subtarefa). */
  paiId: number | null;
  /** Para bugs: a história/tarefa onde o bug foi encontrado. */
  bugDe: number | null;
  /** Só começa quando este card estiver concluído; a entrega dele vira contexto. */
  dependeDe: number | null;
  severidade: Severidade | null;
  devolucoes: number;
  bloqueado: boolean;
  projetoId: number | null;
  custoUsd: number;
  /** Criado pelo modo demonstração (pode ser limpo de uma vez). */
  demo: boolean;
  criadoEm: number;
  atualizadoEm: number;
}

/** "critica": o advogado do diabo questionando as premissas; "autocritica": o autor conferindo a própria entrega. */
export type TipoComentario = "comentario" | "movimento" | "aprovacao" | "devolucao" | "critica" | "autocritica";

export interface Comentario {
  id: number;
  cardId: number;
  /** "voce" para o CEO, senão o id do agente. */
  autor: string;
  tipo: TipoComentario;
  texto: string;
  ts: number;
}

/** Campos que o CEO pode definir ao criar ou editar um card. */
export type CardEditavel = Partial<
  Pick<
    Card,
    | "titulo" | "descricao" | "criterios" | "tipo" | "prioridade" | "nivel" | "sala" | "dono" | "validador" | "etiquetas"
    | "prazo" | "paiId" | "severidade" | "bloqueado" | "projetoId" | "dependeDe"
  >
>;

/** Uma versão do trabalho entregue num card (cada devolução gera uma nova). */
export interface Entrega {
  id: number;
  cardId: number;
  versao: number;
  autor: string;
  resumo: string;
  conteudo: string;
  ts: number;
}

/* ---------- Motor de agentes (Fase 2c) ---------- */

export interface TrabalhoEmAndamento {
  cardId: number;
  agenteId: string;
  tipo: "executar" | "validar";
  desde: number;
}

export interface EstadoMotor {
  pausado: boolean;
  /** Pausado automaticamente porque o gasto do dia chegou ao orçamento. */
  semOrcamento: boolean;
  orcamentoDiarioUsd: number;
  maxSimultaneos: number;
  emAndamento: TrabalhoEmAndamento[];
  /** Cards prontos esperando um agente livre. */
  naFila: number;
}

/* ---------- Projetos da sua máquina ---------- */

export interface Projeto {
  id: number;
  nome: string;
  caminho: string;
  git: boolean;
  branch: string | null;
  /** Manifestos encontrados na raiz (package.json, pyproject.toml...): uma pista da stack. */
  sinais: string[];
  /** Ficha do Projeto: raio-x feito pela empresa e aprovado por você. */
  ficha: string | null;
  /** Endereço local onde o app roda (ex.: http://localhost:3000), para os prints de treinamento e QA. */
  urlLocal: string | null;
  criadoEm: number;
}

/* ---------- Metas, indicadores e rituais (Fase 2e) ---------- */

export interface ResultadoChave {
  id: string;
  descricao: string;
  atual: number;
  alvo: number;
  unidade: string;
  /** Área responsável (opcional). */
  sala: RoomId | null;
}

export interface Meta {
  id: number;
  /** Ex.: "2026-T4". */
  trimestre: string;
  objetivo: string;
  resultados: ResultadoChave[];
  /** Sugerida pela Helena e ainda não confirmada por você. */
  confirmada: boolean;
  criadoEm: number;
  atualizadoEm: number;
}

/** Indicadores calculados da própria board, por área. */
export interface IndicadorArea {
  sala: RoomId;
  concluidos7d: number;
  emAndamento: number;
  aguardandoCeo: number;
  /** % de entregas aprovadas sem devolução (últimos 30 dias). */
  aprovacaoPrimeira: number | null;
  devolucoesMedias: number | null;
  bugsAbertos: number;
  tempoMedioHoras: number | null;
  custo7dUsd: number;
}

export interface Indicadores {
  areas: IndicadorArea[];
  custoHojeUsd: number;
  custo7dUsd: number;
  custoMesUsd: number;
}

export type RitualId = "daily" | "planejamento" | "revisao" | "retrospectiva" | "fechamento" | "cadencias";

export interface RitualInfo {
  id: RitualId;
  nome: string;
  descricao: string;
  ativo: boolean;
  /** "HH:MM", horário local do Mac. */
  hora: string;
  /** Dias da semana (0 = domingo). */
  dias: number[];
  quando: string;
  ultimaExecucao: number | null;
  proximaExecucao: number | null;
}

export interface Ata {
  id: number;
  ritual: RitualId;
  ts: number;
  /** Rodou depois do horário porque o Mac estava desligado. */
  atrasado: boolean;
  autor: string;
  resumo: string;
  conteudo: string;
}

/* ---------- Conhecimento da casa (Fase 2f) ---------- */

/** padrao: como a casa faz; guia: passo a passo; modelo: template pronto; licao: aprendida com devoluções e com o CEO. */
export type TipoConhecimento = "padrao" | "guia" | "modelo" | "licao";

export const tiposConhecimento: { id: TipoConhecimento; nome: string }[] = [
  { id: "padrao", nome: "Padrão da casa" },
  { id: "guia", nome: "Guia" },
  { id: "modelo", nome: "Modelo" },
  { id: "licao", nome: "Lição aprendida" },
];

export interface ItemConhecimento {
  id: number;
  sala: RoomId;
  tipo: TipoConhecimento;
  titulo: string;
  conteudo: string;
  /** Proposta (de um agente ou extraída de um card) espera o CEO; só a aprovada entra nos prompts. */
  aprovado: boolean;
  /** Card de onde a lição ou o padrão saiu. */
  origemCardId: number | null;
  /** "voce" para o CEO, senão o id do agente. */
  autor: string;
  criadoEm: number;
  atualizadoEm: number;
}

/** Liga e desliga o olhar crítico (custa chamadas extras à API). */
export interface ConfigCritica {
  /** O autor confere a entrega contra o checklist antes de entregar. */
  autocritica: boolean;
  /** Um sênior de outra área questiona as premissas das entregas importantes antes do validador. */
  advogado: boolean;
  /** Ao concluir um card com devoluções ou comentários do CEO, propor a lição aprendida. */
  licoes: boolean;
}

/* ---------- Prospecção de clientes (Fase 3, PLANO.md seção 4.5) ---------- */

export const camposLead = [
  "nome", "razaoSocial", "cnpj", "segmento", "cidade", "bairro", "endereco", "porte", "site", "avaliacao",
  "telefone", "whatsapp", "email", "instagram", "facebook", "linkedin", "decisor", "cargoDecisor",
] as const;
export type CampoLead = (typeof camposLead)[number];

export const rotulosCampoLead: Record<CampoLead, string> = {
  nome: "Nome", razaoSocial: "Razão social", cnpj: "CNPJ", segmento: "Segmento", cidade: "Cidade", bairro: "Bairro",
  endereco: "Endereço", porte: "Porte", site: "Site", avaliacao: "Avaliação no Google", telefone: "Telefone",
  whatsapp: "WhatsApp", email: "E-mail", instagram: "Instagram", facebook: "Facebook", linkedin: "LinkedIn",
  decisor: "Pessoa de decisão", cargoDecisor: "Cargo",
};

/** Um dado do lead com a origem: de onde veio, quando, e se é confirmado (fonte oficial da empresa) ou provável. */
export interface DadoLead {
  valor: string;
  fonte: string;
  confianca: "confirmado" | "provavel";
  coletadoEm: number;
}

/** Conferência automática feita pelo servidor (sem IA). */
export interface ConferenciaLead {
  emailValido?: boolean;
  emailDominioRecebe?: boolean;
  telefoneValido?: boolean;
  siteNoAr?: boolean;
  /** Card de outro lead com o mesmo CNPJ, telefone, domínio ou nome+cidade. */
  duplicadoDe?: number | null;
}

export interface MensagensLead {
  whatsapp?: string;
  emailAssunto?: string;
  emailCorpo?: string;
  instagram?: string;
}

export interface Lead {
  cardId: number;
  campanhaId: number | null;
  dados: Partial<Record<CampoLead, DadoLead>>;
  /** Por que é um bom lead (sinais de compra). */
  sinais: string[];
  nota: number;
  motivoNota: string;
  mensagens: MensagensLead;
  conferencia: ConferenciaLead;
  criadoEm: number;
  atualizadoEm: number;
}

export interface Campanha {
  id: number;
  produto: string;
  clienteIdeal: string;
  regiao: string;
  quantidade: number;
  /** Card da pesquisa (SDR). */
  cardId: number | null;
  criadoEm: number;
}

export type TipoNaoContatar = "email" | "telefone" | "dominio" | "cnpj" | "nome";

export interface NaoContatar {
  id: number;
  tipo: TipoNaoContatar;
  valor: string;
  motivo: string;
  criadoEm: number;
}

/* ---------- Fábrica de software (Fase 4) ---------- */

/** Código de um card: a branch na cópia isolada e o que mudou desde o início. */
export interface CodigoDoCard {
  branch: string;
  status: "ativo" | "mesclado" | "descartado";
  arquivos: { status: string; caminho: string }[];
  stat: string;
  patch: string;
  commits: { hash: string; autor: string; mensagem: string }[];
}

/* ---------- Marketing (Fase 5) ---------- */

export type CanalPeca = "instagram" | "linkedin" | "blog" | "email" | "anuncio" | "site" | "outro";

export const canaisPeca: { id: CanalPeca; nome: string; cor: string }[] = [
  { id: "instagram", nome: "Instagram", cor: "#e1306c" },
  { id: "linkedin", nome: "LinkedIn", cor: "#0a66c2" },
  { id: "blog", nome: "Blog", cor: "#2a9d8f" },
  { id: "email", nome: "E-mail", cor: "#f4a261" },
  { id: "anuncio", nome: "Anúncio", cor: "#6d597a" },
  { id: "site", nome: "Site", cor: "#3a86ff" },
  { id: "outro", nome: "Outro", cor: "#64748b" },
];

/** Resultados que o CEO anota depois de publicar (para o relatório de marketing). */
export interface ResultadosPeca {
  impressoes?: number;
  cliques?: number;
  comentarios?: number;
  conversoes?: number;
}

/** Uma peça de conteúdo pronta para publicar (post, artigo, e-mail, anúncio). */
export interface Peca {
  cardId: number;
  canal: CanalPeca;
  formato: string;
  /** Quando publicar (início do dia ou hora sugerida). */
  dataPublicacao: number | null;
  titulo: string;
  texto: string;
  hashtags: string[];
  cta: string;
  roteiroVisual: string;
  /** Variações para teste A/B (ganchos, títulos ou textos alternativos). */
  variacoes: string[];
  publicadoEm: number | null;
  link: string | null;
  resultados: ResultadosPeca;
  atualizadoEm: number;
}

/* ---------- Demais áreas (Fase 6) ---------- */

/** Banco do projeto para consultas só de leitura do time de Dados (a URL do Postgres fica cifrada no servidor). */
export interface ConexaoBanco {
  tipo: "sqlite" | "postgres";
  /** Ex.: "Postgres · db.exemplo.com/app" (sem usuário nem senha). */
  resumo: string;
}

/** Endereço que o SRE monitora. */
export interface Monitor {
  id: number;
  url: string;
  ativo: boolean;
  /** "ok", "fora" ou null antes da primeira checagem. */
  status: "ok" | "fora" | null;
  codigoHttp: number | null;
  ms: number | null;
  diasCertificado: number | null;
  verificadoEm: number | null;
  falhasSeguidas: number;
}

/* ---------- Conquistas (Fase 7) ---------- */

export interface Conquista {
  id: string;
  nome: string;
  descricao: string;
  icone: string;
  /** Quando foi desbloqueada (null = ainda não). */
  em: number | null;
}

/* ---------- Navegador dos agentes ---------- */

/** Uma sessão do navegador interno (uma por card), para você assistir ao vivo. */
export interface SessaoNavegador {
  cardId: number;
  agenteId: string;
  url: string;
  titulo: string;
  /** Último print da tela (endereço /api/midia/…). */
  imagem: string | null;
  /** "teste" (seu app e sites de teste: interação completa) ou "externo" (só leitura). */
  modo: "teste" | "externo" | null;
  acoes: { ts: number; acao: string; detalhe: string; ok: boolean }[];
  ativa: boolean;
  atualizadoEm: number;
  /** Celular de teste (iPhone no Simulador ou Android no emulador). Nesse caso cardId é negativo (-id do card) para não colidir com o navegador do mesmo card. */
  dispositivo?: { plataforma: "ios" | "android"; nome: string; cardId: number };
}

/* ---------- Conectores MCP ---------- */

/** O que fazer quando um agente chama uma ferramenta de um conector. */
export type PoliticaMcp = "auto" | "aprovar" | "bloqueada";

export interface FerramentaMcp {
  nome: string;
  descricao: string;
  /** O servidor declara que só lê (readOnlyHint). */
  leitura: boolean;
  politica: PoliticaMcp;
}

export interface ServidorMcp {
  id: number;
  nome: string;
  /** Atalho do catálogo usado para criar (github, stripe, gmail…) ou "personalizado". */
  preset: string;
  tipo: "stdio" | "http";
  /** stdio: comando e argumentos (sem segredos); http: endereço. */
  comando: string | null;
  args: string[];
  url: string | null;
  autenticacao: "nenhuma" | "token" | "oauth";
  /** Salas cujos agentes podem usar este conector. */
  salas: RoomId[];
  status: "conectado" | "desconectado" | "erro" | "autorizar";
  erro: string | null;
  /** Quando precisa de login (OAuth): o endereço para você autorizar. */
  autorizarUrl: string | null;
  ferramentas: FerramentaMcp[];
}

export interface PedidoMcp {
  id: number;
  servidorId: number;
  servidor: string;
  ferramenta: string;
  args: Record<string, unknown>;
  cardId: number | null;
  agenteId: string;
  /** Por que o agente quer fazer isso (texto do agente). */
  motivo: string;
  status: "pendente" | "executado" | "recusado" | "erro";
  resultado: string | null;
  criadoEm: number;
  decididoEm: number | null;
}

/** Atalhos prontos para conectar (o CEO só informa token ou credenciais). */
export interface PresetMcp {
  id: string;
  nome: string;
  descricao: string;
  tipo: "stdio" | "http";
  url?: string;
  comando?: string;
  args?: string[];
  autenticacao: "nenhuma" | "token" | "oauth";
  /** Campos que o CEO preenche (ex.: token, client id). */
  campos: { id: string; rotulo: string; secreto: boolean; ajuda?: string }[];
  salasSugeridas: RoomId[];
  ajuda: string;
}

/** Sessão de controle do Mac liberada pelo CEO para um card (tempo limitado, com botão PARAR). */
export interface SessaoControle {
  cardId: number;
  agenteId: string;
  /** Até quando vale (ms). */
  ate: number;
  ativa: boolean;
  imagem: string | null;
  acoes: { ts: number; acao: string; detalhe: string; ok: boolean }[];
}

/* ---------- Prévia do app por card ---------- */

export interface Previa {
  cardId: number;
  status: "instalando" | "iniciando" | "no-ar" | "erro" | "parada";
  url: string | null;
  comando: string;
  log: string[];
  erro: string | null;
  desde: number;
}

/* ---------- Telegram (aprovar pelo celular) ---------- */

export interface EstadoTelegram {
  ativo: boolean;
  chatId: number | null;
  nomeChat: string | null;
  bot: string | null;
  /** Código de pareamento (só enquanto não há chat pareado). */
  codigo: string | null;
  notificar: { aprovacoes: boolean; perguntas: boolean; acoes: boolean; whatsapp: boolean; incidentes: boolean };
  temToken: boolean;
  status: "desligado" | "conectado" | "erro";
  erro: string | null;
}

/* ---------- WhatsApp (API oficial da Meta) ---------- */

/** aprovar: cada resposta da agente espera o seu OK; automatico: responde sozinha a quem escreveu (janela de 24 h). */
export type ModoWhatsapp = "aprovar" | "automatico";

export interface EstadoWhatsapp {
  ativo: boolean;
  modo: ModoWhatsapp;
  phoneNumberId: string;
  wabaId: string;
  versao: string;
  temToken: boolean;
  temAppSecret: boolean;
  verifyToken: string;
  /** Endereço público (túnel ou fixo) que a Meta chama; null enquanto não há. */
  urlPublica: string | null;
  usarTunel: boolean;
  /** Número e nome verificados, lidos da Meta no teste de conexão. */
  numero: string | null;
  nomeVerificado: string | null;
  status: "desligado" | "conectando" | "conectado" | "erro";
  erro: string | null;
}

export interface ContatoWhatsapp {
  telefone: string;
  nome: string;
  /** Último contato do cliente: define a janela de 24 h para mensagens livres. */
  ultimaEntrada: number | null;
  ultimaMensagem: { texto: string; ts: number; direcao: "in" | "out" } | null;
  naoLidas: number;
  pendentes: number;
  /** Você assumiu a conversa: a agente não responde. */
  humano: boolean;
  /** Pediu para não receber mais mensagens. */
  bloqueado: boolean;
  etapa: "novo" | "duvida" | "interessado" | "negociando" | "cliente" | "perdido" | "humano";
  resumo: string;
  leadCardId: number | null;
}

export type StatusMensagemWhatsapp = "recebida" | "pendente" | "enviando" | "enviada" | "entregue" | "lida" | "falhou" | "descartada";

export interface MensagemWhatsapp {
  id: number;
  telefone: string;
  direcao: "in" | "out";
  tipo: string;
  texto: string;
  imagem: string | null;
  status: StatusMensagemWhatsapp;
  erro: string | null;
  /** "cliente", "voce" ou o id da agente. */
  autor: string;
  ts: number;
  modelo: string | null;
}

export interface ModeloWhatsapp {
  nome: string;
  idioma: string;
  categoria: string;
  texto: string;
  variaveis: number;
}

/* ---------- Escritórios personalizáveis (DESIGN-ESCRITORIOS.md) ---------- */

/** Sala de um escritório. */
export interface SalaDef {
  id: RoomId;
  nome: string;
  descricao: string;
  cor: string;
  /** Agente que valida as entregas desta sala (de outra sala), ou null (só você). */
  validador: string | null;
  /** Padrão de trabalho da sala (vira o playbook dos agentes dela). Vazio = o da sede, se houver, ou um padrão genérico. */
  playbook?: string;
}

/** Agente de um escritório. */
export interface AgenteDef {
  id: string;
  nome: string;
  cargo: string;
  sala: RoomId;
  modelo?: "claude-opus-5-5" | "claude-sonnet-5-5" | "claude-haiku-5-5";
  lider?: boolean;
  persona: string;
  ferramentas?: string[];
  podeChamar?: string[];
  camisa: string;
  /** Papel especial: "coordenador" recebe os pedidos do CEO no chat e distribui os cards. */
  papel?: "coordenador";
}

/** Planta: fileiras de salas (de cima para baixo); áreas comuns entram sozinhas. */
export interface PlantaDef {
  fileiras: RoomId[][];
}

export interface EscritorioDef {
  id: string;
  nome: string;
  descricao: string;
  /** Modelo de origem (software-house, startup, agencia…). */
  modelo: string;
  projetoId: number | null;
  salas: SalaDef[];
  agentes: AgenteDef[];
  fluxos: Fluxo[];
  /** Fluxo padrão de cada sala (ao criar cards). */
  fluxoDaSala: Record<RoomId, FluxoId>;
  planta: PlantaDef;
  criadoEm: number;
  atualizadoEm: number;
}

/** Resumo para listas e para o seletor. */
export interface EscritorioResumo {
  id: string;
  nome: string;
  descricao: string;
  modelo: string;
  projetoId: number | null;
  salas: number;
  agentes: number;
  fluxos: number;
}

export interface ModeloEscritorio {
  id: string;
  nome: string;
  descricao: string;
  salas: number;
  agentes: number;
  fluxos: string[];
}

export interface ModeloFluxo {
  id: string;
  nome: string;
  descricao: string;
  fluxo: Fluxo;
}
