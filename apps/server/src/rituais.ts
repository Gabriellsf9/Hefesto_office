import { colunaDe, type Ata, type RitualId, type RitualInfo } from "@empresa/shared";
import { agentById, agents, roomById } from "@empresa/org";
import { db, getSetting, setSetting } from "./db.ts";
import { emit, focus, postChat, setAgentStatus } from "./bus.ts";
import { clienteClaude } from "./custo.ts";
import { calcularIndicadores, metasEmTexto } from "./metas.ts";
import { aoAprovar, criarCard, lerCard, listarCards, ultimaEntrega } from "./tarefas.ts";
import { rodarAgente } from "./agentes/loop.ts";
import { colunaDeEntrada, estadoMotor } from "./agentes/motor.ts";
import { transformarPlanoEmCards } from "./agentes/helena.ts";
import { projetoAtivo } from "./projetos.ts";
import { statusOnboarding } from "./onboarding.ts";

// Rituais da empresa (PLANO.md, seção 4.2-D), com agendador local.
// Se o Mac estava desligado na hora, o ritual roda quando o app abre e fica
// marcado como atrasado (só a ocorrência mais recente, até 3 dias para trás).

db.exec(`
  CREATE TABLE IF NOT EXISTS atas (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    ritual   TEXT NOT NULL,
    ts       INTEGER NOT NULL,
    atrasado INTEGER NOT NULL,
    autor    TEXT NOT NULL,
    resumo   TEXT NOT NULL,
    conteudo TEXT NOT NULL
  );
`);

const HELENA = "chief-of-staff";
const RESUMOS = "claude-haiku-5-5"; // resumos e atas: modelo rápido e barato, como no plano
const ANALISE = "claude-sonnet-5-5";
const DIA = 86_400_000;
const JANELA_ATRASO = 3 * DIA;

interface Definicao {
  id: RitualId;
  nome: string;
  descricao: string;
  hora: string;
  dias: number[];
  ativoPadrao: boolean;
  quinzenal?: boolean;
  ultimoDiaUtil?: boolean;
}

export const definicoes: Definicao[] = [
  { id: "daily", nome: "Daily", descricao: "Resumo de 5 linhas: o que foi feito, o que vem hoje, bloqueios e o que precisa de você.", hora: "09:00", dias: [1, 2, 3, 4, 5], ativoPadrao: true },
  { id: "planejamento", nome: "Planejamento semanal", descricao: "A Helena propõe o plano da semana ligado às metas; você aprova e ela vira cards.", hora: "09:30", dias: [1], ativoPadrao: true },
  { id: "revisao", nome: "Revisão semanal", descricao: "O que foi entregue, indicadores, metas e custo da semana.", hora: "17:00", dias: [5], ativoPadrao: true },
  { id: "retrospectiva", nome: "Retrospectiva", descricao: "A cada duas semanas: o que travou (devoluções, bloqueios) e três melhorias de processo.", hora: "17:30", dias: [5], ativoPadrao: true, quinzenal: true },
  { id: "fechamento", nome: "Fechamento do mês", descricao: "A Roberta (Financeiro) fecha o custo de IA do mês e o andamento das metas.", hora: "18:00", dias: [1, 2, 3, 4, 5], ativoPadrao: true, ultimoDiaUtil: true },
  { id: "cadencias", nome: "Cadências das áreas", descricao: "Toda segunda abre cards de rotina: calendário editorial, varredura de dependências, pentest, patches e teste de backup. Gasta mais: desligado por padrão.", hora: "10:00", dias: [1], ativoPadrao: false },
];

/* ---------- Configuração ---------- */

const ativo = (d: Definicao) => (getSetting(`ritual_${d.id}_ativo`) ?? (d.ativoPadrao ? "1" : "0")) === "1";
const horaDe = (d: Definicao) => getSetting(`ritual_${d.id}_hora`) ?? d.hora;

function ultimaExecucao(id: RitualId): number | null {
  const r = db.prepare("SELECT MAX(ts) AS t FROM atas WHERE ritual = ?").get(id) as { t: number | null };
  return r.t;
}

/** Semana ISO (para a retrospectiva quinzenal). */
function semanaIso(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dia = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dia);
  const inicio = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - inicio.getTime()) / DIA + 1) / 7);
}

function ehUltimoDiaUtil(d: Date) {
  const prox = new Date(d);
  do prox.setDate(prox.getDate() + 1);
  while (prox.getDay() === 0 || prox.getDay() === 6);
  return prox.getMonth() !== d.getMonth();
}

function vale(d: Definicao, dia: Date) {
  if (!d.dias.includes(dia.getDay())) return false;
  if (d.quinzenal && semanaIso(dia) % 2 !== 0) return false;
  if (d.ultimoDiaUtil && !ehUltimoDiaUtil(dia)) return false;
  return true;
}

function noHorario(dia: Date, hora: string) {
  const [h, m] = hora.split(":").map(Number);
  const x = new Date(dia);
  x.setHours(h!, m!, 0, 0);
  return x;
}

/** Ocorrência mais recente que já passou (ou null nos últimos 35 dias). */
export function ultimaOcorrencia(d: Definicao, agora = new Date()): Date | null {
  for (let i = 0; i < 35; i++) {
    const dia = new Date(agora);
    dia.setDate(dia.getDate() - i);
    const quando = noHorario(dia, horaDe(d));
    if (quando <= agora && vale(d, dia)) return quando;
  }
  return null;
}

export function proximaOcorrencia(d: Definicao, agora = new Date()): Date | null {
  for (let i = 0; i < 40; i++) {
    const dia = new Date(agora);
    dia.setDate(dia.getDate() + i);
    const quando = noHorario(dia, horaDe(d));
    if (quando > agora && vale(d, dia)) return quando;
  }
  return null;
}

const quandoTexto = (d: Definicao) => {
  const nomes = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  if (d.ultimoDiaUtil) return `último dia útil do mês, ${horaDe(d)}`;
  const dias = d.dias.length === 5 && !d.dias.includes(0) && !d.dias.includes(6) ? "seg a sex" : d.dias.map((x) => nomes[x]).join(", ");
  return `${d.quinzenal ? "a cada 2 semanas, " : ""}${dias}, ${horaDe(d)}`;
};

export function listarRituais(): RitualInfo[] {
  return definicoes.map((d) => ({
    id: d.id, nome: d.nome, descricao: d.descricao, ativo: ativo(d), hora: horaDe(d), dias: d.dias, quando: quandoTexto(d),
    ultimaExecucao: ultimaExecucao(d.id), proximaExecucao: ativo(d) ? (proximaOcorrencia(d)?.getTime() ?? null) : null,
  }));
}

const publicar = () => emit({ type: "rituais", rituais: listarRituais() });

export function configurarRitual(id: RitualId, c: { ativo?: boolean; hora?: string }) {
  if (!definicoes.some((d) => d.id === id)) throw new Error("Ritual inexistente.");
  if (typeof c.ativo === "boolean") setSetting(`ritual_${id}_ativo`, c.ativo ? "1" : "0");
  if (typeof c.hora === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(c.hora)) setSetting(`ritual_${id}_hora`, c.hora);
  publicar();
}

export function listarAtas(limite = 60): Ata[] {
  return (db.prepare("SELECT * FROM atas ORDER BY ts DESC LIMIT ?").all(limite) as Record<string, unknown>[]).map((r) => ({
    id: r.id as number, ritual: r.ritual as RitualId, ts: r.ts as number, atrasado: r.atrasado === 1, autor: r.autor as string,
    resumo: r.resumo as string, conteudo: r.conteudo as string,
  }));
}

function registrarAta(ritual: RitualId, autor: string, resumo: string, conteudo: string, atrasado: boolean): Ata {
  const ts = Date.now();
  const id = Number(
    db.prepare("INSERT INTO atas (ritual, ts, atrasado, autor, resumo, conteudo) VALUES (?, ?, ?, ?, ?, ?)").run(ritual, ts, atrasado ? 1 : 0, autor, resumo, conteudo).lastInsertRowid,
  );
  const ata: Ata = { id, ritual, ts, atrasado, autor, resumo, conteudo };
  emit({ type: "ata", ata });
  publicar();
  return ata;
}

/* ---------- Agendador ---------- */

const rodando = new Set<RitualId>();
let timer: NodeJS.Timeout | null = null;

export function iniciarRituais() {
  if (timer) return;
  timer = setInterval(() => void verificar(), 60_000);
  setTimeout(() => void verificar(), 5_000); // ao abrir o app, recupera o que ficou para trás
}

async function verificar(agora = new Date()) {
  // Na primeira vez que o agendador roda, não recupera nada do passado: os rituais
  // contam a partir de agora (senão uma instalação nova já sairia gastando).
  const desde = Number(getSetting("rituais_desde") ?? "0");
  if (!desde) {
    setSetting("rituais_desde", String(agora.getTime()));
    return;
  }
  if (!clienteClaude()) return; // sem chave, espera (ainda dá tempo dentro da janela de atraso)
  for (const d of definicoes) {
    if (!ativo(d) || rodando.has(d.id)) continue;
    // Planejamento e cadências criam trabalho: só depois que a empresa conhece o negócio.
    if ((d.id === "planejamento" || d.id === "cadencias") && statusOnboarding() !== "concluido") continue;
    const ocorrencia = ultimaOcorrencia(d, agora);
    if (!ocorrencia || ocorrencia.getTime() < desde || agora.getTime() - ocorrencia.getTime() > JANELA_ATRASO) continue;
    const ultima = ultimaExecucao(d.id);
    if (ultima && ultima >= ocorrencia.getTime()) continue;
    await executarRitual(d.id, agora.getTime() - ocorrencia.getTime() > 15 * 60_000);
  }
}

/** Roda um ritual agora (pelo agendador ou pelo botão "Rodar agora"). */
export async function executarRitual(id: RitualId, atrasado = false): Promise<Ata | null> {
  if (rodando.has(id)) return null;
  rodando.add(id);
  try {
    switch (id) {
      case "daily":
        return await reuniaoDeResumo("daily", atrasado);
      case "revisao":
        return await reuniaoDeResumo("revisao", atrasado);
      case "retrospectiva":
        return await reuniaoDeResumo("retrospectiva", atrasado);
      case "fechamento":
        return await reuniaoDeResumo("fechamento", atrasado);
      case "planejamento":
        return planejamento(atrasado);
      case "cadencias":
        return cadencias(atrasado);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    postChat(HELENA, `Não consegui fazer o ritual "${definicoes.find((d) => d.id === id)!.nome}" agora: ${msg}`);
    return null;
  } finally {
    rodando.delete(id);
  }
}

/* ---------- Dados para os rituais ---------- */

function atividadeDesde(desde: number): string {
  const linhas = db
    .prepare(
      `SELECT c.card_id, c.autor, c.tipo, c.texto, c.ts, k.titulo FROM comentarios c JOIN cards k ON k.id = c.card_id
       WHERE c.ts >= ? AND k.demo = 0 ORDER BY c.ts DESC LIMIT 120`,
    )
    .all(desde) as { card_id: number; autor: string; tipo: string; texto: string; ts: number; titulo: string }[];
  if (!linhas.length) return "";
  return linhas
    .reverse()
    .map((l) => {
      const quem = l.autor === "voce" ? "CEO" : (agentById[l.autor]?.nome ?? l.autor);
      return `- EMP-${l.card_id} "${l.titulo}" · ${quem} · ${l.tipo}: ${l.texto.slice(0, 200)}`;
    })
    .join("\n");
}

function situacaoAtual(): string {
  const cards = listarCards().filter((c) => !c.demo);
  const pendentes = cards.filter((c) => colunaDe(c.fluxo, c.coluna)?.tipo === "ceo");
  const bloqueados = cards.filter((c) => c.bloqueado);
  const andamento = cards.filter((c) => !["feito", "perdido", "ceo"].includes(colunaDe(c.fluxo, c.coluna)?.tipo ?? "") && c.coluna !== "backlog");
  const fmt = (c: (typeof cards)[number]) => `- ${c.chave} ${c.titulo} (${c.dono ? agentById[c.dono]?.nome : "sem dono"})`;
  return [
    `Aguardando o CEO (${pendentes.length}):\n${pendentes.map(fmt).join("\n") || "- nenhum"}`,
    `Bloqueados (${bloqueados.length}):\n${bloqueados.map(fmt).join("\n") || "- nenhum"}`,
    `Em andamento (${andamento.length}):\n${andamento.slice(0, 20).map(fmt).join("\n") || "- nenhum"}`,
  ].join("\n\n");
}

function indicadoresEmTexto(): string {
  const ind = calcularIndicadores();
  const usd = (v: number) => `US$ ${v.toFixed(2)}`;
  const areas = ind.areas
    .filter((a) => a.concluidos7d || a.emAndamento || a.aguardandoCeo || a.bugsAbertos)
    .map((a) => `- ${roomById[a.sala].nome}: ${a.concluidos7d} concluídos em 7 dias, ${a.emAndamento} em andamento, ${a.bugsAbertos} bugs abertos, aprovação de primeira ${a.aprovacaoPrimeira ?? "–"}%, custo 7d ${usd(a.custo7dUsd)}`)
    .join("\n");
  return `${areas || "- sem atividade nas áreas"}\nCusto de IA: hoje ${usd(ind.custoHojeUsd)}, 7 dias ${usd(ind.custo7dUsd)}, mês ${usd(ind.custoMesUsd)}`;
}

/* ---------- Reuniões de resumo (daily, revisão, retrospectiva, fechamento) ---------- */

const configResumo: Record<"daily" | "revisao" | "retrospectiva" | "fechamento", { janela: number; autor: string; modelo: string; pedido: string }> = {
  daily: {
    janela: DIA,
    autor: HELENA,
    modelo: RESUMOS,
    pedido: "Escreva a daily em exatamente 5 linhas curtas: 1) o que foi entregue desde ontem; 2) o que a equipe faz hoje; 3) bloqueios; 4) o que precisa do CEO (cite as chaves EMP); 5) uma observação sobre as metas.",
  },
  revisao: {
    janela: 7 * DIA,
    autor: HELENA,
    modelo: RESUMOS,
    pedido: "Escreva a revisão da semana: o que foi entregue (com chaves EMP), andamento das metas em números, indicadores que chamam atenção, custo da semana e as 3 prioridades da próxima semana. No máximo 12 linhas.",
  },
  retrospectiva: {
    janela: 14 * DIA,
    autor: HELENA,
    modelo: ANALISE,
    pedido: "Faça a retrospectiva das últimas duas semanas: onde o trabalho travou (devoluções recorrentes, motivos parecidos, bloqueios, falhas), o que funcionou bem, e proponha 3 melhorias concretas de processo ou de playbook (o CEO decide). No máximo 15 linhas.",
  },
  fechamento: {
    janela: 31 * DIA,
    autor: "financeiro",
    modelo: RESUMOS,
    pedido: "Faça o fechamento do mês como Financeiro: custo de IA do mês e da última semana, áreas que mais gastaram, custo médio por entrega concluída, andamento das metas e uma recomendação de orçamento para o próximo mês. No máximo 12 linhas.",
  },
};

async function reuniaoDeResumo(id: keyof typeof configResumo, atrasado: boolean): Promise<Ata | null> {
  const cfg = configResumo[id];
  const nome = definicoes.find((d) => d.id === id)!.nome;
  const desde = Date.now() - cfg.janela;
  const atividade = atividadeDesde(desde);
  const temCards = listarCards().some((c) => !c.demo);

  // Sem nada acontecendo, não gasta API: registra a ata direto.
  if (!temCards && !atividade) {
    return registrarAta(id, cfg.autor, `${nome}: sem atividade`, "Nenhum card na board ainda. Peça algo à Helena para a equipe começar.", atrasado);
  }

  const client = clienteClaude();
  if (!client) return null;
  const autor = agentById[cfg.autor]!;
  const participantes = escolherParticipantes(desde, autor.id);
  reunir(participantes, nome);
  const inicio = Date.now();
  try {
    const r = await rodarAgente({
      client,
      modelo: cfg.modelo,
      sistema: `Você é ${autor.nome}, ${autor.cargo} da Empresa Completa. ${autor.persona}
Você conduz o ritual "${nome}" e escreve a ata para o CEO. Português do Brasil, direto, sem enrolação, sem inventar nada que não esteja nos dados. Use as chaves EMP-xx quando citar cards. Sem títulos; tópicos curtos são bem-vindos.`,
      mensagem: `## Metas do trimestre\n${metasEmTexto()}\n\n## Indicadores\n${indicadoresEmTexto()}\n\n## Situação agora\n${situacaoAtual()}\n\n## Atividade no período\n${atividade || "(nenhuma)"}\n\n${atrasado ? "Observação: este ritual está rodando atrasado (o computador estava desligado no horário).\n\n" : ""}${cfg.pedido}`,
      ferramentas: [],
      esforco: id === "retrospectiva" ? "medium" : "low",
      fallback: cfg.modelo !== RESUMOS,
      exigeFerramenta: false,
      lembrete: "",
      maxRodadas: 1,
    });
    const conteudo = r.texto.trim() || "(sem conteúdo)";
    // Deixa a reunião aparecer no escritório por pelo menos alguns segundos.
    const falta = 12_000 - (Date.now() - inicio);
    if (falta > 0) await new Promise((res) => setTimeout(res, falta));
    const ata = registrarAta(id, autor.id, `${nome}${atrasado ? " (atrasado)" : ""}`, conteudo, atrasado);
    focus("reuniao", autor.id);
    postChat(autor.id, `${nome}${atrasado ? " (atrasada)" : ""}:\n${conteudo}`);
    return ata;
  } finally {
    dispersar(participantes);
  }
}

/** Quem vai à reunião: quem conduz + líderes das áreas com movimento no período (até 11). */
function escolherParticipantes(desde: number, quemConduz: string): string[] {
  const salas = new Set(listarCards().filter((c) => !c.demo && c.atualizadoEm >= desde).map((c) => c.sala));
  // Quem está no meio de um card continua trabalhando; não é puxado para a reunião.
  const ocupados = new Set(estadoMotor().emAndamento.map((t) => t.agenteId));
  const lideres = agents.filter((a) => a.lider && salas.has(a.sala) && a.id !== quemConduz && !ocupados.has(a.id)).map((a) => a.id);
  return [quemConduz, ...lideres].slice(0, 12);
}

function reunir(ids: string[], nome: string) {
  focus("reuniao", ids[0]);
  ids.forEach((id, i) => setAgentStatus(id, "em-reuniao", `Ritual: ${nome}`, `reuniao:${i}`));
}

function dispersar(ids: string[]) {
  for (const id of ids) setAgentStatus(id, "ocioso", null);
}

/* ---------- Planejamento semanal: vira um card para o CEO aprovar ---------- */

function planejamento(atrasado: boolean): Ata {
  const data = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const revisao = listarAtas(20).find((a) => a.ritual === "revisao");
  const backlog = listarCards()
    .filter((c) => !c.demo && c.coluna === "backlog")
    .slice(0, 30)
    .map((c) => `- ${c.chave} ${c.titulo} (${roomById[c.sala].nome}, ${c.prioridade})`)
    .join("\n");
  const card = criarCard(
    {
      titulo: `Plano da semana (${data})`,
      sala: "diretoria",
      fluxo: "geral",
      coluna: colunaDeEntrada("geral"),
      dono: HELENA,
      nivel: "N1",
      prioridade: "P1",
      etiquetas: ["plano-semana"],
      descricao: `Proponha o plano desta semana ligado às metas do trimestre. NÃO crie cards: liste as propostas; quando o CEO aprovar, eu as transformo em cards.

## Metas do trimestre
${metasEmTexto()}

## Indicadores
${indicadoresEmTexto()}

## Situação agora
${situacaoAtual()}

## Backlog
${backlog || "- vazio"}

## Revisão da semana passada
${revisao?.conteudo ?? "(não houve)"}`,
      criterios: [
        "- No máximo 8 entregas, cada uma ligada a uma meta (ou justificada)",
        "- Para cada entrega: título, área, dono (id do agente), prioridade, nível de autonomia e critérios de aceite",
        "- Ordem e dependências explícitas",
        "- O que fica de fora nesta semana e por quê",
        "- Cabe no orçamento diário de IA",
      ].join("\n"),
    },
    HELENA,
  );
  postChat(HELENA, `Abri o ${card.chave} com o plano da semana. Quando estiver validado, ele aparece em Aprovações; ao aprovar, eu transformo em cards.`);
  return registrarAta("planejamento", HELENA, `Planejamento semanal${atrasado ? " (atrasado)" : ""}`, `Plano da semana aberto no ${card.chave}.`, atrasado);
}

// Plano aprovado pelo CEO: a Helena transforma as propostas em cards.
aoAprovar.push((card) => {
  if (!card.etiquetas.includes("plano-semana")) return;
  const entrega = ultimaEntrega(card.id);
  if (entrega) void transformarPlanoEmCards(lerCard(card.id).chave, entrega.conteudo);
});

/* ---------- Cadências das áreas ---------- */

function cadencias(atrasado: boolean): Ata {
  const data = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const rotinas: { titulo: string; sala: "marketing" | "seguranca" | "infraestrutura" | "dados"; dono: string; descricao: string }[] = [
    { titulo: `Calendário editorial da semana (${data})`, sala: "marketing", dono: "head-marketing", descricao: "Planeje os posts da semana (Instagram e LinkedIn) ligados às metas e ao tom do Livro: tema, formato, gancho, CTA e dia/horário de cada um." },
    { titulo: `Varredura semanal de dependências (${data})`, sala: "seguranca", dono: "appsec", descricao: "Revise as dependências e a configuração do projeto ativo em busca de vulnerabilidades conhecidas e segredos expostos. Liste achados com risco e correção." },
    { titulo: `Checklist semanal de patches e certificados (${data})`, sala: "infraestrutura", dono: "sysadmin", descricao: "Monte o checklist da semana: atualizações de segurança pendentes, certificados TLS a vencer, backups e acessos a revisar, com os comandos para o CEO executar." },
    { titulo: `Plano do teste de restauração de backup (${data})`, sala: "dados", dono: "dba", descricao: "Escreva o passo a passo do teste de restauração de backup desta semana (RPO/RTO, o que validar, como medir), para o CEO executar." },
    { titulo: `Pentest semanal da aplicação (${data})`, sala: "seguranca", dono: "pentester", descricao: "Teste de intrusão autorizado, só na aplicação do projeto ativo (caixa branca, lendo código e rotas, enquanto não houver ambiente de homologação). Siga o OWASP WSTG e entregue o relatório com severidade, como verificar no ambiente de teste e correção." },
  ];
  const criados = rotinas.map((r) =>
    criarCard(
      {
        ...r,
        fluxo: r.sala === "marketing" ? "marketing" : r.sala === "seguranca" ? "software" : "operacoes",
        coluna: colunaDeEntrada(r.sala === "marketing" ? "marketing" : r.sala === "seguranca" ? "software" : "operacoes"),
        nivel: "N1",
        prioridade: "P2",
        etiquetas: ["rotina"],
        projetoId: r.sala === "seguranca" ? projetoAtivo() : null,
      },
      HELENA,
    ),
  );
  return registrarAta("cadencias", HELENA, `Cadências das áreas${atrasado ? " (atrasado)" : ""}`, criados.map((c) => `- ${c.chave} ${c.titulo}`).join("\n"), atrasado);
}
