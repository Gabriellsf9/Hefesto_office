import { cpus, totalmem } from "node:os";
import { statfsSync } from "node:fs";
import type { Agent, EstadoProvedores, ModeloDisponivel, ProvedorIa, RecomendacaoLocal } from "@empresa/shared";
import { getSetting, setSetting } from "./db.ts";
import { apagarSegredo, lerSegredo, loadApiKey, salvarSegredo } from "./secrets.ts";
import { modeloPara, type Papel } from "./custo.ts";
import { DATA_DIR } from "./paths.ts";
import { ErroCard } from "./tarefas.ts";

// Provedores de IA além do Claude (que continua o principal): Ollama na própria máquina,
// OpenAI e Gemini. Cada agente pode usar um modelo de qualquer um deles; quem não tem
// escolha usa o Claude do modo de custo. As chaves ficam cifradas, como a da Anthropic.

const CHAVE: Record<"openai" | "gemini", string> = { openai: "openai_api_key", gemini: "gemini_api_key" };
export const BASE_COMPAT: Record<"openai" | "gemini", string> = {
  openai: "https://api.openai.com/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
};

interface Config {
  ollama: { url: string; contexto: number };
  // Preço (US$ por milhão de tokens) só para o orçamento: confira na página do provedor.
  openai: { precoEntrada: number; precoSaida: number };
  gemini: { precoEntrada: number; precoSaida: number };
}

/** No Docker, o Ollama do Mac fica em host.docker.internal (HEFESTO_OLLAMA_URL no docker-compose). */
const URL_OLLAMA_PADRAO = (process.env.HEFESTO_OLLAMA_URL ?? "http://127.0.0.1:11434").replace(/\/$/, "");

function config(): Config {
  let salvo: Partial<Config> = {};
  try {
    salvo = JSON.parse(getSetting("provedores") ?? "{}") as Partial<Config>;
  } catch { /* configuração corrompida: volta ao padrão */ }
  return {
    ollama: { url: URL_OLLAMA_PADRAO, contexto: 32_768, ...salvo.ollama },
    openai: { precoEntrada: 2, precoSaida: 12, ...salvo.openai },
    gemini: { precoEntrada: 1.5, precoSaida: 9, ...salvo.gemini },
  };
}

export const configOllama = () => config().ollama;
export const chaveDe = (p: "openai" | "gemini") => lerSegredo(CHAVE[p]);
export const precoDe = (p: "openai" | "gemini") => config()[p];

/** "ollama:qwen3.5:9b" → { provedor: "ollama", nome: "qwen3.5:9b" }. Sem prefixo, é do Claude. */
export function provedorDe(modelo: string): { provedor: ProvedorIa; nome: string } {
  const m = /^(ollama|openai|gemini):(.+)$/.exec(modelo);
  return m ? { provedor: m[1] as ProvedorIa, nome: m[2]! } : { provedor: "claude", nome: modelo };
}

/** Há como chamar este modelo agora (chave cadastrada; o Ollama só se descobre chamando). */
export function modeloDisponivel(modelo: string): boolean {
  const { provedor } = provedorDe(modelo);
  if (provedor === "claude") return loadApiKey() !== null;
  if (provedor === "ollama") return true;
  return chaveDe(provedor) !== null;
}

/* ---------- Escolha por agente ---------- */

export function escolhas(): Record<string, string> {
  try {
    return JSON.parse(getSetting("modelos_agentes") ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

/** O modelo que o agente usa neste papel: a sua escolha, se houver; senão o Claude do modo de custo. */
export function modeloDoAgente(agente: Agent, papel: Papel): string {
  return escolhas()[agente.id] ?? modeloPara(agente.modelo, papel);
}

const MODELO_VALIDO = /^((ollama|openai|gemini):[\w.:/-]{1,120}|claude-[\w.-]{1,60})$/;

/* ---------- Modelos de cada provedor ---------- */

interface TagOllama { name: string; size: number; capabilities?: string[] }

/** Capacidades dos modelos do Ollama (ferramentas, visão, pensamento), da última listagem. */
const capacidades = new Map<string, string[]>();

/** Capacidades de um modelo do Ollama (pergunta ao Ollama na primeira vez). Null se ele não disser. */
export async function capacidadesOllama(nome: string): Promise<string[] | null> {
  if (capacidades.has(nome)) return capacidades.get(nome)!;
  try {
    const res = await fetch(`${config().ollama.url}/api/show`, { method: "POST", body: JSON.stringify({ model: nome }), signal: AbortSignal.timeout(5000) });
    const corpo = (await res.json()) as { capabilities?: string[] };
    if (corpo.capabilities) capacidades.set(nome, corpo.capabilities);
    return corpo.capabilities ?? null;
  } catch {
    return null;
  }
}

async function modelosOllama(): Promise<{ versao: string | null; modelos: ModeloDisponivel[] }> {
  const { url } = config().ollama;
  const sinal = AbortSignal.timeout(4000);
  const [tags, versao] = await Promise.all([
    fetch(`${url}/api/tags`, { signal: sinal }).then((r) => r.json() as Promise<{ models?: TagOllama[] }>),
    fetch(`${url}/api/version`, { signal: sinal }).then((r) => r.json() as Promise<{ version?: string }>).catch(() => ({ version: undefined })),
  ]);
  const m1OuM2 = /Apple M[12]\b/.test(cpus()[0]?.model ?? "");
  const modelos = (tags.models ?? []).map((t): ModeloDisponivel => {
    if (t.capabilities) capacidades.set(t.name, t.capabilities);
    const c = t.capabilities;
    return {
      id: `ollama:${t.name}`,
      nome: t.name,
      provedor: "ollama",
      tamanhoGb: Math.round((t.size / 1e9) * 10) / 10,
      ferramentas: c ? c.includes("tools") : null,
      visao: c ? c.includes("vision") : null,
      pensamento: c ? c.includes("thinking") : null,
      ...(m1OuM2 && /mlx|nvfp4/.test(t.name) ? { aviso: "Muito lento neste chip (formato nvfp4). Use a versão sem -mlx." } : {}),
    };
  });
  return { versao: versao.version ?? null, modelos };
}

// Só modelos de conversa (sem embeddings, áudio, imagem, moderação…).
const SO_CONVERSA = /embed|audio|tts|transcri|realtime|image|dall-e|whisper|moderation|search|computer|davinci|babbage|aqa|imagen|veo|learnlm|live/i;

async function modelosCompat(p: "openai" | "gemini"): Promise<ModeloDisponivel[]> {
  const chave = chaveDe(p);
  if (!chave) return [];
  const res = await fetch(`${BASE_COMPAT[p]}/models`, { headers: { authorization: `Bearer ${chave}` }, signal: AbortSignal.timeout(8000) });
  if (res.status === 401 || res.status === 403) throw new Error("Chave recusada pelo provedor.");
  if (!res.ok) throw new Error(`O provedor respondeu ${res.status}.`);
  const corpo = (await res.json()) as { data?: { id: string }[] };
  return (corpo.data ?? [])
    .map((m) => m.id.replace(/^models\//, ""))
    .filter((id) => (p === "openai" ? /^(gpt|o\d|chatgpt)/i : /^gemini/i).test(id) && !SO_CONVERSA.test(id))
    .sort((a, b) => b.localeCompare(a))
    .map((id) => ({ id: `${p}:${id}`, nome: id, provedor: p, ferramentas: true, visao: true }));
}

/* ---------- Recomendações para esta máquina ---------- */

// Tags reais do catálogo do Ollama (tamanho do download). Todos chamam ferramentas.
const CATALOGO: Omit<RecomendacaoLocal, "encaixe" | "instalado">[] = [
  { modelo: "qwen3.5:9b", nome: "Qwen 3.5 9B", tamanhoGb: 6.6, paraQue: "O melhor geral para 16 GB: ferramentas, visão e raciocínio. Bom para conteúdo, pesquisa e apoio." },
  // nvfp4 é um formato de GPU NVIDIA: no M1/M2 o MLX emula e fica inutilizável (minutos para um "oi" num M1 Pro).
  { modelo: "qwen3.5:9b-mlx", nome: "Qwen 3.5 9B (MLX nvfp4)", tamanhoGb: 8.9, paraQue: "Mesmo modelo no motor MLX; só vale em chips M3 ou mais novos." },
  { modelo: "qwen3.5:4b", nome: "Qwen 3.5 4B", tamanhoGb: 3.3, paraQue: "Rápido: conversa por voz, advogado do diabo e tarefas curtas." },
  { modelo: "gemma4:12b", nome: "Gemma 4 12B", tamanhoGb: 7.7, paraQue: "Escrita caprichada (marketing, documentação) e segunda opinião diferente do Qwen." },
  { modelo: "llama3.1:8b", nome: "Llama 3.1 8B", tamanhoGb: 4.9, paraQue: "O Llama clássico: leve e estável, mas mais fraco em ferramentas que o Qwen 3.5." },
  { modelo: "gpt-oss:20b", nome: "gpt-oss 20B", tamanhoGb: 14, paraQue: "O mais certeiro em ferramentas, mas pesado: feche outros apps e use contexto de 16 mil." },
  { modelo: "gemma4:26b-a4b", nome: "Gemma 4 26B (MoE)", tamanhoGb: 16, paraQue: "Qualidade de modelo grande com velocidade de pequeno." },
  { modelo: "qwen3.5:35b-a3b", nome: "Qwen 3.5 35B (MoE)", tamanhoGb: 22, paraQue: "O mais forte que roda local com folga em 48 GB ou mais; bom em código." },
];

function recomendados(memoriaGb: number, instalados: Set<string>): RecomendacaoLocal[] {
  // O macOS deixa ~2/3 a 3/4 da memória para a GPU; o resto é do sistema e dos apps.
  const m1OuM2 = /Apple M[12]\b/.test(cpus()[0]?.model ?? "");
  return CATALOGO.flatMap((r): RecomendacaoLocal[] => {
    if (r.tamanhoGb > memoriaGb * 0.9 || (m1OuM2 && r.modelo.endsWith("-mlx"))) return [];
    return [{ ...r, encaixe: r.tamanhoGb <= memoriaGb * 0.6 ? "bom" : "apertado", instalado: instalados.has(r.modelo) }];
  });
}

function maquina(): EstadoProvedores["maquina"] {
  let discoLivreGb: number | null = null;
  try {
    const s = statfsSync(DATA_DIR);
    discoLivreGb = Math.round((s.bavail * s.bsize) / 1e9);
  } catch { /* sem informação de disco */ }
  return { chip: cpus()[0]?.model ?? "desconhecido", memoriaGb: Math.round(totalmem() / 2 ** 30), nucleos: cpus().length, discoLivreGb };
}

/* ---------- Estado e configuração (tela Modelos de IA) ---------- */

export async function estadoProvedores(): Promise<EstadoProvedores> {
  const c = config();
  const m = maquina();
  const [ol, oa, ge] = await Promise.allSettled([modelosOllama(), modelosCompat("openai"), modelosCompat("gemini")]);
  const erro = (r: PromiseSettledResult<unknown>) => (r.status === "rejected" ? (r.reason instanceof Error ? r.reason.message : String(r.reason)) : null);
  const modelosOl = ol.status === "fulfilled" ? ol.value.modelos : [];
  return {
    maquina: m,
    ollama: {
      url: c.ollama.url,
      online: ol.status === "fulfilled",
      versao: ol.status === "fulfilled" ? ol.value.versao : null,
      contexto: c.ollama.contexto,
      modelos: modelosOl,
      erro: ol.status === "rejected" ? `Ollama não respondeu em ${c.ollama.url}. Abra o app do Ollama (ou rode "ollama serve").` : null,
      recomendados: recomendados(m.memoriaGb, new Set(modelosOl.map((x) => x.nome))),
    },
    openai: { temChave: chaveDe("openai") !== null, ...c.openai, modelos: oa.status === "fulfilled" ? oa.value : [], erro: erro(oa) },
    gemini: { temChave: chaveDe("gemini") !== null, ...c.gemini, modelos: ge.status === "fulfilled" ? ge.value : [], erro: erro(ge) },
    escolhas: escolhas(),
  };
}

const numero = (v: unknown, min: number, max: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : undefined);

export async function configurarProvedores(corpo: Record<string, unknown>): Promise<EstadoProvedores> {
  const c = config();
  const ol = (corpo.ollama ?? {}) as Record<string, unknown>;
  if (typeof ol.url === "string") {
    const url = ol.url.trim().replace(/\/$/, "");
    if (!/^https?:\/\/[\w.-]+(:\d+)?$/.test(url)) throw new ErroCard("Endereço do Ollama inválido (ex.: http://127.0.0.1:11434).");
    c.ollama.url = url;
  }
  c.ollama.contexto = numero(ol.contexto, 4096, 262_144) ?? c.ollama.contexto;
  for (const p of ["openai", "gemini"] as const) {
    const d = (corpo[p] ?? {}) as Record<string, unknown>;
    if (typeof d.chave === "string" && d.chave.trim()) {
      const chave = d.chave.trim();
      const res = await fetch(`${BASE_COMPAT[p]}/models`, { headers: { authorization: `Bearer ${chave}` }, signal: AbortSignal.timeout(8000) }).catch(() => null);
      if (!res) throw new ErroCard(`Não consegui falar com a ${p === "openai" ? "OpenAI" : "Google"}. Verifique a internet.`);
      if (!res.ok) throw new ErroCard(res.status === 401 || res.status === 403 || res.status === 400 ? "Chave inválida ou sem permissão." : `O provedor respondeu ${res.status}.`);
      salvarSegredo(CHAVE[p], chave);
    }
    if (d.esquecer === true) apagarSegredo(CHAVE[p]);
    c[p].precoEntrada = numero(d.precoEntrada, 0, 1000) ?? c[p].precoEntrada;
    c[p].precoSaida = numero(d.precoSaida, 0, 1000) ?? c[p].precoSaida;
  }
  setSetting("provedores", JSON.stringify(c));
  if (corpo.escolhas && typeof corpo.escolhas === "object") {
    // Mescla: { agente: "ollama:…" } escolhe; { agente: null } volta ao Claude.
    const atual = escolhas();
    for (const [agente, modelo] of Object.entries(corpo.escolhas as Record<string, unknown>)) {
      if (modelo === null || modelo === "") delete atual[agente];
      else if (typeof modelo === "string" && MODELO_VALIDO.test(modelo)) atual[agente] = modelo;
      else throw new ErroCard(`Modelo inválido: ${String(modelo)}`);
    }
    setSetting("modelos_agentes", JSON.stringify(atual));
  }
  return estadoProvedores();
}
