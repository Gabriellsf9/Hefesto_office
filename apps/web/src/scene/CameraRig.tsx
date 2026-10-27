import { useEffect, useRef, useState } from "react";
import { useThree } from "@react-three/fiber";
import { CameraControls, CameraControlsImpl } from "@react-three/drei";
import { Box3, Vector3 } from "three";
import { deskByAgent, roomRectById, OFFICE_SIZE, PREDIO } from "@empresa/org";
import { useStore } from "../store.ts";
import { cena } from "./cena.ts";
import { usePaineis } from "../paineis.ts";

const { ACTION } = CameraControlsImpl;

/**
 * Câmera de "jogo de gerenciamento": vista de cima levemente inclinada.
 * Arrastar com o botão esquerdo move, o direito gira, a rodinha aproxima.
 * Reage aos pedidos de foco da store (clique numa sala, agente ou atividade).
 */
export function CameraRig() {
  const ref = useRef<CameraControlsImpl | null>(null);
  // Os controles só existem depois de montados: a configuração roda quando eles chegam
  // (com useRef + efeito vazio ela podia rodar antes e nunca ser aplicada).
  const [controles, setControles] = useState<CameraControlsImpl | null>(null);
  const camera = useStore((s) => s.camera);
  const lateralMinimizado = usePaineis((s) => s.minimizados.lateral);
  const aspecto = useThree((s) => s.size.width / Math.max(1, s.size.height));

  useEffect(() => {
    const c = controles;
    if (!c) return;
    c.mouseButtons.left = ACTION.TRUCK;
    c.mouseButtons.right = ACTION.ROTATE;
    c.mouseButtons.wheel = ACTION.DOLLY;
    c.touches.one = ACTION.TOUCH_TRUCK;
    c.touches.two = ACTION.TOUCH_DOLLY_ROTATE;
    // Zoom em direção ao centro da tela: aproximar na direção do cursor arrasta o ponto de foco
    // para fora do escritório e deixava a câmera atravessar o piso.
    c.dollyToCursor = false;
    c.verticalDragToForward = true;
    // O ponto que a câmera olha fica sempre sobre o piso do escritório (nunca abaixo dele):
    // a rodinha aproxima até a distância mínima e não atravessa o chão.
    c.setBoundary(new Box3(new Vector3(PREDIO.xMin - 4, 0, PREDIO.zMin - 4), new Vector3(PREDIO.xMax + 4, 1.5, PREDIO.zMax + 8)));
    c.boundaryFriction = 0;
    cena.controles = c;
    if (import.meta.env.DEV) Object.assign(window as object, { __controls: c });
    visaoGeral(c, false, aspecto);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controles]);

  useEffect(() => {
    const c = ref.current;
    if (!c || camera.n === 0) return;
    // Com o painel lateral aberto, desloca o enquadramento para a esquerda para a sala não ficar escondida.
    if (camera.agenteId) {
      const d = deskByAgent[camera.agenteId];
      if (d) {
        void c.setFocalOffset(lateralMinimizado ? 0 : 2.2, 0, 0, true);
        void c.setLookAt(d.x, 7.5, d.z + 6.5, d.x, 0.9, d.z - 0.7, true);
      }
      return;
    }
    if (camera.sala) {
      const r = roomRectById[camera.sala];
      const h = Math.max(r.largura * 0.95, r.profundidade * 1.3) + 6;
      void c.setFocalOffset(lateralMinimizado ? 0 : h * 0.14, 0, 0, true);
      void c.setLookAt(r.x, h, r.z + h * 0.72, r.x, 0, r.z, true);
      return;
    }
    void c.setFocalOffset(0, 0, 0, true);
    visaoGeral(c, true, aspecto);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera]);

  // Minimizar ou expandir o painel lateral recentraliza o que está em foco, sem mexer no resto da câmera.
  useEffect(() => {
    const c = ref.current;
    const { agenteSelecionado, salaSelecionada } = useStore.getState();
    if (!c || !salaSelecionada) return;
    let x = 0;
    if (!lateralMinimizado) {
      if (agenteSelecionado) x = 2.2;
      else {
        const r = roomRectById[salaSelecionada];
        x = (Math.max(r.largura * 0.95, r.profundidade * 1.3) + 6) * 0.14;
      }
    }
    void c.setFocalOffset(x, 0, 0, true);
  }, [lateralMinimizado]);

  return (
    <CameraControls
      ref={(c: CameraControlsImpl | null) => {
        ref.current = c;
        if (c && c !== controles) setControles(c);
      }}
      makeDefault
      minDistance={7}
      // Afastar no máximo: um pouco além do enquadramento que mostra o escritório inteiro nesta tela.
      maxDistance={distanciaVisaoGeral(aspecto) * 1.15}
      minPolarAngle={0.15}
      maxPolarAngle={1.05}
      smoothTime={0.45}
    />
  );
}

/** Distância que enquadra o prédio inteiro, levando em conta a largura da tela (fov vertical de 40°). */
function distanciaVisaoGeral(aspecto: number) {
  const tanV = Math.tan((40 * Math.PI) / 360);
  const distLargura = (OFFICE_SIZE.largura + 10) / 2 / (tanV * aspecto);
  const distProfundidade = (OFFICE_SIZE.profundidade + 14) / 2 / tanV;
  return Math.max(distLargura, distProfundidade);
}

function visaoGeral(c: CameraControlsImpl, animar: boolean, aspecto: number) {
  // A câmera fica em (0, h, 0,62h): distância até o alvo = h·√(1 + 0,62²).
  const h = distanciaVisaoGeral(aspecto) / Math.hypot(1, 0.62);
  void c.setLookAt(0, h, h * 0.62, 0, 0, 2, animar);
}
