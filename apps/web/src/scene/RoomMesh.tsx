import { useMemo, useRef, type ReactNode } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { Color, type MeshStandardMaterial, type Texture } from "three";
import type { RoomId } from "@empresa/shared";
import type { RoomRect } from "@empresa/org";
import { agentsByRoom, deskSpots, ESPESSURA_PAREDE, PORTA_SALA, roomById } from "@empresa/org";
import { useStore } from "../store.ts";
import { MeetingTable, Plant, Sofa, Whiteboard } from "./Furniture.tsx";
import {
  Armchair, BeanBag, Bookcase, CoffeeStation, CoffeeTable, Easel, FilingCabinet, FloorLamp, KanbanBoard, LightPool,
  NeonSign, PictureFrame, Printer, RingLight, Rug, ServerRack, TallPlant, TrashBin, TrophyShelf, WallClock, WallSconce,
  WallShelf, WallTV, WaterCooler, Cofre, BancadaDispositivos,
} from "./Props.tsx";
import { KanbanVivo, LivroDaEmpresa, PainelEquipe, SinoVendas, TvAta, TvIndicadores } from "./Interativos.tsx";
import { carpete, hashStr, madeira, porcelanato, sombrear } from "./textures.ts";
import { VIVO } from "./Mesclado.tsx";

export const ALTURA_PAREDE = 2.6;
const ESPESSURA = ESPESSURA_PAREDE;
const PORTA = PORTA_SALA;
const PAREDE = "#f6f2ea";

const pisoDeMadeira: RoomId[] = ["diretoria", "reuniao", "design", "marketing"];
const pisoPorcelanato: RoomId[] = ["infraestrutura", "devops"];

export function RoomMesh({ rect }: { rect: RoomRect }) {
  const room = roomById[rect.id];
  const { x, z, largura: w, profundidade: d } = rect;
  const selecionada = useStore((s) => s.salaSelecionada === rect.id);
  const ativos = useStore((s) => agentsByRoom(rect.id).filter((a) => (s.estados[a.id]?.status ?? "ocioso") !== "ocioso").length);
  const selecionarSala = useStore((s) => s.selecionarSala);

  const piso = useMemo(() => {
    let tex: Texture;
    if (pisoDeMadeira.includes(rect.id)) tex = madeira(rect.id === "diretoria" ? "#9c7350" : "#c9a37a").clone();
    else if (pisoPorcelanato.includes(rect.id)) tex = porcelanato().clone();
    else tex = carpete(new Color(room.cor).lerp(new Color("#ffffff"), 0.35).getStyle()).clone();
    tex.repeat.set(w / 4, d / 4);
    tex.needsUpdate = true;
    return tex;
  }, [rect.id, room.cor, w, d]);

  const borda = useRef<MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    if (!borda.current) return;
    const alvo = selecionada ? 0.9 : ativos > 0 ? 0.45 + Math.sin(clock.elapsedTime * 2.5) * 0.25 : 0;
    borda.current.emissiveIntensity += (alvo - borda.current.emissiveIntensity) * 0.1;
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 4) return;
    selecionarSala(rect.id);
  };

  const acento = room.cor;

  return (
    <group position={[x, 0, z]}>
      {/* Borda luminosa: acende quando a sala está trabalhando */}
      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} userData={VIVO}>
        <planeGeometry args={[w + 0.6, d + 0.6]} />
        <meshStandardMaterial ref={borda} color={acento} emissive={acento} emissiveIntensity={0} />
      </mesh>
      {/* Piso */}
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow onClick={onClick}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial map={piso} roughness={0.9} />
      </mesh>

      {/* Batentes da porta */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[(s * PORTA) / 2, 0.45, d / 2]} castShadow>
          <boxGeometry args={[0.14, 0.9, ESPESSURA + 0.08]} />
          <meshStandardMaterial color={sombrear(acento, 0.6)} />
        </mesh>
      ))}

      <DecoracaoBase rect={rect} />
      <DecoracaoTematica rect={rect} />

      <Html position={[0, ALTURA_PAREDE + 0.45, -d / 2]} center zIndexRange={[10, 0]}>
        <button
          onClick={() => selecionarSala(rect.id)}
          className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold shadow-md ring-1 transition ${
            selecionada ? "bg-[#1f2430] text-white ring-black/20" : "bg-white/90 text-[#1f2430] ring-black/5 hover:bg-white"
          }`}
        >
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: acento }} />
          {room.nome}
          {ativos > 0 && <span className="pulsar rounded-full bg-blue-500 px-1.5 text-[10px] font-bold text-white">{ativos}</span>}
        </button>
      </Html>
    </group>
  );
}

/* ---------- Posicionamento ---------- */

// Paredes ficam recuadas meia espessura para dentro da sala: o item encosta na face interna.
const RECUO = ESPESSURA + 0.01;

/** Item preso na parede do fundo, olhando para dentro da sala. */
function NoFundo({ rect, x, y, children }: { rect: RoomRect; x: number; y: number; children: ReactNode }) {
  return <group position={[x, y, -rect.profundidade / 2 + RECUO]}>{children}</group>;
}

/** Item preso numa parede lateral (lado -1 = esquerda, 1 = direita). */
function NaLateral({ rect, lado, z, y, children }: { rect: RoomRect; lado: -1 | 1; z: number; y: number; children: ReactNode }) {
  return (
    <group position={[lado * (rect.largura / 2 - RECUO), y, z]} rotation={[0, -lado * (Math.PI / 2), 0]}>
      {children}
    </group>
  );
}

function NoChao({ x, z, rot = 0, children }: { x: number; z: number; rot?: number; children: ReactNode }) {
  return (
    <group position={[x, 0, z]} rotation={[0, rot, 0]}>
      {children}
    </group>
  );
}

/** Retângulo ocupado pelas mesas (em coordenadas locais da sala). */
function areaDasMesas(rect: RoomRect) {
  const mesas = deskSpots.filter((s) => s.sala === rect.id);
  if (!mesas.length) return null;
  const xs = mesas.map((m) => m.x - rect.x);
  const zs = mesas.map((m) => m.z - rect.z);
  return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
}

/** O que toda sala tem: tapete sob as mesas, quadros, relógio, arandelas, plantas, luminária e lixeira. */
function DecoracaoBase({ rect }: { rect: RoomRect }) {
  const { largura: w, profundidade: d, id } = rect;
  const room = roomById[id];
  const seed = hashStr(id);
  const area = areaDasMesas(rect);

  return (
    <group>
      {area && (
        <group position={[(area.x0 + area.x1) / 2, 0, (area.z0 + area.z1) / 2 - 0.4]}>
          <Rug
            w={area.x1 - area.x0 + 3}
            d={area.z1 - area.z0 + 3.2}
            base={sombrear(room.cor, 0.62)}
            detalhe={sombrear(room.cor, 1.25)}
            seed={seed}
          />
        </group>
      )}

      {/* Arandelas nos cantos do fundo, com a luz batendo no chão */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <NoFundo rect={rect} x={s * (w / 2 - 0.9)} y={2.05}>
            <WallSconce />
          </NoFundo>
          <NoChao x={s * (w / 2 - 0.9)} z={-d / 2 + 0.9}>
            <LightPool raio={1.6} intensidade={0.4} />
          </NoChao>
        </group>
      ))}

      <NoFundo rect={rect} x={-w / 2 + 2.1} y={1.95}>
        <WallClock />
      </NoFundo>

      {/* Cantos */}
      <NoChao x={-w / 2 + 0.75} z={-d / 2 + 0.75}>
        <TallPlant seed={seed} />
      </NoChao>
      <NoChao x={w / 2 - 0.7} z={d / 2 - 0.7}>
        <Plant escala={0.95} />
      </NoChao>
      <NoChao x={-w / 2 + 0.6} z={d / 2 - 0.65}>
        <FloorLamp />
      </NoChao>
      <NoChao x={PORTA / 2 + 0.45} z={d / 2 - 0.45}>
        <TrashBin />
      </NoChao>
    </group>
  );
}

/** Itens específicos de cada área. */
function DecoracaoTematica({ rect }: { rect: RoomRect }) {
  const { largura: w, profundidade: d, id } = rect;
  const seed = hashStr(id) + 100;
  const room = roomById[id];
  const frenteZ = d / 2 - 1.5;
  const esq = -w / 2 + 2.2;
  const dir = w / 2 - 2.2;

  switch (id) {
    case "diretoria":
      return (
        <group>
          <NoFundo rect={rect} x={-1.4} y={1.7}>
            <PictureFrame seed={seed} w={1.6} h={1.1} moldura="#b08d57" />
          </NoFundo>
          <NoFundo rect={rect} x={1.2} y={1.65}>
            <PainelEquipe />
          </NoFundo>
          <NoChao x={w / 2 - 1.0} z={-d / 2 + 0.3}>
            <TrophyShelf />
          </NoChao>
          <NoChao x={-w / 2 + 3.6} z={-d / 2 + 0.15}>
            <Bookcase seed={seed} largura={1.6} />
          </NoChao>
          <group position={[esq + 0.6, 0, frenteZ - 0.2]}>
            <Rug w={4} d={2.6} base="#7f5539" detalhe="#ddb892" seed={seed} />
            <NoChao x={0} z={-0.7}>
              <Sofa cor="#6d4c41" />
            </NoChao>
            <NoChao x={0} z={0.35}>
              <CoffeeTable />
            </NoChao>
          </group>
          <NoChao x={dir} z={frenteZ} rot={Math.PI}>
            <Armchair cor="#8d6e63" />
          </NoChao>
        </group>
      );
    case "produto":
      return (
        <group>
          <NoFundo rect={rect} x={0.6} y={1.6}>
            <KanbanVivo w={3.4} />
          </NoFundo>
          <NoChao x={dir} z={frenteZ}>
            <BeanBag cor="#2a9d8f" />
          </NoChao>
          <NoChao x={dir - 1.2} z={frenteZ + 0.2}>
            <BeanBag cor="#e9c46a" />
          </NoChao>
          <NoChao x={w / 2 - 1.2} z={-d / 2 + 0.6}>
            <WaterCooler />
          </NoChao>
        </group>
      );
    case "design":
      return (
        <group>
          {[-1.6, 0, 1.6].map((x, i) => (
            <NoFundo key={x} rect={rect} x={x + 0.4} y={1.55 + (i % 2) * 0.2}>
              <PictureFrame seed={seed + i * 7} w={i === 1 ? 1.4 : 1} h={i === 1 ? 1 : 0.75} moldura={["#f4f1ea", "#1b1b1b", "#c9a37a"][i]} />
            </NoFundo>
          ))}
          <NoChao x={esq} z={frenteZ} rot={0.4}>
            <Easel />
          </NoChao>
          <NoChao x={dir} z={frenteZ}>
            <BeanBag cor="#ef476f" />
          </NoChao>
          <NoChao x={dir - 1.1} z={frenteZ + 0.3}>
            <BeanBag cor="#118ab2" />
          </NoChao>
        </group>
      );
    case "arquitetura":
      return (
        <group>
          <NoFundo rect={rect} x={0.5} y={0}>
            <Whiteboard largura={3} />
          </NoFundo>
          <NoChao x={w / 2 - 1.3} z={-d / 2 + 0.15}>
            <Bookcase seed={seed} largura={1.4} />
          </NoChao>
          <NoChao x={esq} z={frenteZ} rot={Math.PI}>
            <Armchair cor="#5e548e" />
          </NoChao>
        </group>
      );
    case "desenvolvimento":
    case "code-review":
      return (
        <group>
          <NoFundo rect={rect} x={0.4} y={1.65}>
            <WallTV tipo="codigo" cor={room.cor} w={id === "desenvolvimento" ? 2.8 : 2.2} />
          </NoFundo>
          {id === "desenvolvimento" ? (
            <>
              <NoChao x={esq} z={frenteZ}>
                <BeanBag cor="#1d3557" />
              </NoChao>
              <NoChao x={esq + 1.2} z={frenteZ + 0.2}>
                <BeanBag cor="#e63946" />
              </NoChao>
            </>
          ) : (
            <NoChao x={w / 2 - 1.3} z={-d / 2 + 0.15}>
              <Bookcase seed={seed} largura={1.4} />
            </NoChao>
          )}
        </group>
      );
    case "seguranca":
      return (
        <group>
          <NoFundo rect={rect} x={0.5} y={1.65}>
            <WallTV tipo="monitoramento" cor="#f87171" w={2.2} />
          </NoFundo>
          <NoChao x={w / 2 - 0.8} z={-d / 2 + 0.6}>
            <FilingCabinet />
          </NoChao>
          <NoChao x={-w / 2 + 0.8} z={-d / 2 + 0.55}>
            <Cofre />
          </NoChao>
        </group>
      );
    case "devops":
      return (
        <group>
          <NoFundo rect={rect} x={0} y={1.7}>
            <WallTV tipo="monitoramento" cor="#4ade80" w={2.6} />
          </NoFundo>
          <NoChao x={w / 2 - 0.8} z={-d / 2 + 0.6}>
            <ServerRack seed={seed} />
          </NoChao>
          <NoChao x={esq} z={frenteZ}>
            <BeanBag cor="#386641" />
          </NoChao>
        </group>
      );
    case "qa":
      return (
        <group>
          <NoFundo rect={rect} x={-1.6} y={1.6}>
            <KanbanBoard seed={seed} w={3.2} />
          </NoFundo>
          <NoFundo rect={rect} x={2.6} y={1.7}>
            <WallTV tipo="grafico" cor="#fb923c" w={2.4} />
          </NoFundo>
          <NoChao x={w / 2 - 0.9} z={-d / 2 + 0.6}>
            <Printer />
          </NoChao>
          <NoChao x={-w / 2 + 1.3} z={-d / 2 + 0.5}>
            <BancadaDispositivos />
          </NoChao>
          <NoChao x={dir} z={frenteZ}>
            <BeanBag cor="#fb8500" />
          </NoChao>
        </group>
      );
    case "dados":
      return (
        <group>
          <NoFundo rect={rect} x={0.4} y={1.7}>
            <TvIndicadores />
          </NoFundo>
          <NoChao x={w / 2 - 0.8} z={-d / 2 + 0.6}>
            <ServerRack seed={seed} />
          </NoChao>
          <NoChao x={dir - 0.4} z={frenteZ} rot={Math.PI}>
            <Armchair cor="#0a9396" />
          </NoChao>
        </group>
      );
    case "docs":
      return (
        <group>
          <NoChao x={w / 2 - 1.3} z={-d / 2 + 0.15}>
            <Bookcase seed={seed} largura={1.4} />
          </NoChao>
          <NoFundo rect={rect} x={-0.6} y={1.6}>
            <KanbanBoard seed={seed} w={2.6} />
          </NoFundo>
          <NoChao x={esq} z={frenteZ - 0.2}>
            <RingLight />
          </NoChao>
          <NoChao x={w / 2 - 2.6} z={-d / 2 + 0.7}>
            <LivroDaEmpresa />
          </NoChao>
        </group>
      );
    case "infraestrutura":
      return (
        <group>
          {[-1, 0, 1].map((i) => (
            <NoChao key={i} x={1.2 + i * 0.75} z={-d / 2 + 0.6}>
              <ServerRack seed={seed + i} />
            </NoChao>
          ))}
          <NoFundo rect={rect} x={-1.6} y={1.7}>
            <WallTV tipo="monitoramento" cor="#60a5fa" w={2} />
          </NoFundo>
          <NoChao x={w / 2 - 0.8} z={-d / 2 + 0.6}>
            <FilingCabinet />
          </NoChao>
        </group>
      );
    case "reuniao":
      return (
        <group>
          <group position={[0, 0, -0.3]}>
            <Rug w={Math.min(w - 3, 12)} d={5} base="#5c4d3c" detalhe="#d9cfb8" seed={seed} />
            <MeetingTable largura={Math.min(w - 5, 9)} profundidade={2.2} />
          </group>
          <NoFundo rect={rect} x={0} y={1.7}>
            <TvAta />
          </NoFundo>
          <NoChao x={esq} z={frenteZ}>
            <TallPlant seed={seed} />
          </NoChao>
        </group>
      );
    case "marketing":
      return (
        <group>
          <NoFundo rect={rect} x={0} y={1.75}>
            <NeonSign />
          </NoFundo>
          <NoFundo rect={rect} x={-3.4} y={1.65}>
            <PictureFrame seed={seed} w={1.2} h={0.85} moldura="#f4f1ea" />
          </NoFundo>
          <NoFundo rect={rect} x={3.4} y={1.65}>
            <PictureFrame seed={seed + 5} w={1.2} h={0.85} moldura="#f4f1ea" />
          </NoFundo>
          <NoChao x={esq + 0.4} z={frenteZ - 0.3}>
            <RingLight />
          </NoChao>
          <NoChao x={dir} z={frenteZ}>
            <BeanBag cor="#f77f00" />
          </NoChao>
          <NoChao x={dir - 1.2} z={frenteZ + 0.2}>
            <BeanBag cor="#ff006e" />
          </NoChao>
          <NoChao x={w / 2 - 0.8} z={-d / 2 + 0.7}>
            <TallPlant seed={seed + 9} />
          </NoChao>
        </group>
      );
    case "comercial":
      return (
        <group>
          <NoChao x={0.6} z={-d / 2 + 0.3}>
            <TrophyShelf />
          </NoChao>
          <NoChao x={-0.9} z={-d / 2 + 0.45}>
            <SinoVendas />
          </NoChao>
          <NoChao x={dir + 0.6} z={frenteZ} rot={Math.PI}>
            <Armchair cor="#ca6702" />
          </NoChao>
        </group>
      );
    case "cs":
      return (
        <group>
          <NoFundo rect={rect} x={0.6} y={1.7}>
            <PictureFrame seed={seed} w={1.8} h={1} />
          </NoFundo>
          <NoChao x={0.3} z={frenteZ + 0.3} rot={Math.PI}>
            <Sofa cor="#4361ee" />
          </NoChao>
        </group>
      );
    case "administrativo":
      return (
        <group>
          <NoChao x={-0.2} z={-d / 2 + 0.15}>
            <Bookcase seed={seed} largura={1.6} />
          </NoChao>
          {[0, 1].map((i) => (
            <NoChao key={i} x={w / 2 - 0.7 - i * 0.6} z={-d / 2 + 0.6}>
              <FilingCabinet />
            </NoChao>
          ))}
          <NoChao x={-w / 2 + 0.8} z={-d / 2 + 0.55}>
            <Cofre />
          </NoChao>
          <NoChao x={dir} z={frenteZ}>
            <Printer />
          </NoChao>
        </group>
      );
    default:
      return null;
  }
}
