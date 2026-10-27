import { useStore } from "../store.ts";

// Voz de saída (Etapa 1 do PLANO.md, seção 4.3): vozes pt-BR do próprio sistema.
// Cada agente ganha uma voz e um tom próprios; a Helena fica com a melhor voz.

let vozes: SpeechSynthesisVoice[] = [];
export const sinteseSuportada = typeof window !== "undefined" && "speechSynthesis" in window;

// Vozes robóticas (sintetizador Eloquence do macOS) e caricatas ficam de fora:
// soam como "tradutor". Preferimos as versões Premium/Aprimoradas e a Luciana/Felipe.
const ROBOTICAS =
  /eddy|flo|reed|rocko|sandy|shelley|grandma|grandpa|bad news|bells|boing|bubbles|cellos|jester|organ|superstar|trinoids|whisper|wobble|zarvox|albert|bahh/i;
const qualidade = (v: SpeechSynthesisVoice) =>
  /premium/i.test(v.name) ? 0 : /aprimorad|enhanced|neural|natural|siri/i.test(v.name) ? 1 : /luciana|felipe|francisca|antonio/i.test(v.name) ? 2 : 3;

function carregarVozes() {
  const pt = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("pt") && !ROBOTICAS.test(v.name));
  const br = pt.filter((v) => v.lang.toLowerCase().includes("br"));
  vozes = (br.length ? br : pt).sort((a, b) => qualidade(a) - qualidade(b));
}

/** Nomes das vozes em uso (para mostrar na tela e orientar a instalação de vozes melhores). */
export const vozesDisponiveis = () => vozes.map((v) => v.name);
if (sinteseSuportada) {
  carregarVozes();
  speechSynthesis.addEventListener("voiceschanged", carregarVozes);
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/* Voz escolhida por você para cada agente (fica salva neste navegador). */
const CHAVE_VOZES = "empresa.vozes";
function escolhidas(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_VOZES) ?? "{}");
  } catch {
    return {};
  }
}
export const vozEscolhida = (id: string): string | null => escolhidas()[id] ?? null;
export function escolherVoz(id: string, nome: string | null) {
  const atual = escolhidas();
  if (nome) atual[id] = nome;
  else delete atual[id];
  try {
    localStorage.setItem(CHAVE_VOZES, JSON.stringify(atual));
  } catch {
    /* sem armazenamento: vale só nesta sessão */
  }
}

/** Voz, tom e velocidade de cada agente (estáveis entre recarregamentos). */
export function vozDoAgente(id: string) {
  const escolhida = vozEscolhida(id);
  const fixa = escolhida ? vozes.find((v) => v.name === escolhida) : undefined;
  if (id === "chief-of-staff") return { voz: fixa ?? vozes[0] ?? null, tom: 1, velocidade: 1.05 };
  const h = hash(id);
  // Variação leve de tom: grave demais soa baixo e abafado.
  return {
    voz: fixa ?? (vozes.length ? vozes[h % vozes.length]! : null),
    tom: 0.97 + (h % 5) * 0.03, // 0,97 a 1,09
    velocidade: 1.0 + ((h >> 4) % 4) * 0.02,
  };
}

/** Texto do chat (Markdown) para fala: sem símbolos, tabelas nem código. */
export function paraFala(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .split("\n")
    .filter((l) => !/^\s*\|/.test(l))
    .join("\n")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_`#>]+/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\s*\n+\s*/g, ". ")
    .replace(/\.\s*\./g, ".")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Texto que está sendo falado agora: usado para não confundir a própria voz com a sua (eco). */
export let falandoAgora = "";
let pendentes = 0;

/** Fala um trecho na voz do agente. Frases longas são quebradas (o Chrome corta falas longas). */
export function falar(texto: string, agenteId: string) {
  if (!sinteseSuportada) return;
  const limpo = paraFala(texto);
  if (!limpo) return;
  const { voz, tom, velocidade } = vozDoAgente(agenteId);
  const pedacos = limpo.match(/[^.!?…]+[.!?…]*\s*/g) ?? [limpo];
  for (const p of pedacos) {
    const u = new SpeechSynthesisUtterance(p.trim());
    u.lang = voz?.lang ?? "pt-BR";
    if (voz) u.voice = voz;
    u.pitch = tom;
    u.rate = velocidade;
    u.volume = 1;
    u.onstart = () => {
      falandoAgora = p;
      useStore.getState().setVoz({ falando: agenteId });
      useStore.getState().focarAgente(agenteId);
    };
    u.onend = u.onerror = () => {
      pendentes = Math.max(0, pendentes - 1);
      if (pendentes === 0) {
        falandoAgora = "";
        useStore.getState().setVoz({ falando: null });
      }
    };
    pendentes++;
    speechSynthesis.speak(u);
  }
}

export function pararDeFalar() {
  if (!sinteseSuportada) return;
  pendentes = 0;
  falandoAgora = "";
  speechSynthesis.cancel();
  useStore.getState().setVoz({ falando: null });
}

export const estaFalando = () => sinteseSuportada && (speechSynthesis.speaking || pendentes > 0);

/* ---------- Fala incremental: frases saem enquanto a resposta chega ---------- */

const LIMITE = 650; // a resposta falada é curta; o resto fica no chat
const falado = new Map<string, { ate: number; avisou: boolean }>();

/** Recebe o texto parcial de uma resposta e fala as frases que já terminaram. */
export function alimentar(chave: string, parcial: string, agenteId: string) {
  const st = falado.get(chave) ?? { ate: 0, avisou: false };
  falado.set(chave, st);
  const resto = parcial.slice(st.ate);
  const m = /^[\s\S]*[.!?…:](\s|\n)/.exec(resto);
  if (!m) return;
  falarComLimite(chave, st, m[0], agenteId);
  st.ate += m[0].length;
}

/** A resposta terminou: fala o que faltou (ou tudo, se nada saiu em streaming). */
export function finalizar(chave: string, final: string, agenteId: string) {
  const st = falado.get(chave) ?? { ate: 0, avisou: false };
  falado.delete(chave);
  if (st.ate === 0) falarComLimite(chave, st, final, agenteId);
  else if (final.length > st.ate) falarComLimite(chave, st, final.slice(st.ate), agenteId);
}

function falarComLimite(_chave: string, st: { ate: number; avisou: boolean }, trecho: string, agenteId: string) {
  const ja = st.ate;
  if (ja >= LIMITE) {
    if (!st.avisou) falar("Os detalhes estão no chat.", agenteId);
    st.avisou = true;
    return;
  }
  const cabe = trecho.slice(0, LIMITE - ja);
  falar(cabe, agenteId);
  if (cabe.length < trecho.length && !st.avisou) {
    falar("Os detalhes estão no chat.", agenteId);
    st.avisou = true;
  }
}
