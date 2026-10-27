import { useEffect, useRef, type ReactNode } from "react";
import { BufferAttribute, BufferGeometry, Group, Matrix4, Mesh, type Material, type Object3D } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// Desempenho (DESIGN-ESCRITORIO.md, seção 13): junta os objetos estáticos de uma
// parte da cena em poucos desenhos, um por material. Paredes, móveis e decoração
// viram dezenas de chamadas em vez de milhares.
//
// Ficam de fora (e continuam sendo desenhados sozinhos):
// - objetos com userData.vivo (animados ou que aparecem e somem);
// - objetos clicáveis (com eventos do React Three Fiber, neles ou nos pais);
// - malhas instanciadas e materiais em lista ou de shader.
// Os originais ficam invisíveis, não são removidos: o React continua dono deles.

/** Marca um objeto (e tudo dentro dele) para não ser mesclado. */
export const VIVO = { vivo: true } as const;

type ComR3f = Object3D & { __r3f?: { handlers?: Record<string, unknown> } };

function temEventos(o: Object3D) {
  const h = (o as ComR3f).__r3f?.handlers;
  return !!h && Object.keys(h).length > 0;
}

function ficaDeFora(o: Object3D, raiz: Object3D) {
  for (let x: Object3D | null = o; x && x !== raiz; x = x.parent) {
    if (x.userData.vivo || temEventos(x)) return true;
  }
  return false;
}

function chaveDoMaterial(m: Material, mesh: Mesh) {
  const x = m as Material & Record<string, unknown>;
  const cor = (k: string) => ((x[k] as { getHexString?: () => string } | undefined)?.getHexString?.() ?? "");
  const tex = (k: string) => ((x[k] as { uuid?: string } | null | undefined)?.uuid ?? "");
  return [
    m.type, cor("color"), cor("emissive"), x.emissiveIntensity, x.roughness, x.metalness, tex("map"), tex("emissiveMap"), tex("alphaMap"),
    m.transparent, m.opacity, m.side, m.depthWrite, m.depthTest, x.flatShading, m.vertexColors, m.alphaTest, x.fog, m.polygonOffset,
    mesh.castShadow, mesh.receiveShadow, mesh.renderOrder,
  ].join("|");
}

/** Deixa a geometria só com posição, normal e uv, sem índice (assim todas podem ser unidas). */
function normalizar(g: BufferGeometry): BufferGeometry {
  const n = g.index ? g.toNonIndexed() : g;
  for (const nome of Object.keys(n.attributes)) if (!["position", "normal", "uv"].includes(nome)) n.deleteAttribute(nome);
  if (!n.attributes.normal) n.computeVertexNormals();
  if (!n.attributes.uv) n.setAttribute("uv", new BufferAttribute(new Float32Array((n.attributes.position!.count) * 2), 2));
  return n;
}

function mesclar(raiz: Group): { criados: Mesh[]; escondidos: Mesh[] } {
  raiz.updateWorldMatrix(true, true);
  const inversa = new Matrix4().copy(raiz.matrixWorld).invert();
  const grupos = new Map<string, { material: Material; mesh: Mesh; geos: BufferGeometry[]; originais: Mesh[] }>();

  raiz.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh || (m as unknown as { isInstancedMesh?: boolean }).isInstancedMesh || !m.visible) return;
    if (Array.isArray(m.material) || (m.material as Material).type === "ShaderMaterial") return;
    if (ficaDeFora(m, raiz)) return;
    // Só mescla o que está visível de verdade (um pai escondido esconde o filho).
    for (let p = m.parent; p && p !== raiz; p = p.parent) if (!p.visible) return;
    const chave = chaveDoMaterial(m.material as Material, m);
    const geo = normalizar(m.geometry.clone());
    geo.applyMatrix4(new Matrix4().multiplyMatrices(inversa, m.matrixWorld));
    const g = grupos.get(chave) ?? { material: m.material as Material, mesh: m, geos: [], originais: [] };
    g.geos.push(geo);
    g.originais.push(m);
    grupos.set(chave, g);
  });

  const criados: Mesh[] = [];
  const escondidos: Mesh[] = [];
  for (const g of grupos.values()) {
    if (g.originais.length < 2) continue; // sozinho não ganha nada
    const unida = mergeGeometries(g.geos, false);
    g.geos.forEach((x) => x.dispose());
    if (!unida) continue;
    const malha = new Mesh(unida, g.material);
    malha.castShadow = g.mesh.castShadow;
    malha.receiveShadow = g.mesh.receiveShadow;
    malha.renderOrder = g.mesh.renderOrder;
    malha.userData.mesclado = true;
    malha.raycast = () => {}; // cliques continuam nos originais clicáveis, que não entram aqui
    raiz.add(malha);
    criados.push(malha);
    for (const o of g.originais) {
      o.visible = false;
      escondidos.push(o);
    }
  }
  return { criados, escondidos };
}

/**
 * Mescla os filhos estáticos depois de montados. Mude `versao` quando algo estático
 * mudar de verdade (ex.: entrou um móvel novo) para mesclar de novo.
 */
export function Mesclado({ children, versao = 0 }: { children: ReactNode; versao?: unknown }) {
  const raiz = useRef<Group>(null);
  useEffect(() => {
    const g = raiz.current;
    if (!g) return;
    let feito: ReturnType<typeof mesclar> | null = null;
    // Espera um quadro: texturas e geometrias criadas em efeitos dos filhos já estão prontas.
    const id = requestAnimationFrame(() => {
      feito = mesclar(g);
    });
    return () => {
      cancelAnimationFrame(id);
      if (!feito) return;
      for (const m of feito.criados) {
        g.remove(m);
        m.geometry.dispose();
      }
      for (const o of feito.escondidos) o.visible = true;
    };
  }, [versao]);
  return <group ref={raiz}>{children}</group>;
}
