import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { CanvasTexture, SRGBColorSpace, Vector3, type Group, type Mesh, type MeshStandardMaterial } from "three";
import type { CameraControlsImpl } from "@react-three/drei";
import { colunaDe, fluxos, type Ata, type Card } from "@empresa/shared";
import { agentById, agents, deskSpots, roomRects } from "@empresa/org";
import { useStore } from "../store.ts";
import { usePaineis } from "../paineis.ts";
import { api } from "../api.ts";
import { comportamentoDe } from "./behavior.ts";
import { atenuar, tocarPorta, tocarSino, useSons } from "../sons.ts";
import { PORTA_SALA } from "@empresa/org";

// Objetos interativos do escritório (DESIGN-ESCRITORIO.md, seção 5): telas com
// dados reais que abrem o painel certo, sino de vendas, livro, vapor da cafeteira
// e portas de vidro automáticas. Tudo com eventos fica fora da mesclagem.

/* ---------- Base: brilho ao passar o mouse e dica ---------- */

export function Interativo({ dica, onClick, children }: { dica: string; onClick: () => void; children: ReactNode }) {
  const [hover, setHover] = useState(false);
  const g = useRef<Group>(null);
  useFrame((_, dt) => {
    if (!g.current) return;
    const alvo = hover ? 1.05 : 1;
    const s = g.current.scale.x + (alvo - g.current.scale.x) * Math.min(1, dt * 12);
    g.current.scale.setScalar(s);
  });
  return (
    <group
      ref={g}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        if (e.delta > 4) return;
        onClick();
      }}
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
      {children}
      <Html position={[0, 1.2, 0.3]} center zIndexRange={[30, 0]} style={{ pointerEvents: "none" }}>
        <div className={`whitespace-nowrap rounded-full bg-[#1f2430] px-2.5 py-1 text-[11px] font-semibold text-white shadow-md transition-opacity ${hover ? "opacity-100" : "invisible opacity-0"}`}>
          {dica}
        </div>
      </Html>
    </group>
  );
}

/** Mostra o painel correspondente expandindo a barra do topo se estiver minimizada. */
const garantirTopo = () => {
  const p = usePaineis.getState();
  if (p.minimizados.topo) p.alternar("topo");
};

/* ---------- Telas desenhadas em canvas ---------- */

type Desenho = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

function useTelaViva(w: number, h: number, desenhar: Desenho, deps: unknown[]) {
  const { canvas, tex } = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    tex.anisotropy = 8;
    return { canvas, tex };
  }, [w, h]);
  useEffect(() => {
    desenhar(canvas.getContext("2d")!, w, h);
    tex.needsUpdate = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return tex;
}

function Tela({ tex, w, h, moldura = "#20242c" }: { tex: CanvasTexture; w: number; h: number; moldura?: string }) {
  return (
    <group>
      <mesh position={[0, 0, 0.03]} castShadow>
        <boxGeometry args={[w + 0.12, h + 0.12, 0.06]} />
        <meshStandardMaterial color={moldura} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0, 0.065]}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial map={tex} emissiveMap={tex} emissive="#ffffff" emissiveIntensity={0.6} />
      </mesh>
    </group>
  );
}

const FUNDO = "#1f2430";
const TEXTO = "#f6f2ea";
const SUAVE = "#9aa3b2";

function titulo(ctx: CanvasRenderingContext2D, t: string, x: number, y: number, tam = 40) {
  ctx.fillStyle = TEXTO;
  ctx.font = `bold ${tam}px system-ui, sans-serif`;
  ctx.fillText(t, x, y);
}

function cortar(ctx: CanvasRenderingContext2D, t: string, max: number) {
  if (ctx.measureText(t).width <= max) return t;
  let s = t;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > max) s = s.slice(0, -1);
  return `${s}…`;
}

/* ---------- Mural de metas (recepção) ---------- */

export function MuralMetasVivo() {
  const metas = useStore((s) => s.metas);
  const tex = useTelaViva(
    1024,
    320,
    (ctx, w, h) => {
      ctx.fillStyle = FUNDO;
      ctx.fillRect(0, 0, w, h);
      titulo(ctx, "Metas do trimestre", 36, 64, 44);
      const krs = metas.flatMap((m) => m.resultados).slice(0, 3);
      if (!krs.length) {
        ctx.fillStyle = SUAVE;
        ctx.font = "30px system-ui, sans-serif";
        ctx.fillText("Nenhuma meta ainda. Clique para criar.", 36, 160);
        return;
      }
      const cores = ["#06d6a0", "#ffd166", "#8ecae6"];
      krs.forEach((kr, i) => {
        const y = 100 + i * 70;
        const p = Math.max(0, Math.min(1, kr.alvo ? kr.atual / kr.alvo : 0));
        ctx.fillStyle = SUAVE;
        ctx.font = "24px system-ui, sans-serif";
        ctx.fillText(cortar(ctx, kr.descricao, w - 220), 36, y + 4);
        ctx.fillStyle = "#2f3542";
        ctx.fillRect(36, y + 16, w - 220, 24);
        ctx.fillStyle = cores[i]!;
        ctx.fillRect(36, y + 16, (w - 220) * p, 24);
        ctx.fillStyle = TEXTO;
        ctx.font = "bold 28px system-ui, sans-serif";
        ctx.fillText(`${Math.round(p * 100)}%`, w - 160, y + 38);
      });
    },
    [metas],
  );
  return (
    <Interativo dica="Metas do trimestre · abrir Rotina" onClick={() => useStore.getState().setRotinaAberta(true, "metas")}>
      <group position={[0, 1.6, 0]}>
        <Tela tex={tex} w={4} h={1.25} moldura="#3a3f4b" />
      </group>
    </Interativo>
  );
}

/* ---------- Kanban da parede (Produto) ---------- */

export function KanbanVivo({ w = 3.4 }: { w?: number }) {
  const cards = useStore((s) => s.cards);
  const lista = Object.values(cards).filter((c) => c.fluxo === "software" && !c.demo);
  const tex = useTelaViva(
    1024,
    560,
    (ctx, cw, ch) => {
      ctx.fillStyle = "#fbfaf6";
      ctx.fillRect(0, 0, cw, ch);
      const colunas = fluxos.software.colunas.filter((c) => !["seguranca", "bug"].includes(c.id)).slice(0, 7);
      const larg = cw / colunas.length;
      const postIts = ["#ffd166", "#8ecae6", "#ffafcc", "#b9fbc0", "#cdb4db"];
      colunas.forEach((col, i) => {
        const x = i * larg;
        ctx.fillStyle = "#1f2430";
        ctx.font = "bold 22px system-ui, sans-serif";
        ctx.fillText(cortar(ctx, col.nome, larg - 16), x + 10, 34);
        const daColuna = lista.filter((c) => c.coluna === col.id);
        ctx.fillStyle = "#9aa3b2";
        ctx.font = "20px system-ui, sans-serif";
        ctx.fillText(String(daColuna.length), x + 10, 60);
        if (i) {
          ctx.strokeStyle = "#e5e1d8";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(x, 10);
          ctx.lineTo(x, ch - 10);
          ctx.stroke();
        }
        daColuna.slice(0, 5).forEach((c: Card, k) => {
          const y = 76 + k * 94;
          ctx.fillStyle = postIts[(c.id + k) % postIts.length]!;
          ctx.fillRect(x + 8, y, larg - 16, 84);
          ctx.fillStyle = "#1f2430";
          ctx.font = "bold 16px system-ui, sans-serif";
          ctx.fillText(c.chave, x + 14, y + 22);
          ctx.font = "16px system-ui, sans-serif";
          ctx.fillText(cortar(ctx, c.titulo, larg - 28), x + 14, y + 46);
          ctx.fillStyle = "#555";
          ctx.fillText(cortar(ctx, agentById[c.dono ?? ""]?.nome ?? "", larg - 28), x + 14, y + 70);
        });
      });
    },
    [lista.map((c) => `${c.id}:${c.coluna}:${c.titulo}`).join("|")],
  );
  return (
    <Interativo dica="Board de Software · abrir" onClick={() => useStore.getState().setModoBoard("cheia")}>
      <Tela tex={tex} w={w} h={w * 0.55} moldura="#8a6a4a" />
    </Interativo>
  );
}

/* ---------- TV da Sala de Reunião: a última ata ---------- */

export function TvAta() {
  const novas = useStore((s) => s.atasNovas);
  const rituais = useStore((s) => s.rituais);
  const [antiga, setAntiga] = useState<Ata | null>(null);
  useEffect(() => void api<Ata[]>("/api/atas").then((l) => setAntiga(l.sort((a, b) => b.ts - a.ts)[0] ?? null)).catch(() => {}), []);
  const ata = novas[0] ?? antiga;
  const tex = useTelaViva(
    1024,
    576,
    (ctx, w, h) => {
      ctx.fillStyle = FUNDO;
      ctx.fillRect(0, 0, w, h);
      if (!ata) {
        titulo(ctx, "Sala de Reunião", 40, 80, 46);
        ctx.fillStyle = SUAVE;
        ctx.font = "28px system-ui, sans-serif";
        ctx.fillText("As atas dos rituais aparecem aqui.", 40, 150);
        return;
      }
      const nome = rituais.find((r) => r.id === ata.ritual)?.nome ?? ata.ritual;
      titulo(ctx, `Última ata · ${nome}`, 40, 72, 40);
      ctx.fillStyle = SUAVE;
      ctx.font = "24px system-ui, sans-serif";
      ctx.fillText(`${new Date(ata.ts).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} · ${agentById[ata.autor]?.nome ?? ""}`, 40, 112);
      ctx.fillStyle = TEXTO;
      ctx.font = "26px system-ui, sans-serif";
      const linhas = ata.conteudo.replace(/[#*_`>]/g, "").split("\n").map((l) => l.trim()).filter(Boolean);
      linhas.slice(0, 12).forEach((l, i) => ctx.fillText(cortar(ctx, l, w - 80), 40, 168 + i * 34));
    },
    [ata?.id, ata?.conteudo, rituais.length],
  );
  return (
    <Interativo dica="Atas dos rituais · abrir Rotina" onClick={() => useStore.getState().setRotinaAberta(true, "atas")}>
      <Tela tex={tex} w={3} h={1.69} />
    </Interativo>
  );
}

/* ---------- Painel da Equipe (Diretoria) ---------- */

export function PainelEquipe() {
  const estados = useStore((s) => s.estados);
  const custo = useStore((s) => s.custoHojeUsd);
  const motor = useStore((s) => s.motor);
  const ativos = agents.filter((a) => (estados[a.id]?.status ?? "ocioso") !== "ocioso").length;
  const tex = useTelaViva(
    768,
    432,
    (ctx, w, h) => {
      ctx.fillStyle = FUNDO;
      ctx.fillRect(0, 0, w, h);
      titulo(ctx, "Equipe agora", 32, 60, 38);
      const blocos: [string, string, string][] = [
        ["Trabalhando", `${ativos}/${agents.length}`, "#60a5fa"],
        ["Custo hoje", custo.toLocaleString("pt-BR", { style: "currency", currency: "USD" }), "#fbbf24"],
        ["Na fila", String(motor.naFila), "#a78bfa"],
        ["Status", motor.pausado ? "Pausada" : motor.semOrcamento ? "Sem orçamento" : "Trabalhando", motor.pausado || motor.semOrcamento ? "#f87171" : "#34d399"],
      ];
      blocos.forEach(([rot, val, cor], i) => {
        const x = 32 + (i % 2) * 360;
        const y = 110 + Math.floor(i / 2) * 150;
        ctx.fillStyle = "#2a2f3b";
        ctx.fillRect(x, y, 330, 128);
        ctx.fillStyle = SUAVE;
        ctx.font = "24px system-ui, sans-serif";
        ctx.fillText(rot, x + 18, y + 38);
        ctx.fillStyle = cor;
        ctx.font = "bold 44px system-ui, sans-serif";
        ctx.fillText(cortar(ctx, val, 300), x + 18, y + 96);
      });
    },
    [ativos, custo, motor.naFila, motor.pausado, motor.semOrcamento],
  );
  return (
    <Interativo
      dica="Equipe · abrir o menu"
      onClick={() => {
        garantirTopo();
        useStore.getState().setEquipeAberta(true);
      }}
    >
      <Tela tex={tex} w={2.2} h={1.24} />
    </Interativo>
  );
}

/* ---------- TV de indicadores (Dados) ---------- */

export function TvIndicadores() {
  const cards = useStore((s) => s.cards);
  const lista = Object.values(cards).filter((c) => !c.demo);
  const semana = Date.now() - 7 * 86_400_000;
  const tipo = (c: Card) => colunaDe(c.fluxo, c.coluna)?.tipo;
  const n = {
    concluidos: lista.filter((c) => tipo(c) === "feito" && c.atualizadoEm >= semana).length,
    andando: lista.filter((c) => tipo(c) === "trabalho" || c.emValidacao).length,
    ceo: lista.filter((c) => tipo(c) === "ceo").length,
    bugs: lista.filter((c) => c.tipo === "bug" && tipo(c) !== "feito").length,
  };
  const tex = useTelaViva(
    1024,
    576,
    (ctx, w, h) => {
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(0, 0, w, h);
      titulo(ctx, "Indicadores", 40, 70, 44);
      const itens: [string, number, string][] = [
        ["Concluídos (7 dias)", n.concluidos, "#2dd4bf"],
        ["Em andamento", n.andando, "#60a5fa"],
        ["Esperando você", n.ceo, "#fbbf24"],
        ["Bugs abertos", n.bugs, "#f87171"],
      ];
      const max = Math.max(1, ...itens.map((i) => i[1]));
      itens.forEach(([rot, v, cor], i) => {
        const y = 130 + i * 105;
        ctx.fillStyle = SUAVE;
        ctx.font = "26px system-ui, sans-serif";
        ctx.fillText(rot, 40, y);
        ctx.fillStyle = "#1e293b";
        ctx.fillRect(40, y + 14, w - 200, 40);
        ctx.fillStyle = cor;
        ctx.fillRect(40, y + 14, ((w - 200) * v) / max, 40);
        ctx.fillStyle = TEXTO;
        ctx.font = "bold 36px system-ui, sans-serif";
        ctx.fillText(String(v), w - 140, y + 46);
      });
    },
    [n.concluidos, n.andando, n.ceo, n.bugs],
  );
  return (
    <Interativo dica="Indicadores · abrir Rotina" onClick={() => useStore.getState().setRotinaAberta(true, "indicadores")}>
      <Tela tex={tex} w={2.8} h={1.58} />
    </Interativo>
  );
}

/* ---------- Sino de vendas (Comercial) ---------- */

export function SinoVendas() {
  const sino = useRef<Group>(null);
  const balanco = useRef(0);
  const cards = useStore((s) => s.cards);
  // Toca sozinho quando um card do Comercial chega a "Fechado".
  const fechados = Object.values(cards).filter((c) => c.fluxo === "comercial" && c.coluna === "fechado").length;
  const antes = useRef(fechados);
  useEffect(() => {
    if (fechados > antes.current) {
      balanco.current = 1;
      tocarSino(false);
    }
    antes.current = fechados;
  }, [fechados]);
  useFrame(({ clock }, dt) => {
    if (!sino.current) return;
    balanco.current = Math.max(0, balanco.current - dt * 0.5);
    sino.current.rotation.z = Math.sin(clock.elapsedTime * 14) * 0.45 * balanco.current;
  });
  return (
    <Interativo
      dica="Sino de vendas · tocar"
      onClick={() => {
        balanco.current = 1;
        tocarSino(true);
      }}
    >
      <mesh position={[0, 0.5, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.05, 1, 8]} />
        <meshStandardMaterial color="#5b3f27" />
      </mesh>
      <mesh position={[0, 1.02, 0]}>
        <boxGeometry args={[0.6, 0.05, 0.05]} />
        <meshStandardMaterial color="#5b3f27" />
      </mesh>
      <group ref={sino} position={[0.2, 1.0, 0]}>
        <mesh position={[0, -0.16, 0]} castShadow>
          <cylinderGeometry args={[0.06, 0.16, 0.22, 16, 1, true]} />
          <meshStandardMaterial color="#e9b949" metalness={0.8} roughness={0.25} side={2} />
        </mesh>
        <mesh position={[0, -0.29, 0]}>
          <sphereGeometry args={[0.035, 8, 6]} />
          <meshStandardMaterial color="#b08a2e" metalness={0.8} />
        </mesh>
      </group>
    </Interativo>
  );
}

/* ---------- Livro da Empresa na biblioteca (Documentação) ---------- */

export function LivroDaEmpresa() {
  const mat = useRef<MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    if (mat.current) mat.current.emissiveIntensity = 0.35 + Math.sin(clock.elapsedTime * 2) * 0.15;
  });
  return (
    <Interativo dica="Livro da Empresa · abrir" onClick={() => useStore.getState().setLivroAberto(true, "livro")}>
      {/* Púlpito com o livro aberto */}
      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[0.5, 1, 0.4]} />
        <meshStandardMaterial color="#8a6a4a" />
      </mesh>
      <group position={[0, 1.04, 0]} rotation={[-0.35, 0, 0]}>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.15, 0.02, 0]} rotation={[0, 0, s * -0.12]}>
            <boxGeometry args={[0.3, 0.03, 0.4]} />
            <meshStandardMaterial ref={s === 1 ? mat : undefined} color="#f6f2ea" emissive="#ffd38a" emissiveIntensity={0.35} />
          </mesh>
        ))}
      </group>
    </Interativo>
  );
}

/* ---------- Vapor da cafeteira (quando alguém pega café) ---------- */

export function VaporCafe() {
  const tempoLivre = useStore((s) => s.tempoLivre);
  const ativo = Object.values(tempoLivre).some((t) => t?.includes("café"));
  const g = useRef<Group>(null);
  useFrame(({ clock }) => {
    g.current?.children.forEach((c, i) => {
      const t = (clock.elapsedTime * 0.6 + i / 4) % 1;
      c.position.set(Math.sin(t * 6 + i) * 0.05, 1.3 + t * 0.7, 0);
      c.scale.setScalar(0.06 + t * 0.12);
      ((c as Mesh).material as MeshStandardMaterial).opacity = (1 - t) * 0.5;
    });
  });
  if (!ativo) return null;
  return (
    <group ref={g} userData={{ vivo: true }}>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i}>
          <sphereGeometry args={[1, 8, 6]} />
          <meshStandardMaterial color="#ffffff" transparent opacity={0.4} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

/* ---------- Portas de vidro automáticas ---------- */

const ABRE_A = 2.2; // distância (m) em que a porta começa a abrir

export function PortasAutomaticas() {
  const portas = useMemo(() => roomRects.map((r) => ({ id: r.id, x: r.x, z: r.z + r.profundidade / 2 })), []);
  const folhas = useRef<(Group | null)[]>([]);
  const abertura = useRef(portas.map(() => 0));
  const controles = useMemo(() => deskSpots.map((d) => comportamentoDe(d.agenteId)), []);
  const camControles = useThree((s) => s.controls) as CameraControlsImpl | null;
  const foco = useMemo(() => new Vector3(), []);
  const estavaAberta = useRef(portas.map(() => false));
  useFrame((_, dt) => {
    camControles?.getTarget(foco);
    portas.forEach((p, i) => {
      const perto = controles.some((c) => Math.abs(c.x - p.x) < ABRE_A && Math.abs(c.z - p.z) < ABRE_A);
      if (perto && !estavaAberta.current[i]) tocarPorta(atenuar(Math.hypot(p.x - foco.x, p.z - foco.z), 16));
      estavaAberta.current[i] = perto;
      const alvo = perto ? 1 : 0;
      abertura.current[i]! += (alvo - abertura.current[i]!) * Math.min(1, dt * 6);
      const g = folhas.current[i];
      if (!g) return;
      const a = abertura.current[i]!;
      g.children[0]!.position.x = -PORTA_SALA / 4 - a * (PORTA_SALA / 2 - 0.1);
      g.children[1]!.position.x = PORTA_SALA / 4 + a * (PORTA_SALA / 2 - 0.1);
    });
  });
  return (
    <group userData={{ vivo: true }}>
      {portas.map((p, i) => (
        <group key={p.id} ref={(el) => void (folhas.current[i] = el)} position={[p.x, 0, p.z]}>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[(s * PORTA_SALA) / 4, 1.05, 0]}>
              <boxGeometry args={[PORTA_SALA / 2 - 0.04, 2.1, 0.04]} />
              <meshStandardMaterial color="#cfe8f5" transparent opacity={0.28} roughness={0.05} metalness={0.2} depthWrite={false} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

/* ---------- Rádio da copa: liga e desliga a música ambiente ---------- */

export function Radio() {
  const musica = useSons((s) => s.musica);
  const notas = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!notas.current) return;
    notas.current.visible = musica;
    notas.current.children.forEach((n, i) => {
      const t = (clock.elapsedTime * 0.5 + i / 3) % 1;
      n.position.set(0.15 + Math.sin(t * 5 + i) * 0.1, 0.45 + t * 0.6, 0);
      n.scale.setScalar(1 - t * 0.6);
    });
  });
  return (
    <Interativo dica={musica ? "Rádio · desligar a música" : "Rádio · tocar música lo-fi"} onClick={() => useSons.getState().configurar({ musica: !musica })}>
      <mesh position={[0, 0.17, 0]} castShadow>
        <boxGeometry args={[0.5, 0.3, 0.18]} />
        <meshStandardMaterial color="#c1121f" roughness={0.6} />
      </mesh>
      <mesh position={[-0.1, 0.17, 0.091]}>
        <circleGeometry args={[0.1, 20]} />
        <meshStandardMaterial color="#3a3f4b" />
      </mesh>
      <mesh position={[0.15, 0.2, 0.091]}>
        <planeGeometry args={[0.14, 0.08]} />
        <meshStandardMaterial color="#fde68a" emissive="#fde68a" emissiveIntensity={musica ? 0.9 : 0.1} />
      </mesh>
      <mesh position={[0.18, 0.42, 0]} rotation={[0, 0, -0.3]}>
        <cylinderGeometry args={[0.008, 0.008, 0.3, 4]} />
        <meshStandardMaterial color="#9aa3b2" metalness={0.8} />
      </mesh>
      <group ref={notas}>
        {["♪", "♫", "♪"].map((_, i) => (
          <mesh key={i}>
            <sphereGeometry args={[0.035, 8, 6]} />
            <meshBasicMaterial color={["#e76f51", "#2a9d8f", "#e9c46a"][i]} />
          </mesh>
        ))}
      </group>
    </Interativo>
  );
}
