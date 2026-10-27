import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import type { CameraControlsImpl } from "@react-three/drei";
import { deskSpots } from "@empresa/org";
import { useStore } from "../store.ts";
import { atenuar, tocarCafe, tocarTecla, useSons } from "../sons.ts";
import { comportamentoDe } from "./behavior.ts";
import { itensAreas } from "./areas.ts";

// Sons do ambiente (DESIGN-ESCRITORIO.md, seção 10): digitação de quem está trabalhando
// na mesa e o vapor da cafeteira, mais altos perto do ponto que a câmera olha.

const cafeteiras = itensAreas.filter((i) => i.tipo === "cafeteria");

export function SonsDoEscritorio() {
  const controles = useThree((s) => s.controls) as CameraControlsImpl | null;
  const alvo = useMemo(() => new Vector3(), []);
  const proximo = useRef(0);
  const proximoCafe = useRef(0);
  const ctrls = useMemo(() => deskSpots.map((d) => ({ id: d.agenteId, c: comportamentoDe(d.agenteId) })), []);

  useFrame(({ clock }) => {
    if (!useSons.getState().efeitos || !controles) return;
    const t = clock.elapsedTime;
    if (t < proximo.current) return;
    proximo.current = t + 0.07;
    controles.getTarget(alvo);
    const estados = useStore.getState().estados;
    // Digitação: cada um que está trabalhando sentado na mesa tem uma chance de tecla por passo.
    for (const { id, c } of ctrls) {
      const st = estados[id]?.status;
      if ((st !== "trabalhando" && st !== "testando") || !c.sentadoNaMesa) continue;
      const vol = atenuar(Math.hypot(c.x - alvo.x, c.z - alvo.z), 14);
      if (vol > 0 && Math.random() < 0.35) tocarTecla(vol);
    }
    // Cafeteira: chia quando alguém está pegando café, de tempos em tempos.
    if (t >= proximoCafe.current) {
      proximoCafe.current = t + 5 + Math.random() * 4;
      const tomando = Object.values(useStore.getState().tempoLivre).some((x) => x?.includes("café"));
      if (tomando) {
        const d = Math.min(...cafeteiras.map((k) => Math.hypot(k.x - alvo.x, k.z - alvo.z)));
        tocarCafe(atenuar(d, 20));
      }
    }
  });
  return null;
}
