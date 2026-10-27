import { create } from "zustand";
import { Color, Vector3 } from "three";

// Dia e noite pelo relógio do Mac (DESIGN-ESCRITORIO.md, seção 7).
// Quadros-chave por hora; entre eles, as cores e intensidades são interpoladas.

export type ModoLuz = "relogio" | "dia" | "noite";

interface Quadro {
  h: number;
  ceu: string; // topo do céu
  horizonte: string; // horizonte e neblina
  sol: string;
  intSol: number;
  hemiCeu: string;
  hemiChao: string;
  intHemi: number;
  /** 0 = dia pleno, 1 = noite (luzes acesas). */
  noite: number;
}

const QUADROS: Quadro[] = [
  { h: 0, ceu: "#0b1430", horizonte: "#2a3556", sol: "#9fb4ff", intSol: 0.35, hemiCeu: "#6f7fb0", hemiChao: "#2c3040", intHemi: 0.75, noite: 1 },
  { h: 5, ceu: "#16224a", horizonte: "#3d4670", sol: "#a8b6ff", intSol: 0.4, hemiCeu: "#7684b4", hemiChao: "#353a4a", intHemi: 0.8, noite: 1 },
  { h: 6.2, ceu: "#5d6fa8", horizonte: "#f2b48a", sol: "#ffb27a", intSol: 0.9, hemiCeu: "#d8c4c0", hemiChao: "#8a7f74", intHemi: 0.9, noite: 0.45 },
  { h: 7.5, ceu: "#8fbce6", horizonte: "#f6dcc0", sol: "#ffd9a3", intSol: 1.35, hemiCeu: "#fff1df", hemiChao: "#b3a993", intHemi: 1.0, noite: 0 },
  { h: 12, ceu: "#7fb6ea", horizonte: "#e9e4da", sol: "#fffaf0", intSol: 1.6, hemiCeu: "#fff8ec", hemiChao: "#b9b2a4", intHemi: 1.1, noite: 0 },
  { h: 16.5, ceu: "#86b4e0", horizonte: "#f1dfc8", sol: "#ffe2b5", intSol: 1.45, hemiCeu: "#fff0dc", hemiChao: "#b5a990", intHemi: 1.05, noite: 0 },
  { h: 18, ceu: "#6c7fb8", horizonte: "#f4a46c", sol: "#ff9a5c", intSol: 1.05, hemiCeu: "#f0c9b0", hemiChao: "#8f7d6c", intHemi: 0.92, noite: 0.25 },
  { h: 19.2, ceu: "#2b335f", horizonte: "#a76a7a", sol: "#d07a8a", intSol: 0.55, hemiCeu: "#9a8cb4", hemiChao: "#4a4552", intHemi: 0.8, noite: 0.8 },
  { h: 20.5, ceu: "#0f1838", horizonte: "#2d3758", sol: "#9fb4ff", intSol: 0.38, hemiCeu: "#7080b0", hemiChao: "#2e3242", intHemi: 0.75, noite: 1 },
  { h: 24, ceu: "#0b1430", horizonte: "#2a3556", sol: "#9fb4ff", intSol: 0.35, hemiCeu: "#6f7fb0", hemiChao: "#2c3040", intHemi: 0.75, noite: 1 },
];

export interface EstadoCeu {
  ceu: Color;
  horizonte: Color;
  sol: Color;
  intSol: number;
  hemiCeu: Color;
  hemiChao: Color;
  intHemi: number;
  noite: number;
  /** Direção de onde vem a luz (sol de dia, lua de noite), normalizada. */
  direcao: Vector3;
}

const c = (hex: string) => new Color(hex);

export function estadoDoCeu(hora: number): EstadoCeu {
  const h = ((hora % 24) + 24) % 24;
  const i = QUADROS.findIndex((q, k) => k < QUADROS.length - 1 && h >= q.h && h < QUADROS[k + 1]!.h);
  const a = QUADROS[i]!;
  const b = QUADROS[i + 1]!;
  const t = (h - a.h) / (b.h - a.h);
  const mix = (x: string, y: string) => c(x).lerp(c(y), t);
  const num = (x: number, y: number) => x + (y - x) * t;

  // Sol nasce no leste (+x) às 6h, passa alto ao meio-dia e se põe no oeste às 18h. Vem um pouco do sul (lado da câmera),
  // para as faces que você vê ficarem iluminadas e as sombras caírem para o fundo.
  // De noite a "lua" faz o mesmo arco, mais baixa.
  const dia = h >= 6 && h <= 18;
  const fase = dia ? (h - 6) / 12 : ((h + 6) % 24) / 12; // 0..1 ao longo do arco
  const ang = fase * Math.PI;
  const altura = Math.sin(ang) * (dia ? 1 : 0.6) + 0.25;
  const direcao = new Vector3(Math.cos(ang), altura, 0.45).normalize();

  return {
    ceu: mix(a.ceu, b.ceu),
    horizonte: mix(a.horizonte, b.horizonte),
    sol: mix(a.sol, b.sol),
    intSol: num(a.intSol, b.intSol),
    hemiCeu: mix(a.hemiCeu, b.hemiCeu),
    hemiChao: mix(a.hemiChao, b.hemiChao),
    intHemi: num(a.intHemi, b.intHemi),
    noite: num(a.noite, b.noite),
    direcao,
  };
}

const CHAVE = "empresa.modoLuz";
function carregarModo(): ModoLuz {
  try {
    const v = localStorage.getItem(CHAVE);
    return v === "dia" || v === "noite" ? v : "relogio";
  } catch {
    return "relogio";
  }
}

interface StoreCeu {
  modo: ModoLuz;
  /** 0 = dia, 1 = noite. As luminárias, postes e janelas leem daqui. */
  noite: number;
  setModo: (m: ModoLuz) => void;
  setNoite: (n: number) => void;
}

export const useCeu = create<StoreCeu>((set) => ({
  modo: carregarModo(),
  noite: 0,
  setModo: (modo) => {
    try {
      localStorage.setItem(CHAVE, modo);
    } catch {
      /* sem armazenamento: vale só nesta sessão */
    }
    set({ modo });
  },
  setNoite: (noite) => set({ noite }),
}));

/** Hora usada pela cena: o relógio do Mac, ou fixa em "sempre dia" / "sempre noite". */
export function horaDaCena(modo: ModoLuz, agora = new Date()): number {
  if (modo === "dia") return 11;
  if (modo === "noite") return 22;
  return agora.getHours() + agora.getMinutes() / 60;
}
