import { useMemo, useState } from "react";
import { PerformanceMonitor } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { agentById, CORREDOR, corredoresZ, deskSpots, ENTRADA, OFFICE_SIZE, PREDIO, roomRectById, roomRects } from "@empresa/org";
import { useStore } from "../store.ts";
import { CameraRig } from "./CameraRig.tsx";
import { RoomMesh } from "./RoomMesh.tsx";
import { AgentActor, Workstation } from "./Avatar.tsx";
import { Plant } from "./Furniture.tsx";
import { TallPlant } from "./Props.tsx";
import { Paredes } from "./Paredes.tsx";
import { AreasComuns } from "./AreasComuns.tsx";
import { Ambiente } from "./Ambiente.tsx";
import { Exterior } from "./Exterior.tsx";
import { Mesclado } from "./Mesclado.tsx";
import { Corpos } from "./Corpos.tsx";
import { PortasAutomaticas } from "./Interativos.tsx";
import { Byte } from "./Byte.tsx";
import { SonsDoEscritorio } from "./SonsDoEscritorio.tsx";
import { madeira, porcelanato } from "./textures.ts";

export function Office() {
  const visaoGeral = useStore((s) => s.visaoGeral);
  // Qualidade automática (DESIGN-ESCRITORIO.md, seção 13): se o FPS cai, a resolução baixa; se sobra folga, sobe.
  const [dpr, setDpr] = useState(() => Math.min(2, window.devicePixelRatio || 1));
  const { largura, profundidade } = OFFICE_SIZE;

  const pisoPredio = useMemo(() => {
    const t = madeira("#c7a27a").clone();
    t.repeat.set(largura / 5, profundidade / 5);
    t.needsUpdate = true;
    return t;
  }, [largura, profundidade]);
  const praca = useMemo(() => {
    const t = porcelanato("#d6d0c4").clone();
    t.repeat.set((largura + 8) / 3, 3);
    t.needsUpdate = true;
    return t;
  }, [largura]);

  return (
    <Canvas shadows dpr={dpr} camera={{ fov: 40, near: 0.5, far: 900, position: [0, 70, 45] }}>
      <PerformanceMonitor
        onDecline={() => setDpr((d) => Math.max(0.75, Math.round((d - 0.25) * 100) / 100))}
        onIncline={() => setDpr((d) => Math.min(Math.min(2, window.devicePixelRatio || 1), Math.round((d + 0.25) * 100) / 100))}
        flipflops={4}
        onFallback={() => setDpr(1)}
      />
      <color attach="background" args={["#e9e4da"]} />
      {/* Luz, céu, neblina e estrelas seguem a hora do Mac (ou "sempre dia"/"sempre noite" no menu ⋯). */}
      <Ambiente />

      <CameraRig />
      {import.meta.env.DEV && <ExporRenderer />}

      {/* Parque, lago, rua e a cidade no horizonte */}
      <Mesclado>
        <Exterior />
      </Mesclado>

      {/* Piso do prédio (corredores em madeira). Clicar aqui volta para a visão geral. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.005, 0]}
        receiveShadow
        onClick={(e) => {
          if (e.delta > 4) return;
          visaoGeral();
        }}
      >
        <planeGeometry args={[largura, profundidade]} />
        <meshStandardMaterial map={pisoPredio} roughness={0.85} />
      </mesh>

      {/* Praça da entrada */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, PREDIO.zMax + 4]} receiveShadow>
        <planeGeometry args={[largura + 8, 8]} />
        <meshStandardMaterial map={praca} roughness={1} />
      </mesh>

      {/* Tudo o que não se mexe é mesclado em poucos desenhos (o que anima ou é clicável fica de fora). */}
      <Mesclado>
        <Corredores />
        <Paredes />
        <AreasComuns />
        {roomRects.map((r) => (
          <RoomMesh key={r.id} rect={r} />
        ))}
        {deskSpots.map((d) => (
          <Workstation key={d.agenteId} agent={agentById[d.agenteId]!} x={d.x} z={d.z} />
        ))}
      </Mesclado>
      {deskSpots.map((d) => (
        <AgentActor key={d.agenteId} agent={agentById[d.agenteId]!} />
      ))}
      {/* Portas de vidro das salas: abrem sozinhas quando alguém chega perto. */}
      <PortasAutomaticas />
      {/* Corpos de todos os agentes em poucas malhas instanciadas (depois dos agentes: roda depois deles a cada quadro). */}
      <Corpos />
      <Byte />
      <SonsDoEscritorio />

      {/* Plantas altas nos cantos do prédio e vasos na praça (sem tapar a entrada) */}
      <Mesclado>
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <group key={`${sx}${sz}`} position={[sx * (largura / 2 + 1.4), 0, sz * (profundidade / 2 + 1.4)]}>
            <TallPlant seed={sx * 10 + sz} />
          </group>
        )),
      )}
      {Array.from({ length: 11 }, (_, i) => (i - 5) * 7.5)
        .filter((x) => Math.abs(x - ENTRADA.x) > 4)
        .map((x) => (
          <group key={x} position={[x, 0, PREDIO.zMax + 7.2]}>
            <Plant escala={1.5} />
          </group>
        ))}
      </Mesclado>
    </Canvas>
  );
}

/** Passadeiras nos corredores e as setas do fluxo do código no chão. */
function Corredores() {
  const r = roomRectById;
  const xLateralLeste = PREDIO.xMax - 1.5;
  // Corredor 1: Produto → Design → Arquitetura (para o leste); desce pelo corredor lateral;
  // corredor 2: Desenvolvimento → Code Review → Segurança → QA → Docs (para o oeste).
  const ida = setas(r.produto.x, xLateralLeste, corredoresZ[0]!, 1);
  const descida = setasVerticais(xLateralLeste, corredoresZ[0]! + 2, corredoresZ[1]! - 2);
  const volta = setas(xLateralLeste - 2.5, r.docs.x, corredoresZ[1]!, -1);
  return (
    <group>
      {corredoresZ.map((z) => (
        <mesh key={z} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, z]} receiveShadow>
          <planeGeometry args={[PREDIO.xMax - PREDIO.xMin - 6.4, CORREDOR * 0.42]} />
          <meshStandardMaterial color="#a8927a" roughness={1} />
        </mesh>
      ))}
      {[...ida, ...descida, ...volta].map((s, i) => (
        <Seta key={i} x={s.x} z={s.z} rot={s.rot} />
      ))}
    </group>
  );
}

function setas(xDe: number, xAte: number, z: number, sentido: 1 | -1) {
  const out: { x: number; z: number; rot: number }[] = [];
  for (let x = xDe; sentido > 0 ? x <= xAte : x >= xAte; x += 3 * sentido) out.push({ x, z, rot: sentido > 0 ? 0 : Math.PI });
  return out;
}

function setasVerticais(x: number, zDe: number, zAte: number) {
  const out: { x: number; z: number; rot: number }[] = [];
  for (let z = zDe; z <= zAte; z += 3) out.push({ x, z, rot: -Math.PI / 2 });
  return out;
}

/** Seta pintada no chão (aponta para +x quando rot = 0). */
function Seta({ x, z, rot }: { x: number; z: number; rot: number }) {
  return (
    <group position={[x, 0.016, z]} rotation={[-Math.PI / 2, 0, rot]}>
      <mesh position={[-0.25, 0, 0]}>
        <planeGeometry args={[0.7, 0.16]} />
        <meshBasicMaterial color="#2a9d8f" transparent opacity={0.6} depthWrite={false} />
      </mesh>
      <mesh position={[0.2, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <circleGeometry args={[0.32, 3]} />
        <meshBasicMaterial color="#2a9d8f" transparent opacity={0.6} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Só em desenvolvimento: deixa o renderer acessível no console para medir desempenho. */
function ExporRenderer() {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  Object.assign(window as object, { __gl: gl, __camera: camera });
  return null;
}
