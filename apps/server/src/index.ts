import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { ROOT } from "./paths.ts";
import websocket from "@fastify/websocket";
import { colunaDe } from "@empresa/shared";
import type { CardEditavel, ClientEvent, ConfigCritica, ItemConhecimento, Meta, RitualId, ServerEvent, StatusResponse } from "@empresa/shared";
import { estados, emit, subscribe } from "./bus.ts";
import { recentChat, recentFeed } from "./db.ts";
import { configurarMotor, estadoMotor, iniciarMotor, interromper } from "./agentes/motor.ts";
import { pedirParaHelena } from "./agentes/helena.ts";
import { custoHoje } from "./custo.ts";
import { configurarGatilho, listarGatilhos, type GatilhoId } from "./gatilhos.ts";
import { codigoDoCard, descartar, mesclar } from "./fabrica/workspace.ts";
import { iniciarPrevia, lerPrevia, pararPrevia, pararTodasPrevias } from "./fabrica/previa.ts";
import { editarPeca, iniciarLembretesDeMarketing, listarPecas, marcarPublicado } from "./marketing.ts";
import { configurarConexao, conexaoDoProjeto, removerConexao } from "./areas/dados.ts";
import { adicionarMonitor, checarTodos, consultarDns, iniciarMonitoramento, listarMonitores, removerMonitor, verificarSite } from "./areas/infra.ts";
import { abrirAtendimento } from "./areas/atendimento.ts";
import { calcularSimples } from "./areas/financas.ts";
import { iniciarConquistas, listarConquistas } from "./conquistas.ts";
import { definirConfigBackup, estadoBackup, fazerBackup, iniciarBackup } from "./backup.ts";
import { buscarNaMemoria } from "./memoria.ts";
import { configurarNuvem, estadoNuvem, testarNuvem } from "./fabrica/nuvem.ts";
import { listarPessoas, removerPessoa, salvarPessoa } from "./pessoas.ts";
import { exportarAgente, exportarEscritorio, exportarFluxo, importarPacote } from "./escritoriosPacote.ts";
import { carregarEscritorios, excluirEscritorio, listarEscritorios, restaurarSede, salvarEscritorio } from "./escritorios.ts";
import { escritorioDoModelo, MODELOS_FLUXO, modelosDeEscritorio } from "@empresa/org";
import { configurarTelegram, desparear, enviar as enviarTelegram, esquecerTelegram, estadoTelegram, iniciarTelegram } from "./telegram.ts";
import {
  aprovarResposta, atualizarContato, configurarWhatsapp, descartarResposta, enviarModelo, enviarTexto, esquecerWhatsapp, estadoWhatsapp,
  iniciarWhatsapp, listarContatos, listarMensagens, listarModelos, pararWhatsapp, testarConexao,
} from "./whatsapp/whatsapp.ts";
import "./whatsapp/agente.ts";
import { presets } from "./mcp/catalogo.ts";
import { atualizarServidor, concluirOauth, conectar, criarServidor, iniciarConectores, listarServidores, redirectOauth, removerServidor } from "./mcp/conectores.ts";
import { aprovarPedido, listarPedidos, recusarPedido } from "./mcp/ferramentas.ts";
import { configMaquina, definirConfigMaquina, validarConfig } from "./maquina/terminal.ts";
import { encerrar, listarSessoesControle, pararTudo } from "./maquina/controle.ts";
import { desligar as desligarCelular, listarAparelhos, listarSessoesCelular } from "./maquina/celular.ts";
import { definirExternoLivre, definirSitesDeTeste, externoLivre, fecharSessao, listarSessoes, sitesDeTeste } from "./fabrica/navegador.ts";
import {
  adicionarNaoContatar, editarLead, iniciarProspeccao, leadsEmCsv, lerLead, listarCampanhas, listarLeads, listarNaoContatar, marcarContatado,
  naoContatarLead, removerNaoContatar,
} from "./prospeccao.ts";
import {
  aprovarConhecimento, configCritica, configurarCritica, criarConhecimento, editarConhecimento, excluirConhecimento, listarConhecimento,
} from "./conhecimento.ts";
import { calcularIndicadores, listarMetas, removerMeta, salvarMeta, sugerirMetas } from "./metas.ts";
import { configurarRitual, executarRitual, iniciarRituais, listarAtas, listarRituais } from "./rituais.ts";
import { isDemoActive, setDemo } from "./demo.ts";
import { ehSecao, lerLivro, marcarRevisada, salvarSecao } from "./livro.ts";
import { estadoOnboarding, iniciarEntrevista, responder } from "./onboarding.ts";
import { adicionarProjeto, definirAtivo, definirUrlLocal, escolherPasta, listarPastas, listarProjetos, projetoAtivo, removerProjeto } from "./projetos.ts";
import { pastaDeMidia } from "./fabrica/capturas.ts";
import { nomeValido, PASTA_IMAGENS, salvarImagem } from "./imagens.ts";
import { mimeDe, nomeArquivoValido, nomeOriginal, PASTA_ARQUIVOS, salvarArquivo } from "./arquivos.ts";
import { createReadStream, existsSync } from "node:fs";
import { join } from "node:path";
import {
  abrirBug, aprovar, aprovarLote, comentarComoCeo, criarCard, devolver, editarCard, ErroCard, lerCard, liberarGasto, listarCards, listarComentarios, listarEntregas, mover,
  removerCard, removerCardsDemo, type NovoCard,
} from "./tarefas.ts";
import { apiKeyHint, clearApiKey, loadApiKey, saveApiKey, validateApiKey } from "./secrets.ts";
import { HOST } from "./plataforma.ts";
import { configurarProvedores, estadoProvedores, marcarNoAr } from "./provedores.ts";
import { iniciarVigia, listarAlertas, resolverAlerta } from "./vigia.ts";
import { listarIntegracoes } from "./integracoes.ts";
import { configAutonomia, configurarAutonomia, desfazerDecisao, iniciarAutonomia, listarDecisoes, resumoDoDia } from "./autonomia.ts";
import { montarPainel, configRelatorio, definirRelatorio, mandarRelatorio, iniciarRelatorioDiario } from "./painel.ts";
import { resumoChamadas, estimativaDeCusto } from "./chamadas.ts";
import { MODELOS_DE_PROJETO, criarProjetoDoModelo } from "./modelosDeProjeto.ts";
import { relatorioParaCliente } from "./relatorioCliente.ts";
import { limparCopiasAntigas, migrarCopiasParaWorkspace } from "./fabrica/workspace.ts";
import { testarCard } from "./fabrica/testes.ts";
import { abrirPullRequest, configurarGithub, estadoGithub } from "./fabrica/github.ts";
import { listarEvals, rodarEvals, tarefasDeEval, apagarCaso, importarCasos, listarCasos } from "./evals.ts";
import { testarModelo } from "./agentes/compat.ts";
import { conferirMetricas, conferirSentry, configurarProducao, definirMetrica, estadoProducao, iniciarProducao, metricaDoCard, previaPublicadaDo, publicarPrevia, registrarResultadoDaMetrica, vigiarDepoisDoMerge, vincularProjeto, vinculoDoProjeto } from "./fabrica/producao.ts";
import { conferirReplanejamento, definirOrcamentoDoProjeto, fixarLinhaDeBase, iniciarPlanejamento, planoDoProjeto } from "./planejamento.ts";
import { auditarRequisicao, listarAuditoria, verificarAuditoria } from "./confianca/auditoria.ts";
import { execucoesDoCard, limparPassosAntigos } from "./confianca/execucoes.ts";
import { aplicarSugestao, configurarAprendizado, definirABAutomatico, encerrarAB, estadoAprendizado, iniciarAB, iniciarAprendizado, proporCandidata } from "./aprendizado.ts";

const PORT = Number(process.env.API_PORT ?? 4317);

// Escritórios guardados no banco entram no registro antes de tudo (motor, prompts e rotas usam o registro).
carregarEscritorios();

// Escuta só em localhost: a chave e os agentes nunca ficam expostos na rede (no Docker, 0.0.0.0 dentro
// do contêiner, publicado só em 127.0.0.1 do Mac; o filtro de Host e Origin abaixo vale nos dois casos).
// Os plugins têm 2 minutos para subir (o padrão é 10 s): com a memória em swap, o @fastify/static passava disso
// e o contêiner reiniciava na primeira tentativa.
const app = Fastify({ logger: { level: "warn" }, pluginTimeout: 120_000 });

// Só o próprio Mac fala com a API (achado do QA em 27/10/2026): sem isso, qualquer site aberto no navegador
// poderia mandar pedidos para 127.0.0.1 (CSRF), apontar um domínio para o Mac (DNS rebinding) ou abrir o
// WebSocket e ler o chat. Regras: Host local; Origin, se houver, local; nada entre sites, exceto a navegação
// normal (o retorno do login OAuth chega assim).
const HOST_LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
const ORIGEM_LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
app.addHook("onRequest", async (req, reply) => {
  if (!HOST_LOCAL.test(req.headers.host ?? "")) return reply.code(403).send({ erro: "Acesso só pelo próprio Mac (localhost)." });
  const origem = req.headers.origin;
  if (origem !== undefined && !ORIGEM_LOCAL.test(origem)) return reply.code(403).send({ erro: "Origem não permitida." });
  const site = req.headers["sec-fetch-site"];
  const navegacao = req.method === "GET" && req.headers["sec-fetch-mode"] === "navigate";
  if (site === "cross-site" && !navegacao) return reply.code(403).send({ erro: "Pedido entre sites bloqueado." });
});
// Auditoria: toda ação que muda algo pela API entra na corrente de hashes (sem segredos).
app.addHook("onResponse", async (req, reply) => {
  if (req.url.startsWith("/api/")) auditarRequisicao(req.method, req.url, reply.statusCode, req.body);
});
await app.register(websocket);

// Erros de regra de negócio viram respostas { erro } com o status certo.
app.setErrorHandler((err, _req, reply) => {
  if (err instanceof ErroCard) return reply.code(err.status).send({ erro: err.message });
  app.log.error(err);
  return reply.code(500).send({ erro: "Erro interno no servidor." });
});

app.get("/api/status", async (): Promise<StatusResponse> => {
  const key = loadApiKey();
  return { chaveConfigurada: key !== null, dicaChave: apiKeyHint(key) };
});

app.post<{ Body: { apiKey?: string } }>("/api/key", async (req, reply) => {
  const apiKey = req.body?.apiKey?.trim();
  if (!apiKey || !apiKey.startsWith("sk-ant-")) {
    return reply.code(400).send({ erro: "A chave deve começar com sk-ant-." });
  }
  const check = await validateApiKey(apiKey);
  if (!check.ok) return reply.code(400).send({ erro: check.erro });
  saveApiKey(apiKey);
  // Chave nova (ou crédito recarregado): o Claude volta a ser tentado na hora.
  marcarNoAr("claude");
  emit({ type: "chave", configurada: true });
  return { chaveConfigurada: true, dicaChave: apiKeyHint(apiKey) } satisfies StatusResponse;
});

app.delete("/api/key", async () => {
  clearApiKey();
  emit({ type: "chave", configurada: false });
  return { chaveConfigurada: false, dicaChave: null } satisfies StatusResponse;
});

app.get("/api/livro", async () => lerLivro());

app.put<{ Params: { secao: string }; Body: { conteudo?: string; revisada?: boolean } }>("/api/livro/:secao", async (req, reply) => {
  const { secao } = req.params;
  if (!ehSecao(secao)) return reply.code(404).send({ erro: "Seção inexistente." });
  const { conteudo, revisada } = req.body ?? {};
  if (typeof conteudo === "string") {
    if (!conteudo.trim()) return reply.code(400).send({ erro: "A seção não pode ficar vazia." });
    // Editada pelo CEO: já conta como revisada.
    salvarSecao(secao, conteudo.trim().slice(0, 20000), true);
  } else if (typeof revisada === "boolean") {
    marcarRevisada(secao, revisada);
  }
  return lerLivro();
});

/* ---------- Backlog e board ---------- */

const idDe = (v: string) => {
  const n = Number(v);
  if (!Number.isInteger(n)) throw new ErroCard("Id inválido.");
  return n;
};

app.get("/api/cards", async () => listarCards());
app.post<{ Body: NovoCard }>("/api/cards", async (req) => criarCard(req.body));
// O CEO mexendo num card em andamento (bloquear, trocar responsável/área, mover, apagar) interrompe o agente que está nele.
app.patch<{ Params: { id: string }; Body: CardEditavel }>("/api/cards/:id", async (req) => {
  const id = idDe(req.params.id);
  const antes = lerCard(id);
  const depois = editarCard(id, req.body);
  if ((depois.bloqueado && !antes.bloqueado) || depois.dono !== antes.dono || depois.validador !== antes.validador || depois.sala !== antes.sala) {
    interromper(id, "o CEO mudou o card");
  }
  return depois;
});
app.delete<{ Params: { id: string } }>("/api/cards/:id", async (req) => {
  interromper(idDe(req.params.id), "o card foi apagado");
  removerCard(idDe(req.params.id));
  return { ok: true };
});
app.delete("/api/cards-demo", async () => {
  removerCardsDemo();
  return { ok: true };
});
app.post<{ Params: { id: string }; Body: { coluna: string; ordem?: number } }>("/api/cards/:id/mover", async (req) => {
  const id = idDe(req.params.id);
  const antes = lerCard(id).coluna;
  const movido = mover(id, req.body.coluna, "voce", req.body.ordem);
  if (movido.coluna !== antes) interromper(id, "o CEO moveu o card de coluna");
  return movido;
});
app.post<{ Params: { id: string }; Body: { comentario?: string } }>("/api/cards/:id/aprovar", async (req) =>
  aprovar(idDe(req.params.id), req.body?.comentario),
);
app.post<{ Body: { ids: number[] } }>("/api/cards/aprovar-lote", async (req) => aprovarLote(req.body.ids ?? []));
app.post<{ Params: { id: string }; Body: { comentario: string } }>("/api/cards/:id/devolver", async (req) =>
  devolver(idDe(req.params.id), req.body?.comentario ?? ""),
);
app.post<{ Params: { id: string }; Body: { titulo: string; descricao?: string; severidade?: "S1" | "S2" | "S3" | "S4" } }>(
  "/api/cards/:id/bug",
  async (req) => abrirBug(idDe(req.params.id), req.body),
);
app.post<{ Params: { id: string } }>("/api/cards/:id/liberar", async (req) => liberarGasto(idDe(req.params.id)));
app.post<{ Params: { id: string } }>("/api/cards/:id/codigo/testar", async (req) => testarCard(idDe(req.params.id), "voce"));
app.post<{ Params: { id: string } }>("/api/cards/:id/pull-request", async (req) => abrirPullRequest(idDe(req.params.id)));
app.get("/api/integracoes", async () => listarIntegracoes());
app.get("/api/autonomia", async () => configAutonomia());
app.put<{ Body: Record<string, unknown> }>("/api/autonomia", async (req) => configurarAutonomia(req.body ?? {}));
app.get("/api/autonomia/decisoes", async () => listarDecisoes());
app.get("/api/autonomia/resumo", async () => ({ texto: resumoDoDia() }));
app.post<{ Params: { id: string } }>("/api/autonomia/decisoes/:id/desfazer", async (req, reply) => {
  try {
    return desfazerDecisao(Number(req.params.id));
  } catch (e) {
    return reply.code(400).send({ erro: (e as Error).message });
  }
});
app.get("/api/github", async () => estadoGithub());
app.put<{ Body: { token?: string | null } }>("/api/github", async (req) => configurarGithub(typeof req.body?.token === "string" ? req.body.token : null));
app.get("/api/evals", async () => listarEvals());
app.get("/api/evals/tarefas", async () => tarefasDeEval());
app.post("/api/evals", async () => rodarEvals());
// Casos reais: cards concluídos viram casos de avaliação (o juiz compara com a entrega aprovada).
app.get("/api/evals/casos", async () => listarCasos());
app.post("/api/evals/casos/importar", async () => importarCasos());
app.delete<{ Params: { id: string } }>("/api/evals/casos/:id", async (req) => {
  apagarCaso(Number(req.params.id));
  return listarCasos();
});

// Vigia de saúde: alertas abertos (ou os últimos 100, com ?todos=1) e resolver à mão.
app.get<{ Querystring: { todos?: string } }>("/api/alertas", async (req) => listarAlertas(req.query.todos !== "1"));
app.post<{ Params: { id: string } }>("/api/alertas/:id/resolver", async (req) => {
  resolverAlerta(Number(req.params.id));
  return listarAlertas();
});

/* ---------- Produção: prévia publicada (Vercel), Sentry depois do merge e métrica por card ---------- */

const erro400 = (fn: () => unknown) => async (_req: unknown, reply: { code: (n: number) => { send: (b: unknown) => unknown } }) => {
  try {
    return await fn();
  } catch (e) {
    return reply.code(400).send({ erro: (e as Error).message });
  }
};
app.get("/api/producao", async () => estadoProducao());
app.put<{ Body: { vercelToken?: string | null; vercelTime?: string | null; sentryToken?: string | null } }>("/api/producao", async (req, reply) =>
  erro400(() => configurarProducao(req.body ?? {}))(req, reply),
);
app.get<{ Params: { id: string } }>("/api/projetos/:id/producao", async (req) => vinculoDoProjeto(idDe(req.params.id)));
app.put<{ Params: { id: string }; Body: { vercel?: string | null; sentry?: string | null } }>("/api/projetos/:id/producao", async (req, reply) =>
  erro400(() => vincularProjeto(idDe(req.params.id), req.body ?? {}))(req, reply),
);
app.get<{ Params: { id: string } }>("/api/cards/:id/previa-publicada", async (req) => previaPublicadaDo(idDe(req.params.id)) ?? { semPrevia: true });
app.post<{ Params: { id: string } }>("/api/cards/:id/previa-publicada", async (req, reply) => erro400(() => publicarPrevia(idDe(req.params.id)))(req, reply));
app.post("/api/producao/conferir", async () => ({ bugs: await conferirSentry(), perguntas: conferirMetricas() }));
app.get<{ Params: { id: string } }>("/api/cards/:id/metrica", async (req) => metricaDoCard(idDe(req.params.id)) ?? { semMetrica: true });
app.put<{ Params: { id: string }; Body: { nome: string; alvo: string; comoMedir?: string; prazoDias: number } | null }>("/api/cards/:id/metrica", async (req, reply) =>
  erro400(() => definirMetrica(idDe(req.params.id), req.body ?? null) ?? { semMetrica: true })(req, reply),
);
app.delete<{ Params: { id: string } }>("/api/cards/:id/metrica", async (req) => (definirMetrica(idDe(req.params.id), null), { semMetrica: true }));
app.post<{ Params: { id: string }; Body: { resultado?: string; atingiu?: boolean | null } }>("/api/cards/:id/metrica/resultado", async (req, reply) =>
  erro400(() => registrarResultadoDaMetrica(idDe(req.params.id), String(req.body?.resultado ?? ""), req.body?.atingiu))(req, reply),
);

/* ---------- Planejamento por projeto ---------- */

app.get<{ Params: { id: string } }>("/api/projetos/:id/plano", async (req) => planoDoProjeto(idDe(req.params.id)));
app.post<{ Params: { id: string } }>("/api/projetos/:id/plano/base", async (req) => fixarLinhaDeBase(idDe(req.params.id)));
app.post<{ Params: { id: string } }>("/api/projetos/:id/plano/conferir", async (req) => ({ card: conferirReplanejamento(idDe(req.params.id)) }));
app.put<{ Params: { id: string }; Body: { orcamentoUsd?: number | null } }>("/api/projetos/:id/orcamento", async (req, reply) => {
  const v = req.body?.orcamentoUsd;
  if (v !== null && v !== undefined && (typeof v !== "number" || !Number.isFinite(v) || v < 0)) return reply.code(400).send({ erro: "Orçamento inválido." });
  try {
    return definirOrcamentoDoProjeto(idDe(req.params.id), v ?? null);
  } catch (e) {
    return reply.code(404).send({ erro: (e as Error).message });
  }
});

/* ---------- Confiança: replay das execuções e auditoria ---------- */

app.get<{ Params: { id: string } }>("/api/cards/:id/execucoes", async (req) => execucoesDoCard(idDe(req.params.id)));
app.get<{ Querystring: { limite?: string; ator?: string; antesDe?: string } }>("/api/auditoria", async (req) => ({
  registros: listarAuditoria({ limite: Number(req.query.limite) || 100, ator: req.query.ator || undefined, antesDe: Number(req.query.antesDe) || undefined }),
  verificacao: verificarAuditoria(),
}));

/* ---------- Aprendizado: A/B de instruções, escada de modelos e testes sombra ---------- */

app.get("/api/aprendizado", async () => estadoAprendizado());
app.put<{ Body: { localPrimeiro?: string | null; sombraPct?: number; sombraLocal?: string | null; abAutomatico?: boolean } }>("/api/aprendizado", async (req) => {
  const b = req.body ?? {};
  if (typeof b.abAutomatico === "boolean") definirABAutomatico(b.abAutomatico);
  configurarAprendizado({ localPrimeiro: b.localPrimeiro, sombraPct: b.sombraPct, sombraLocal: b.sombraLocal });
  return estadoAprendizado();
});
app.post<{ Params: { agente: string }; Body: { texto?: string } }>("/api/aprendizado/ab/:agente", async (req, reply) => {
  try {
    const texto = typeof req.body?.texto === "string" ? req.body.texto.trim() : "";
    // Com texto, você escreve a candidata; sem texto, um modelo escreve a partir das devoluções.
    const v = texto ? iniciarAB(req.params.agente, texto) : await proporCandidata(req.params.agente);
    if (!v) return reply.code(400).send({ erro: "Ainda não há devoluções suficientes para esse agente (mínimo 3)." });
    return v;
  } catch (e) {
    return reply.code(400).send({ erro: (e as Error).message });
  }
});
app.delete<{ Params: { agente: string } }>("/api/aprendizado/ab/:agente", async (req) => {
  encerrarAB(req.params.agente);
  return estadoAprendizado();
});
app.post<{ Body: { agente?: string; modelo?: string } }>("/api/aprendizado/sugestao", async (req, reply) => {
  const { agente, modelo } = req.body ?? {};
  if (!agente || !modelo) return reply.code(400).send({ erro: "Agente e modelo são obrigatórios." });
  aplicarSugestao(agente, modelo);
  return estadoAprendizado();
});

/* ---------- Painel, chamadas de IA, modelos de projeto e relatórios ---------- */

app.get<{ Querystring: { escritorio?: string } }>("/api/painel", async (req) => montarPainel(req.query.escritorio || undefined));
app.get<{ Querystring: { horas?: string } }>("/api/chamadas", async (req) => resumoChamadas(Math.min(24 * 30, Math.max(1, Number(req.query.horas) || 24))));
app.get<{ Querystring: { sala: string; tipo: string } }>("/api/estimativa", async (req) => estimativaDeCusto(String(req.query.sala ?? ""), String(req.query.tipo ?? "tarefa")) ?? { semHistorico: true });
app.get("/api/relatorio", async () => configRelatorio());
app.put<{ Body: { ativo?: boolean; hora?: number } }>("/api/relatorio", async (req) => definirRelatorio(req.body ?? {}));
app.post("/api/relatorio/agora", async () => ({ texto: await mandarRelatorio() }));
app.get("/api/modelos-projeto", async () => MODELOS_DE_PROJETO.map((m) => ({ id: m.id, nome: m.nome, descricao: m.descricao, etapas: m.etapas.map((e) => ({ titulo: e.titulo, sala: e.sala })) })));
app.post<{ Params: { id: string }; Body: { contexto?: string; projetoId?: number | null } }>("/api/modelos-projeto/:id", async (req) =>
  criarProjetoDoModelo(req.params.id, String(req.body?.contexto ?? ""), typeof req.body?.projetoId === "number" ? req.body.projetoId : null),
);
app.post<{ Params: { id: string }; Body: { cliente?: string } }>("/api/projetos/:id/relatorio-cliente", async (req) =>
  relatorioParaCliente(idDe(req.params.id), typeof req.body?.cliente === "string" ? req.body.cliente.slice(0, 120) : undefined),
);
app.get<{ Params: { id: string } }>("/api/cards/:id/comentarios", async (req) => listarComentarios(idDe(req.params.id)));
app.get<{ Params: { id: string } }>("/api/cards/:id/entregas", async (req) => listarEntregas(idDe(req.params.id)));
app.post<{ Params: { id: string }; Body: { texto: string } }>("/api/cards/:id/comentarios", async (req) => {
  const texto = req.body?.texto?.trim();
  if (!texto) throw new ErroCard("Escreva o comentário.");
  return comentarComoCeo(idDe(req.params.id), texto.slice(0, 5000));
});

/* ---------- Motor de agentes ---------- */

app.get("/api/motor", async () => estadoMotor());
app.put<{ Body: { pausado?: boolean; orcamentoDiarioUsd?: number; maxSimultaneos?: number; modoCusto?: string; limiteCardUsd?: number; limiteCodigoUsd?: number } }>("/api/motor", async (req) =>
  configurarMotor(req.body ?? {}),
);

/* ---------- Metas, indicadores e rituais ---------- */

app.get("/api/metas", async () => listarMetas());
app.post<{ Body: Meta }>("/api/metas", async (req) => salvarMeta(req.body));
app.put<{ Params: { id: string }; Body: Meta }>("/api/metas/:id", async (req) => salvarMeta(req.body, idDe(req.params.id)));
app.delete<{ Params: { id: string } }>("/api/metas/:id", async (req) => {
  removerMeta(idDe(req.params.id));
  return { ok: true };
});
app.post("/api/metas/sugerir", async () => sugerirMetas());
app.get("/api/indicadores", async () => calcularIndicadores());
app.get("/api/rituais", async () => listarRituais());
app.put<{ Params: { id: RitualId }; Body: { ativo?: boolean; hora?: string } }>("/api/rituais/:id", async (req) => {
  configurarRitual(req.params.id, req.body ?? {});
  return listarRituais();
});
app.post<{ Params: { id: RitualId } }>("/api/rituais/:id/rodar", async (req) => {
  if (!listarRituais().some((r) => r.id === req.params.id)) throw new ErroCard("Ritual inexistente.", 404);
  void executarRitual(req.params.id);
  return { ok: true };
});
app.get("/api/atas", async () => listarAtas());
app.get("/api/gatilhos", async () => listarGatilhos());
app.put<{ Params: { id: GatilhoId }; Body: { ativo: boolean } }>("/api/gatilhos/:id", async (req) => {
  if (!listarGatilhos().some((g) => g.id === req.params.id)) throw new ErroCard("Gatilho inexistente.", 404);
  return configurarGatilho(req.params.id, req.body?.ativo === true);
});

/* ---------- Conhecimento da casa e olhar crítico (Fase 2f) ---------- */

type CamposConhecimento = Partial<Pick<ItemConhecimento, "sala" | "tipo" | "titulo" | "conteudo">>;
app.get("/api/conhecimento", async () => listarConhecimento());
app.post<{ Body: CamposConhecimento }>("/api/conhecimento", async (req) => {
  const b = req.body ?? {};
  return criarConhecimento({ sala: b.sala, tipo: b.tipo, titulo: b.titulo, conteudo: b.conteudo });
});
app.put<{ Params: { id: string }; Body: CamposConhecimento }>("/api/conhecimento/:id", async (req) => editarConhecimento(idDe(req.params.id), req.body ?? {}));
app.post<{ Params: { id: string } }>("/api/conhecimento/:id/aprovar", async (req) => aprovarConhecimento(idDe(req.params.id)));
app.delete<{ Params: { id: string } }>("/api/conhecimento/:id", async (req) => {
  excluirConhecimento(idDe(req.params.id));
  return { ok: true };
});
app.get("/api/critica", async () => configCritica());
app.put<{ Body: Partial<ConfigCritica> }>("/api/critica", async (req) => configurarCritica(req.body ?? {}));

/* ---------- Demais áreas (Fase 6) ---------- */

app.get<{ Params: { id: string } }>("/api/projetos/:id/banco", async (req) => conexaoDoProjeto(idDe(req.params.id)) ?? { semBanco: true });
app.put<{ Params: { id: string }; Body: { tipo?: string; caminho?: string; url?: string } }>("/api/projetos/:id/banco", async (req) => {
  const id = idDe(req.params.id);
  const p = listarProjetos().find((x) => x.id === id);
  if (!p) throw new ErroCard("Projeto não encontrado.", 404);
  return configurarConexao(id, p.caminho, req.body ?? {});
});
app.delete<{ Params: { id: string } }>("/api/projetos/:id/banco", async (req) => {
  removerConexao(idDe(req.params.id));
  return { ok: true };
});
app.get("/api/conquistas", async () => listarConquistas());

/* ---------- Conectores MCP ---------- */

app.get("/api/mcp", async () => ({ servidores: listarServidores(), presets, redirectOauth: redirectOauth() }));
app.post<{ Body: Parameters<typeof criarServidor>[0] }>("/api/mcp", async (req) => criarServidor(req.body ?? {}));
app.put<{ Params: { id: string }; Body: Parameters<typeof atualizarServidor>[1] }>("/api/mcp/:id", async (req) => atualizarServidor(idDe(req.params.id), req.body ?? {}));
app.delete<{ Params: { id: string } }>("/api/mcp/:id", async (req) => {
  await removerServidor(idDe(req.params.id));
  return { ok: true };
});
app.post<{ Params: { id: string } }>("/api/mcp/:id/conectar", async (req) => conectar(idDe(req.params.id)));
app.get<{ Querystring: { code?: string; state?: string; error?: string } }>("/api/mcp/oauth/callback", async (req, reply) => {
  const pagina = (titulo: string, texto: string) =>
    reply.header("content-type", "text/html; charset=utf-8").send(`<!doctype html><meta charset="utf-8"><title>${titulo}</title><body style="font-family:system-ui;padding:40px;color:#1f2430"><h2>${titulo}</h2><p>${texto}</p><p>Pode fechar esta aba e voltar para o Hefesto.</p></body>`);
  if (req.query.error || !req.query.code || !req.query.state) return pagina("Autorização não concluída", "O acesso não foi autorizado.");
  try {
    const nome = await concluirOauth(req.query.state, req.query.code);
    return pagina("Conectado ✓", `${nome.replace(/[<>&]/g, "")} está conectado ao Hefesto.`);
  } catch (e) {
    return pagina("Não deu certo", (e instanceof Error ? e.message : String(e)).replace(/[<>&]/g, ""));
  }
});
app.get("/api/mcp/pedidos", async () => listarPedidos());

/* ---------- Máquina do CEO: terminal e controle ---------- */

app.get("/api/maquina/config", async () => configMaquina());
app.put<{ Body: unknown }>("/api/maquina/config", async (req) => definirConfigMaquina(validarConfig(req.body)));
app.post("/api/maquina/parar", async () => {
  pararTudo();
  return { ok: true };
});
app.post<{ Params: { id: string } }>("/api/maquina/parar/:id", async (req) => {
  encerrar(idDe(req.params.id));
  return { ok: true };
});
app.post<{ Params: { id: string } }>("/api/mcp/pedidos/:id/aprovar", async (req) => aprovarPedido(idDe(req.params.id)));
app.post<{ Params: { id: string }; Body: { motivo?: string } }>("/api/mcp/pedidos/:id/recusar", async (req) => recusarPedido(idDe(req.params.id), req.body?.motivo ?? ""));
app.get("/api/whatsapp", async () => estadoWhatsapp());
app.put<{ Body: Record<string, unknown> }>("/api/whatsapp", async (req) => configurarWhatsapp(req.body ?? {}));
app.post("/api/whatsapp/testar", async () => testarConexao());
app.post("/api/whatsapp/esquecer", async () => esquecerWhatsapp());
app.get("/api/whatsapp/modelos", async () => listarModelos());
app.post<{ Body: Record<string, unknown> }>("/api/whatsapp/modelo", async (req) => enviarModelo(req.body ?? {}));
app.get("/api/whatsapp/contatos", async () => listarContatos());
const telDe = (t: string) => {
  if (!/^\d{8,15}$/.test(t)) throw new ErroCard("Telefone inválido.", 400);
  return t;
};
app.get<{ Params: { tel: string } }>("/api/whatsapp/contatos/:tel/mensagens", async (req) => listarMensagens(telDe(req.params.tel)));
app.post<{ Params: { tel: string }; Body: { texto?: string } }>("/api/whatsapp/contatos/:tel/enviar", async (req) => enviarTexto(telDe(req.params.tel), String(req.body?.texto ?? ""), "voce"));
app.patch<{ Params: { tel: string }; Body: { humano?: boolean; lido?: boolean; etapa?: string; nome?: string } }>("/api/whatsapp/contatos/:tel", async (req) => {
  const b = req.body ?? {};
  const etapas = ["novo", "duvida", "interessado", "negociando", "cliente", "perdido", "humano"] as const;
  const etapa = etapas.find((x) => x === b.etapa);
  return atualizarContato(telDe(req.params.tel), { humano: b.humano, lido: b.lido, nome: b.nome, ...(etapa ? { etapa } : {}), ...(b.humano === false ? { etapa: "duvida" as const } : {}) });
});
app.post<{ Params: { id: string }; Body: { texto?: string } }>("/api/whatsapp/mensagens/:id/aprovar", async (req) => aprovarResposta(idDe(req.params.id), req.body?.texto));
app.post<{ Params: { id: string } }>("/api/whatsapp/mensagens/:id/descartar", async (req) => descartarResposta(idDe(req.params.id)));
app.get<{ Querystring: { q?: string } }>("/api/memoria", async (req) => buscarNaMemoria(String(req.query.q ?? "").slice(0, 200), 12));
app.get("/api/escritorios", async () => listarEscritorios());
app.get("/api/escritorios/modelos", async () => ({ escritorios: modelosDeEscritorio(), fluxos: MODELOS_FLUXO }));
app.post<{ Body: { modelo?: string; nome?: string; projetoId?: number | null } }>("/api/escritorios", async (req) => {
  const nome = String(req.body?.nome ?? "").trim().slice(0, 60);
  if (!nome) throw new ErroCard("Dê um nome ao escritório.");
  // Id curto e único (vira o prefixo de salas, agentes e fluxos).
  const base = nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 20) || "escritorio";
  const usados = new Set(listarEscritorios().map((d) => d.id));
  let id = base;
  for (let i = 2; usados.has(id); i++) id = `${base}-${i}`;
  try {
    return salvarEscritorio(escritorioDoModelo(String(req.body?.modelo ?? "em-branco"), id, nome, typeof req.body?.projetoId === "number" ? req.body.projetoId : null));
  } catch (e) {
    throw e instanceof ErroCard ? e : new ErroCard(e instanceof Error ? e.message : String(e));
  }
});
app.put<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/escritorios/:id", async (req) => {
  const def = req.body as unknown as Parameters<typeof salvarEscritorio>[0];
  if (!def || def.id !== req.params.id) throw new ErroCard("Definição inválida.");
  return salvarEscritorio(def);
});
app.delete<{ Params: { id: string } }>("/api/escritorios/:id", async (req) => {
  excluirEscritorio(req.params.id);
  return { ok: true };
});
app.post("/api/escritorios/sede/restaurar", async () => restaurarSede());
app.get<{ Params: { id: string } }>("/api/escritorios/:id/exportar", async (req) => exportarEscritorio(req.params.id));
app.get<{ Params: { id: string; agente: string } }>("/api/escritorios/:id/agentes/:agente/exportar", async (req) => exportarAgente(req.params.id, req.params.agente));
app.get<{ Params: { id: string; fluxo: string } }>("/api/escritorios/:id/fluxos/:fluxo/exportar", async (req) => exportarFluxo(req.params.id, req.params.fluxo));
app.post<{ Body: { pacote?: unknown; escritorioId?: string; sala?: string } }>("/api/escritorios/importar", { bodyLimit: 4 * 1024 * 1024 }, async (req) =>
  importarPacote(req.body?.pacote, { escritorioId: req.body?.escritorioId, sala: req.body?.sala }),
);
app.post("/api/nuvem/testar", async () => testarNuvem());
app.get("/api/nuvem", async () => estadoNuvem());
app.put<{ Body: { ativo?: boolean; url?: string | null; token?: string | null } }>("/api/nuvem", async (req, reply) => {
  try {
    return configurarNuvem(req.body ?? {});
  } catch (e) {
    return reply.code(400).send({ erro: (e as Error).message });
  }
});
app.get("/api/pessoas", async () => listarPessoas());
app.post<{ Body: { id?: string; nome: string; papel?: string; telegram?: string } }>("/api/pessoas", async (req, reply) => {
  try {
    return salvarPessoa(req.body ?? { nome: "" });
  } catch (e) {
    return reply.code(400).send({ erro: (e as Error).message });
  }
});
app.delete<{ Params: { id: string } }>("/api/pessoas/:id", async (req, reply) => {
  try {
    const aberto = listarCards().find((c) => c.dono === req.params.id && !["feito", "perdido"].includes(colunaDe(c.fluxo, c.coluna)?.tipo ?? ""));
    if (aberto) throw new Error(`Esta pessoa ainda é dona de cards abertos (ex.: ${aberto.chave}): troque o dono antes.`);
    removerPessoa(req.params.id);
    return { ok: true };
  } catch (e) {
    return reply.code(400).send({ erro: (e as Error).message });
  }
});
app.get("/api/telegram", async () => estadoTelegram());
app.put<{ Body: Record<string, unknown> }>("/api/telegram", async (req) => configurarTelegram(req.body ?? {}));
app.post("/api/telegram/desparear", async () => desparear());
app.post("/api/telegram/esquecer", async () => esquecerTelegram());
app.post("/api/telegram/teste", async () => {
  const id = await enviarTelegram("Teste do Hefesto: está tudo certo. Os avisos e aprovações chegam aqui.");
  if (!id) throw new ErroCard("Não enviou: confira se o bot está ligado e pareado.");
  return { ok: true };
});
app.get("/api/provedores", async () => estadoProvedores());
app.put<{ Body: Record<string, unknown> }>("/api/provedores", async (req) => configurarProvedores(req.body ?? {}));
app.post<{ Body: { modelo?: string } }>("/api/provedores/testar", async (req) => {
  const modelo = String(req.body?.modelo ?? "");
  if (!/^((ollama|openai|gemini):[\w.:/-]{1,120}|claude-[\w.-]{1,60})$/.test(modelo)) throw new ErroCard("Modelo inválido.");
  return testarModelo(modelo);
});
app.get("/api/backup", async () => estadoBackup());
app.put<{ Body: { ativo?: boolean; pasta?: string; manter?: number } }>("/api/backup", async (req) => definirConfigBackup(req.body ?? {}));
app.post("/api/backup/agora", async () => fazerBackup());
app.get("/api/navegador/sessoes", async () => [...listarSessoes(), ...listarSessoesCelular()]);
app.get("/api/celular/aparelhos", async () => ({ texto: await listarAparelhos() }));
app.post<{ Params: { id: string } }>("/api/celular/:id/desligar", async (req) => {
  await desligarCelular(idDe(req.params.id));
  return { ok: true };
});
app.get("/api/navegador/config", async () => ({ sites: sitesDeTeste(), externoLivre: externoLivre() }));
app.put<{ Body: { externoLivre?: boolean } }>("/api/navegador/config", async (req) => ({ sites: sitesDeTeste(), externoLivre: definirExternoLivre(req.body?.externoLivre !== false) }));
app.get("/api/navegador/sites", async () => sitesDeTeste());
app.put<{ Body: { sites?: string[] } }>("/api/navegador/sites", async (req) => definirSitesDeTeste(req.body?.sites));
app.post<{ Params: { id: string } }>("/api/navegador/:id/fechar", async (req) => {
  await fecharSessao(idDe(req.params.id));
  return { ok: true };
});
app.get("/api/monitores", async () => listarMonitores());
app.post<{ Body: { url: string } }>("/api/monitores", async (req) => adicionarMonitor(req.body?.url ?? ""));
app.delete<{ Params: { id: string } }>("/api/monitores/:id", async (req) => removerMonitor(idDe(req.params.id)));
app.post("/api/monitores/checar", async () => {
  await checarTodos();
  return listarMonitores();
});
app.get<{ Querystring: { url?: string } }>("/api/infra/site", async (req) => verificarSite(req.query.url ?? ""));
app.get<{ Querystring: { dominio?: string } }>("/api/infra/dns", async (req) => ({ texto: await consultarDns(req.query.dominio ?? "") }));
app.post<{ Body: { cliente?: string; canal?: string; mensagem?: string } }>("/api/atendimentos", async (req) => abrirAtendimento(req.body ?? {}));
app.get<{ Querystring: { receita12m?: string; folha12m?: string; receitaMes?: string } }>("/api/financas/simples", async (req) => {
  try {
    return calcularSimples(Number(req.query.receita12m), Number(req.query.folha12m), Number(req.query.receitaMes));
  } catch (e) {
    throw new ErroCard(e instanceof Error ? e.message : String(e));
  }
});

/* ---------- Marketing (Fase 5) ---------- */

app.get("/api/pecas", async () => listarPecas());
app.put<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/pecas/:id", async (req) => editarPeca(idDe(req.params.id), req.body ?? {}));
app.post<{ Params: { id: string }; Body: { link?: string } }>("/api/pecas/:id/publicado", async (req) => marcarPublicado(idDe(req.params.id), req.body?.link ?? null));

/* ---------- Fábrica de software (Fase 4) ---------- */

app.get<{ Params: { id: string } }>("/api/cards/:id/codigo", async (req) => (await codigoDoCard(lerCard(idDe(req.params.id)))) ?? { semCodigo: true });
app.post<{ Params: { id: string } }>("/api/cards/:id/merge", async (req) => {
  await pararPrevia(idDe(req.params.id), "card mesclado");
  const r = await mesclar(idDe(req.params.id));
  vigiarDepoisDoMerge(idDe(req.params.id));
  return r;
});
app.get<{ Params: { id: string } }>("/api/cards/:id/previa", async (req) => lerPrevia(idDe(req.params.id)) ?? { status: "parada", url: null, log: [], erro: null });
app.post<{ Params: { id: string } }>("/api/cards/:id/previa", async (req) => iniciarPrevia(lerCard(idDe(req.params.id))));
app.delete<{ Params: { id: string } }>("/api/cards/:id/previa", async (req) => pararPrevia(idDe(req.params.id)));
app.post<{ Params: { id: string } }>("/api/cards/:id/descartar", async (req) => {
  await pararPrevia(idDe(req.params.id), "card descartado");
  await descartar(idDe(req.params.id));
  return { ok: true };
});

/* ---------- Prospecção de clientes (Fase 3) ---------- */

app.get("/api/leads", async () => listarLeads());
app.get("/api/leads.csv", async (_req, reply) =>
  reply.header("content-type", "text/csv; charset=utf-8").header("content-disposition", 'attachment; filename="leads.csv"').send(leadsEmCsv()),
);
app.get<{ Params: { id: string } }>("/api/leads/:id", async (req) => {
  const l = lerLead(idDe(req.params.id));
  if (!l) throw new ErroCard("Lead não encontrado.", 404);
  return l;
});
app.put<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/leads/:id", async (req) => editarLead(idDe(req.params.id), req.body ?? {}));
app.post<{ Params: { id: string }; Body: { canal?: string } }>("/api/leads/:id/contatado", async (req) => marcarContatado(idDe(req.params.id), req.body?.canal?.slice(0, 40) || "WhatsApp"));
app.post<{ Params: { id: string }; Body: { motivo?: string } }>("/api/leads/:id/nao-contatar", async (req) => naoContatarLead(idDe(req.params.id), req.body?.motivo ?? ""));
app.get("/api/campanhas", async () => listarCampanhas());
app.post<{ Body: { produto?: string; clienteIdeal?: string; regiao?: string; quantidade?: number } }>("/api/prospeccao", async (req) => iniciarProspeccao(req.body ?? {}));
app.get("/api/nao-contatar", async () => listarNaoContatar());
app.post<{ Body: { tipo: "email" | "telefone" | "dominio" | "cnpj" | "nome"; valor: string; motivo?: string } }>("/api/nao-contatar", async (req) =>
  adicionarNaoContatar(req.body?.tipo, req.body?.valor ?? "", req.body?.motivo),
);
app.delete<{ Params: { id: string } }>("/api/nao-contatar/:id", async (req) => removerNaoContatar(idDe(req.params.id)));

/* ---------- Projetos da sua máquina ---------- */

app.get("/api/projetos", async () => ({ projetos: listarProjetos(), projetoAtivo: projetoAtivo() }));
app.get<{ Querystring: { caminho?: string } }>("/api/pastas", async (req) => listarPastas(req.query.caminho));
app.post("/api/projetos/escolher", async () => {
  const caminho = await escolherPasta();
  return caminho ? adicionarProjeto(caminho) : { cancelado: true };
});
app.post<{ Body: { caminho: string } }>("/api/projetos", async (req) => adicionarProjeto(req.body?.caminho));
app.put<{ Body: { id: number | null } }>("/api/projetos/ativo", async (req) => {
  definirAtivo(req.body?.id ?? null);
  return { ok: true };
});
// Raio-x: o Arquiteto lê o projeto (somente leitura) e escreve a Ficha do Projeto.
app.post<{ Params: { id: string } }>("/api/projetos/:id/raio-x", async (req) => {
  const id = idDe(req.params.id);
  const projeto = listarProjetos().find((p) => p.id === id);
  if (!projeto) throw new ErroCard("Projeto não encontrado.", 404);
  return criarCard(
    {
      titulo: `Raio-x do projeto ${projeto.nome}`,
      sala: "arquitetura",
      fluxo: "software",
      coluna: "a-fazer",
      tipo: "tarefa",
      dono: "arquiteto",
      nivel: "N1",
      prioridade: "P1",
      projetoId: id,
      etiquetas: ["raio-x"],
      descricao: `Leia o projeto em ${projeto.caminho} (somente leitura) e escreva a Ficha do Projeto, que todos os agentes vão usar como contexto.`,
      criterios: [
        "- Stack, linguagens, frameworks e versões principais",
        "- Estrutura de pastas e responsabilidade de cada parte",
        "- Como rodar, testar e fazer build (comandos)",
        "- Funcionalidades e regras de negócio encontradas no código",
        "- Integrações externas e dados sensíveis tratados",
        "- Qualidade: testes existentes, pontos de atenção e riscos (incluindo segurança)",
        "- Tudo citando os arquivos onde foi visto",
      ].join("\n"),
    },
    "voce",
  );
});
app.put<{ Params: { id: string }; Body: { urlLocal: string | null } }>("/api/projetos/:id/url-local", async (req) => {
  definirUrlLocal(idDe(req.params.id), req.body?.urlLocal ?? null);
  return { ok: true };
});
// Imagens que você envia no chat.
app.post<{ Body: { dados?: string } }>("/api/imagens", { bodyLimit: 8 * 1024 * 1024 }, async (req) => salvarImagem(req.body?.dados));
app.post<{ Body: { nome?: string; dados?: string } }>("/api/arquivos", { bodyLimit: 22 * 1024 * 1024 }, async (req) => salvarArquivo(req.body?.nome, req.body?.dados));
const baixar = (nomeArquivo: string) => `attachment; filename*=UTF-8''${encodeURIComponent(nomeArquivo)}`;
app.get<{ Params: { arquivo: string } }>("/api/midia/arquivos/:arquivo", async (req, reply) => {
  const { arquivo } = req.params;
  if (!nomeArquivoValido(arquivo) || !existsSync(join(PASTA_ARQUIVOS, arquivo))) throw new ErroCard("Não encontrado.", 404);
  const ext = arquivo.split(".").pop()!;
  return reply.header("content-type", mimeDe(ext)).header("content-disposition", baixar(nomeOriginal(arquivo))).header("x-content-type-options", "nosniff").send(createReadStream(join(PASTA_ARQUIVOS, arquivo)));
});
app.get<{ Params: { card: string; nome: string } }>("/api/midia/:card/arquivos/:nome", async (req, reply) => {
  const nome = req.params.nome;
  if (!/^[\w .-]{1,90}\.(docx|pdf|xlsx|csv|md|html)$/.test(nome) || nome.includes("..")) throw new ErroCard("Arquivo inválido.", 400);
  const caminho = join(pastaDeMidia(idDe(req.params.card)), "arquivos", nome);
  if (!existsSync(caminho)) throw new ErroCard("Não encontrado.", 404);
  return reply.header("content-type", mimeDe(nome.split(".").pop()!)).header("content-disposition", baixar(nome)).header("x-content-type-options", "nosniff").send(createReadStream(caminho));
});
app.get<{ Params: { card: string; nome: string } }>("/api/midia/:card/videos/:nome", async (req, reply) => {
  const nome = req.params.nome;
  if (!/^\d+-\d+\.webm$/.test(nome)) throw new ErroCard("Arquivo inválido.", 400);
  const caminho = join(pastaDeMidia(idDe(req.params.card)), "videos", nome);
  if (!existsSync(caminho)) throw new ErroCard("Não encontrado.", 404);
  return reply.header("content-type", "video/webm").header("x-content-type-options", "nosniff").send(createReadStream(caminho));
});
app.get<{ Params: { arquivo: string } }>("/api/midia/chat/:arquivo", async (req, reply) => {
  const { arquivo } = req.params;
  if (!nomeValido(arquivo)) throw new ErroCard("Arquivo inválido.", 400);
  const caminho = join(PASTA_IMAGENS, arquivo);
  if (!existsSync(caminho)) throw new ErroCard("Não encontrado.", 404);
  const ext = arquivo.split(".").pop()!;
  return reply.header("content-type", ext === "jpg" ? "image/jpeg" : `image/${ext}`).header("cache-control", "private, max-age=86400").send(createReadStream(caminho));
});
// Prints e vídeos feitos pelos agentes (só arquivos com nome seguro, dentro da pasta do card).
app.get<{ Params: { card: string; arquivo: string } }>("/api/midia/:card/:arquivo", async (req, reply) => {
  const { arquivo } = req.params;
  if (!/^[a-z0-9-]+\.(png|jpg|webm)$/.test(arquivo)) throw new ErroCard("Arquivo inválido.", 400);
  const caminho = join(pastaDeMidia(idDe(req.params.card)), arquivo);
  if (!existsSync(caminho)) throw new ErroCard("Não encontrado.", 404);
  return reply.header("content-type", arquivo.endsWith(".png") ? "image/png" : arquivo.endsWith(".jpg") ? "image/jpeg" : "video/webm").header("cache-control", "private, max-age=3600").send(createReadStream(caminho));
});
app.delete<{ Params: { id: string } }>("/api/projetos/:id", async (req) => {
  removerProjeto(idDe(req.params.id));
  return { ok: true };
});

app.get("/ws", { websocket: true }, (socket) => {
  const send = (e: ServerEvent) => socket.send(JSON.stringify(e));
  send({
    type: "hello",
    estados,
    feed: recentFeed(),
    chat: recentChat(),
    chaveConfigurada: loadApiKey() !== null,
    demo: isDemoActive(),
    onboarding: estadoOnboarding(),
    livro: lerLivro(),
    custoHojeUsd: custoHoje(),
    cards: listarCards(),
    projetos: listarProjetos(),
    projetoAtivo: projetoAtivo(),
    motor: estadoMotor(),
    metas: listarMetas(),
    rituais: listarRituais(),
    conhecimento: listarConhecimento(),
    critica: configCritica(),
    leads: listarLeads(),
    pecas: listarPecas(),
    monitores: listarMonitores(),
    conquistas: listarConquistas(),
    navegador: [...listarSessoes(), ...listarSessoesCelular()],
    mcp: listarServidores(),
    pedidosMcp: listarPedidos(),
    controle: listarSessoesControle(),
    whatsapp: estadoWhatsapp(),
    telegram: estadoTelegram(),
    escritorios: listarEscritorios(),
    contatosWhatsapp: listarContatos(),
  });
  const unsubscribe = subscribe(send);
  socket.on("close", unsubscribe);

  socket.on("message", (raw: Buffer) => {
    let msg: ClientEvent;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (msg.type === "demo") setDemo(msg.ativo);
    if (msg.type === "command" && typeof msg.texto === "string") pedirParaHelena(msg.texto, msg.imagens, msg.arquivos, msg.escritorio);
    if (msg.type === "onboarding.iniciar") void iniciarEntrevista();
    if (msg.type === "onboarding.responder" && typeof msg.texto === "string") void responder(msg.texto);
  });
});

// Versão pronta (pnpm build): o próprio servidor entrega a interface, num endereço só (app desktop).
const WEB_DIST = join(ROOT, "apps", "web", "dist");
if (existsSync(join(WEB_DIST, "index.html"))) {
  await app.register(fastifyStatic, { root: WEB_DIST, prefix: "/", wildcard: false });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith("/api/") || req.url.startsWith("/ws")) return reply.code(404).send({ erro: "Não encontrado." });
    return reply.sendFile("index.html");
  });
}

await app.listen({ host: HOST, port: PORT });
iniciarMotor();
iniciarRelatorioDiario();
iniciarAprendizado();
iniciarPlanejamento();
iniciarProducao();
iniciarAutonomia();
limparPassosAntigos();
setInterval(limparPassosAntigos, 24 * 3600_000).unref();
void migrarCopiasParaWorkspace().then((n) => n && console.log(`${n} cópia(s) de card movida(s) para ${process.env.EMPRESA_WORKSPACE_DIR}`));
// Limpeza de cópias isoladas abandonadas (cards apagados ou perdidos), uma vez por hora; a branch fica.
setInterval(() => void limparCopiasAntigas().catch((e) => console.error("Limpeza de cópias:", e)), 3600_000);
iniciarLembretesDeMarketing();
iniciarMonitoramento();
iniciarVigia();
iniciarConquistas();
iniciarConectores();
iniciarBackup();
iniciarWhatsapp();
iniciarTelegram();
for (const sinal of ["SIGINT", "SIGTERM"] as const) process.once(sinal, () => {
  pararWhatsapp();
  pararTodasPrevias();
  process.exit(0);
});
iniciarRituais();
console.log(`Servidor do Hefesto em http://127.0.0.1:${PORT}`);
