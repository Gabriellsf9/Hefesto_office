import type { RoomId } from "@empresa/shared";
import { agentsByRoom } from "./agents.ts";

// Planta do campus (DESIGN-ESCRITORIO.md, seção 2). Plano XZ em metros; norte = z negativo.
//
//   ┌─ corredor lateral oeste ─┬──────── fileiras de salas ────────┬─ corredor lateral leste ─┐
//   │ fileira 1  Estratégia & Produto (Produto → Design → Arquitetura, para o leste)          │
//   │ ═══ corredor 1 (principal) ═══════════════════════════════════════════════════════════ │
//   │ fileira 2  Engenharia (Desenvolvimento → Review → Segurança → QA → Docs, para o oeste)  │
//   │ ═══ corredor 2 ═══════════════════════════════════════════════════════════════════════ │
//   │ fileira 3  Plataforma + Átrio, Copa e Lounge                                            │
//   │ ═══ corredor 3 ═══════════════════════════════════════════════════════════════════════ │
//   │ fileira 4  Crescimento + Recepção                                                       │
//   │ ═══ corredor 4 ═══════════════════════════════ entrada ═══════════════════════════════ │
//
// Todas as salas abrem para o corredor ao sul delas; os corredores laterais ligam todos.

export type AreaComumId = "recepcao" | "copa" | "lounge" | "atrio";

/** Retângulo de uma sala (ou área comum) no chão. */
export interface RoomRect {
  id: RoomId;
  x: number;
  z: number;
  largura: number;
  profundidade: number;
}

export interface AreaRect {
  id: AreaComumId;
  x: number;
  z: number;
  largura: number;
  profundidade: number;
  /** Largura da abertura para o corredor ao sul (0 = parede inteira). */
  abertura: number;
  /** Sem paredes (átrio): aberto também para o corredor ao norte. */
  aberta: boolean;
}

export interface DeskSpot {
  agenteId: string;
  sala: RoomId;
  x: number;
  z: number;
}

export type TipoParede = "solida" | "vidro" | "externa" | "fachada";

export interface Parede {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  tipo: TipoParede;
  /** Sala ou área dona da parede (para a cor do lambri). */
  sala?: RoomId | AreaComumId;
}

export const CORREDOR = 3.4;
export const LATERAL = 3;
export const PORTA_SALA = 2.6;
export const ESPESSURA_PAREDE = 0.16;
const MIOLO = 74; // largura das fileiras (sem os corredores laterais)

type Item = [RoomId | AreaComumId, number];
const AREAS: Record<AreaComumId, { abertura: number; aberta: boolean }> = {
  atrio: { abertura: 0, aberta: true },
  copa: { abertura: 5, aberta: false },
  lounge: { abertura: 5, aberta: false },
  recepcao: { abertura: 8, aberta: false },
};
const ehArea = (id: string): id is AreaComumId => id in AREAS;

const fileiras: { profundidade: number; itens: Item[] }[] = [
  { profundidade: 10, itens: [["diretoria", 13], ["reuniao", 15], ["administrativo", 12], ["produto", 12], ["design", 12], ["arquitetura", 10]] },
  { profundidade: 11, itens: [["docs", 12], ["qa", 18], ["seguranca", 13], ["code-review", 13], ["desenvolvimento", 18]] },
  { profundidade: 11, itens: [["devops", 10], ["infraestrutura", 12], ["dados", 12], ["atrio", 16], ["copa", 11], ["lounge", 13]] },
  { profundidade: 11, itens: [["marketing", 24], ["comercial", 11], ["cs", 11], ["recepcao", 28]] },
];

const PROFUNDIDADE_TOTAL = fileiras.reduce((s, f) => s + f.profundidade + CORREDOR, 0);

export const PREDIO = {
  xMin: -MIOLO / 2 - LATERAL,
  xMax: MIOLO / 2 + LATERAL,
  zMin: -PROFUNDIDADE_TOTAL / 2,
  zMax: PROFUNDIDADE_TOTAL / 2,
};

export const OFFICE_SIZE = { largura: PREDIO.xMax - PREDIO.xMin, profundidade: PROFUNDIDADE_TOTAL };

/* ---------- Salas, áreas comuns e corredores ---------- */

const salas: RoomRect[] = [];
const areas: AreaRect[] = [];
/** z do centro de cada corredor horizontal (o corredor fica ao sul de cada fileira). */
export const corredoresZ: number[] = [];

{
  let z = PREDIO.zMin;
  for (const f of fileiras) {
    const soma = f.itens.reduce((s, [, w]) => s + w, 0);
    let x = -MIOLO / 2;
    for (const [id, peso] of f.itens) {
      const largura = (peso / soma) * MIOLO;
      const base = { x: x + largura / 2, z: z + f.profundidade / 2, largura, profundidade: f.profundidade };
      if (ehArea(id)) areas.push({ id, ...base, ...AREAS[id] });
      else salas.push({ id, ...base });
      x += largura;
    }
    z += f.profundidade;
    corredoresZ.push(z + CORREDOR / 2);
    z += CORREDOR;
  }
}

export const roomRects: RoomRect[] = salas;
export const roomRectById = Object.fromEntries(salas.map((r) => [r.id, r])) as Record<RoomId, RoomRect>;
export const areasComuns: AreaRect[] = areas;
export const areaRectById = Object.fromEntries(areas.map((a) => [a.id, a])) as Record<AreaComumId, AreaRect>;

/** Entrada do prédio: na fachada sul, alinhada com a recepção. */
export const ENTRADA = { x: areaRectById.recepcao.x, z: PREDIO.zMax, largura: 4 };

/* ---------- Paredes (desenho e navegação usam a mesma lista) ---------- */

function montarParedes(): Parede[] {
  const out: Parede[] = [];
  const inset = ESPESSURA_PAREDE / 2; // salas vizinhas não desenham parede no mesmo lugar
  const caixa = (sala: RoomId | AreaComumId, x: number, z: number, w: number, d: number, porta: number) => {
    const x0 = x - w / 2 + inset, x1 = x + w / 2 - inset, z0 = z - d / 2 + inset, z1 = z + d / 2 - inset;
    out.push({ x1: x0, z1: z0, x2: x1, z2: z0, tipo: "solida", sala });
    out.push({ x1: x0, z1: z0, x2: x0, z2: z1, tipo: "vidro", sala });
    out.push({ x1: x1, z1: z0, x2: x1, z2: z1, tipo: "vidro", sala });
    if (porta <= 0) out.push({ x1: x0, z1: z1, x2: x1, z2: z1, tipo: "vidro", sala });
    else {
      out.push({ x1: x0, z1: z1, x2: x - porta / 2, z2: z1, tipo: "vidro", sala });
      out.push({ x1: x + porta / 2, z1: z1, x2: x1, z2: z1, tipo: "vidro", sala });
    }
  };
  for (const r of salas) caixa(r.id, r.x, r.z, r.largura, r.profundidade, PORTA_SALA);
  for (const a of areas) if (!a.aberta) caixa(a.id, a.x, a.z, a.largura, a.profundidade, a.abertura);

  // Prédio: paredes externas e fachada de vidro com a entrada.
  const { xMin, xMax, zMin, zMax } = PREDIO;
  out.push({ x1: xMin, z1: zMin, x2: xMax, z2: zMin, tipo: "externa" });
  out.push({ x1: xMin, z1: zMin, x2: xMin, z2: zMax, tipo: "externa" });
  out.push({ x1: xMax, z1: zMin, x2: xMax, z2: zMax, tipo: "externa" });
  out.push({ x1: xMin, z1: zMax, x2: ENTRADA.x - ENTRADA.largura / 2, z2: zMax, tipo: "fachada" });
  out.push({ x1: ENTRADA.x + ENTRADA.largura / 2, z1: zMax, x2: xMax, z2: zMax, tipo: "fachada" });
  return out;
}

export const paredes: Parede[] = montarParedes();

/* ---------- Mesas ---------- */

const ESPACO_X = 3.2;
const ESPACO_Z = 3.6;

function montarMesas(): DeskSpot[] {
  const out: DeskSpot[] = [];
  for (const rect of salas) {
    const membros = agentsByRoom(rect.id);
    if (membros.length === 0) continue;
    const porLinha = Math.max(1, Math.min(membros.length, Math.floor((rect.largura - 1.5) / ESPACO_X)));
    const nLinhas = Math.ceil(membros.length / porLinha);
    membros.forEach((a, i) => {
      const linha = Math.floor(i / porLinha);
      const naLinha = linha === nLinhas - 1 ? membros.length - linha * porLinha : porLinha;
      const col = i % porLinha;
      out.push({
        agenteId: a.id,
        sala: rect.id,
        x: rect.x + (col - (naLinha - 1) / 2) * ESPACO_X,
        // Um pouco para o fundo da sala, deixando a porta (lado sul) livre.
        z: rect.z - 0.6 + (linha - (nLinhas - 1) / 2) * ESPACO_Z,
      });
    });
  }
  return out;
}

export const deskSpots: DeskSpot[] = montarMesas();
export const deskByAgent = Object.fromEntries(deskSpots.map((d) => [d.agenteId, d])) as Record<string, DeskSpot>;

/** Tamanho da mesa de trabalho (para desenhar e para a navegação desviar). */
export const MESA = { largura: 1.7, profundidade: 0.85 };
