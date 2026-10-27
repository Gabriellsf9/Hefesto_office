import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { Vector3, type Group } from "three";
import type { CameraControlsImpl } from "@react-three/drei";
import { areaRectById, corredoresZ, deskSpots, PREDIO } from "@empresa/org";
import { comportamentoDe } from "./behavior.ts";
import { pontoLivre, rota, type Ponto } from "./nav.ts";

// Byte, o cachorro da empresa (DESIGN-ESCRITORIO.md, seção 8). Comportamento próprio,
// sem IA: passeia pelos corredores, visita quem está no tempo livre, deita na caminha
// da recepção e, quando clicado, abana o rabo e segue a câmera por alguns segundos.

type Estado = "passeando" | "visitando" | "deitado" | "seguindo" | "parado";

const VELOCIDADE = 2.3;
const recepcao = areaRectById.recepcao;
const CAMA: Ponto = { x: recepcao.x + 4.6, z: recepcao.z + recepcao.profundidade / 2 - 2.4 };

/** Um ponto livre aleatório nos corredores. */
function pontoNoCorredor(): Ponto {
  for (let i = 0; i < 30; i++) {
    const p = { x: PREDIO.xMin + 3 + Math.random() * (PREDIO.xMax - PREDIO.xMin - 6), z: corredoresZ[Math.floor(Math.random() * corredoresZ.length)]! + (Math.random() - 0.5) };
    if (pontoLivre(p)) return p;
  }
  return CAMA;
}

class ControleByte {
  x = CAMA.x;
  z = CAMA.z;
  yaw = 0;
  estado: Estado = "deitado";
  feliz = 0; // 0..1: abana o rabo mais rápido
  passo = 0;
  private caminho: Ponto[] = [];
  private timer = 15;
  private reRota = 0;
  alvoSeguir: Ponto | null = null;

  irPara(p: Ponto) {
    this.caminho = rota({ x: this.x, z: this.z }, p);
  }

  private escolher() {
    const r = Math.random();
    if (r < 0.3) {
      this.estado = "deitado";
      this.irPara(CAMA);
      this.timer = 20 + Math.random() * 25;
      return;
    }
    if (r < 0.65) {
      // Visita alguém que está no tempo livre (fora da mesa) ou trabalhando.
      const ids = deskSpots.map((d) => d.agenteId);
      const livres = ids.map((id) => comportamentoDe(id)).filter((c) => c.balao);
      const alvo = livres.length ? livres[Math.floor(Math.random() * livres.length)]! : comportamentoDe(ids[Math.floor(Math.random() * ids.length)]!);
      const p = { x: alvo.x + (Math.random() < 0.5 ? -0.9 : 0.9), z: alvo.z + 0.6 };
      this.estado = "visitando";
      this.irPara(pontoLivre(p) ? p : { x: alvo.x, z: alvo.z + 1 });
      this.timer = 10 + Math.random() * 8;
      return;
    }
    this.estado = "passeando";
    this.irPara(pontoNoCorredor());
    this.timer = 8 + Math.random() * 10;
  }

  clicado() {
    this.estado = "seguindo";
    this.feliz = 1;
    this.timer = 9;
    this.reRota = 0;
  }

  update(dt: number) {
    this.timer -= dt;
    this.feliz = Math.max(this.estado === "visitando" ? 0.5 : 0, this.feliz - dt * 0.15);
    if (this.estado === "seguindo" && this.alvoSeguir) {
      this.reRota -= dt;
      if (this.reRota <= 0) {
        this.reRota = 0.8;
        const d = Math.hypot(this.alvoSeguir.x - this.x, this.alvoSeguir.z - this.z);
        if (d > 1.5 && pontoLivre(this.alvoSeguir)) this.irPara(this.alvoSeguir);
      }
    }
    if (this.timer <= 0) this.escolher();

    const prox = this.caminho[0];
    if (!prox) return;
    const dx = prox.x - this.x;
    const dz = prox.z - this.z;
    const d = Math.hypot(dx, dz);
    const v = VELOCIDADE * (this.estado === "seguindo" ? 1.6 : 1);
    if (d < 0.08) {
      this.caminho.shift();
      return;
    }
    const k = Math.min(1, (v * dt) / d);
    this.x += dx * k;
    this.z += dz * k;
    this.passo += dt * 12;
    const alvoYaw = Math.atan2(dx, dz);
    let delta = alvoYaw - this.yaw;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    this.yaw += delta * Math.min(1, dt * 8);
  }

  get andando() {
    return this.caminho.length > 0;
  }
}

const PELO = "#c8955a";
const PELO_ESCURO = "#8a5a32";

export function Byte() {
  const ctrl = useMemo(() => new ControleByte(), []);
  useEffect(() => {
    if (import.meta.env.DEV) Object.assign(window as object, { __byte: ctrl });
  }, [ctrl]);
  const raiz = useRef<Group>(null);
  const corpo = useRef<Group>(null);
  const rabo = useRef<Group>(null);
  const pernas = useRef<Group>(null);
  const [hover, setHover] = useState(false);
  const controles = useThree((s) => s.controls) as CameraControlsImpl | null;
  const alvo = useMemo(() => new Vector3(), []);

  useFrame(({ clock }, dt) => {
    if (controles && ctrl.estado === "seguindo") {
      controles.getTarget(alvo);
      ctrl.alvoSeguir = { x: alvo.x, z: alvo.z };
    }
    ctrl.update(Math.min(dt, 0.1));
    const t = clock.elapsedTime;
    const deitado = ctrl.estado === "deitado" && !ctrl.andando;
    if (raiz.current) {
      raiz.current.position.set(ctrl.x, 0, ctrl.z);
      raiz.current.rotation.y = ctrl.yaw;
    }
    if (corpo.current) corpo.current.position.y += ((deitado ? -0.18 : 0) - corpo.current.position.y) * Math.min(1, dt * 5);
    if (rabo.current) rabo.current.rotation.y = Math.sin(t * (6 + ctrl.feliz * 14)) * (0.35 + ctrl.feliz * 0.4);
    pernas.current?.children.forEach((p, i) => {
      p.rotation.x = ctrl.andando ? Math.sin(ctrl.passo + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI : 0)) * 0.6 : 0;
      p.visible = !deitado;
    });
  });

  const clicar = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 4) return;
    ctrl.clicado();
  };

  return (
    <group>
      {/* Caminha na recepção */}
      <group position={[CAMA.x, 0, CAMA.z]}>
        <mesh position={[0, 0.06, 0]} receiveShadow>
          <cylinderGeometry args={[0.6, 0.65, 0.12, 20]} />
          <meshStandardMaterial color="#e76f51" roughness={1} />
        </mesh>
        <mesh position={[0, 0.13, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.52, 0.1, 8, 24]} />
          <meshStandardMaterial color="#f4a261" roughness={1} />
        </mesh>
      </group>

      <group
        ref={raiz}
        scale={1.25}
        onClick={clicar}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHover(false);
          document.body.style.cursor = "";
        }}
      >
        {/* Alvo invisível para o clique (o Byte deitado é pequeno) */}
        <mesh position={[0, 0.4, 0.05]}>
          <sphereGeometry args={[0.75, 10, 8]} />
          <meshBasicMaterial visible={false} />
        </mesh>
        <group ref={corpo}>
          <mesh position={[0, 0.42, 0]} castShadow>
            <boxGeometry args={[0.36, 0.3, 0.72]} />
            <meshStandardMaterial color={PELO} roughness={0.9} />
          </mesh>
          {/* Cabeça, focinho, nariz, orelhas e coleira */}
          <group position={[0, 0.66, 0.42]}>
            <mesh castShadow>
              <boxGeometry args={[0.32, 0.3, 0.3]} />
              <meshStandardMaterial color={PELO} roughness={0.9} />
            </mesh>
            <mesh position={[0, -0.06, 0.2]}>
              <boxGeometry args={[0.18, 0.14, 0.16]} />
              <meshStandardMaterial color="#e6c39a" />
            </mesh>
            <mesh position={[0, -0.02, 0.29]}>
              <boxGeometry args={[0.07, 0.05, 0.03]} />
              <meshStandardMaterial color="#1b1b1b" />
            </mesh>
            {[-0.09, 0.09].map((x) => (
              <mesh key={x} position={[x, 0.05, 0.155]}>
                <sphereGeometry args={[0.025, 8, 6]} />
                <meshBasicMaterial color="#1b1b1b" />
              </mesh>
            ))}
            {[-0.15, 0.15].map((x) => (
              <mesh key={x} position={[x, 0.1, -0.02]} rotation={[0, 0, x > 0 ? -0.4 : 0.4]}>
                <boxGeometry args={[0.08, 0.2, 0.12]} />
                <meshStandardMaterial color={PELO_ESCURO} />
              </mesh>
            ))}
            <mesh position={[0, -0.18, -0.08]}>
              <boxGeometry args={[0.34, 0.05, 0.2]} />
              <meshStandardMaterial color="#d62828" />
            </mesh>
          </group>
          <group ref={rabo} position={[0, 0.52, -0.36]}>
            <mesh position={[0, 0.08, -0.08]} rotation={[0.8, 0, 0]}>
              <cylinderGeometry args={[0.03, 0.05, 0.28, 6]} />
              <meshStandardMaterial color={PELO_ESCURO} />
            </mesh>
          </group>
          <group ref={pernas}>
            {[
              [-0.12, 0.26], [0.12, 0.26], [-0.12, -0.26], [0.12, -0.26],
            ].map(([x, z], i) => (
              <group key={i} position={[x!, 0.3, z!]}>
                <mesh position={[0, -0.15, 0]} castShadow>
                  <cylinderGeometry args={[0.05, 0.05, 0.3, 6]} />
                  <meshStandardMaterial color={PELO} />
                </mesh>
              </group>
            ))}
          </group>
        </group>
        <Html position={[0, 1.2, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
          <div className={`whitespace-nowrap rounded-full bg-glass px-2.5 py-1 text-legenda font-semibold shadow-2 ring-1 ring-line transition-opacity ${hover ? "opacity-100" : "invisible opacity-0"}`}>
            🐶 Byte · mascote
          </div>
        </Html>
      </group>
    </group>
  );
}
