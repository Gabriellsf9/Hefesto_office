import { useMemo } from "react";
import { Color, MeshStandardMaterial } from "three";
import { ESPESSURA_PAREDE, paredes, roomById, type Parede } from "@empresa/org";
import type { RoomId } from "@empresa/shared";
import { corDaArea } from "./areas.ts";
import { sombrear } from "./textures.ts";

// Paredes do campus (DESIGN-ESCRITORIO.md, seção 3), desenhadas a partir da mesma
// lista que a navegação usa: o que se vê é exatamente onde ninguém passa.
//   sólida  — fundo das salas, com lambri na cor da sala (onde ficam TVs e quadros)
//   vidro   — laterais e frente: mureta de madeira + vidro com moldura fina
//   externa — paredes do prédio
//   fachada — frente do prédio em vidro, com a entrada

export const ALTURA_PAREDE = 2.6;
const T = ESPESSURA_PAREDE;

const vidro = new MeshStandardMaterial({ color: "#d4ecf7", transparent: true, opacity: 0.2, roughness: 0.05, metalness: 0.15, depthWrite: false });
const moldura = new MeshStandardMaterial({ color: "#3a3f4b", roughness: 0.5, metalness: 0.4 });
const mureta = new MeshStandardMaterial({ color: "#c9a37a", roughness: 0.8 });
const branca = new MeshStandardMaterial({ color: "#f6f2ea", roughness: 0.95 });
const externa = new MeshStandardMaterial({ color: "#e6e1d6", roughness: 0.95 });
const rodape = new MeshStandardMaterial({ color: "#4a3f35" });
const acabamento = new MeshStandardMaterial({ color: "#e2dccf" });

const corDe = (sala?: Parede["sala"]) =>
  !sala ? "#c9b8a6" : sala in roomById ? roomById[sala as RoomId].cor : corDaArea(sala as Parameters<typeof corDaArea>[0]);

export function Paredes() {
  return (
    <group>
      {paredes.map((p, i) => (
        <Segmento key={i} p={p} />
      ))}
    </group>
  );
}

function Segmento({ p }: { p: Parede }) {
  const dx = p.x2 - p.x1;
  const dz = p.z2 - p.z1;
  const L = Math.hypot(dx, dz);
  const lambri = useMemo(() => new MeshStandardMaterial({ color: new Color(sombrear(corDe(p.sala), 0.78)), roughness: 0.8 }), [p.sala]);
  const faixa = useMemo(() => new MeshStandardMaterial({ color: new Color(sombrear(corDe(p.sala), 0.55)) }), [p.sala]);
  if (L < 0.05) return null;

  return (
    <group position={[(p.x1 + p.x2) / 2, 0, (p.z1 + p.z2) / 2]} rotation={[0, -Math.atan2(dz, dx), 0]}>
      {p.tipo === "solida" && (
        <>
          <mesh position={[0, ALTURA_PAREDE / 2, 0]} material={branca} castShadow receiveShadow>
            <boxGeometry args={[L, ALTURA_PAREDE, T]} />
          </mesh>
          <mesh position={[0, 0.5, 0]} material={lambri}>
            <boxGeometry args={[L + 0.002, 1.0, T + 0.02]} />
          </mesh>
          <mesh position={[0, 1.03, 0]} material={faixa}>
            <boxGeometry args={[L + 0.004, 0.06, T + 0.05]} />
          </mesh>
          <mesh position={[0, 0.06, 0]} material={rodape}>
            <boxGeometry args={[L + 0.004, 0.12, T + 0.05]} />
          </mesh>
          <mesh position={[0, ALTURA_PAREDE + 0.03, 0]} material={acabamento}>
            <boxGeometry args={[L + 0.02, 0.06, T + 0.06]} />
          </mesh>
        </>
      )}

      {p.tipo === "vidro" && (
        <>
          <mesh position={[0, 0.25, 0]} material={mureta} castShadow receiveShadow>
            <boxGeometry args={[L, 0.5, T]} />
          </mesh>
          <mesh position={[0, 0.51, 0]} material={lambri}>
            <boxGeometry args={[L + 0.01, 0.04, T + 0.03]} />
          </mesh>
          <mesh position={[0, 1.42, 0]} material={vidro} renderOrder={2}>
            <boxGeometry args={[L, 1.8, 0.03]} />
          </mesh>
          <mesh position={[0, 2.35, 0]} material={moldura}>
            <boxGeometry args={[L, 0.06, 0.07]} />
          </mesh>
          {[-L / 2 + 0.03, L / 2 - 0.03].map((x) => (
            <mesh key={x} position={[x, 1.42, 0]} material={moldura}>
              <boxGeometry args={[0.06, 1.8, 0.07]} />
            </mesh>
          ))}
        </>
      )}

      {p.tipo === "externa" && (
        <>
          <mesh position={[0, 1.5, 0]} material={externa} castShadow receiveShadow>
            <boxGeometry args={[L + 0.3, 3.0, 0.3]} />
          </mesh>
          <mesh position={[0, 3.03, 0]} material={acabamento}>
            <boxGeometry args={[L + 0.4, 0.06, 0.4]} />
          </mesh>
        </>
      )}

      {p.tipo === "fachada" && (
        <>
          <mesh position={[0, 0.08, 0]} material={moldura}>
            <boxGeometry args={[L, 0.16, 0.2]} />
          </mesh>
          <mesh position={[0, 1.5, 0]} material={vidro} renderOrder={2}>
            <boxGeometry args={[L, 2.8, 0.04]} />
          </mesh>
          <mesh position={[0, 2.95, 0]} material={moldura}>
            <boxGeometry args={[L, 0.12, 0.2]} />
          </mesh>
          {Array.from({ length: Math.floor(L / 4) + 1 }, (_, i) => -L / 2 + i * (L / Math.max(1, Math.floor(L / 4)))).map((x) => (
            <mesh key={x} position={[x, 1.5, 0]} material={moldura}>
              <boxGeometry args={[0.1, 2.9, 0.12]} />
            </mesh>
          ))}
        </>
      )}
    </group>
  );
}
