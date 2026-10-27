import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { MeshStandardMaterial } from "three";
import { useCeu } from "./ceu.ts";
import { VIVO } from "./Mesclado.tsx";

// Móveis low-poly feitos só com primitivas: sem modelos externos, carrega na hora.

const MADEIRA = "#c89f72";
const MADEIRA_ESCURA = "#8a6a4a";
const METAL = "#3a3f4b";

/** Mesa com monitor. O monitor fica de costas para a câmera (o agente olha para ela). */
export function Desk({ ligado, corTela, duplo = false }: { ligado: boolean; corTela: string; duplo?: boolean }) {
  const tela = useRef<MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    if (!tela.current) return;
    // À noite as telas ligadas brilham mais, como num escritório de verdade depois que escurece.
    const noite = useCeu.getState().noite;
    tela.current.emissiveIntensity = ligado ? (0.9 + Math.sin(clock.elapsedTime * 3) * 0.15) * (1 + noite * 0.8) : 0.08 + noite * 0.1;
  });
  return (
    <group>
      <mesh position={[0, 0.74, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.7, 0.08, 0.85]} />
        <meshStandardMaterial color={MADEIRA} roughness={0.8} />
      </mesh>
      {[-0.75, 0.75].map((x) => (
        <mesh key={x} position={[x, 0.36, 0]} castShadow>
          <boxGeometry args={[0.07, 0.72, 0.75]} />
          <meshStandardMaterial color={MADEIRA_ESCURA} />
        </mesh>
      ))}
      {/* Monitor */}
      <group position={[0, 0.78, 0.2]}>
        <mesh position={[0, 0.06, 0]}>
          <boxGeometry args={[0.28, 0.03, 0.18]} />
          <meshStandardMaterial color={METAL} />
        </mesh>
        <mesh position={[0, 0.2, 0]}>
          <boxGeometry args={[0.05, 0.28, 0.05]} />
          <meshStandardMaterial color={METAL} />
        </mesh>
        <mesh position={[0, 0.42, 0]} castShadow>
          <boxGeometry args={[0.85, 0.5, 0.05]} />
          <meshStandardMaterial color="#20242c" />
        </mesh>
        <mesh position={[0, 0.42, -0.03]} userData={VIVO}>
          <planeGeometry args={[0.78, 0.43]} />
          <meshStandardMaterial ref={tela} color="#0b1020" emissive={corTela} emissiveIntensity={0.08} side={2} />
        </mesh>
      </group>
      {/* Segundo monitor (Desenvolvimento e Code Review), virado um pouco para dentro */}
      {duplo && (
        <group position={[0.62, 0.78, 0.12]} rotation={[0, -0.45, 0]}>
          <mesh position={[0, 0.2, 0]}>
            <boxGeometry args={[0.05, 0.28, 0.05]} />
            <meshStandardMaterial color={METAL} />
          </mesh>
          <mesh position={[0, 0.42, 0]} castShadow>
            <boxGeometry args={[0.6, 0.4, 0.05]} />
            <meshStandardMaterial color="#20242c" />
          </mesh>
          <mesh position={[0, 0.42, -0.03]}>
            <planeGeometry args={[0.54, 0.34]} />
            <meshStandardMaterial color="#0b1020" emissive="#3b5b8c" emissiveIntensity={0.5} side={2} />
          </mesh>
        </group>
      )}
      {/* Teclado */}
      <mesh position={[0, 0.79, -0.15]}>
        <boxGeometry args={[0.55, 0.02, 0.17]} />
        <meshStandardMaterial color="#e8e8ea" />
      </mesh>
    </group>
  );
}

export function Chair({ cor = "#4a5160" }: { cor?: string }) {
  return (
    <group>
      <mesh position={[0, 0.46, 0]} castShadow>
        <boxGeometry args={[0.55, 0.08, 0.55]} />
        <meshStandardMaterial color={cor} />
      </mesh>
      <mesh position={[0, 0.85, -0.25]} castShadow>
        <boxGeometry args={[0.55, 0.7, 0.08]} />
        <meshStandardMaterial color={cor} />
      </mesh>
      <mesh position={[0, 0.22, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 0.44, 6]} />
        <meshStandardMaterial color={METAL} />
      </mesh>
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.28, 0.28, 0.05, 8]} />
        <meshStandardMaterial color={METAL} />
      </mesh>
    </group>
  );
}

export function Plant({ escala = 1 }: { escala?: number }) {
  return (
    <group scale={escala}>
      <mesh position={[0, 0.25, 0]} castShadow>
        <cylinderGeometry args={[0.28, 0.22, 0.5, 8]} />
        <meshStandardMaterial color="#d97b4f" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.85, 0]} castShadow>
        <icosahedronGeometry args={[0.5, 0]} />
        <meshStandardMaterial color="#5f9e5a" flatShading />
      </mesh>
      <mesh position={[0.15, 1.2, 0.05]} castShadow>
        <icosahedronGeometry args={[0.32, 0]} />
        <meshStandardMaterial color="#76b46f" flatShading />
      </mesh>
    </group>
  );
}

export function Whiteboard({ largura = 2.6 }: { largura?: number }) {
  return (
    <group>
      <mesh position={[0, 1.55, 0]} castShadow>
        <boxGeometry args={[largura, 1.1, 0.06]} />
        <meshStandardMaterial color="#fbfbf8" />
      </mesh>
      {[-0.6, -0.3, 0, 0.3].map((y, i) => (
        <mesh key={y} position={[-largura / 2 + 0.3 + (i % 2) * 0.2 + (largura * 0.25), 1.55 + y * 0.6 + 0.2, 0.035]}>
          <planeGeometry args={[largura * (0.3 + (i % 3) * 0.12), 0.05]} />
          <meshBasicMaterial color={["#3b82f6", "#ef4444", "#10b981", "#f59e0b"][i]} />
        </mesh>
      ))}
    </group>
  );
}

export function MeetingTable({ largura, profundidade }: { largura: number; profundidade: number }) {
  const lugares = Math.max(2, Math.floor(largura / 1.3));
  return (
    <group>
      <mesh position={[0, 0.74, 0]} castShadow receiveShadow>
        <boxGeometry args={[largura, 0.1, profundidade]} />
        <meshStandardMaterial color={MADEIRA} roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.36, 0]} castShadow>
        <boxGeometry args={[largura * 0.6, 0.7, profundidade * 0.4]} />
        <meshStandardMaterial color={MADEIRA_ESCURA} />
      </mesh>
      {Array.from({ length: lugares }, (_, i) => {
        const x = (i - (lugares - 1) / 2) * (largura / lugares);
        return (
          <group key={i}>
            <group position={[x, 0, -profundidade / 2 - 0.55]}>
              <Chair cor="#6b5b4b" />
            </group>
            <group position={[x, 0, profundidade / 2 + 0.55]} rotation={[0, Math.PI, 0]}>
              <Chair cor="#6b5b4b" />
            </group>
          </group>
        );
      })}
    </group>
  );
}

export function Sofa({ cor = "#7a8fb0" }: { cor?: string }) {
  return (
    <group>
      <mesh position={[0, 0.3, 0]} castShadow>
        <boxGeometry args={[2.2, 0.4, 0.9]} />
        <meshStandardMaterial color={cor} />
      </mesh>
      <mesh position={[0, 0.65, -0.35]} castShadow>
        <boxGeometry args={[2.2, 0.6, 0.2]} />
        <meshStandardMaterial color={cor} />
      </mesh>
      {[-1.05, 1.05].map((x) => (
        <mesh key={x} position={[x, 0.5, 0]} castShadow>
          <boxGeometry args={[0.2, 0.5, 0.9]} />
          <meshStandardMaterial color={cor} />
        </mesh>
      ))}
    </group>
  );
}
