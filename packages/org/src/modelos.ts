import type { AgenteDef, Coluna, EscritorioDef, Fluxo, ModeloEscritorio, ModeloFluxo, SalaDef } from "@empresa/shared";
import { fluxos as fluxosDaSede } from "@empresa/shared";
import { escritorioSede } from "./registro.ts";

// Modelos prontos (DESIGN-ESCRITORIOS.md): 7 escritórios e 8 fluxos. Os ids aqui são locais; ao criar um
// escritório, tudo ganha o prefixo dele ("e3.dev-1") para não colidir com outros escritórios.

const OPUS = "claude-opus-5-5" as const;
const HAIKU = "claude-haiku-5-5" as const;

/* ---------- Fluxos prontos ---------- */

const semSala = (f: Fluxo): Fluxo => ({ ...f, colunas: f.colunas.map(({ sala: _, ...c }) => ({ ...c })) });
const col = (id: string, nome: string, tipo: Coluna["tipo"], sala?: string): Coluna => (sala ? { id, nome, tipo, sala } : { id, nome, tipo });

export const MODELOS_FLUXO: ModeloFluxo[] = [
  { id: "software", nome: "Software", descricao: "Backlog → design → desenvolvimento → code review → segurança → QA → aprovação.", fluxo: semSala({ ...fluxosDaSede.software!, base: "software" }) },
  { id: "marketing", nome: "Marketing", descricao: "Ideias → roteiro → produção → validação → aprovação → agendado → publicado.", fluxo: semSala({ ...fluxosDaSede.marketing!, base: "marketing" }) },
  { id: "comercial", nome: "Comercial", descricao: "Lead encontrado → qualificado → mensagem → aprovação → contato → reunião → proposta → fechado.", fluxo: semSala({ ...fluxosDaSede.comercial!, base: "comercial" }) },
  { id: "operacoes", nome: "Infra & Dados", descricao: "Pedido → em andamento → validação → aprovação → aplicado.", fluxo: semSala({ ...fluxosDaSede.operacoes!, base: "operacoes" }) },
  { id: "geral", nome: "Geral", descricao: "Backlog → a fazer → em andamento → validação → aprovação → concluído.", fluxo: semSala({ ...fluxosDaSede.geral!, base: "geral" }) },
  {
    id: "conteudo", nome: "Conteúdo", descricao: "Pauta → roteiro → produção → revisão → aprovação → publicado.",
    fluxo: { id: "conteudo", nome: "Conteúdo", base: "conteudo", devolverPara: "producao", aprovarPara: "publicado", colunas: [
      col("pauta", "Pauta", "fila"), col("roteiro", "Roteiro", "trabalho"), col("producao", "Produção", "trabalho"), col("revisao", "Revisão", "validacao"),
      col("aguardando-ceo", "Aguardando CEO", "ceo"), col("publicado", "Publicado", "feito"),
    ] },
  },
  {
    id: "atendimento", nome: "Atendimento", descricao: "Novo → triagem → resposta → validação → aprovação → resolvido.",
    fluxo: { id: "atendimento", nome: "Atendimento", base: "atendimento", devolverPara: "resposta", aprovarPara: "resolvido", colunas: [
      col("novo", "Novo", "fila"), col("triagem", "Triagem", "trabalho"), col("resposta", "Resposta", "trabalho"), col("validacao", "Validação", "validacao"),
      col("aguardando-ceo", "Aguardando CEO", "ceo"), col("resolvido", "Resolvido", "feito"),
    ] },
  },
  {
    id: "pedidos", nome: "Pedidos da loja", descricao: "Novo pedido → separação → conferência → aprovação → enviado → entregue.",
    fluxo: { id: "pedidos", nome: "Pedidos da loja", base: "pedidos", devolverPara: "separacao", aprovarPara: "enviado", colunas: [
      col("novo", "Novo pedido", "fila"), col("separacao", "Separação", "trabalho"), col("conferencia", "Conferência", "validacao"),
      col("aguardando-ceo", "Aguardando CEO", "ceo"), col("enviado", "Enviado", "trabalho"), col("entregue", "Entregue", "feito"), col("cancelado", "Cancelado", "perdido"),
    ] },
  },
];

const fluxoPronto = (id: string, sala?: Record<string, string>): Fluxo => {
  const f = structuredClone(MODELOS_FLUXO.find((m) => m.id === id)!.fluxo);
  if (sala) for (const c of f.colunas) if (sala[c.id]) c.sala = sala[c.id];
  return f;
};

/* ---------- Escritórios prontos ---------- */

interface Modelo {
  id: string;
  nome: string;
  descricao: string;
  montar: () => { salas: SalaDef[]; agentes: AgenteDef[]; fluxos: Fluxo[]; fluxoDaSala: Record<string, string>; planta: string[][] };
}

const sala = (id: string, nome: string, cor: string, descricao: string, validador: string | null): SalaDef => ({ id, nome, cor, descricao, validador });
const ag = (id: string, nome: string, cargo: string, salaId: string, camisa: string, persona: string, extra: Partial<AgenteDef> = {}): AgenteDef => ({ id, nome, cargo, sala: salaId, camisa, persona, ...extra });

const MODELOS: Modelo[] = [
  {
    id: "software-house",
    nome: "Software house completa",
    descricao: "O escritório da sede: produto, design, engenharia, qualidade, dados, marketing, comercial, sucesso do cliente e administrativo.",
    montar: () => {
      const s = escritorioSede();
      return { salas: s.salas, agentes: s.agentes, fluxos: s.fluxos, fluxoDaSala: s.fluxoDaSala, planta: s.planta.fileiras };
    },
  },
  {
    id: "startup",
    nome: "Startup enxuta",
    descricao: "Produto digital com time pequeno: coordenação, produto e design, dois devs, QA, growth e sucesso do cliente.",
    montar: () => ({
      salas: [
        sala("lideranca", "Liderança", "#f2c879", "Recebe os pedidos, prioriza e mantém o foco no que dá resultado.", "pm"),
        sala("produto", "Produto & Design", "#9ad0c2", "Descobre o problema, escreve as histórias e desenha as telas.", "tech-lead"),
        sala("engenharia", "Engenharia", "#8fb8f0", "Constrói, testa e coloca no ar.", "qa"),
        sala("qualidade", "Qualidade", "#f6b37a", "Testa cada entrega antes de chegar ao cliente.", "pm"),
        sala("growth", "Growth & Clientes", "#f59ac4", "Aquisição, ativação, retenção e atendimento.", "coord"),
      ],
      agentes: [
        ag("coord", "Bia", "Head de Operações", "lideranca", "#3d5a80", "Transforma pedidos em planos curtos, prioriza pelo impacto e acompanha até a entrega.", { papel: "coordenador", lider: true, modelo: OPUS }),
        ag("pm", "Rui", "Product Manager", "produto", "#2a9d8f", "Descoberta rápida, histórias com critérios de aceite claros e escopo mínimo que entrega valor.", { lider: true, ferramentas: ["web"] }),
        ag("designer", "Lia", "Product Designer", "produto", "#e76f51", "Fluxos simples, protótipos navegáveis e design system enxuto, com acessibilidade desde o início.", { ferramentas: ["navegador"] }),
        ag("tech-lead", "Davi", "Tech Lead Fullstack", "engenharia", "#264653", "Arquitetura simples, código limpo, testes e deploy contínuo. Escolhe a stack do projeto.", { lider: true, ferramentas: ["arquivos", "terminal", "git", "web"] }),
        ag("dev", "Nina", "Dev Fullstack", "engenharia", "#457b9d", "Implementa ponta a ponta, com testes, em qualquer stack do projeto.", { ferramentas: ["arquivos", "terminal", "git", "web"] }),
        ag("qa", "Teo", "QA", "qualidade", "#f4a261", "Testes exploratórios, E2E e regressão; escreve bugs reproduzíveis.", { ferramentas: ["arquivos", "terminal", "playwright", "navegador", "celular"] }),
        ag("growth", "Mel", "Growth Marketer", "growth", "#d62828", "Experimentos de aquisição e ativação medidos, conteúdo e campanhas.", { ferramentas: ["web"] }),
        ag("cs", "Gil", "Customer Success", "growth", "#4361ee", "Onboarding, suporte e voz do cliente para o produto."),
        ag("dados", "Ana", "Analista de Dados", "growth", "#2b9348", "Métricas de produto, funis e leitura dos experimentos.", { ferramentas: ["planilhas"] }),
      ],
      fluxos: [fluxoPronto("software", { "a-fazer": "produto", design: "produto", "em-dev": "engenharia", "em-qa": "qualidade", bug: "engenharia" }), fluxoPronto("marketing"), fluxoPronto("geral")],
      fluxoDaSala: { lideranca: "geral", produto: "software", engenharia: "software", qualidade: "software", growth: "marketing" },
      planta: [["lideranca", "produto", "engenharia"], ["qualidade", "growth"]],
    }),
  },
  {
    id: "agencia",
    nome: "Agência de marketing",
    descricao: "Conteúdo, redes sociais, tráfego pago, SEO, design e atendimento a clientes.",
    montar: () => ({
      salas: [
        sala("direcao", "Direção", "#f2c879", "Planejamento das contas, prioridades e aprovação interna.", "atendimento"),
        sala("criacao", "Criação", "#f4a6b8", "Redação, design e vídeo.", "planejamento"),
        sala("midia", "Mídia & Performance", "#a8d98a", "Tráfego pago, SEO e análise de resultados.", "planejamento"),
        sala("social", "Social Media", "#f59ac4", "Calendário, posts, comunidade e influenciadores.", "diretor-criacao"),
        sala("contas", "Atendimento a clientes", "#9ec5f5", "Briefings, relatórios e relacionamento com os clientes.", "coord"),
      ],
      agentes: [
        ag("coord", "Carla", "Diretora de Operações", "direcao", "#3d5a80", "Organiza as demandas dos clientes, distribui e garante prazo e qualidade.", { papel: "coordenador", lider: true, modelo: OPUS }),
        ag("planejamento", "Leo", "Planejamento Estratégico", "direcao", "#6a4c93", "Pesquisa de público e concorrência, posicionamento e plano de campanha.", { ferramentas: ["web"] }),
        ag("diretor-criacao", "Ivo", "Diretor de Criação", "criacao", "#e76f51", "Conceito criativo, tom da marca e qualidade de cada peça.", { lider: true }),
        ag("redator", "Sara", "Redatora", "criacao", "#e9c46a", "Textos de anúncio, posts, roteiros e e-mails no tom de cada cliente.", { ferramentas: ["web"] }),
        ag("designer", "Paulo", "Designer", "criacao", "#2a9d8f", "Peças visuais, carrosséis, roteiros visuais e identidade.", { ferramentas: ["imagens"] }),
        ag("trafego", "Dani", "Gestor de Tráfego", "midia", "#2b9348", "Campanhas no Meta e no Google com testes A/B e leitura de CAC e ROAS.", { lider: true, ferramentas: ["web", "planilhas"] }),
        ag("seo", "Igor", "Especialista em SEO", "midia", "#457b9d", "Pesquisa de palavras-chave, conteúdo otimizado e SEO técnico.", { ferramentas: ["web", "navegador"] }),
        ag("social", "Bruna", "Social Media", "social", "#d62828", "Calendário editorial, posts, legendas e gestão de comunidade.", { lider: true, ferramentas: ["web"] }),
        ag("video", "Rafa", "Editor de Vídeo", "social", "#f4a261", "Roteiros e edição de Reels, Shorts e TikTok."),
        ag("atendimento", "Lu", "Atendimento", "contas", "#4361ee", "Briefings claros, alinhamento de expectativas e relatórios mensais aos clientes.", { lider: true }),
        ag("analista", "Mari", "Analista de Resultados", "contas", "#2b2d42", "Relatórios de desempenho com o que funcionou e o próximo passo.", { ferramentas: ["planilhas"] }),
      ],
      fluxos: [fluxoPronto("marketing", { roteiro: "criacao", producao: "criacao" }), fluxoPronto("conteudo", { roteiro: "criacao", producao: "social" }), fluxoPronto("geral")],
      fluxoDaSala: { direcao: "geral", criacao: "marketing", midia: "geral", social: "conteudo", contas: "geral" },
      planta: [["direcao", "criacao", "midia"], ["social", "contas"]],
    }),
  },
  {
    id: "loja",
    nome: "Loja online",
    descricao: "E-commerce: catálogo, anúncios, atendimento, pedidos e logística, financeiro.",
    montar: () => ({
      salas: [
        sala("gestao", "Gestão", "#f2c879", "Metas de venda, prioridades e decisões da loja.", "marketing"),
        sala("catalogo", "Catálogo & Site", "#9ad0c2", "Produtos, fotos, descrições, preços e a vitrine.", "marketing"),
        sala("marketing", "Marketing", "#f59ac4", "Anúncios, redes sociais, e-mail e promoções.", "coord"),
        sala("atendimento", "Atendimento", "#9ec5f5", "Dúvidas, trocas, devoluções e reclamações.", "coord"),
        sala("logistica", "Pedidos & Logística", "#a8d98a", "Separação, envio, rastreio e estoque.", "coord"),
      ],
      agentes: [
        ag("coord", "Marta", "Gerente da Loja", "gestao", "#3d5a80", "Cuida das metas, distribui as tarefas e garante a experiência do cliente do clique à entrega.", { papel: "coordenador", lider: true, modelo: OPUS }),
        ag("financeiro", "Caio", "Financeiro", "gestao", "#2b9348", "Margem, preço, fluxo de caixa, taxas do marketplace e impostos.", { ferramentas: ["planilhas"] }),
        ag("catalogo", "Rita", "Especialista de Catálogo", "catalogo", "#2a9d8f", "Fichas de produto completas, SEO de produto e fotos padronizadas.", { lider: true, ferramentas: ["web", "navegador"] }),
        ag("ecommerce", "Hugo", "Dev E-commerce", "catalogo", "#264653", "Plataforma da loja (Shopify, Nuvemshop, WooCommerce ou própria), integrações e checkout.", { ferramentas: ["arquivos", "terminal", "git", "web", "navegador"] }),
        ag("marketing", "Júlia", "Marketing", "marketing", "#d62828", "Campanhas, e-mail marketing, redes e datas promocionais.", { lider: true, ferramentas: ["web"] }),
        ag("trafego", "Beto", "Tráfego Pago", "marketing", "#f4a261", "Catálogo no Meta e no Google Shopping, ROAS e públicos.", { ferramentas: ["web", "planilhas"] }),
        ag("sac", "Elisa", "Atendimento", "atendimento", "#4361ee", "Respostas rápidas e empáticas, trocas e devoluções pela política da loja.", { lider: true }),
        ag("pos-venda", "Nico", "Pós-venda", "atendimento", "#457b9d", "Avaliações, recompra e clientes insatisfeitos."),
        ag("logistica", "Vera", "Logística", "logistica", "#6a994e", "Separação, etiquetas, transportadoras, prazos e rastreio.", { lider: true, ferramentas: ["planilhas"] }),
        ag("estoque", "Tito", "Estoque", "logistica", "#bc6c25", "Inventário, reposição e produtos parados.", { ferramentas: ["planilhas"] }),
      ],
      fluxos: [fluxoPronto("pedidos", { separacao: "logistica", enviado: "logistica" }), fluxoPronto("atendimento", { triagem: "atendimento", resposta: "atendimento" }), fluxoPronto("marketing", { roteiro: "marketing", producao: "marketing" }), fluxoPronto("geral")],
      fluxoDaSala: { gestao: "geral", catalogo: "geral", marketing: "marketing", atendimento: "atendimento", logistica: "pedidos" },
      planta: [["gestao", "catalogo", "marketing"], ["atendimento", "logistica"]],
    }),
  },
  {
    id: "consultoria",
    nome: "Consultoria e serviços",
    descricao: "Prospecção, propostas, entregas a clientes, qualidade e financeiro.",
    montar: () => ({
      salas: [
        sala("socios", "Sócios", "#f2c879", "Estratégia, relacionamento com clientes-chave e decisões.", "qualidade"),
        sala("comercial", "Comercial", "#e9d27a", "Prospecção, diagnóstico e propostas.", "coord"),
        sala("projetos", "Projetos", "#8fb8f0", "Execução das entregas aos clientes.", "qualidade"),
        sala("qualidade", "Qualidade", "#f6b37a", "Revisão técnica de cada entrega antes do cliente.", "coord"),
        sala("backoffice", "Backoffice", "#c9b8a6", "Contratos, faturamento e indicadores.", "coord"),
      ],
      agentes: [
        ag("coord", "Otávio", "Sócio-diretor", "socios", "#3d5a80", "Transforma pedidos em planos de projeto, distribui e cuida da relação com o cliente.", { papel: "coordenador", lider: true, modelo: OPUS }),
        ag("comercial", "Lara", "Executiva Comercial", "comercial", "#ee9b00", "Diagnóstico consultivo e propostas com escopo, prazo e preço claros.", { lider: true, ferramentas: ["web"] }),
        ag("sdr", "Pedro", "SDR", "comercial", "#ca6702", "Pesquisa de empresas com o perfil ideal e primeira abordagem.", { ferramentas: ["web", "planilhas"] }),
        ag("gerente", "Sônia", "Gerente de Projetos", "projetos", "#264653", "Cronograma, riscos e status semanal ao cliente.", { lider: true }),
        ag("consultor", "Ricardo", "Consultor", "projetos", "#457b9d", "Análises, recomendações e materiais de entrega.", { ferramentas: ["web", "planilhas"] }),
        ag("analista", "Clara", "Analista", "projetos", "#2a9d8f", "Pesquisa, dados e documentos de apoio.", { ferramentas: ["web", "planilhas"] }),
        ag("qualidade", "Edu", "Revisor Técnico", "qualidade", "#f4a261", "Confere a entrega contra o escopo, a lógica e a apresentação."),
        ag("financeiro", "Neusa", "Financeiro", "backoffice", "#2b9348", "Contratos, faturamento, impostos e margem por projeto.", { lider: true, ferramentas: ["planilhas"] }),
      ],
      fluxos: [fluxoPronto("comercial", { qualificado: "comercial", "pronto-contato": "comercial", contatado: "comercial", respondeu: "comercial", reuniao: "comercial", proposta: "comercial" }), fluxoPronto("geral")],
      fluxoDaSala: { socios: "geral", comercial: "comercial", projetos: "geral", qualidade: "geral", backoffice: "geral" },
      planta: [["socios", "comercial", "projetos"], ["qualidade", "backoffice"]],
    }),
  },
  {
    id: "estudio",
    nome: "Estúdio de conteúdo",
    descricao: "Vídeo, podcast e blog: pauta, roteiro, gravação, edição e publicação.",
    montar: () => ({
      salas: [
        sala("editorial", "Editorial", "#f2c879", "Linha editorial, pauta e calendário.", "revisor"),
        sala("roteiro", "Roteiro", "#f4a6b8", "Roteiros, títulos e ganchos.", "editor-chefe"),
        sala("producao", "Produção & Edição", "#8fb8f0", "Gravação, edição, thumbs e cortes.", "editor-chefe"),
        sala("revisao", "Revisão & Distribuição", "#a8d98a", "Revisão final, SEO e publicação nos canais.", "coord"),
      ],
      agentes: [
        ag("coord", "Duda", "Produtora Executiva", "editorial", "#3d5a80", "Organiza o calendário, distribui as pautas e garante o ritmo de publicação.", { papel: "coordenador", lider: true, modelo: OPUS }),
        ag("editor-chefe", "Felipe", "Editor-chefe", "editorial", "#6a4c93", "Linha editorial, qualidade e tom de voz.", { lider: true, ferramentas: ["web"] }),
        ag("roteirista", "Iara", "Roteirista", "roteiro", "#e76f51", "Roteiros com gancho forte, estrutura clara e chamada para ação.", { ferramentas: ["web"] }),
        ag("editor", "Caue", "Editor de Vídeo", "producao", "#264653", "Edição dinâmica, cortes para redes e legendas."),
        ag("designer", "Nara", "Designer", "producao", "#2a9d8f", "Thumbnails, capas e identidade visual dos canais.", { ferramentas: ["imagens"] }),
        ag("revisor", "Tom", "Revisor e SEO", "revisao", "#2b9348", "Revisão de texto, títulos, descrições e tags para cada plataforma.", { lider: true, ferramentas: ["web"] }),
        ag("social", "Ju", "Distribuição", "revisao", "#d62828", "Publicação, cortes e comunidade em cada canal.", { modelo: HAIKU }),
      ],
      fluxos: [fluxoPronto("conteudo", { roteiro: "roteiro", producao: "producao", revisao: "revisao" }), fluxoPronto("geral")],
      fluxoDaSala: { editorial: "conteudo", roteiro: "conteudo", producao: "conteudo", revisao: "conteudo" },
      planta: [["editorial", "roteiro"], ["producao", "revisao"]],
    }),
  },
  {
    id: "em-branco",
    nome: "Em branco",
    descricao: "Só a coordenação e um fluxo geral. Você monta as salas, a equipe e os fluxos do seu jeito.",
    montar: () => ({
      salas: [sala("coordenacao", "Coordenação", "#f2c879", "Recebe os pedidos do CEO e distribui o trabalho.", null)],
      agentes: [ag("coord", "Alex", "Coordenador", "coordenacao", "#3d5a80", "Organiza o trabalho, distribui e acompanha até a entrega.", { papel: "coordenador", lider: true })],
      fluxos: [fluxoPronto("geral")],
      fluxoDaSala: { coordenacao: "geral" },
      planta: [["coordenacao"]],
    }),
  },
];

export const modelosDeEscritorio = (): ModeloEscritorio[] =>
  MODELOS.map((m) => {
    const x = m.montar();
    return { id: m.id, nome: m.nome, descricao: m.descricao, salas: x.salas.length, agentes: x.agentes.length, fluxos: x.fluxos.map((f) => f.nome) };
  });

/** Cria a definição de um escritório novo a partir de um modelo, com todos os ids prefixados por `id.`. */
export function escritorioDoModelo(modeloId: string, id: string, nome: string, projetoId: number | null): EscritorioDef {
  const m = MODELOS.find((x) => x.id === modeloId);
  if (!m) throw new Error("Modelo de escritório não encontrado.");
  const x = structuredClone(m.montar());
  const p = (s: string) => `${id}.${s}`;
  const agora = Date.now();
  return {
    id,
    nome,
    descricao: m.descricao,
    modelo: m.id,
    projetoId,
    salas: x.salas.map((s) => ({ ...s, id: p(s.id), validador: s.validador ? p(s.validador) : null })),
    agentes: x.agentes.map((a) => ({ ...a, id: p(a.id), sala: p(a.sala), podeChamar: (a.podeChamar ?? []).map((c) => (c === "*" ? c : p(c))) })),
    fluxos: x.fluxos.map((f) => ({ ...f, id: p(f.id), colunas: f.colunas.map((c) => (c.sala ? { ...c, sala: p(c.sala) } : c)) })),
    fluxoDaSala: Object.fromEntries(Object.entries(x.fluxoDaSala).map(([s, f]) => [p(s), p(f)])),
    planta: { fileiras: x.planta.map((f) => f.map(p)) },
    criadoEm: agora,
    atualizadoEm: agora,
  };
}

/** Um fluxo pronto para acrescentar a um escritório existente (id prefixado). */
export function fluxoDoModelo(modeloId: string, escritorio: string, sufixo = ""): Fluxo {
  const f = structuredClone(MODELOS_FLUXO.find((m) => m.id === modeloId)?.fluxo);
  if (!f) throw new Error("Modelo de fluxo não encontrado.");
  return { ...f, id: `${escritorio}.${f.id}${sufixo}` };
}
