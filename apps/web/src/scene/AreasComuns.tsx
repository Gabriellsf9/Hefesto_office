import { useMemo } from "react";
import { Html } from "@react-three/drei";
import { Color } from "three";
import { areasComuns, type AreaRect } from "@empresa/org";
import { coresAreas, itensAreas, type ItemArea } from "./areas.ts";
import { BeanBag, CoffeeStation, CoffeeTable, LightPool, TallPlant, WallTV, WaterCooler } from "./Props.tsx";
import { MeetingTable, Plant, Sofa } from "./Furniture.tsx";
import { Aquario, Arvore, Banco, BalcaoRecepcao, Geladeira, LogoPiso, Pebolim, Sinuca } from "./PropsComuns.tsx";
import { MuralMetasVivo, Radio, VaporCafe } from "./Interativos.tsx";
import { carpete, porcelanato } from "./textures.ts";
import { ESPESSURA_PAREDE } from "@empresa/org";

// Recepção, copa, lounge e átrio (DESIGN-ESCRITORIO.md, seção 2). Posições em areas.ts.

const NOMES: Record<AreaRect["id"], string> = { recepcao: "Recepção", copa: "Copa", lounge: "Lounge", atrio: "Átrio" };
const PAREDE_INTERNA = ESPESSURA_PAREDE + 0.01; // distância da linha da parede até a face interna

export function AreasComuns() {
  return (
    <group>
      {areasComuns.map((a) => (
        <Area key={a.id} a={a} />
      ))}
      {itensAreas.map((it, i) => (
        <Item key={i} it={it} />
      ))}
    </group>
  );
}

function Area({ a }: { a: AreaRect }) {
  const piso = useMemo(() => {
    const tex =
      a.id === "atrio"
        ? carpete("#7fb069").clone()
        : a.id === "lounge"
          ? carpete(new Color(coresAreas.lounge).lerp(new Color("#ffffff"), 0.35).getStyle()).clone()
          : porcelanato(a.id === "copa" ? "#ece7dc" : "#f1eee8").clone();
    tex.repeat.set(a.largura / 4, a.profundidade / 4);
    tex.needsUpdate = true;
    return tex;
  }, [a.id, a.largura, a.profundidade]);

  return (
    <group position={[a.x, 0, a.z]}>
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[a.largura, a.profundidade]} />
        <meshStandardMaterial map={piso} roughness={0.9} />
      </mesh>
      {a.id === "atrio" && (
        // Claraboia: mancha de luz natural sobre o átrio.
        <LightPool raio={5} intensidade={0.35} />
      )}
      <Html position={[0, (a.aberta ? 0.6 : 2.6) + 0.45, -a.profundidade / 2]} center zIndexRange={[10, 0]}>
        <div className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-[#1f2430] shadow-md ring-1 ring-black/5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: coresAreas[a.id] }} />
          {NOMES[a.id]}
        </div>
      </Html>
    </group>
  );
}

function Item({ it }: { it: ItemArea }) {
  const rot = it.rot ?? 0;
  // Itens presos na parede do fundo encostam na face interna dela.
  const naParede = (z: number) => z + PAREDE_INTERNA - 0.1;
  switch (it.tipo) {
    case "cafeteria":
      return (
        <group position={[it.x, 0, it.z - 0.3]}>
          <CoffeeStation />
          <VaporCafe />
        </group>
      );
    case "geladeira":
      return (
        <group position={[it.x, 0, it.z]}>
          <Geladeira />
          {/* Rádio em cima da geladeira: liga a música lo-fi */}
          <group position={[0, 2.0, 0.05]}>
            <Radio />
          </group>
        </group>
      );
    case "bebedouro":
      return (
        <group position={[it.x, 0, it.z]}>
          <WaterCooler />
        </group>
      );
    case "mesaRefeicao":
      return (
        <group position={[it.x, 0, it.z]}>
          <MeetingTable largura={it.bloqueia?.w ?? 4} profundidade={it.bloqueia?.d ?? 1.2} />
        </group>
      );
    case "sofa":
      return (
        <group position={[it.x, 0, it.z]} rotation={[0, rot, 0]}>
          <Sofa cor={it.cor ?? "#7a8fb0"} />
        </group>
      );
    case "mesaCentro":
      return (
        <group position={[it.x, 0, it.z]}>
          <CoffeeTable />
        </group>
      );
    case "puff":
      return (
        <group position={[it.x, 0, it.z]} rotation={[0, rot, 0]}>
          <BeanBag cor={it.cor ?? "#2a9d8f"} />
        </group>
      );
    case "tvParede":
      return (
        <group position={[it.x, 1.6, naParede(it.z)]}>
          <WallTV tipo="grafico" cor="#cdb4db" w={2.4} />
        </group>
      );
    case "pebolim":
      return (
        <group position={[it.x, 0, it.z]} rotation={[0, rot, 0]}>
          <Pebolim />
        </group>
      );
    case "sinuca":
      return (
        <group position={[it.x, 0, it.z]} rotation={[0, rot, 0]}>
          <Sinuca />
        </group>
      );
    case "arvore":
      return (
        <group position={[it.x, 0, it.z]}>
          <Arvore />
        </group>
      );
    case "banco":
      return (
        <group position={[it.x, 0, it.z]} rotation={[0, rot, 0]}>
          <Banco />
        </group>
      );
    case "balcao":
      return (
        <group position={[it.x, 0, it.z]}>
          <BalcaoRecepcao />
        </group>
      );
    case "aquario":
      return (
        <group position={[it.x, 0, it.z]}>
          <Aquario />
        </group>
      );
    case "logo":
      return (
        <group position={[it.x, 0, it.z]}>
          <LogoPiso />
        </group>
      );
    case "mural":
      return (
        <group position={[it.x, 0, naParede(it.z)]}>
          <MuralMetasVivo />
        </group>
      );
    case "planta":
      return (
        <group position={[it.x, 0, it.z]}>
          <Plant escala={1.1} />
        </group>
      );
    case "plantaAlta":
      return (
        <group position={[it.x, 0, it.z]}>
          <TallPlant seed={Math.round(it.x * 10 + it.z)} />
        </group>
      );
  }
}
