import { create } from "zustand";

// Sons gerados no navegador (Web Audio), sem baixar arquivos (DESIGN-ESCRITORIO.md, seção 10).
// Desligados por padrão; ligam no menu ⋯. Um som pedido por clique toca mesmo assim.

const CHAVE = "empresa.sons";

interface ConfigSons {
  efeitos: boolean;
  musica: boolean;
  volume: number;
}

function carregar(): ConfigSons {
  try {
    return { efeitos: false, musica: false, volume: 0.6, ...JSON.parse(localStorage.getItem(CHAVE) ?? "{}") };
  } catch {
    return { efeitos: false, musica: false, volume: 0.6 };
  }
}

interface StoreSons extends ConfigSons {
  configurar: (c: Partial<ConfigSons>) => void;
}

export const useSons = create<StoreSons>((set, get) => ({
  ...carregar(),
  configurar: (c) => {
    set(c);
    const { efeitos, musica, volume } = get();
    try {
      localStorage.setItem(CHAVE, JSON.stringify({ efeitos, musica, volume }));
    } catch {
      /* sem armazenamento: vale só nesta sessão */
    }
  },
}));

let ctx: AudioContext | null = null;
let saida: GainNode | null = null;

/** Contexto de áudio criado sob demanda (o navegador só deixa depois de um clique). */
export function audio(): { ctx: AudioContext; saida: GainNode } | null {
  try {
    if (!ctx) {
      ctx = new AudioContext();
      saida = ctx.createGain();
      saida.connect(ctx.destination);
    }
    if (ctx.state === "suspended") void ctx.resume();
    saida!.gain.value = useSons.getState().volume;
    return { ctx, saida: saida! };
  } catch {
    return null;
  }
}

/** Sino de vendas: parciais inarmônicas com decaimento longo. */
export function tocarSino(pedidoPeloUsuario: boolean) {
  if (!pedidoPeloUsuario && !useSons.getState().efeitos) return;
  const a = audio();
  if (!a) return;
  const t = a.ctx.currentTime;
  for (const [f, g, d] of [
    [880, 0.35, 2.4],
    [1760 * 1.19, 0.12, 1.6],
    [2640 * 1.07, 0.08, 1.1],
    [440, 0.1, 2.8],
  ] as const) {
    const o = a.ctx.createOscillator();
    const v = a.ctx.createGain();
    o.type = "sine";
    o.frequency.value = f;
    v.gain.setValueAtTime(0, t);
    v.gain.linearRampToValueAtTime(g, t + 0.005);
    v.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(v).connect(a.saida);
    o.start(t);
    o.stop(t + d + 0.05);
  }
}

/** Ruído branco curto (base de cliques, vapor e portas). */
function ruido(a: { ctx: AudioContext }, segundos: number) {
  const n = Math.floor(a.ctx.sampleRate * segundos);
  const buf = a.ctx.createBuffer(1, n, a.ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = a.ctx.createBufferSource();
  src.buffer = buf;
  return src;
}

/** Efeito ambiente: só toca com os efeitos ligados; `vol` já vem atenuado pela distância. */
function efeito(vol: number) {
  if (!useSons.getState().efeitos || vol <= 0.01) return null;
  return audio();
}

/** Uma tecla: clique curto e abafado. */
export function tocarTecla(vol: number) {
  const a = efeito(vol);
  if (!a) return;
  const t = a.ctx.currentTime;
  const src = ruido(a, 0.03);
  const filtro = a.ctx.createBiquadFilter();
  filtro.type = "bandpass";
  filtro.frequency.value = 2500 + Math.random() * 1500;
  const g = a.ctx.createGain();
  g.gain.setValueAtTime(0.18 * vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
  src.connect(filtro).connect(g).connect(a.saida);
  src.start(t);
}

/** Cafeteira: chiado do vapor. */
export function tocarCafe(vol: number) {
  const a = efeito(vol);
  if (!a) return;
  const t = a.ctx.currentTime;
  const src = ruido(a, 1.6);
  const filtro = a.ctx.createBiquadFilter();
  filtro.type = "highpass";
  filtro.frequency.value = 3000;
  const g = a.ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.12 * vol, t + 0.3);
  g.gain.linearRampToValueAtTime(0, t + 1.6);
  src.connect(filtro).connect(g).connect(a.saida);
  src.start(t);
}

/** Porta de vidro deslizando. */
export function tocarPorta(vol: number) {
  const a = efeito(vol);
  if (!a) return;
  const t = a.ctx.currentTime;
  const src = ruido(a, 0.5);
  const filtro = a.ctx.createBiquadFilter();
  filtro.type = "lowpass";
  filtro.frequency.setValueAtTime(400, t);
  filtro.frequency.linearRampToValueAtTime(1400, t + 0.25);
  const g = a.ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.1 * vol, t + 0.08);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
  src.connect(filtro).connect(g).connect(a.saida);
  src.start(t);
}

/** Algo novo esperando você (aprovação): duas notas suaves. */
export function tocarNotificacao() {
  if (!useSons.getState().efeitos) return;
  const a = audio();
  if (!a) return;
  const t = a.ctx.currentTime;
  [659.25, 987.77].forEach((f, i) => {
    const o = a.ctx.createOscillator();
    const g = a.ctx.createGain();
    o.type = "triangle";
    o.frequency.value = f;
    const t0 = t + i * 0.14;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.16, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6);
    o.connect(g).connect(a.saida);
    o.start(t0);
    o.stop(t0 + 0.65);
  });
}

/* ---------- Música ambiente lo-fi (gerada aqui mesmo) ---------- */

const BPM = 74;
const BATIDA = 60 / BPM;
// ii–V–I–vi em Fá maior, com sétimas: Gm7, C9, Fmaj7, Dm7.
const ACORDES = [
  [55, 58, 62, 65],
  [48, 52, 55, 58, 62],
  [53, 57, 60, 64],
  [50, 53, 57, 60],
];
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

let tocando: { parar: () => void } | null = null;

export function musicaTocando() {
  return tocando !== null;
}

export function ligarMusica(ligar: boolean) {
  if (!ligar) {
    tocando?.parar();
    tocando = null;
    return;
  }
  if (tocando) return;
  const a = audio();
  if (!a) return;
  const { ctx } = a;
  const mix = ctx.createGain();
  mix.gain.value = 0.35;
  // Filtro "de fita": tira o brilho, como num lo-fi.
  const fita = ctx.createBiquadFilter();
  fita.type = "lowpass";
  fita.frequency.value = 1800;
  mix.connect(fita).connect(a.saida);

  // Chiado de vinil, bem baixinho e contínuo.
  const vinil = ruido(a, 2);
  vinil.loop = true;
  const fv = ctx.createBiquadFilter();
  fv.type = "bandpass";
  fv.frequency.value = 5000;
  const gv = ctx.createGain();
  gv.gain.value = 0.012;
  vinil.connect(fv).connect(gv).connect(mix);
  vinil.start();

  let proximo = ctx.currentTime + 0.1;
  let passo = 0;
  const agendar = () => {
    while (proximo < ctx.currentTime + 0.4) {
      const compasso = Math.floor(passo / 8);
      const tempoNoCompasso = passo % 8; // colcheias
      const t = proximo;
      if (tempoNoCompasso === 0) {
        // Acorde do compasso: pad macio de 4 batidas.
        for (const n of ACORDES[compasso % ACORDES.length]!) {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = "triangle";
          o.frequency.value = hz(n);
          o.detune.value = (Math.random() - 0.5) * 12;
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.05, t + 0.25);
          g.gain.linearRampToValueAtTime(0.0001, t + BATIDA * 4);
          o.connect(g).connect(mix);
          o.start(t);
          o.stop(t + BATIDA * 4 + 0.05);
        }
        // Baixo na fundamental.
        const b = ctx.createOscillator();
        const gb = ctx.createGain();
        b.type = "sine";
        b.frequency.value = hz(ACORDES[compasso % ACORDES.length]![0]! - 12);
        gb.gain.setValueAtTime(0.18, t);
        gb.gain.exponentialRampToValueAtTime(0.0001, t + BATIDA * 1.8);
        b.connect(gb).connect(mix);
        b.start(t);
        b.stop(t + BATIDA * 2);
      }
      // Bumbo nas batidas 1 e 3 (com um "atrasinho" no 3), caixa nas 2 e 4, chimbal em colcheias com swing.
      if (tempoNoCompasso === 0 || tempoNoCompasso === 5) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.setValueAtTime(110, t);
        o.frequency.exponentialRampToValueAtTime(45, t + 0.15);
        g.gain.setValueAtTime(0.35, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
        o.connect(g).connect(mix);
        o.start(t);
        o.stop(t + 0.3);
      }
      if (tempoNoCompasso === 2 || tempoNoCompasso === 6) {
        const s = ruido(a, 0.2);
        const f = ctx.createBiquadFilter();
        f.type = "bandpass";
        f.frequency.value = 1800;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.12, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
        s.connect(f).connect(g).connect(mix);
        s.start(t);
      }
      {
        const s = ruido(a, 0.05);
        const f = ctx.createBiquadFilter();
        f.type = "highpass";
        f.frequency.value = 7000;
        const g = ctx.createGain();
        g.gain.setValueAtTime(tempoNoCompasso % 2 ? 0.025 : 0.04, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
        s.connect(f).connect(g).connect(mix);
        s.start(t);
      }
      const swing = tempoNoCompasso % 2 ? 0.42 : 0.58;
      proximo += BATIDA * swing;
      passo++;
    }
  };
  const id = setInterval(agendar, 100);
  agendar();
  tocando = {
    parar: () => {
      clearInterval(id);
      const t = ctx.currentTime;
      mix.gain.setValueAtTime(mix.gain.value, t);
      mix.gain.linearRampToValueAtTime(0, t + 0.6);
      setTimeout(() => {
        vinil.stop();
        mix.disconnect();
      }, 700);
    },
  };
}

// Música segue a configuração (ligar no menu ⋯ ou no rádio da copa).
useSons.subscribe((s, antes) => {
  if (s.musica !== antes.musica) ligarMusica(s.musica);
  if (saida && s.volume !== antes.volume) saida.gain.value = s.volume;
});

// O navegador só deixa tocar depois de um clique: se a música ficou ligada da última vez, começa no primeiro clique.
if (typeof window !== "undefined") {
  const primeiroGesto = () => {
    if (useSons.getState().musica) ligarMusica(true);
    window.removeEventListener("pointerdown", primeiroGesto);
  };
  window.addEventListener("pointerdown", primeiroGesto);
}

/** Volume pela distância: 1 perto, 0 a partir de `alcance` metros. */
export const atenuar = (distancia: number, alcance = 18) => Math.max(0, 1 - distancia / alcance) ** 1.5;
