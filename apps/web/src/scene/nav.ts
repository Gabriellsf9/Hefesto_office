import type { RoomId } from "@empresa/shared";
import { deskByAgent, deskSpots, ESPESSURA_PAREDE, MESA, paredes, PREDIO, type AreaComumId } from "@empresa/org";
import { itensAreas, mesaReuniao } from "./areas.ts";

// Navegação por grade com busca A* (DESIGN-ESCRITORIO.md, seção 12).
// O chão vira uma grade de células de 0,5 m, livres ou bloqueadas por paredes,
// mesas e móveis; cada agente calcula o caminho mais curto passando pelas portas.

export interface Ponto {
  x: number;
  z: number;
}

/** Um lugar do escritório (a sala é só informativa). */
export interface Lugar extends Ponto {
  sala?: RoomId | AreaComumId;
}

const CELULA = 0.5;
const RAIO_AGENTE = 0.28;
const X0 = PREDIO.xMin - 8;
const Z0 = PREDIO.zMin - 6;
const COLS = Math.ceil((PREDIO.xMax + 8 - X0) / CELULA);
const LINHAS = Math.ceil((PREDIO.zMax + 12 - Z0) / CELULA);

let grade: Uint8Array | null = null; // 1 = bloqueada

const col = (x: number) => Math.floor((x - X0) / CELULA);
const lin = (z: number) => Math.floor((z - Z0) / CELULA);
const cx = (c: number) => X0 + (c + 0.5) * CELULA;
const cz = (l: number) => Z0 + (l + 0.5) * CELULA;
const dentro = (c: number, l: number) => c >= 0 && l >= 0 && c < COLS && l < LINHAS;

function bloquearRetangulo(x: number, z: number, w: number, d: number, folga = RAIO_AGENTE) {
  const g = grade!;
  const c0 = col(x - w / 2 - folga), c1 = col(x + w / 2 + folga);
  const l0 = lin(z - d / 2 - folga), l1 = lin(z + d / 2 + folga);
  for (let l = l0; l <= l1; l++) {
    for (let c = c0; c <= c1; c++) {
      if (!dentro(c, l)) continue;
      // Só bloqueia células cujo centro cai dentro do retângulo inflado.
      if (Math.abs(cx(c) - x) <= w / 2 + folga && Math.abs(cz(l) - z) <= d / 2 + folga) g[l * COLS + c] = 1;
    }
  }
}

function construir() {
  grade = new Uint8Array(COLS * LINHAS);
  const meia = ESPESSURA_PAREDE / 2 + RAIO_AGENTE;
  for (const p of paredes) {
    const comprimento = Math.hypot(p.x2 - p.x1, p.z2 - p.z1);
    const passos = Math.max(1, Math.ceil(comprimento / 0.2));
    for (let i = 0; i <= passos; i++) {
      const t = i / passos;
      bloquearRetangulo(p.x1 + (p.x2 - p.x1) * t, p.z1 + (p.z2 - p.z1) * t, 0, 0, meia);
    }
  }
  for (const d of deskSpots) bloquearRetangulo(d.x, d.z, MESA.largura, MESA.profundidade);
  bloquearRetangulo(mesaReuniao.x, mesaReuniao.z, mesaReuniao.largura, mesaReuniao.profundidade);
  for (const it of itensAreas) {
    if (!it.bloqueia) continue;
    // Itens girados 90° trocam largura e profundidade.
    const girado = Math.abs(Math.sin(it.rot ?? 0)) > 0.5;
    bloquearRetangulo(it.x, it.z, girado ? it.bloqueia.d : it.bloqueia.w, girado ? it.bloqueia.w : it.bloqueia.d);
  }
}

const livre = (c: number, l: number) => dentro(c, l) && grade![l * COLS + c] === 0;

/** Célula livre mais próxima (o destino pode estar colado num móvel, como uma cadeira). */
function celulaLivre(p: Ponto): [number, number] | null {
  const c0 = col(p.x), l0 = lin(p.z);
  if (livre(c0, l0)) return [c0, l0];
  for (let r = 1; r < 12; r++) {
    let melhor: [number, number] | null = null;
    let dist = Infinity;
    for (let dl = -r; dl <= r; dl++) {
      for (let dc = -r; dc <= r; dc++) {
        if (Math.max(Math.abs(dc), Math.abs(dl)) !== r || !livre(c0 + dc, l0 + dl)) continue;
        const d = Math.hypot(cx(c0 + dc) - p.x, cz(l0 + dl) - p.z);
        if (d < dist) {
          dist = d;
          melhor = [c0 + dc, l0 + dl];
        }
      }
    }
    if (melhor) return melhor;
  }
  return null;
}

/* ---------- A* com fila de prioridade ---------- */

class Heap {
  private itens: number[] = [];
  constructor(private readonly f: Float32Array) {}
  get tamanho() {
    return this.itens.length;
  }
  push(i: number) {
    const a = this.itens;
    a.push(i);
    let k = a.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (this.f[a[p]!]! <= this.f[a[k]!]!) break;
      [a[p], a[k]] = [a[k]!, a[p]!];
      k = p;
    }
  }
  pop(): number {
    const a = this.itens;
    const topo = a[0]!;
    const ultimo = a.pop()!;
    if (a.length) {
      a[0] = ultimo;
      let k = 0;
      for (;;) {
        const e = 2 * k + 1, d = e + 1;
        let m = k;
        if (e < a.length && this.f[a[e]!]! < this.f[a[m]!]!) m = e;
        if (d < a.length && this.f[a[d]!]! < this.f[a[m]!]!) m = d;
        if (m === k) break;
        [a[m], a[k]] = [a[k]!, a[m]!];
        k = m;
      }
    }
    return topo;
  }
}

const VIZINHOS: [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

function aEstrela(inicio: [number, number], fim: [number, number]): [number, number][] | null {
  const total = COLS * LINHAS;
  const g = new Float32Array(total).fill(Infinity);
  const f = new Float32Array(total).fill(Infinity);
  const veio = new Int32Array(total).fill(-1);
  const fechado = new Uint8Array(total);
  const h = (c: number, l: number) => {
    const dx = Math.abs(c - fim[0]), dl = Math.abs(l - fim[1]);
    return dx + dl + (Math.SQRT2 - 2) * Math.min(dx, dl);
  };
  const ini = inicio[1] * COLS + inicio[0];
  const alvo = fim[1] * COLS + fim[0];
  g[ini] = 0;
  f[ini] = h(inicio[0], inicio[1]);
  const aberto = new Heap(f);
  aberto.push(ini);
  while (aberto.tamanho) {
    const atual = aberto.pop();
    if (atual === alvo) break;
    if (fechado[atual]) continue;
    fechado[atual] = 1;
    const c = atual % COLS, l = (atual - c) / COLS;
    for (const [dc, dl, custo] of VIZINHOS) {
      const nc = c + dc, nl = l + dl;
      if (!livre(nc, nl)) continue;
      // Diagonal só se as duas laterais estiverem livres (não "corta quina" de parede).
      if (dc && dl && (!livre(c + dc, l) || !livre(c, l + dl))) continue;
      const ni = nl * COLS + nc;
      const ng = g[atual]! + custo;
      if (ng < g[ni]!) {
        g[ni] = ng;
        f[ni] = ng + h(nc, nl);
        veio[ni] = atual;
        aberto.push(ni);
      }
    }
  }
  if (veio[alvo] === -1 && alvo !== ini) return null;
  const caminho: [number, number][] = [];
  for (let i = alvo; i !== -1; i = veio[i]!) caminho.push([i % COLS, Math.floor(i / COLS)]);
  return caminho.reverse();
}

/** Linha reta entre dois pontos sem passar por célula bloqueada. */
function visivel(a: Ponto, b: Ponto) {
  const d = Math.hypot(b.x - a.x, b.z - a.z);
  const passos = Math.ceil(d / (CELULA * 0.4));
  for (let i = 1; i < passos; i++) {
    const t = i / passos;
    if (!livre(col(a.x + (b.x - a.x) * t), lin(a.z + (b.z - a.z) * t))) return false;
  }
  return true;
}

/** Caminho de `de` até `para` (sem o ponto de partida), já suavizado. Vazio se não houver. */
export function rota(de: Ponto, para: Ponto): Ponto[] {
  if (!grade) construir();
  const a = celulaLivre(de), b = celulaLivre(para);
  if (!a || !b) return [para];
  const celulas = aEstrela(a, b);
  if (!celulas) return [para];
  const pontos: Ponto[] = [de, ...celulas.map(([c, l]) => ({ x: cx(c), z: cz(l) })), para];
  // Suaviza: de cada ponto, pula direto para o mais distante que dá para ver em linha reta.
  const out: Ponto[] = [];
  let i = 0;
  while (i < pontos.length - 1) {
    let j = pontos.length - 1;
    while (j > i + 1 && !visivel(pontos[i]!, pontos[j]!)) j--;
    out.push(pontos[j]!);
    i = j;
  }
  return out;
}

/** Onde o agente senta (a cadeira fica atrás da mesa). */
export function assentoDaMesa(agenteId: string): Lugar {
  const d = deskByAgent[agenteId]!;
  return { sala: d.sala, x: d.x, z: d.z - 0.85 };
}

/** Lugar em pé ao lado da mesa de um colega, para conversar ou validar (no vão entre as mesas). */
export function aoLadoDaMesa(agenteId: string): Lugar {
  const d = deskByAgent[agenteId]!;
  return { sala: d.sala, x: d.x + 1.45, z: d.z - 0.55 };
}

/** Só para depuração/testes: a célula de um ponto está livre? */
export const pontoLivre = (p: Ponto) => {
  if (!grade) construir();
  return livre(col(p.x), lin(p.z));
};
