import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group, Mesh, MeshStandardMaterial } from "three";
import { arte, manchaDeLuz, rng, tela, tapete } from "./textures.ts";
import { useNoite } from "./Ambiente.tsx";
import { VIVO } from "./Mesclado.tsx";

// Objetos de decoração. Convenção: origem no chão, frente virada para +z
// (ou seja, para dentro da sala quando encostado na parede do fundo).

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

/* ---------- Parede ---------- */

export function PictureFrame({ seed, w = 1.1, h = 0.8, moldura = "#2b2b2b" }: { seed: number; w?: number; h?: number; moldura?: string }) {
  const tex = useMemo(() => arte(seed), [seed]);
  return (
    <group>
      <Caixa pos={[0, 0, 0.02]} size={[w + 0.12, h + 0.12, 0.04]} cor={moldura} />
      <mesh position={[0, 0, 0.045]}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial map={tex} roughness={0.6} />
      </mesh>
    </group>
  );
}

export function WallClock() {
  const ponteiro = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (ponteiro.current) ponteiro.current.rotation.z = -clock.elapsedTime * 0.5;
  });
  return (
    <group>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.03]}>
        <cylinderGeometry args={[0.28, 0.28, 0.05, 24]} />
        <meshStandardMaterial color="#2b2b2b" />
      </mesh>
      <mesh position={[0, 0, 0.06]}>
        <circleGeometry args={[0.24, 24]} />
        <meshStandardMaterial color="#fbfaf6" />
      </mesh>
      <mesh ref={ponteiro} position={[0, 0, 0.07]} userData={VIVO}>
        <boxGeometry args={[0.02, 0.36, 0.01]} />
        <meshBasicMaterial color="#d62828" />
      </mesh>
      <mesh position={[0.06, 0.03, 0.07]} rotation={[0, 0, -1]}>
        <boxGeometry args={[0.03, 0.16, 0.01]} />
        <meshBasicMaterial color="#1b1b1b" />
      </mesh>
    </group>
  );
}

/** Arandela: luminária de parede com brilho e mancha de luz. */
export function WallSconce() {
  return (
    <group>
      <Caixa pos={[0, 0, 0.05]} size={[0.12, 0.25, 0.1]} cor="#3a3f4b" metal={0.5} />
      <mesh position={[0, 0.12, 0.14]}>
        <cylinderGeometry args={[0.13, 0.08, 0.2, 12, 1, true]} />
        <meshStandardMaterial color="#f7e7c6" emissive="#ffd38a" emissiveIntensity={1.2} side={2} />
      </mesh>
    </group>
  );
}

export function WallShelf({ seed, largura = 1.6 }: { seed: number; largura?: number }) {
  const livros = useMemo(() => montarLivros(seed, largura - 0.2), [seed, largura]);
  return (
    <group>
      <Caixa pos={[0, 0, 0.14]} size={[largura, 0.05, 0.28]} cor="#8a6a4a" sombra />
      {livros.map((l, i) => (
        <Caixa key={i} pos={[l.x, 0.025 + l.h / 2, 0.14]} size={[l.w, l.h, 0.2]} cor={l.cor} />
      ))}
    </group>
  );
}

export function WallTV({ tipo, cor, w = 2.4 }: { tipo: "grafico" | "codigo" | "monitoramento"; cor: string; w?: number }) {
  const tex = useMemo(() => tela(tipo, cor), [tipo, cor]);
  const h = w * 0.5625;
  return (
    <group>
      <Caixa pos={[0, 0, 0.04]} size={[w + 0.1, h + 0.1, 0.06]} cor="#15171c" sombra />
      <mesh position={[0, 0, 0.075]}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial map={tex} emissiveMap={tex} emissive="#ffffff" emissiveIntensity={0.9} />
      </mesh>
    </group>
  );
}

export function KanbanBoard({ seed, w = 2.8 }: { seed: number; w?: number }) {
  const notas = useMemo(() => {
    const r = rng(seed);
    const cores = ["#fde68a", "#fbcfe8", "#bfdbfe", "#bbf7d0", "#fed7aa"];
    const out: { x: number; y: number; cor: string; rot: number }[] = [];
    for (let col = 0; col < 4; col++)
      for (let i = 0; i < 2 + Math.floor(r() * 3); i++)
        out.push({ x: -w / 2 + 0.4 + col * ((w - 0.5) / 4), y: 0.35 - i * 0.24, cor: cores[Math.floor(r() * cores.length)]!, rot: (r() - 0.5) * 0.2 });
    return out;
  }, [seed, w]);
  return (
    <group>
      <Caixa pos={[0, 0, 0.03]} size={[w, 1.2, 0.05]} cor="#f8f6f0" sombra />
      <Caixa pos={[0, 0.6, 0.04]} size={[w + 0.08, 0.06, 0.07]} cor="#9aa1ad" />
      <Caixa pos={[0, -0.6, 0.04]} size={[w + 0.08, 0.06, 0.07]} cor="#9aa1ad" />
      {[1, 2, 3].map((c) => (
        <Caixa key={c} pos={[-w / 2 + c * (w / 4), 0, 0.06]} size={[0.015, 1.1, 0.01]} cor="#cbd0d8" />
      ))}
      {notas.map((n, i) => (
        <mesh key={i} position={[n.x + 0.1, n.y, 0.065]} rotation={[0, 0, n.rot]}>
          <planeGeometry args={[0.22, 0.2]} />
          <meshStandardMaterial color={n.cor} />
        </mesh>
      ))}
    </group>
  );
}

/** Letreiro de neon (barras emissivas) — o toque descolado do Marketing. */
export function NeonSign({ cor = "#ff4fa3" }: { cor?: string }) {
  const mat = useRef<MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    if (mat.current) mat.current.emissiveIntensity = 2.2 + Math.sin(clock.elapsedTime * 2) * 0.4;
  });
  const barras: [number, number, number, number][] = [
    [-0.7, 0.15, 0.5, 0], [-0.7, -0.15, 0.5, 0], [-0.95, 0, 0.32, Math.PI / 2],
    [-0.1, 0, 0.42, Math.PI / 2], [0.1, 0, 0.42, Math.PI / 2], [0, 0.15, 0.22, 0],
    [0.55, 0, 0.42, Math.PI / 2], [0.8, 0.15, 0.5, 0], [0.8, -0.15, 0.5, 0],
  ];
  return (
    <group>
      <Caixa pos={[0, 0, 0.02]} size={[2.4, 0.7, 0.03]} cor="#1a1a22" />
      {barras.map(([x, y, l, r], i) => (
        <mesh key={i} position={[x, y, 0.06]} rotation={[0, 0, r]} userData={VIVO}>
          <boxGeometry args={[l, 0.045, 0.03]} />
          <meshStandardMaterial ref={i === 0 ? mat : undefined} color={cor} emissive={cor} emissiveIntensity={2.2} />
        </mesh>
      ))}
    </group>
  );
}

/* ---------- Piso ---------- */

export function Rug({ w, d, base, detalhe, seed }: { w: number; d: number; base: string; detalhe: string; seed: number }) {
  const tex = useMemo(() => tapete(base, detalhe, seed), [base, detalhe, seed]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.045, 0]} receiveShadow>
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial map={tex} roughness={1} />
    </mesh>
  );
}

export function LightPool({ raio = 2.2, intensidade = 0.5 }: { raio?: number; intensidade?: number }) {
  const tex = useMemo(() => manchaDeLuz(), []);
  // À noite as luminárias "acendem": a mancha de luz no chão fica mais forte.
  const noite = useNoite();
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
      <planeGeometry args={[raio * 2, raio * 2]} />
      <meshBasicMaterial map={tex} transparent opacity={Math.min(1, intensidade * (1 + noite * 1.3))} depthWrite={false} />
    </mesh>
  );
}

export function FloorLamp() {
  return (
    <group>
      <LightPool raio={1.8} intensidade={0.55} />
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.22, 0.25, 0.05, 16]} />
        <meshStandardMaterial color="#2b2b2b" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.85, 0]}>
        <cylinderGeometry args={[0.025, 0.025, 1.65, 8]} />
        <meshStandardMaterial color="#2b2b2b" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0, 1.7, 0]} castShadow>
        <cylinderGeometry args={[0.18, 0.32, 0.38, 16, 1, true]} />
        <meshStandardMaterial color="#f3e3c3" emissive="#ffcf7a" emissiveIntensity={0.9} side={2} />
      </mesh>
    </group>
  );
}

/* ---------- Móveis ---------- */

interface Livro { x: number; w: number; h: number; cor: string }
function montarLivros(seed: number, largura: number): Livro[] {
  const r = rng(seed);
  const cores = ["#9b2226", "#005f73", "#ee9b00", "#0a9396", "#3d405b", "#81b29a", "#e07a5f", "#f2cc8f", "#6d597a"];
  const out: Livro[] = [];
  let x = -largura / 2;
  while (x < largura / 2 - 0.1) {
    if (r() < 0.12) { x += 0.15 + r() * 0.2; continue; }
    const w = 0.05 + r() * 0.05;
    out.push({ x: x + w / 2, w, h: 0.22 + r() * 0.12, cor: cores[Math.floor(r() * cores.length)]! });
    x += w + 0.005;
  }
  return out;
}

export function Bookcase({ seed, largura = 1.6 }: { seed: number; largura?: number }) {
  const prateleiras = useMemo(() => [0, 1, 2, 3].map((i) => montarLivros(seed + i * 17, largura - 0.15)), [seed, largura]);
  const H = 2.1;
  return (
    <group>
      <Caixa pos={[0, H / 2, 0.02]} size={[largura, H, 0.04]} cor="#6f5139" />
      {[-1, 1].map((s) => (
        <Caixa key={s} pos={[(s * largura) / 2, H / 2, 0.22]} size={[0.06, H, 0.44]} cor="#7d5c41" sombra />
      ))}
      {[0, 1, 2, 3, 4].map((i) => (
        <Caixa key={i} pos={[0, 0.05 + i * 0.5, 0.22]} size={[largura, 0.05, 0.44]} cor="#7d5c41" />
      ))}
      {prateleiras.map((livros, i) =>
        livros.map((l, j) => <Caixa key={`${i}-${j}`} pos={[l.x, 0.075 + i * 0.5 + l.h / 2, 0.24]} size={[l.w, l.h, 0.3]} cor={l.cor} />),
      )}
    </group>
  );
}

export function CoffeeStation() {
  return (
    <group>
      <Caixa pos={[0, 0.45, 0.3]} size={[2, 0.9, 0.6]} cor="#f2efe8" sombra />
      <Caixa pos={[0, 0.92, 0.3]} size={[2.06, 0.05, 0.66]} cor="#3f3a36" />
      {/* Máquina de café */}
      <Caixa pos={[-0.5, 1.2, 0.25]} size={[0.45, 0.5, 0.4]} cor="#2b2b2b" metal={0.4} sombra />
      <Caixa pos={[-0.5, 1.12, 0.47]} size={[0.25, 0.08, 0.05]} cor="#c0c0c0" metal={0.8} />
      <mesh position={[-0.35, 1.38, 0.46]}>
        <sphereGeometry args={[0.025, 8, 6]} />
        <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={2} />
      </mesh>
      {/* Xícaras */}
      {[0.1, 0.3, 0.5].map((x, i) => (
        <mesh key={x} position={[x, 1.0, 0.35]}>
          <cylinderGeometry args={[0.05, 0.04, 0.1, 10]} />
          <meshStandardMaterial color={["#e76f51", "#2a9d8f", "#fbfbf8"][i]} />
        </mesh>
      ))}
      {/* Fruteira */}
      <mesh position={[0.75, 1.0, 0.3]}>
        <cylinderGeometry args={[0.18, 0.1, 0.08, 14]} />
        <meshStandardMaterial color="#c89f72" />
      </mesh>
      {["#e63946", "#f4a261", "#90be6d"].map((c, i) => (
        <mesh key={c} position={[0.68 + i * 0.07, 1.08, 0.28 + (i % 2) * 0.06]}>
          <sphereGeometry args={[0.055, 10, 8]} />
          <meshStandardMaterial color={c} />
        </mesh>
      ))}
    </group>
  );
}

export function WaterCooler() {
  return (
    <group>
      <Caixa pos={[0, 0.5, 0]} size={[0.4, 1, 0.4]} cor="#e8ecf0" sombra />
      <mesh position={[0, 1.25, 0]} castShadow>
        <cylinderGeometry args={[0.17, 0.17, 0.5, 14]} />
        <meshPhysicalMaterial color="#9fd3f5" transmission={0.4} roughness={0.1} transparent opacity={0.75} />
      </mesh>
    </group>
  );
}

export function ServerRack({ seed }: { seed: number }) {
  const g = useRef<Group>(null);
  const leds = useMemo(() => {
    const r = rng(seed);
    return Array.from({ length: 14 }, (_, i) => ({ y: 0.25 + i * 0.12, x: -0.2 + r() * 0.4, fase: r() * 10, cor: r() > 0.85 ? "#f59e0b" : "#22c55e" }));
  }, [seed]);
  useFrame(({ clock }) => {
    g.current?.children.forEach((c, i) => {
      const led = leds[i];
      if (led) c.visible = Math.sin(clock.elapsedTime * 6 + led.fase) > -0.3;
    });
  });
  return (
    <group>
      <Caixa pos={[0, 1, 0]} size={[0.7, 2, 0.8]} cor="#1f232b" metal={0.4} rough={0.5} sombra />
      {Array.from({ length: 14 }, (_, i) => (
        <Caixa key={i} pos={[0, 0.25 + i * 0.12, 0.405]} size={[0.6, 0.09, 0.01]} cor="#2d333d" />
      ))}
      <group ref={g} userData={VIVO}>
        {leds.map((l, i) => (
          <mesh key={i} position={[l.x, l.y, 0.415]}>
            <boxGeometry args={[0.03, 0.025, 0.01]} />
            <meshBasicMaterial color={l.cor} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

export function FilingCabinet() {
  return (
    <group>
      <Caixa pos={[0, 0.65, 0]} size={[0.5, 1.3, 0.6]} cor="#8d99ae" metal={0.3} sombra />
      {[0.3, 0.72, 1.12].map((y) => (
        <group key={y}>
          <Caixa pos={[0, y, 0.305]} size={[0.44, 0.36, 0.01]} cor="#9aa6ba" metal={0.3} />
          <Caixa pos={[0, y + 0.1, 0.315]} size={[0.14, 0.03, 0.02]} cor="#3a3f4b" metal={0.6} />
        </group>
      ))}
    </group>
  );
}

export function Printer() {
  return (
    <group>
      <Caixa pos={[0, 0.35, 0]} size={[0.7, 0.7, 0.55]} cor="#d9dde3" sombra />
      <Caixa pos={[0, 0.85, 0]} size={[0.65, 0.3, 0.5]} cor="#eef0f3" sombra />
      <Caixa pos={[0, 1.01, 0.05]} size={[0.4, 0.01, 0.3]} cor="#ffffff" />
      <Caixa pos={[0.22, 0.92, 0.26]} size={[0.12, 0.08, 0.02]} cor="#3b82f6" />
    </group>
  );
}

export function CoffeeTable({ w = 1.2 }: { w?: number }) {
  return (
    <group>
      <Caixa pos={[0, 0.4, 0]} size={[w, 0.06, 0.65]} cor="#c89f72" sombra />
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => <Caixa key={`${sx}${sz}`} pos={[sx * (w / 2 - 0.08), 0.19, sz * 0.24]} size={[0.05, 0.38, 0.05]} cor="#3a3f4b" />),
      )}
      <Caixa pos={[-0.2, 0.46, 0]} size={[0.3, 0.05, 0.22]} cor="#e76f51" />
      <mesh position={[0.25, 0.48, 0.05]}>
        <cylinderGeometry args={[0.05, 0.04, 0.1, 10]} />
        <meshStandardMaterial color="#fbfbf8" />
      </mesh>
    </group>
  );
}

export function BeanBag({ cor }: { cor: string }) {
  return (
    <group>
      <mesh position={[0, 0.25, 0]} scale={[1, 0.6, 1]} castShadow>
        <sphereGeometry args={[0.5, 14, 10]} />
        <meshStandardMaterial color={cor} roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.42, -0.22]} scale={[0.9, 0.7, 0.5]} castShadow>
        <sphereGeometry args={[0.45, 12, 10]} />
        <meshStandardMaterial color={cor} roughness={0.95} />
      </mesh>
    </group>
  );
}

export function Armchair({ cor }: { cor: string }) {
  return (
    <group>
      <Caixa pos={[0, 0.25, 0]} size={[0.85, 0.4, 0.8]} cor={cor} sombra />
      <Caixa pos={[0, 0.6, -0.32]} size={[0.85, 0.6, 0.18]} cor={cor} sombra />
      {[-1, 1].map((s) => (
        <Caixa key={s} pos={[s * 0.38, 0.45, 0]} size={[0.12, 0.35, 0.8]} cor={cor} />
      ))}
    </group>
  );
}

export function TrophyShelf() {
  return (
    <group>
      <Caixa pos={[0, 0.5, 0.2]} size={[1.4, 1, 0.4]} cor="#5b4636" sombra />
      {[-0.45, 0, 0.45].map((x, i) => (
        <group key={x} position={[x, 1, 0.2]}>
          <Caixa pos={[0, 0.06, 0]} size={[0.18, 0.12, 0.18]} cor="#2b2b2b" />
          <mesh position={[0, 0.25 + i * 0.03, 0]}>
            <cylinderGeometry args={[0.1, 0.04, 0.22 + i * 0.06, 12]} />
            <meshStandardMaterial color="#e9c46a" metalness={0.8} roughness={0.25} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Kit de gravação do Marketing: tripé com ring light. */
export function RingLight() {
  return (
    <group>
      <LightPool raio={1.4} intensidade={0.45} />
      {[0, 2.1, 4.2].map((a) => (
        <mesh key={a} position={[Math.sin(a) * 0.2, 0.6, Math.cos(a) * 0.2]} rotation={[Math.cos(a) * 0.3, 0, -Math.sin(a) * 0.3]}>
          <cylinderGeometry args={[0.015, 0.015, 1.25, 6]} />
          <meshStandardMaterial color="#2b2b2b" />
        </mesh>
      ))}
      <mesh position={[0, 1.6, 0]}>
        <torusGeometry args={[0.35, 0.04, 8, 32]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={1.6} />
      </mesh>
    </group>
  );
}

export function Easel() {
  const tex = useMemo(() => arte(4242), []);
  return (
    <group rotation={[-0.08, 0, 0]}>
      {[-0.3, 0.3].map((x) => (
        <Caixa key={x} pos={[x, 0.85, 0]} size={[0.05, 1.7, 0.05]} cor="#a47148" />
      ))}
      <Caixa pos={[0, 0.7, 0.03]} size={[0.8, 0.05, 0.12]} cor="#a47148" />
      <mesh position={[0, 1.15, 0.05]}>
        <planeGeometry args={[0.8, 0.6]} />
        <meshStandardMaterial map={tex} />
      </mesh>
    </group>
  );
}

export function TrashBin() {
  return (
    <mesh position={[0, 0.2, 0]} castShadow>
      <cylinderGeometry args={[0.16, 0.13, 0.4, 12]} />
      <meshStandardMaterial color="#6b7280" metalness={0.3} />
    </mesh>
  );
}

export function TallPlant({ seed }: { seed: number }) {
  const folhas = useMemo(() => {
    const r = rng(seed);
    return Array.from({ length: 7 }, () => ({ a: r() * Math.PI * 2, h: 0.9 + r() * 0.9, inc: 0.5 + r() * 0.5 }));
  }, [seed]);
  return (
    <group>
      <mesh position={[0, 0.3, 0]} castShadow>
        <cylinderGeometry args={[0.3, 0.24, 0.6, 12]} />
        <meshStandardMaterial color="#efe9df" />
      </mesh>
      {folhas.map((f, i) => (
        <mesh key={i} position={[Math.sin(f.a) * 0.15, 0.6 + f.h / 2, Math.cos(f.a) * 0.15]} rotation={[Math.cos(f.a) * f.inc, 0, -Math.sin(f.a) * f.inc]} castShadow>
          <coneGeometry args={[0.16, f.h, 4]} />
          <meshStandardMaterial color={i % 2 ? "#3f7d3a" : "#5f9e5a"} flatShading />
        </mesh>
      ))}
    </group>
  );
}

/** Objetos aleatórios sobre a mesa de cada agente: caneca, papéis, mini planta, fone... */
export function DeskClutter({ seed }: { seed: number }) {
  const itens = useMemo(() => {
    const r = rng(seed);
    return {
      caneca: r() > 0.3 ? ["#e76f51", "#2a9d8f", "#264653", "#f4a261", "#fbfbf8"][Math.floor(r() * 5)] : null,
      papeis: r() > 0.4,
      planta: r() > 0.55,
      fone: r() > 0.6,
      luminaria: r() > 0.5,
      ladoCaneca: r() > 0.5 ? 1 : -1,
    };
  }, [seed]);
  const lado = itens.ladoCaneca;
  return (
    <group position={[0, 0.78, 0]}>
      {itens.caneca && (
        <mesh position={[lado * 0.62, 0.05, -0.2]}>
          <cylinderGeometry args={[0.045, 0.04, 0.1, 10]} />
          <meshStandardMaterial color={itens.caneca} />
        </mesh>
      )}
      {itens.papeis && (
        <group position={[-lado * 0.55, 0, -0.1]} rotation={[0, 0.3, 0]}>
          <Caixa pos={[0, 0.01, 0]} size={[0.3, 0.02, 0.22]} cor="#fbfbf8" />
          <Caixa pos={[0.02, 0.03, 0.01]} size={[0.3, 0.02, 0.22]} cor="#f1f1ec" />
        </group>
      )}
      {itens.planta && (
        <group position={[lado * 0.65, 0, 0.22]}>
          <mesh position={[0, 0.05, 0]}>
            <cylinderGeometry args={[0.06, 0.05, 0.1, 8]} />
            <meshStandardMaterial color="#d97b4f" />
          </mesh>
          <mesh position={[0, 0.16, 0]}>
            <icosahedronGeometry args={[0.09, 0]} />
            <meshStandardMaterial color="#5f9e5a" flatShading />
          </mesh>
        </group>
      )}
      {itens.fone && (
        <mesh position={[-lado * 0.3, 0.04, -0.28]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.08, 0.018, 6, 14, Math.PI]} />
          <meshStandardMaterial color="#1f2430" />
        </mesh>
      )}
      {itens.luminaria && (
        <group position={[-lado * 0.68, 0, 0.2]}>
          <mesh position={[0, 0.015, 0]}>
            <cylinderGeometry args={[0.07, 0.08, 0.03, 10]} />
            <meshStandardMaterial color="#2b2b2b" />
          </mesh>
          <mesh position={[0, 0.2, 0]}>
            <cylinderGeometry args={[0.012, 0.012, 0.38, 6]} />
            <meshStandardMaterial color="#2b2b2b" />
          </mesh>
          <mesh position={[lado * 0.06, 0.38, 0]} rotation={[0, 0, lado * 0.8]}>
            <coneGeometry args={[0.08, 0.13, 10, 1, true]} />
            <meshStandardMaterial color="#f3e3c3" emissive="#ffcf7a" emissiveIntensity={0.9} side={2} />
          </mesh>
        </group>
      )}
    </group>
  );
}

/** Cofre (Segurança e Administrativo). */
export function Cofre() {
  return (
    <group>
      <Caixa pos={[0, 0.45, 0]} size={[0.7, 0.9, 0.6]} cor="#4a4f5a" metal={0.6} rough={0.35} sombra />
      <Caixa pos={[0, 0.45, 0.305]} size={[0.6, 0.8, 0.01]} cor="#5a606c" metal={0.6} rough={0.3} />
      <mesh position={[0.12, 0.5, 0.32]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 0.03, 16]} />
        <meshStandardMaterial color="#c9ccd3" metalness={0.9} roughness={0.2} />
      </mesh>
      <Caixa pos={[-0.18, 0.5, 0.32]} size={[0.04, 0.22, 0.03]} cor="#c9ccd3" metal={0.9} />
    </group>
  );
}

/** Bancada de dispositivos do QA: celulares e tablets em suportes, com telas acesas. */
export function BancadaDispositivos() {
  const aparelhos: [number, number, number, string][] = [
    [-0.62, 0.16, 0.3, "#60a5fa"], [-0.32, 0.16, 0.3, "#34d399"], [-0.02, 0.16, 0.3, "#f472b6"],
    [0.36, 0.26, 0.38, "#fbbf24"], [0.74, 0.26, 0.38, "#a78bfa"],
  ];
  return (
    <group>
      <Caixa pos={[0, 0.74, 0]} size={[1.9, 0.06, 0.6]} cor="#e9e4da" sombra />
      {[-0.88, 0.88].map((x) => <Caixa key={x} pos={[x, 0.36, 0]} size={[0.06, 0.72, 0.55]} cor="#3a3f4b" metal={0.4} />)}
      {aparelhos.map(([x, larg, alt, cor], i) => (
        <group key={i} position={[x, 0.78 + alt / 2, -0.05]} rotation={[-0.25, 0, 0]}>
          <Caixa pos={[0, 0, 0]} size={[larg, alt, 0.02]} cor="#1f2430" />
          <mesh position={[0, 0, 0.011]}>
            <planeGeometry args={[larg - 0.03, alt - 0.04]} />
            <meshStandardMaterial color={cor} emissive={cor} emissiveIntensity={0.7} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
