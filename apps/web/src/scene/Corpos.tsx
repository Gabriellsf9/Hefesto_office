import { useEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeElements } from "@react-three/fiber";
import {
  BoxGeometry, CapsuleGeometry, Color, CylinderGeometry, type InstancedMesh, Matrix4, MeshBasicMaterial, MeshStandardMaterial, type Object3D,
  SphereGeometry, TorusGeometry, type BufferGeometry, type Material,
} from "three";

// Desempenho: os corpos de todos os agentes desenhados com instancing.
// Cada parte (tronco, perna, braço, cabeça…) é UMA malha para todos os agentes.
// O boneco continua sendo montado e animado no Avatar, com "âncoras" invisíveis
// no lugar das malhas; aqui cada instância copia a posição da sua âncora a cada quadro.

export type Parte =
  | "tronco" | "perna" | "sapato" | "braco" | "cabeca" | "cabelo" | "olho" | "xicara" | "copo" | "fruta" | "livro"
  | "oculos" | "fone" | "cabeloLongo" | "coque" | "cracha";

interface Def {
  geo: BufferGeometry;
  mat: Material;
  max: number;
  sombra?: boolean;
}

const padrao = (props: ConstructorParameters<typeof MeshStandardMaterial>[0] = {}) => new MeshStandardMaterial({ roughness: 0.85, ...props });

function definicoes(): Record<Parte, Def> {
  return {
    tronco: { geo: new CapsuleGeometry(0.26, 0.42, 4, 10), mat: padrao(), max: 128, sombra: true },
    perna: { geo: new CapsuleGeometry(0.11, 0.6, 4, 8), mat: padrao(), max: 256 },
    sapato: { geo: new BoxGeometry(0.17, 0.09, 0.28), mat: padrao(), max: 256 },
    braco: { geo: new CapsuleGeometry(0.08, 0.36, 4, 8), mat: padrao(), max: 256 },
    cabeca: { geo: new SphereGeometry(0.24, 16, 12), mat: padrao({ roughness: 0.7 }), max: 128, sombra: true },
    cabelo: { geo: new SphereGeometry(0.25, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat: padrao({ roughness: 0.9 }), max: 128 },
    olho: { geo: new SphereGeometry(0.028, 8, 6), mat: new MeshBasicMaterial(), max: 256 },
    xicara: { geo: new CylinderGeometry(0.055, 0.045, 0.11, 10), mat: padrao(), max: 128 },
    copo: { geo: new CylinderGeometry(0.045, 0.04, 0.13, 10), mat: padrao({ transparent: true, opacity: 0.8 }), max: 128 },
    fruta: { geo: new SphereGeometry(0.065, 10, 8), mat: padrao(), max: 128 },
    livro: { geo: new BoxGeometry(0.22, 0.05, 0.16), mat: padrao(), max: 128 },
    oculos: { geo: new TorusGeometry(0.055, 0.011, 6, 16), mat: padrao({ roughness: 0.3, metalness: 0.4 }), max: 256 },
    fone: { geo: new TorusGeometry(0.27, 0.035, 6, 18, Math.PI), mat: padrao({ roughness: 0.5 }), max: 128 },
    cabeloLongo: { geo: new BoxGeometry(0.44, 0.46, 0.14), mat: padrao({ roughness: 0.9 }), max: 128 },
    coque: { geo: new SphereGeometry(0.11, 10, 8), mat: padrao({ roughness: 0.9 }), max: 128 },
    cracha: { geo: new BoxGeometry(0.11, 0.14, 0.015), mat: padrao({ roughness: 0.4 }), max: 128 },
  };
}

const PARTES = Object.keys(definicoes()) as Parte[];

interface Registro {
  obj: Object3D;
  cor: Color;
}

const ancoras = new Map<Parte, Set<Registro>>(PARTES.map((p) => [p, new Set()]));

/** Ponto invisível onde uma parte do corpo é desenhada (mesmas props de posição de um mesh). */
export function Ancora({ parte, cor, ...props }: { parte: Parte; cor: string } & ThreeElements["object3D"]) {
  const ref = useRef<Object3D>(null);
  const corObj = useMemo(() => new Color(cor), [cor]);
  useEffect(() => {
    const obj = ref.current;
    if (!obj) return;
    const r: Registro = { obj, cor: corObj };
    ancoras.get(parte)!.add(r);
    return () => void ancoras.get(parte)!.delete(r);
  }, [parte, corObj]);
  return <object3D ref={ref} {...props} />;
}

function visivelDeVerdade(o: Object3D) {
  for (let x: Object3D | null = o; x; x = x.parent) if (!x.visible) return false;
  return true;
}

const ZERO = new Matrix4().makeScale(0, 0, 0);

function ParteInstanciada({ parte, def }: { parte: Parte; def: Def }) {
  const malha = useRef<InstancedMesh>(null);
  useFrame(() => {
    const m = malha.current;
    if (!m) return;
    let i = 0;
    for (const r of ancoras.get(parte)!) {
      if (i >= def.max) break;
      r.obj.updateWorldMatrix(true, false);
      m.setMatrixAt(i, visivelDeVerdade(r.obj) ? r.obj.matrixWorld : ZERO);
      m.setColorAt(i, r.cor);
      i++;
    }
    m.count = i;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    // As instâncias andam pelo prédio inteiro: a caixa de recorte de uma só não serve.
    m.frustumCulled = false;
  });
  return <instancedMesh ref={malha} args={[def.geo, def.mat, def.max]} castShadow={def.sombra} receiveShadow />;
}

/** Monta uma malha instanciada por parte. Deve vir DEPOIS dos agentes na árvore (roda depois deles a cada quadro). */
export function Corpos() {
  const defs = useMemo(definicoes, []);
  return (
    <group>
      {PARTES.map((p) => (
        <ParteInstanciada key={p} parte={p} def={defs[p]} />
      ))}
    </group>
  );
}
