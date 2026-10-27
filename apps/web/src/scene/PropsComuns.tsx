import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { CanvasTexture, SRGBColorSpace, type Group } from "three";
import { VIVO } from "./Mesclado.tsx";

// Móveis das áreas comuns (copa, lounge, átrio, recepção). Mesma convenção dos
// outros objetos: origem no centro do item, no chão; frente para +z.

type V3 = [number, number, number];

function Caixa({ pos, size, cor, sombra = false, rough = 0.8, metal = 0 }: {
  pos: V3; size: V3; cor: string; sombra?: boolean; rough?: number; metal?: number;
}) {
  return (
    <mesh position={pos} castShadow={sombra} receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={cor} roughness={rough} metalness={metal} />
    </mesh>
  );
}

export function Geladeira() {
  return (
    <group>
      <Caixa pos={[0, 1.0, 0]} size={[0.9, 2.0, 0.8]} cor="#e9edf1" rough={0.35} metal={0.3} sombra />
      <Caixa pos={[0, 1.32, 0.405]} size={[0.86, 0.01, 0.01]} cor="#9aa6b2" />
      {[1.65, 0.85].map((y) => (
        <Caixa key={y} pos={[0.36, y, 0.42]} size={[0.04, 0.35, 0.04]} cor="#7d8794" metal={0.6} />
      ))}
    </group>
  );
}

export function Pebolim() {
  return (
    <group>
      <Caixa pos={[0, 0.82, 0]} size={[1.4, 0.18, 0.78]} cor="#2b6a3a" sombra />
      <Caixa pos={[0, 0.92, 0]} size={[1.44, 0.04, 0.82]} cor="#7d5c41" />
      {[-0.6, 0.6].map((x) =>
        [-0.32, 0.32].map((z) => <Caixa key={`${x}${z}`} pos={[x, 0.37, z]} size={[0.08, 0.74, 0.08]} cor="#5b4636" />),
      )}
      {[-0.45, -0.15, 0.15, 0.45].map((x, i) => (
        <group key={x}>
          <mesh position={[x, 0.98, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.012, 0.012, 1.2, 6]} />
            <meshStandardMaterial color="#c0c0c0" metalness={0.8} roughness={0.3} />
          </mesh>
          {[-0.2, 0, 0.2].map((z) => (
            <Caixa key={z} pos={[x, 0.95, z]} size={[0.05, 0.12, 0.04]} cor={i % 2 ? "#d62828" : "#1d3557"} />
          ))}
        </group>
      ))}
    </group>
  );
}

export function Sinuca() {
  return (
    <group>
      <Caixa pos={[0, 0.78, 0]} size={[2.4, 0.1, 1.3]} cor="#1f6f43" rough={1} sombra />
      {[-1.25, 1.25].map((x) => <Caixa key={x} pos={[x, 0.8, 0]} size={[0.12, 0.16, 1.42]} cor="#6b4a2e" />)}
      {[-0.68, 0.68].map((z) => <Caixa key={z} pos={[0, 0.8, z]} size={[2.62, 0.16, 0.12]} cor="#6b4a2e" />)}
      {[-1.05, 1.05].map((x) => [-0.5, 0.5].map((z) => <Caixa key={`${x}${z}`} pos={[x, 0.36, z]} size={[0.16, 0.72, 0.16]} cor="#5b3f27" />))}
      {[["#f8f8f2", -0.6, 0.1], ["#e63946", 0.4, -0.15], ["#ffb703", 0.55, 0.1], ["#023047", 0.7, -0.05], ["#2a9d8f", 0.3, 0.2]].map(([c, x, z]) => (
        <mesh key={c as string} position={[x as number, 0.87, z as number]}>
          <sphereGeometry args={[0.04, 10, 8]} />
          <meshStandardMaterial color={c as string} roughness={0.2} />
        </mesh>
      ))}
    </group>
  );
}

/** Árvore do átrio: canteiro redondo, tronco e copa low-poly. */
export function Arvore() {
  const copa = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (copa.current) copa.current.rotation.z = Math.sin(clock.elapsedTime * 0.6) * 0.015;
  });
  return (
    <group>
      <mesh position={[0, 0.25, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.6, 1.7, 0.5, 20]} />
        <meshStandardMaterial color="#cfc6b6" roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.51, 0]}>
        <cylinderGeometry args={[1.45, 1.45, 0.04, 20]} />
        <meshStandardMaterial color="#5a4632" roughness={1} />
      </mesh>
      <mesh position={[0, 1.9, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.26, 2.8, 8]} />
        <meshStandardMaterial color="#7a5638" roughness={0.9} />
      </mesh>
      <group ref={copa} position={[0, 3.6, 0]} userData={VIVO}>
        {[
          [0, 0.4, 0, 1.6, "#4f8f4b"],
          [0.9, -0.1, 0.3, 1.1, "#5fa35a"],
          [-0.8, 0, -0.4, 1.2, "#468a42"],
          [0.2, -0.2, -0.9, 1.0, "#6cb565"],
          [-0.3, 0.9, 0.5, 0.9, "#78c06f"],
        ].map(([x, y, z, r, c], i) => (
          <mesh key={i} position={[x as number, y as number, z as number]} castShadow>
            <icosahedronGeometry args={[r as number, 0]} />
            <meshStandardMaterial color={c as string} flatShading roughness={0.9} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** Banco de ripas (comprido no eixo x; gire para alinhar). */
export function Banco() {
  return (
    <group>
      {[-0.17, 0, 0.17].map((z) => <Caixa key={z} pos={[0, 0.45, z]} size={[1.8, 0.05, 0.13]} cor="#b98d62" sombra />)}
      {[-0.75, 0.75].map((x) => <Caixa key={x} pos={[x, 0.22, 0]} size={[0.08, 0.44, 0.48]} cor="#3a3f4b" metal={0.4} />)}
    </group>
  );
}

/** Balcão da recepção com monitor (frente voltada para a entrada, ao sul). */
export function BalcaoRecepcao({ cor = "#8ecae6" }: { cor?: string }) {
  return (
    <group>
      <Caixa pos={[0, 0.55, 0]} size={[4.2, 1.1, 0.9]} cor="#f4f1ea" sombra />
      <Caixa pos={[0, 1.12, 0]} size={[4.3, 0.06, 1.0]} cor="#b98d62" />
      <Caixa pos={[0, 0.55, 0.455]} size={[4.0, 0.12, 0.01]} cor={cor} />
      <group position={[0.8, 1.15, -0.15]}>
        <Caixa pos={[0, 0.25, 0]} size={[0.6, 0.38, 0.04]} cor="#20242c" />
        <Caixa pos={[0, 0.03, 0]} size={[0.2, 0.06, 0.15]} cor="#3a3f4b" />
      </group>
    </group>
  );
}

/** Aquário com móvel e peixes nadando. */
export function Aquario() {
  const peixes = useRef<Group>(null);
  const dados = useMemo(
    () => Array.from({ length: 7 }, (_, i) => ({ fase: i * 1.7, y: 1.05 + (i % 3) * 0.2, cor: ["#ff8c42", "#ffd166", "#06d6a0", "#ef476f", "#118ab2"][i % 5]! })),
    [],
  );
  useFrame(({ clock }) => {
    peixes.current?.children.forEach((p, i) => {
      const d = dados[i]!;
      const t = clock.elapsedTime * 0.4 + d.fase;
      p.position.set(Math.sin(t) * 1.25, d.y + Math.sin(t * 2.3) * 0.04, Math.cos(t * 1.3) * 0.18);
      p.rotation.y = Math.cos(t) > 0 ? 0 : Math.PI;
    });
  });
  return (
    <group>
      <Caixa pos={[0, 0.4, 0]} size={[3.0, 0.8, 0.8]} cor="#3a3f4b" sombra />
      <mesh position={[0, 1.25, 0]} renderOrder={2}>
        <boxGeometry args={[2.95, 0.9, 0.7]} />
        <meshStandardMaterial color="#5fb3d9" transparent opacity={0.35} roughness={0.05} depthWrite={false} />
      </mesh>
      <Caixa pos={[0, 0.83, 0]} size={[2.9, 0.06, 0.65]} cor="#e9d8a6" />
      <group ref={peixes} userData={VIVO}>
        {dados.map((d, i) => (
          <mesh key={i}>
            <boxGeometry args={[0.12, 0.06, 0.03]} />
            <meshStandardMaterial color={d.cor} emissive={d.cor} emissiveIntensity={0.3} />
          </mesh>
        ))}
      </group>
      <Caixa pos={[0, 1.72, 0]} size={[3.0, 0.05, 0.75]} cor="#20242c" />
    </group>
  );
}

function texturaTexto(desenhar: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, w = 512, h = 512) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  desenhar(c.getContext("2d")!, w, h);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Logo da empresa no piso da recepção. */
export function LogoPiso() {
  const tex = useMemo(
    () =>
      texturaTexto((ctx, w, h) => {
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = "#1f2430";
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, w / 2 - 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#f59e0b";
        ctx.lineWidth = 14;
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, w / 2 - 30, 0, Math.PI * 2);
        ctx.stroke();
        // Logo do Hefesto (mesmos traços de public/hefesto.svg, desenhado em 512×512).
        const s = (w * 0.62) / 512;
        ctx.save();
        ctx.translate(w / 2 - 242 * s, h / 2 - 232 * s);
        ctx.scale(s, s);
        ctx.fillStyle = "#fbbf24";
        ctx.fill(new Path2D("M300 64 Q307 133 370 142 Q307 151 300 220 Q293 151 230 142 Q293 133 300 64 Z"));
        ctx.beginPath();
        ctx.arc(386, 86, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#f97316";
        ctx.beginPath();
        ctx.arc(214, 96, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#f6f2ea";
        ctx.fill(new Path2D("M76 230 H408 V276 Q408 290 394 290 H354 Q326 298 322 330 V346 H368 Q382 346 382 360 V400 H130 V360 Q130 346 144 346 H190 V330 Q186 300 156 292 Q100 278 76 230 Z"));
        ctx.restore();
      }),
    [],
  );
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
      <circleGeometry args={[1.8, 48]} />
      <meshStandardMaterial map={tex} transparent roughness={0.6} />
    </mesh>
  );
}
