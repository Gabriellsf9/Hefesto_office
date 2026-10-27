import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { CanvasTexture, Color, type Group, type InstancedMesh, MeshStandardMaterial, Object3D, RepeatWrapping, SRGBColorSpace } from "three";
import { ENTRADA, PREDIO } from "@empresa/org";
import { rng } from "./textures.ts";
import { useNoite } from "./Ambiente.tsx";
import { LightPool } from "./Props.tsx";
import { VIVO } from "./Mesclado.tsx";

// Exterior do campus (DESIGN-ESCRITORIO.md, seção 6): calçadas, rua com carros,
// postes, parque com árvores, lago com patos, jardim, bicicletário e a cidade no
// horizonte (ao norte, que é para onde a câmera olha).

const Z_CALCADA = PREDIO.zMax + 9.5; // calçada entre a praça e a rua
const Z_RUA = PREDIO.zMax + 15.5; // centro da rua
const LARGURA_RUA = 9;
const LAGO = { x: PREDIO.xMin - 34, z: -4, rx: 15, rz: 21 };
const JARDIM = { x: PREDIO.xMax + 22, z: 0, w: 20, d: 34 };

export function Exterior() {
  return (
    <group>
      <Chao />
      <Calcadas />
      <Rua />
      <Postes />
      <Lago />
      <Jardim />
      <Bicicletario />
      <Arvores />
      <Cidade />
    </group>
  );
}

function Chao() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
      <planeGeometry args={[1400, 1400]} />
      <meshStandardMaterial color="#a9c98f" roughness={1} />
    </mesh>
  );
}

function Faixa({ x, z, w, d, cor, y = 0.004 }: { x: number; z: number; w: number; d: number; cor: string; y?: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[x, y, z]} receiveShadow>
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial color={cor} roughness={1} />
    </mesh>
  );
}

/** Calçada em volta do prédio e caminhos do parque. */
function Calcadas() {
  const { xMin, xMax, zMin, zMax } = PREDIO;
  const cor = "#d9d3c7";
  return (
    <group>
      <Faixa x={0} z={zMin - 2} w={xMax - xMin + 8} d={4} cor={cor} />
      <Faixa x={xMin - 2} z={0} w={4} d={zMax - zMin} cor={cor} />
      <Faixa x={xMax + 2} z={0} w={4} d={zMax - zMin} cor={cor} />
      <Faixa x={0} z={Z_CALCADA} w={600} d={3} cor={cor} />
      <Faixa x={0} z={Z_RUA + LARGURA_RUA / 2 + 1.5} w={600} d={3} cor={cor} />
      {/* Caminho até o lago e até o jardim */}
      <Faixa x={(xMin - 4 + LAGO.x + LAGO.rx) / 2} z={0} w={xMin - 4 - (LAGO.x + LAGO.rx) + 2} d={2.2} cor={cor} />
      <Faixa x={JARDIM.x} z={JARDIM.z} w={2.2} d={JARDIM.d + 6} cor={cor} />
      {/* Trilha ao norte, entre o prédio e o bosque */}
      <Faixa x={0} z={zMin - 14} w={260} d={2.4} cor={cor} />
    </group>
  );
}

/* ---------- Rua e carros ---------- */

const CORES_CARRO = ["#e63946", "#457b9d", "#f1faee", "#1d3557", "#2a9d8f", "#e9c46a", "#6d6875", "#3a3f4b"];

function Carro({ cor }: { cor: string }) {
  return (
    <group>
      <mesh position={[0, 0.55, 0]} castShadow>
        <boxGeometry args={[4.2, 0.7, 1.8]} />
        <meshStandardMaterial color={cor} roughness={0.4} metalness={0.3} />
      </mesh>
      <mesh position={[-0.2, 1.1, 0]} castShadow>
        <boxGeometry args={[2.2, 0.55, 1.6]} />
        <meshStandardMaterial color="#9fb3c8" roughness={0.15} metalness={0.5} />
      </mesh>
      {[-1.35, 1.35].map((x) =>
        [-0.85, 0.85].map((z) => (
          <mesh key={`${x}${z}`} position={[x, 0.32, z]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.32, 0.32, 0.22, 12]} />
            <meshStandardMaterial color="#1f2430" roughness={0.9} />
          </mesh>
        )),
      )}
    </group>
  );
}

function Rua() {
  const estacionados = useMemo(() => {
    const r = rng(41);
    const out: { x: number; cor: string }[] = [];
    for (let x = -150; x < 150; x += 7 + r() * 9) {
      if (Math.abs(x - ENTRADA.x) < 10 || r() < 0.25) continue;
      out.push({ x, cor: CORES_CARRO[Math.floor(r() * CORES_CARRO.length)]! });
    }
    return out;
  }, []);
  const passando = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!passando.current) return;
    // Um carro passa de vez em quando: atravessa em ~22 s e some por ~14 s.
    const ciclo = clock.elapsedTime % 36;
    passando.current.visible = ciclo < 22;
    passando.current.position.x = -230 + (ciclo / 22) * 460;
  });

  return (
    <group>
      <Faixa x={0} z={Z_RUA} w={600} d={LARGURA_RUA} cor="#5b5f66" y={0.006} />
      {Array.from({ length: 60 }, (_, i) => -295 + i * 10).map((x) => (
        <Faixa key={x} x={x} z={Z_RUA} w={4} d={0.18} cor="#f1e9d2" y={0.01} />
      ))}
      {/* Faixa de pedestres na frente da entrada */}
      {Array.from({ length: 7 }, (_, i) => i).map((i) => (
        <Faixa key={i} x={ENTRADA.x - 3 + i} z={Z_RUA} w={0.5} d={LARGURA_RUA - 1} cor="#f4f1ea" y={0.012} />
      ))}
      {estacionados.map((c, i) => (
        <group key={i} position={[c.x, 0, Z_RUA + 2.5]}>
          <Carro cor={c.cor} />
        </group>
      ))}
      <group ref={passando} position={[0, 0, Z_RUA - 2]} userData={VIVO}>
        <Carro cor="#ff7f50" />
      </group>
    </group>
  );
}

/* ---------- Postes (acendem à noite) ---------- */

function Postes() {
  const noite = useNoite();
  // Um material para todas as lâmpadas: acender à noite é mudar um número só.
  const lampada = useMemo(() => new MeshStandardMaterial({ color: "#fff4d6", emissive: "#ffd38a", emissiveIntensity: 0.15 }), []);
  useEffect(() => {
    lampada.emissiveIntensity = 0.15 + noite * 2.4;
  }, [lampada, noite]);
  const pontos = useMemo(() => {
    const out: [number, number][] = [];
    for (let x = -120; x <= 120; x += 16) if (Math.abs(x - ENTRADA.x) > 5) out.push([x, Z_CALCADA - 1.2]);
    for (let z = PREDIO.zMin + 4; z <= PREDIO.zMax - 4; z += 14) {
      out.push([PREDIO.xMin - 3.6, z], [PREDIO.xMax + 3.6, z]);
    }
    for (let x = -100; x <= 100; x += 20) out.push([x, PREDIO.zMin - 15.8]);
    return out;
  }, []);
  return (
    <group>
      {pontos.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 2, 0]} castShadow>
            <cylinderGeometry args={[0.07, 0.09, 4, 8]} />
            <meshStandardMaterial color="#2f343d" metalness={0.5} roughness={0.5} />
          </mesh>
          <mesh position={[0, 4.05, 0]} material={lampada}>
            <sphereGeometry args={[0.26, 12, 10]} />
          </mesh>
          {noite > 0.3 && (
            <group userData={VIVO}>
              <LightPool raio={3.2} intensidade={0.5 * noite} />
            </group>
          )}
        </group>
      ))}
    </group>
  );
}

/* ---------- Lago com patos ---------- */

function Lago() {
  const patos = useRef<Group>(null);
  useFrame(({ clock }) => {
    patos.current?.children.forEach((p, i) => {
      const t = clock.elapsedTime * 0.06 + i * 0.35;
      const x = Math.cos(t) * LAGO.rx * 0.55;
      const z = Math.sin(t) * LAGO.rz * 0.55;
      p.position.set(x, 0.1 + Math.sin(clock.elapsedTime * 2 + i) * 0.02, z);
      p.rotation.y = -t + Math.PI;
    });
  });
  return (
    <group position={[LAGO.x, 0, LAGO.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} scale={[LAGO.rx + 1.5, LAGO.rz + 1.5, 1]} receiveShadow>
        <circleGeometry args={[1, 48]} />
        <meshStandardMaterial color="#d8c9a5" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} scale={[LAGO.rx, LAGO.rz, 1]}>
        <circleGeometry args={[1, 48]} />
        <meshStandardMaterial color="#5fa8c9" roughness={0.12} metalness={0.25} />
      </mesh>
      {/* Deque de madeira */}
      <mesh position={[LAGO.rx - 1, 0.15, 0]} castShadow receiveShadow>
        <boxGeometry args={[5, 0.12, 2.4]} />
        <meshStandardMaterial color="#a07850" roughness={0.9} />
      </mesh>
      <group ref={patos} userData={VIVO}>
        {[0, 1, 2, 3].map((i) => (
          <group key={i} scale={i === 0 ? 1.2 : 0.8}>
            <mesh position={[0, 0.12, 0]}>
              <sphereGeometry args={[0.32, 10, 8]} />
              <meshStandardMaterial color={i === 0 ? "#f1faee" : "#e9d8a6"} />
            </mesh>
            <mesh position={[0.26, 0.38, 0]}>
              <sphereGeometry args={[0.17, 10, 8]} />
              <meshStandardMaterial color={i === 0 ? "#2d6a4f" : "#e9d8a6"} />
            </mesh>
            <mesh position={[0.44, 0.36, 0]}>
              <boxGeometry args={[0.16, 0.05, 0.1]} />
              <meshStandardMaterial color="#f4a261" />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

/* ---------- Jardim, bancos e bicicletário ---------- */

const CORES_FLOR = ["#e76f51", "#f4a261", "#e9c46a", "#ffafcc", "#cdb4db", "#ffffff"];

function Jardim() {
  const canteiros = useMemo(() => {
    const r = rng(77);
    const out: { x: number; z: number; w: number; d: number; cor: string }[] = [];
    for (let i = 0; i < 6; i++) {
      for (const lado of [-1, 1]) {
        out.push({ x: JARDIM.x + lado * 4.6, z: JARDIM.z - JARDIM.d / 2 + 3 + i * 5.6, w: 5.4, d: 3.6, cor: CORES_FLOR[Math.floor(r() * CORES_FLOR.length)]! });
      }
    }
    return out;
  }, []);
  return (
    <group>
      {canteiros.map((c, i) => (
        <group key={i} position={[c.x, 0, c.z]}>
          <mesh position={[0, 0.15, 0]} receiveShadow>
            <boxGeometry args={[c.w, 0.3, c.d]} />
            <meshStandardMaterial color="#6b4f3a" roughness={1} />
          </mesh>
          <mesh position={[0, 0.38, 0]} castShadow>
            <boxGeometry args={[c.w - 0.4, 0.25, c.d - 0.4]} />
            <meshStandardMaterial color={c.cor} roughness={0.9} flatShading />
          </mesh>
        </group>
      ))}
      {[-8, 8].map((dz) => (
        <group key={dz} position={[JARDIM.x - 1.8, 0, JARDIM.z + dz]} rotation={[0, Math.PI / 2, 0]}>
          <BancoParque />
        </group>
      ))}
    </group>
  );
}

function BancoParque() {
  return (
    <group>
      {[-0.15, 0, 0.15].map((z) => (
        <mesh key={z} position={[0, 0.48, z]} castShadow>
          <boxGeometry args={[2, 0.05, 0.12]} />
          <meshStandardMaterial color="#b98d62" />
        </mesh>
      ))}
      <mesh position={[0, 0.8, -0.24]} castShadow>
        <boxGeometry args={[2, 0.4, 0.05]} />
        <meshStandardMaterial color="#b98d62" />
      </mesh>
      {[-0.85, 0.85].map((x) => (
        <mesh key={x} position={[x, 0.24, 0]}>
          <boxGeometry args={[0.08, 0.48, 0.5]} />
          <meshStandardMaterial color="#2f343d" metalness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

function Bicicletario() {
  const x0 = PREDIO.xMax + 5.5;
  const z0 = PREDIO.zMax - 8;
  return (
    <group position={[x0, 0, z0]}>
      {[0, 1, 2, 3, 4].map((i) => (
        <group key={i} position={[0, 0, i * 1.1 - 2.2]}>
          <mesh position={[0, 0.45, 0]} rotation={[0, 0, Math.PI / 2]}>
            <torusGeometry args={[0.4, 0.04, 6, 16, Math.PI]} />
            <meshStandardMaterial color="#8d99ae" metalness={0.7} roughness={0.3} />
          </mesh>
          {i % 2 === 0 && (
            <group position={[0.2, 0, 0]}>
              {[-0.5, 0.5].map((x) => (
                <mesh key={x} position={[x, 0.35, 0]}>
                  <torusGeometry args={[0.33, 0.035, 6, 18]} />
                  <meshStandardMaterial color="#1f2430" />
                </mesh>
              ))}
              <mesh position={[0, 0.55, 0]} rotation={[0, 0, 0.2]}>
                <boxGeometry args={[1, 0.06, 0.06]} />
                <meshStandardMaterial color={["#e63946", "#2a9d8f", "#e9c46a"][i / 2]} />
              </mesh>
            </group>
          )}
        </group>
      ))}
    </group>
  );
}

/* ---------- Árvores (instancing) ---------- */

function livreParaArvore(x: number, z: number) {
  const { xMin, xMax, zMin, zMax } = PREDIO;
  if (x > xMin - 9 && x < xMax + 9 && z > zMin - 9 && z < zMax + 26) return false; // prédio, praça, rua
  if (z > zMax + 6 && z < zMax + 27) return false; // rua em toda a extensão
  if (((x - LAGO.x) / (LAGO.rx + 5)) ** 2 + ((z - LAGO.z) / (LAGO.rz + 5)) ** 2 < 1) return false;
  if (Math.abs(x - JARDIM.x) < JARDIM.w / 2 + 3 && Math.abs(z - JARDIM.z) < JARDIM.d / 2 + 4) return false;
  if (Math.abs(z - (zMin - 14)) < 3) return false; // trilha
  return true;
}

function Arvores() {
  const tronco = useRef<InstancedMesh>(null);
  const copa = useRef<InstancedMesh>(null);
  const topo = useRef<InstancedMesh>(null);
  const arvores = useMemo(() => {
    const r = rng(2026);
    const out: { x: number; z: number; s: number; cor: Color }[] = [];
    const verdes = ["#4f8f4b", "#5fa35a", "#468a42", "#6cb565", "#3f7d3c", "#78a85f"];
    for (let tent = 0; out.length < 340 && tent < 4000; tent++) {
      const x = -190 + r() * 380;
      const z = -170 + r() * 300;
      if (!livreParaArvore(x, z)) continue;
      out.push({ x, z, s: 0.8 + r() * 0.9, cor: new Color(verdes[Math.floor(r() * verdes.length)]!) });
    }
    return out;
  }, []);

  useLayoutEffect(() => {
    const o = new Object3D();
    arvores.forEach((a, i) => {
      o.position.set(a.x, 1.1 * a.s, a.z);
      o.scale.setScalar(a.s);
      o.rotation.set(0, i, 0);
      o.updateMatrix();
      tronco.current?.setMatrixAt(i, o.matrix);
      o.position.set(a.x, 3.1 * a.s, a.z);
      o.updateMatrix();
      copa.current?.setMatrixAt(i, o.matrix);
      copa.current?.setColorAt(i, a.cor);
      o.position.set(a.x, 4.4 * a.s, a.z);
      o.scale.setScalar(a.s * 0.68);
      o.updateMatrix();
      topo.current?.setMatrixAt(i, o.matrix);
      topo.current?.setColorAt(i, a.cor.clone().offsetHSL(0, 0, 0.06));
    });
    for (const m of [tronco, copa, topo]) {
      if (!m.current) continue;
      m.current.instanceMatrix.needsUpdate = true;
      if (m.current.instanceColor) m.current.instanceColor.needsUpdate = true;
    }
  }, [arvores]);

  return (
    <group>
      <instancedMesh ref={tronco} args={[undefined, undefined, arvores.length]} castShadow>
        <cylinderGeometry args={[0.18, 0.28, 2.2, 6]} />
        <meshStandardMaterial color="#7a5638" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={copa} args={[undefined, undefined, arvores.length]} castShadow>
        <icosahedronGeometry args={[1.7, 0]} />
        <meshStandardMaterial flatShading roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={topo} args={[undefined, undefined, arvores.length]} castShadow>
        <icosahedronGeometry args={[1.7, 0]} />
        <meshStandardMaterial flatShading roughness={0.9} />
      </instancedMesh>
    </group>
  );
}

/* ---------- Cidade no horizonte (instancing; janelas acendem à noite) ---------- */

function texturaJanelas() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  const r = rng(9);
  const dia = document.createElement("canvas");
  dia.width = 64;
  dia.height = 128;
  const dctx = dia.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, 64, 128);
  dctx.fillStyle = "#ffffff";
  dctx.fillRect(0, 0, 64, 128);
  for (let y = 4; y < 124; y += 8) {
    for (let x = 4; x < 60; x += 8) {
      dctx.fillStyle = "#9fb0c4";
      dctx.fillRect(x, y, 5, 5);
      if (r() < 0.45) {
        ctx.fillStyle = r() < 0.8 ? "#ffd98a" : "#cfe8ff";
        ctx.fillRect(x, y, 5, 5);
      }
    }
  }
  const mapa = (cv: HTMLCanvasElement) => {
    const t = new CanvasTexture(cv);
    t.colorSpace = SRGBColorSpace;
    t.wrapS = t.wrapT = RepeatWrapping;
    return t;
  };
  return { dia: mapa(dia), noite: mapa(c) };
}

function Cidade() {
  const malha = useRef<InstancedMesh>(null);
  const mat = useRef<MeshStandardMaterial>(null);
  const noite = useNoite();
  const tex = useMemo(texturaJanelas, []);
  const predios = useMemo(() => {
    const r = rng(314);
    const tons = ["#c9ccd3", "#b8bec9", "#d8d2c6", "#a9b3bf", "#cfc6bb", "#9aa5b1"];
    const out: { x: number; z: number; w: number; d: number; h: number; cor: Color }[] = [];
    // Três camadas: perto (mais baixas), meio e fundo (as mais altas), como no horizonte de uma cidade.
    const camadas = [
      { z: -270, n: 40, hMin: 14, hMax: 38 },
      { z: -330, n: 46, hMin: 24, hMax: 64 },
      { z: -390, n: 50, hMin: 35, hMax: 100 },
    ];
    for (const c of camadas) {
      for (let i = 0; i < c.n; i++) {
        const x = -420 + (i / c.n) * 840 + r() * 8;
        out.push({
          x, z: c.z + r() * 20, w: 9 + r() * 12, d: 9 + r() * 12, h: c.hMin + r() * (c.hMax - c.hMin),
          cor: new Color(tons[Math.floor(r() * tons.length)]!),
        });
      }
    }
    return out;
  }, []);

  useLayoutEffect(() => {
    const o = new Object3D();
    predios.forEach((p, i) => {
      o.position.set(p.x, p.h / 2, p.z);
      o.scale.set(p.w, p.h, p.d);
      o.updateMatrix();
      malha.current?.setMatrixAt(i, o.matrix);
      malha.current?.setColorAt(i, p.cor);
    });
    if (malha.current) {
      malha.current.instanceMatrix.needsUpdate = true;
      if (malha.current.instanceColor) malha.current.instanceColor.needsUpdate = true;
    }
  }, [predios]);

  useEffect(() => {
    if (mat.current) mat.current.emissiveIntensity = noite * 1.6;
  }, [noite]);

  return (
    <instancedMesh ref={malha} args={[undefined, undefined, predios.length]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial ref={mat} map={tex.dia} emissiveMap={tex.noite} emissive="#ffffff" emissiveIntensity={0} roughness={0.8} />
    </instancedMesh>
  );
}
