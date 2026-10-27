import type { RoomId } from "@empresa/shared";
import { areaRectById, roomRectById, type AreaComumId } from "@empresa/org";

// Mobília das áreas comuns (recepção, copa, lounge, átrio): uma única fonte de
// posições para desenhar, para a navegação desviar e para os lugares de descanso.
// (x, z) é o centro do item; rot é o yaw (0 = virado para o sul / para a câmera).

export type TipoItem =
  | "cafeteria" | "geladeira" | "bebedouro" | "mesaRefeicao" | "sofa" | "mesaCentro" | "puff" | "tvParede" | "pebolim"
  | "sinuca" | "arvore" | "banco" | "balcao" | "aquario" | "logo" | "mural" | "planta" | "plantaAlta";

export interface ItemArea {
  tipo: TipoItem;
  x: number;
  z: number;
  rot?: number;
  cor?: string;
  /** Área que o item ocupa no chão, no referencial do item (largura x, profundidade z antes de girar). */
  bloqueia?: { w: number; d: number };
}

export type Acao = "cafe" | "comer" | "agua" | "puff" | "sofa" | "poltrona" | "ler" | "jogar" | "banco" | "aquario";

export interface Poi {
  x: number;
  z: number;
  sala: RoomId | AreaComumId;
  acao: Acao;
  /** Yaw ao chegar. 0 = olhando para o sul (câmera). */
  rot: number;
  sentado: boolean;
  /** Ajuste de altura quando sentado (puff é mais baixo que cadeira). */
  alturaAssento: number;
}

const NORTE = Math.PI; // virado para o norte (para a parede do fundo)
const LESTE = Math.PI / 2;
const OESTE = -Math.PI / 2;

const itens: ItemArea[] = [];
const pois: Poi[] = [];
const poi = (sala: Poi["sala"], acao: Acao, x: number, z: number, rot: number, sentado = false, alturaAssento = 0) =>
  pois.push({ sala, acao, x, z, rot, sentado, alturaAssento });

/* ---------- Copa ---------- */
{
  const c = areaRectById.copa;
  const n = c.z - c.profundidade / 2;
  itens.push(
    { tipo: "cafeteria", x: c.x - 2.6, z: n + 0.45, bloqueia: { w: 2.1, d: 0.75 } },
    { tipo: "cafeteria", x: c.x - 0.5, z: n + 0.45, bloqueia: { w: 2.1, d: 0.75 } },
    { tipo: "geladeira", x: c.x + 1.8, z: n + 0.5, bloqueia: { w: 0.95, d: 0.85 } },
    { tipo: "bebedouro", x: c.x + 3.2, z: n + 0.4, bloqueia: { w: 0.5, d: 0.5 } },
    { tipo: "plantaAlta", x: c.x + 4.5, z: n + 0.75, bloqueia: { w: 0.7, d: 0.7 } },
    { tipo: "mesaRefeicao", x: c.x, z: c.z + 0.8, bloqueia: { w: 4.2, d: 1.2 } },
    { tipo: "planta", x: c.x - 4.6, z: c.z + c.profundidade / 2 - 0.8 },
  );
  poi("copa", "cafe", c.x - 2.9, n + 1.3, NORTE);
  poi("copa", "cafe", c.x - 0.8, n + 1.3, NORTE);
  poi("copa", "comer", c.x + 1.8, n + 1.35, NORTE);
  poi("copa", "agua", c.x + 3.2, n + 1.0, NORTE);
  for (const i of [-1, 0, 1]) {
    poi("copa", "comer", c.x + i * 1.4, c.z + 0.8 - 1.15, 0, true);
    poi("copa", "comer", c.x + i * 1.4, c.z + 0.8 + 1.15, NORTE, true);
  }
}

/* ---------- Lounge ---------- */
{
  const l = areaRectById.lounge;
  const n = l.z - l.profundidade / 2;
  itens.push(
    { tipo: "tvParede", x: l.x - 2.5, z: n + 0.1 },
    { tipo: "sofa", x: l.x - 2.5, z: n + 1.5, bloqueia: { w: 2.3, d: 0.95 } },
    { tipo: "mesaCentro", x: l.x - 2.5, z: n + 2.8, bloqueia: { w: 1.25, d: 0.7 } },
    { tipo: "puff", x: l.x - 4.4, z: n + 3.6, rot: NORTE, cor: "#e76f51" },
    { tipo: "puff", x: l.x - 2.5, z: n + 4.3, rot: NORTE, cor: "#2a9d8f" },
    { tipo: "puff", x: l.x - 0.6, z: n + 3.6, rot: NORTE, cor: "#e9c46a" },
    { tipo: "pebolim", x: l.x + 3.0, z: l.z - 1.8, bloqueia: { w: 1.5, d: 0.85 } },
    { tipo: "sinuca", x: l.x + 3.0, z: l.z + 2.0, bloqueia: { w: 2.6, d: 1.45 } },
    { tipo: "plantaAlta", x: l.x + 5.6, z: n + 0.75, bloqueia: { w: 0.7, d: 0.7 } },
    { tipo: "planta", x: l.x - 5.6, z: l.z + l.profundidade / 2 - 0.8 },
  );
  poi("lounge", "sofa", l.x - 3.0, n + 1.55, 0, true, -0.08);
  poi("lounge", "sofa", l.x - 2.0, n + 1.55, 0, true, -0.08);
  poi("lounge", "puff", l.x - 4.4, n + 3.55, NORTE, true, -0.22);
  poi("lounge", "puff", l.x - 2.5, n + 4.25, NORTE, true, -0.22);
  poi("lounge", "puff", l.x - 0.6, n + 3.55, NORTE, true, -0.22);
  poi("lounge", "jogar", l.x + 3.0 - 1.2, l.z - 1.8, LESTE);
  poi("lounge", "jogar", l.x + 3.0 + 1.2, l.z - 1.8, OESTE);
  poi("lounge", "jogar", l.x + 3.0 - 1.8, l.z + 2.0, LESTE);
  poi("lounge", "jogar", l.x + 3.0 + 1.8, l.z + 2.0, OESTE);
}

/* ---------- Átrio ---------- */
{
  const a = areaRectById.atrio;
  itens.push(
    { tipo: "arvore", x: a.x, z: a.z, bloqueia: { w: 3.4, d: 3.4 } },
    { tipo: "banco", x: a.x - 3.7, z: a.z, rot: LESTE, bloqueia: { w: 1.9, d: 0.65 } },
    { tipo: "banco", x: a.x + 3.7, z: a.z, rot: OESTE, bloqueia: { w: 1.9, d: 0.65 } },
  );
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) itens.push({ tipo: "planta", x: a.x + sx * 6.6, z: a.z + sz * 4.2 });
  for (const dz of [-0.45, 0.45]) {
    poi("atrio", "banco", a.x - 3.55, a.z + dz, LESTE, true, -0.1);
    poi("atrio", "banco", a.x + 3.55, a.z + dz, OESTE, true, -0.1);
  }
}

/* ---------- Recepção ---------- */
{
  const r = areaRectById.recepcao;
  const n = r.z - r.profundidade / 2;
  itens.push(
    { tipo: "mural", x: r.x - 6, z: n + 0.1 },
    { tipo: "balcao", x: r.x, z: n + 2.0, bloqueia: { w: 4.2, d: 1.0 } },
    { tipo: "logo", x: r.x, z: r.z + 1.8 },
    { tipo: "sofa", x: r.x - 9.5, z: n + 3.0, bloqueia: { w: 2.3, d: 0.95 }, cor: "#8d6e63" },
    { tipo: "mesaCentro", x: r.x - 9.5, z: n + 4.3, bloqueia: { w: 1.25, d: 0.7 } },
    { tipo: "sofa", x: r.x - 9.5, z: n + 5.6, rot: NORTE, bloqueia: { w: 2.3, d: 0.95 }, cor: "#8d6e63" },
    { tipo: "aquario", x: r.x + 8, z: n + 0.55, bloqueia: { w: 3.1, d: 0.85 } },
    { tipo: "plantaAlta", x: r.x - 13, z: n + 0.8, bloqueia: { w: 0.7, d: 0.7 } },
    { tipo: "plantaAlta", x: r.x + 13, z: n + 0.8, bloqueia: { w: 0.7, d: 0.7 } },
    { tipo: "plantaAlta", x: r.x + 13, z: r.z + r.profundidade / 2 - 0.8, bloqueia: { w: 0.7, d: 0.7 } },
    { tipo: "planta", x: r.x + 2.6, z: n + 2.0 },
  );
  poi("recepcao", "sofa", r.x - 10, n + 3.05, 0, true, -0.08);
  poi("recepcao", "sofa", r.x - 9, n + 3.05, 0, true, -0.08);
  poi("recepcao", "sofa", r.x - 10, n + 5.55, NORTE, true, -0.08);
  poi("recepcao", "sofa", r.x - 9, n + 5.55, NORTE, true, -0.08);
  poi("recepcao", "aquario", r.x + 7.3, n + 1.6, NORTE);
  poi("recepcao", "aquario", r.x + 8.7, n + 1.6, NORTE);
}

/* ---------- Estantes dentro das salas (mesmas posições do RoomMesh) ---------- */
{
  const estante = (sala: RoomId, xLocal: (w: number) => number) => {
    const s = roomRectById[sala];
    if (!s) return;
    poi(sala, "ler", s.x + xLocal(s.largura), s.z - s.profundidade / 2 + 1.1, NORTE);
  };
  estante("diretoria", (w) => -w / 2 + 3.6);
  estante("arquitetura", (w) => w / 2 - 1.3);
  estante("code-review", (w) => w / 2 - 1.3);
  estante("docs", (w) => w / 2 - 1.3);
  estante("administrativo", () => -0.2);
}

export const itensAreas = itens;
export const poisAreas = pois;

/** Mesa da Sala de Reunião (mesma fórmula do MeetingTable em RoomMesh). */
export const mesaReuniao = (() => {
  const r = roomRectById.reuniao;
  // Escritórios sem Sala de Reunião: retângulo vazio, fora de tudo.
  if (!r) return { x: 0, z: 0, largura: 0, profundidade: 0 };
  return { x: r.x, z: r.z - 0.3, largura: Math.min(r.largura - 5, 9), profundidade: 2.2 };
})();

/** Cor de acento de cada área comum (lambri, borda e placa). */
export const coresAreas: Record<AreaComumId, string> = {
  recepcao: "#8ecae6",
  copa: "#e9c46a",
  lounge: "#cdb4db",
  atrio: "#95d5b2",
};
export const corDaArea = (id: AreaComumId) => coresAreas[id];
