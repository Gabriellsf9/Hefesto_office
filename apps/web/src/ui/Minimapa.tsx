import { useEffect, useMemo, useRef } from "react";
import { Vector3 } from "three";
import { areasComuns, deskSpots, PREDIO, roomById, roomRects } from "@empresa/org";
import { useStore } from "../store.ts";
import { statusInfo } from "../status.ts";
import { usePaineis } from "../paineis.ts";
import { cena } from "../scene/cena.ts";
import { comportamentoDe } from "../scene/behavior.ts";
import { coresAreas } from "../scene/areas.ts";
import { BotaoMinimizar, Recolhido } from "./Minimizavel.tsx";

// Minimapa (DESIGN-ESCRITORIO.md, seção 9): planta 2D com as salas, um ponto por agente
// na cor do status, o Byte e o que a câmera está vendo. Clique para ir até lá; teclas 1 a 4
// levam a câmera para cada fileira de salas.

const MARGEM = 4;
const X0 = PREDIO.xMin - MARGEM;
const X1 = PREDIO.xMax + MARGEM;
const Z0 = PREDIO.zMin - MARGEM;
const Z1 = PREDIO.zMax + MARGEM + 4;
const LARGURA = 232;
const ESCALA = LARGURA / (X1 - X0);
const ALTURA = Math.round((Z1 - Z0) * ESCALA);
const px = (x: number) => (x - X0) * ESCALA;
const pz = (z: number) => (z - Z0) * ESCALA;

/** Centro (z) de cada fileira de salas, de cima para baixo. */
const fileiras = [...new Set(roomRects.map((r) => Math.round(r.z * 10) / 10))].sort((a, b) => a - b);

export function Minimapa() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const minimizado = usePaineis((s) => s.minimizados.mapa);
  const sala = useStore((s) => s.salaSelecionada);
  const lateralAberta = usePaineis((s) => !s.minimizados.lateral) && !!sala;
  const ctrls = useMemo(() => deskSpots.map((d) => ({ id: d.agenteId, c: comportamentoDe(d.agenteId) })), []);

  // Fundo estático (salas e áreas), desenhado uma vez.
  const fundo = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = LARGURA * 2;
    c.height = ALTURA * 2;
    const ctx = c.getContext("2d")!;
    ctx.scale(2, 2);
    ctx.fillStyle = "#b9d4a2";
    ctx.fillRect(0, 0, LARGURA, ALTURA);
    ctx.fillStyle = "#e7d9c4";
    ctx.fillRect(px(PREDIO.xMin), pz(PREDIO.zMin), (PREDIO.xMax - PREDIO.xMin) * ESCALA, (PREDIO.zMax - PREDIO.zMin) * ESCALA);
    for (const a of areasComuns) {
      ctx.fillStyle = coresAreas[a.id];
      ctx.globalAlpha = 0.55;
      ctx.fillRect(px(a.x - a.largura / 2), pz(a.z - a.profundidade / 2), a.largura * ESCALA, a.profundidade * ESCALA);
    }
    ctx.globalAlpha = 1;
    for (const r of roomRects) {
      ctx.fillStyle = roomById[r.id].cor;
      ctx.fillRect(px(r.x - r.largura / 2) + 0.5, pz(r.z - r.profundidade / 2) + 0.5, r.largura * ESCALA - 1, r.profundidade * ESCALA - 1);
    }
    return c;
  }, []);

  useEffect(() => {
    if (minimizado) return;
    let id = 0;
    let ultimo = 0;
    const v = new Vector3();
    const desenhar = (t: number) => {
      id = requestAnimationFrame(desenhar);
      if (t - ultimo < 100) return; // 10 quadros por segundo bastam
      ultimo = t;
      const ctx = canvas.current?.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(2, 0, 0, 2, 0, 0);
      ctx.drawImage(fundo, 0, 0, LARGURA, ALTURA);
      const selecionada = useStore.getState().salaSelecionada;
      if (selecionada) {
        const r = roomRects.find((x) => x.id === selecionada)!;
        ctx.strokeStyle = "#1f2430";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(px(r.x - r.largura / 2), pz(r.z - r.profundidade / 2), r.largura * ESCALA, r.profundidade * ESCALA);
      }
      // Agentes: ponto na cor do status.
      const estados = useStore.getState().estados;
      for (const { id: aid, c } of ctrls) {
        ctx.fillStyle = statusInfo[estados[aid]?.status ?? "ocioso"].cor;
        ctx.beginPath();
        ctx.arc(px(c.x), pz(c.z), 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      const byte = (window as { __byte?: { x: number; z: number } }).__byte;
      if (byte) {
        ctx.fillStyle = "#8a5a32";
        ctx.fillRect(px(byte.x) - 1.5, pz(byte.z) - 1.5, 3, 3);
      }
      // O que a câmera vê: os quatro cantos da tela projetados no chão.
      const cam = cena.controles?.camera;
      if (cam) {
        ctx.strokeStyle = "rgba(31,36,48,0.85)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([nx, ny], i) => {
          v.set(nx!, ny!, 0.5).unproject(cam).sub(cam.position).normalize();
          const tt = v.y < -0.01 ? -cam.position.y / v.y : 400;
          const x = cam.position.x + v.x * Math.min(tt, 400);
          const z = cam.position.z + v.z * Math.min(tt, 400);
          if (i === 0) ctx.moveTo(px(x), pz(z));
          else ctx.lineTo(px(x), pz(z));
        });
        ctx.closePath();
        ctx.stroke();
      }
    };
    id = requestAnimationFrame(desenhar);
    return () => cancelAnimationFrame(id);
  }, [minimizado, fundo, ctrls]);

  // Teclas 1 a 4: vai para cada fileira de salas.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(alvo.tagName))) return;
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1 || n > fileiras.length || e.metaKey || e.ctrlKey || e.altKey) return;
      const z = fileiras[n - 1]!;
      // Fecha a sala aberta sem pedir a visão geral (que atropelaria este movimento).
      useStore.setState({ salaSelecionada: null, agenteSelecionado: null });
      void cena.controles?.setFocalOffset(0, 0, 0, true);
      void cena.controles?.setLookAt(0, 40, z + 26, 0, 0, z, true);
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, []);

  const clicar = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = X0 + (e.clientX - r.left) / ESCALA;
    const z = Z0 + (e.clientY - r.top) / ESCALA;
    const sala = roomRects.find((s) => Math.abs(s.x - x) < s.largura / 2 && Math.abs(s.z - z) < s.profundidade / 2);
    if (sala) {
      useStore.getState().selecionarSala(sala.id);
      return;
    }
    useStore.setState({ salaSelecionada: null, agenteSelecionado: null });
    void cena.controles?.setFocalOffset(0, 0, 0, true);
    void cena.controles?.moveTo(x, 0, z, true);
  };

  // Em telas estreitas a barra de chat ocupa o rodapé: o mapa sobe para não ficar por cima dela.
  const posicao = lateralAberta ? "bottom-24 right-[412px] 2xl:bottom-4" : "bottom-24 right-4 2xl:bottom-4";
  if (minimizado) return <Recolhido id="mapa" rotulo="Mapa" className={posicao} />;
  return (
    <div className={`painel pointer-events-auto absolute ${posicao} p-2`}>
      <div className="-mt-0.5 mb-1 flex items-center pl-1">
        <span className="flex-1 text-[10px] font-semibold uppercase tracking-wide text-black/45">Mapa · teclas 1–{fileiras.length}</span>
        <BotaoMinimizar id="mapa" />
      </div>
      <canvas
        ref={canvas}
        width={LARGURA * 2}
        height={ALTURA * 2}
        style={{ width: LARGURA, height: ALTURA }}
        onClick={clicar}
        className="block cursor-pointer rounded-lg"
        title="Clique para ir até lá"
      />
    </div>
  );
}
