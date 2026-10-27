import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  AdditiveBlending, BackSide, BufferGeometry, Color, Float32BufferAttribute, type DirectionalLight, type Fog, type HemisphereLight,
  type PointsMaterial, type RectAreaLight, ShaderMaterial,
} from "three";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import { PREDIO } from "@empresa/org";
import { estadoDoCeu, horaDaCena, useCeu, type EstadoCeu } from "./ceu.ts";

RectAreaLightUniformsLib.init();

// Luz, céu e neblina que acompanham a hora (DESIGN-ESCRITORIO.md, seção 7).
// Recalcula a cada 2 s e aproxima suavemente, para trocar de modo sem salto.

const RAIO_CEU = 560;

export function Ambiente() {
  const sol = useRef<DirectionalLight>(null);
  const hemi = useRef<HemisphereLight>(null);
  const estrelas = useRef<PointsMaterial>(null);
  const teto = useRef<RectAreaLight>(null);
  const scene = useThree((s) => s.scene);
  const atual = useRef<EstadoCeu | null>(null);
  const proximaConta = useRef(0);
  const alvo = useRef<EstadoCeu>(estadoDoCeu(horaDaCena(useCeu.getState().modo)));

  const ceu = useMemo(
    () =>
      new ShaderMaterial({
        side: BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { topo: { value: new Color() }, horizonte: { value: new Color() } },
        vertexShader: `varying float vAltura;
void main() { vAltura = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `uniform vec3 topo; uniform vec3 horizonte; varying float vAltura;
void main() { float t = smoothstep(-0.05, 0.55, vAltura); gl_FragColor = vec4(mix(horizonte, topo, t), 1.0); }`,
      }),
    [],
  );

  const geoEstrelas = useMemo(() => {
    const pos: number[] = [];
    let s = 7;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 700; i++) {
      const th = r() * Math.PI * 2;
      const y = 0.12 + r() * 0.88;
      const rr = Math.sqrt(1 - y * y);
      pos.push(Math.cos(th) * rr * (RAIO_CEU - 20), y * (RAIO_CEU - 20), Math.sin(th) * rr * (RAIO_CEU - 20));
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(pos, 3));
    return g;
  }, []);

  useFrame(({ clock }, dt) => {
    if (clock.elapsedTime >= proximaConta.current) {
      proximaConta.current = clock.elapsedTime + 2;
      alvo.current = estadoDoCeu(horaDaCena(useCeu.getState().modo));
    }
    const a = alvo.current;
    if (!atual.current) atual.current = { ...a, ceu: a.ceu.clone(), horizonte: a.horizonte.clone(), sol: a.sol.clone(), hemiCeu: a.hemiCeu.clone(), hemiChao: a.hemiChao.clone(), direcao: a.direcao.clone() };
    const e = atual.current;
    const k = Math.min(1, dt * 1.5);
    e.ceu.lerp(a.ceu, k);
    e.horizonte.lerp(a.horizonte, k);
    e.sol.lerp(a.sol, k);
    e.hemiCeu.lerp(a.hemiCeu, k);
    e.hemiChao.lerp(a.hemiChao, k);
    e.direcao.lerp(a.direcao, k).normalize();
    e.intSol += (a.intSol - e.intSol) * k;
    e.intHemi += (a.intHemi - e.intHemi) * k;
    e.noite += (a.noite - e.noite) * k;

    if (sol.current) {
      sol.current.position.copy(e.direcao).multiplyScalar(70);
      sol.current.color.copy(e.sol);
      sol.current.intensity = e.intSol;
    }
    if (hemi.current) {
      hemi.current.color.copy(e.hemiCeu);
      hemi.current.groundColor.copy(e.hemiChao);
      hemi.current.intensity = e.intHemi;
    }
    ceu.uniforms.topo!.value.copy(e.ceu);
    ceu.uniforms.horizonte!.value.copy(e.horizonte);
    if (scene.background instanceof Color) scene.background.copy(e.horizonte);
    else scene.background = e.horizonte.clone();
    if (scene.fog) (scene.fog as Fog).color.copy(e.horizonte);
    if (estrelas.current) estrelas.current.opacity = Math.max(0, e.noite - 0.3) / 0.7;
    // Luz do teto do escritório: some de dia, acende quente à noite (as salas ficam legíveis).
    if (teto.current) teto.current.intensity = e.noite * 2.2;

    // Só avisa quem depende da noite (luminárias, postes, janelas) quando muda de verdade.
    const ceuStore = useCeu.getState();
    if (Math.abs(ceuStore.noite - e.noite) > 0.02) ceuStore.setNoite(Math.round(e.noite * 50) / 50);
  });

  return (
    <>
      <fog attach="fog" args={["#e9e4da", 150, 430]} />
      <hemisphereLight ref={hemi} args={["#fff8ec", "#b9b2a4", 1.1]} />
      <directionalLight
        ref={sol}
        position={[25, 45, 20]}
        intensity={1.6}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-48}
        shadow-camera-right={48}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
        shadow-camera-far={160}
        shadow-bias={-0.0004}
      />
      <rectAreaLight
        ref={teto}
        args={["#ffd9a8", 0, PREDIO.xMax - PREDIO.xMin, PREDIO.zMax - PREDIO.zMin]}
        position={[(PREDIO.xMin + PREDIO.xMax) / 2, 7, (PREDIO.zMin + PREDIO.zMax) / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
      />
      <mesh material={ceu} renderOrder={-1}>
        <sphereGeometry args={[RAIO_CEU, 32, 16]} />
      </mesh>
      <points geometry={geoEstrelas}>
        <pointsMaterial ref={estrelas} color="#ffffff" size={2.2} sizeAttenuation={false} transparent opacity={0} depthWrite={false} fog={false} blending={AdditiveBlending} />
      </points>
    </>
  );
}

/** Intensidade de algo que acende à noite (0 de dia, 1 de noite). */
export const useNoite = () => useCeu((s) => s.noite);
