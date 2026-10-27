import { useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { CanvasTexture, SRGBColorSpace, type Group, type MeshBasicMaterial, type Sprite, type SpriteMaterial } from "three";
import type { Agent, AgentStatus } from "@empresa/shared";
import { roomById, salaDe } from "@empresa/org";
import { useStore } from "../store.ts";
import { statusInfo } from "../status.ts";
import { comportamentoDe, type Comportamento } from "./behavior.ts";
import { Chair, Desk } from "./Furniture.tsx";
import { DeskClutter } from "./Props.tsx";
import { hashStr, rng } from "./textures.ts";
import { Ancora } from "./Corpos.tsx";

/** Mesa, cadeira e objetos do agente. Fica parada; quem anda é o AgentActor. */
export function Workstation({ agent, x, z }: { agent: Agent; x: number; z: number }) {
  const status = useStore((s) => s.estados[agent.id]?.status ?? "ocioso");
  const info = statusInfo[status];
  return (
    <group position={[x, 0, z]}>
      <Desk ligado={status !== "ocioso"} corTela={info.cor} duplo={agent.sala === "desenvolvimento" || agent.sala === "code-review"} />
      <DeskClutter seed={hashStr(agent.id)} />
      <group position={[0, 0, -0.85]}>
        <Chair />
      </group>
    </group>
  );
}

/** O agente em si: anda pelo escritório guiado pelo seu Comportamento. */
export function AgentActor({ agent }: { agent: Agent }) {
  const ctrl = useMemo(() => comportamentoDe(agent.id), [agent.id]);
  const raiz = useRef<Group>(null);

  const status: AgentStatus = useStore((s) => s.estados[agent.id]?.status ?? "ocioso");
  const selecionado = useStore((s) => s.agenteSelecionado === agent.id);
  const hover = useStore((s) => s.agenteHover === agent.id);
  const salaFocada = useStore((s) => s.salaSelecionada === agent.sala);
  const tempoLivre = useStore((s) => s.tempoLivre[agent.id]);
  const selecionarAgente = useStore((s) => s.selecionarAgente);
  const setHover = useStore((s) => s.setHover);

  useFrame((_, dt) => {
    const e = useStore.getState().estados[agent.id];
    ctrl.update(Math.min(dt, 0.1), e?.status ?? "ocioso", e?.com ?? null);
    raiz.current?.position.set(ctrl.x, 0, ctrl.z);
    if (raiz.current) raiz.current.rotation.y = ctrl.yaw;
  });

  const info = statusInfo[status];
  const ativo = status !== "ocioso";
  const mostrarNome = selecionado || hover || salaFocada;

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 4) return; // foi um arrasto da câmera, não um clique
    selecionarAgente(agent.id);
  };

  return (
    <group ref={raiz} position={[ctrl.x, 0, ctrl.z]}>
      <group
        onClick={onClick}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(agent.id);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHover(null);
          document.body.style.cursor = "";
        }}
      >
        <Person agent={agent} status={status} ctrl={ctrl} />
      </group>
      <StatusRing cor={info.cor} ativo={ativo} destaque={selecionado || hover} />
      {ativo && <StatusBubble cor={info.cor} status={status} />}
      {!ativo && <BalaoEmoji ctrl={ctrl} />}
      {/* Sempre montado e só escondido: montar/desmontar Html do drei a cada hover gera avisos do React. */}
      <Html position={[0, 2.5, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
        <div
          className={`whitespace-nowrap rounded-full bg-glass px-2.5 py-1 text-legenda font-medium shadow-2 ring-1 ring-line transition-opacity ${
            mostrarNome ? "opacity-100" : "invisible opacity-0"
          }`}
        >
          <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: info.cor }} />
          {agent.nome}
          {/* Com a sala inteira em foco, só o nome (as etiquetas lado a lado não se sobrepõem); o cargo aparece no hover. */}
          {(selecionado || hover) && <span className="ml-1 text-fg-3">· {!ativo && tempoLivre ? tempoLivre : agent.cargo}</span>}
        </div>
      </Html>
    </group>
  );
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const CALCAS = ["#2f3542", "#3d405b", "#5c4d3c", "#1d3557", "#6b705c", "#22223b", "#7f5539"];

/** Variedade visual estável por agente (sempre a mesma para o mesmo id). */
function visualDe(agent: Agent) {
  const r = rng(hashStr(agent.id) + 17);
  const usaFone = ["cs", "comercial"].includes(agent.sala) || (agent.sala === "desenvolvimento" && r() < 0.6) || r() < 0.12;
  const p = r();
  return {
    calca: CALCAS[Math.floor(r() * CALCAS.length)]!,
    cracha: salaDe(agent.sala).cor,
    oculos: r() < 0.32,
    fone: usaFone,
    penteado: (p < 0.38 ? "longo" : p < 0.52 ? "coque" : "curto") as "longo" | "coque" | "curto",
  };
}

function Person({ agent, status, ctrl }: { agent: Agent; status: AgentStatus; ctrl: Comportamento }) {
  const quadril = useRef<Group>(null);
  const cabeca = useRef<Group>(null);
  const pernaE = useRef<Group>(null);
  const pernaD = useRef<Group>(null);
  const bracoE = useRef<Group>(null);
  const bracoD = useRef<Group>(null);
  const itens = useRef<Group>(null);
  const emPe = useRef(0); // 0 = sentado, 1 = em pé (interpolado)
  const fase = useRef(Math.random() * 10);
  const { camisa, pele, cabelo } = agent.aparencia;
  const visual = useMemo(() => visualDe(agent), [agent]);

  useFrame(({ clock }, dt) => {
    const q = quadril.current;
    if (!q || !cabeca.current || !pernaE.current || !pernaD.current || !bracoE.current || !bracoD.current || !itens.current) return;
    const t = clock.elapsedTime + fase.current;
    const andando = ctrl.pose === "andando";
    const sentado = ctrl.pose === "sentado";
    emPe.current += ((sentado ? 0 : 1) - emPe.current) * Math.min(1, dt * 8);
    const s = emPe.current;

    // Quadril: altura do assento quando sentado, altura das pernas quando em pé.
    const quique = andando ? Math.abs(Math.sin(ctrl.passo)) * 0.05 : 0;
    q.position.y = lerp(0.58 + ctrl.alturaAssento, 0.86, s) + quique;

    // Pernas: para frente sentado, balançando andando.
    const balanco = andando ? Math.sin(ctrl.passo) * 0.6 : 0;
    pernaE.current.rotation.x = lerp(-Math.PI / 2, balanco, s);
    pernaD.current.rotation.x = lerp(-Math.PI / 2, -balanco, s);

    // Braços: digitando na mesa, balançando ao andar, segurando algo no tempo livre.
    const naMesaTrabalhando = sentado && ctrl.alturaAssento === 0 && (status === "trabalhando" || status === "testando");
    const segurando = ctrl.item !== null && !andando;
    let alvoE = sentado ? -0.35 : -0.08;
    let alvoD = alvoE;
    if (naMesaTrabalhando) {
      alvoE = -1.15 + Math.sin(t * 14) * 0.15;
      alvoD = -1.15 + Math.sin(t * 14 + 1.5) * 0.15;
    } else if (andando) {
      alvoE = -balanco * 0.8;
      alvoD = balanco * 0.8;
    }
    if (segurando) alvoD = -1.25 + Math.sin(t * 0.8) * 0.12;
    bracoE.current.rotation.x += (alvoE - bracoE.current.rotation.x) * Math.min(1, dt * 12);
    bracoD.current.rotation.x += (alvoD - bracoD.current.rotation.x) * Math.min(1, dt * 12);
    if (naMesaTrabalhando) q.position.y += Math.sin(t * 7) * 0.008;
    else if (sentado) q.position.y += Math.sin(t * 1.6) * 0.012;

    itens.current.children.forEach((c) => (c.visible = segurando && c.name === ctrl.item));

    let alvoY = 0;
    let alvoZ = 0;
    if (status === "pensando") alvoZ = Math.sin(t * 1.2) * 0.18;
    if (status === "validando" || status === "em-reuniao") alvoY = Math.sin(t * 1.3) * 0.35;
    if (!andando && ctrl.item === "livro") alvoZ = 0.15;
    // Falando em voz alta: acena com a cabeça enquanto a voz toca.
    const falando = useStore.getState().voz.falando === agent.id;
    cabeca.current.rotation.x = falando ? Math.sin(t * 9) * 0.09 : cabeca.current.rotation.x * 0.85;
    cabeca.current.rotation.y += (alvoY - cabeca.current.rotation.y) * Math.min(1, dt * 4);
    cabeca.current.rotation.z += (alvoZ - cabeca.current.rotation.z) * Math.min(1, dt * 4);
  });

  return (
    <group ref={quadril} position={[0, 0.58, 0]}>
      {/* As partes do corpo são desenhadas por instancing (Corpos.tsx); aqui ficam só as âncoras animadas. */}
      {/* Alvo invisível para o clique e o hover no agente. */}
      {/* (o material é que fica invisível: o renderizador pula, mas o clique continua acertando) */}
      <mesh position={[0, 0.25, 0]}>
        <capsuleGeometry args={[0.36, 1.3, 2, 8]} />
        <meshBasicMaterial visible={false} />
      </mesh>
      <Ancora parte="tronco" cor={camisa} position={[0, 0.4, 0]} />
      {/* Crachá na cor da sala */}
      <Ancora parte="cracha" cor={visual.cracha} position={[0.12, 0.52, 0.255]} />
      {/* Pernas (pivô no quadril) */}
      {[
        [pernaE, -0.12],
        [pernaD, 0.12],
      ].map(([ref, x]) => (
        <group key={x as number} ref={ref as React.RefObject<Group>} position={[x as number, 0.02, 0]}>
          <Ancora parte="perna" cor={visual.calca} position={[0, -0.4, 0]} />
          <Ancora parte="sapato" cor="#1f2430" position={[0, -0.8, 0.07]} />
        </group>
      ))}
      {/* Braços (pivô no ombro) */}
      <group ref={bracoE} position={[-0.33, 0.72, 0]}>
        <Ancora parte="braco" cor={camisa} position={[0, -0.22, 0]} />
      </group>
      <group ref={bracoD} position={[0.33, 0.72, 0]}>
        <Ancora parte="braco" cor={camisa} position={[0, -0.22, 0]} />
        <group ref={itens} position={[0, -0.48, 0.02]}>
          <Ancora parte="xicara" cor="#fbfbf8" name="xicara" />
          <Ancora parte="copo" cor="#9fd3f5" name="copo" />
          <Ancora parte="fruta" cor="#e63946" name="fruta" />
          <Ancora parte="livro" cor="#005f73" name="livro" rotation={[0, 0, Math.PI / 2]} />
        </group>
      </group>
      {/* Cabeça */}
      <group ref={cabeca} position={[0, 0.97, 0]}>
        <Ancora parte="cabeca" cor={pele} />
        <Ancora parte="cabelo" cor={cabelo} position={[0, 0.07, -0.03]} scale={[1.06, 0.85, 1.06]} />
        {visual.penteado === "longo" && <Ancora parte="cabeloLongo" cor={cabelo} position={[0, -0.12, -0.13]} />}
        {visual.penteado === "coque" && <Ancora parte="coque" cor={cabelo} position={[0, 0.2, -0.2]} />}
        {visual.oculos &&
          [-0.08, 0.08].map((ex) => <Ancora key={ex} parte="oculos" cor="#1f2430" position={[ex, 0.01, 0.235]} />)}
        {visual.fone && <Ancora parte="fone" cor="#2b2d33" position={[0, 0.02, 0]} />}
        {[-0.08, 0.08].map((ex) => (
          <Ancora key={ex} parte="olho" cor="#1b1b1b" position={[ex, 0.01, 0.22]} />
        ))}
      </group>
    </group>
  );
}

function StatusRing({ cor, ativo, destaque }: { cor: string; ativo: boolean; destaque: boolean }) {
  const mat = useRef<MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    if (!mat.current) return;
    const base = destaque ? 0.95 : ativo ? 0.7 : 0.25;
    mat.current.opacity = ativo ? base * (0.75 + Math.sin(clock.elapsedTime * 3) * 0.25) : base;
  });
  return (
    <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[destaque ? 0.62 : 0.55, destaque ? 0.78 : 0.68, 32]} />
      <meshBasicMaterial ref={mat} color={cor} transparent depthWrite={false} />
    </mesh>
  );
}

/** Texturas de balão com emoji, criadas uma vez por emoji. */
const texturasBalao = new Map<string, CanvasTexture>();
function texturaBalao(emoji: string) {
  let t = texturasBalao.get(emoji);
  if (t) return t;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "rgba(255,255,255,0.96)";
  ctx.beginPath();
  ctx.arc(64, 58, 48, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(52, 100);
  ctx.lineTo(64, 122);
  ctx.lineTo(76, 100);
  ctx.fill();
  ctx.font = "56px system-ui, 'Apple Color Emoji', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emoji, 64, 62);
  t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  texturasBalao.set(emoji, t);
  return t;
}

/** Balão com emoji sobre a cabeça no tempo livre (☕ no café, 💬 conversando…). Um sprite, sem DOM. */
function BalaoEmoji({ ctrl }: { ctrl: Comportamento }) {
  const sprite = useRef<Sprite>(null);
  const atual = useRef<string | null>(null);
  useFrame(({ clock }) => {
    const s = sprite.current;
    if (!s) return;
    const emoji = ctrl.balao;
    s.visible = !!emoji;
    if (!emoji) return;
    if (emoji !== atual.current) {
      atual.current = emoji;
      (s.material as SpriteMaterial).map = texturaBalao(emoji);
      (s.material as SpriteMaterial).needsUpdate = true;
    }
    s.position.y = 2.25 + Math.sin(clock.elapsedTime * 2 + ctrl.x) * 0.05;
  });
  return (
    <sprite ref={sprite} scale={[0.6, 0.6, 0.6]} visible={false}>
      <spriteMaterial transparent depthWrite={false} />
    </sprite>
  );
}

/** Indicador flutuante acima da cabeça: pulsa na cor do status. */
function StatusBubble({ cor, status }: { cor: string; status: AgentStatus }) {
  const g = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!g.current) return;
    const t = clock.elapsedTime;
    g.current.position.y = 2.2 + Math.sin(t * 2.4) * 0.06;
    g.current.rotation.y = t * 1.2;
  });
  const alerta = status === "aguardando-aprovacao";
  return (
    <group ref={g} position={[0, 2.2, 0]}>
      {status === "pensando" ? (
        [0, 1, 2].map((i) => (
          <mesh key={i} position={[(i - 1) * 0.16, 0, 0]}>
            <sphereGeometry args={[0.07, 10, 8]} />
            <meshBasicMaterial color={cor} />
          </mesh>
        ))
      ) : (
        <mesh>
          {alerta ? <octahedronGeometry args={[0.18, 0]} /> : <icosahedronGeometry args={[0.13, 0]} />}
          <meshBasicMaterial color={cor} />
        </mesh>
      )}
    </group>
  );
}
