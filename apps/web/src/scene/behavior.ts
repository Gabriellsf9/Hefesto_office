import type { AgentStatus } from "@empresa/shared";
import { agentById, agents } from "@empresa/org";
import { useStore } from "../store.ts";
import { aoLadoDaMesa, assentoDaMesa, rota, type Lugar, type Ponto } from "./nav.ts";
import { assentosReuniao, pois, rotulosAcao, type Acao } from "./pois.ts";

// Vida no escritório: quando o agente está ocioso ele levanta, toma café, come,
// descansa ou vai conversar com um colega. Quando recebe trabalho, volta (rápido)
// para a mesa e senta no computador. O validador vai até a mesa de quem ele valida.

export type Pose = "sentado" | "em-pe" | "andando";
export type ItemNaMao = "xicara" | "fruta" | "copo" | "livro" | null;

const VELOCIDADE_LIVRE = 1.7;
const VELOCIDADE_TRABALHO = 4.2;
const MAX_PASSEANDO = 10;

const itemDaAcao: Partial<Record<Acao, ItemNaMao>> = { cafe: "xicara", comer: "fruta", agua: "copo", ler: "livro" };
/** Emoji do balão que aparece sobre a cabeça enquanto o agente faz aquilo. */
const emojiDaAcao: Record<Acao, string> = {
  cafe: "☕", comer: "🍎", agua: "💧", puff: "😌", sofa: "😌", poltrona: "🤔", ler: "📚", jogar: "🎱", banco: "🌳", aquario: "🐠",
};

interface Destino {
  chave: string;
  lugar: Lugar;
  /** Rotação ao chegar; função para olhar para algo que pode estar em outro ponto. */
  rot: number | ((x: number, z: number) => number);
  sentado: boolean;
  alturaAssento: number;
  item: ItemNaMao;
  texto: string | null;
  rapido: boolean;
  emoji?: string;
}

const controladores = new Map<string, Comportamento>();
if (import.meta.env.DEV) (window as unknown as { __comportamentos: typeof controladores }).__comportamentos = controladores;
const poisOcupados = new Set<number>();

export function comportamentoDe(id: string) {
  let c = controladores.get(id);
  if (!c) controladores.set(id, (c = new Comportamento(id)));
  return c;
}

const passeando = () => [...controladores.values()].filter((c) => c.livreForaDaMesa).length;
const sorteia = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]!;

export class Comportamento {
  x: number;
  z: number;
  yaw = 0;
  pose: Pose = "sentado";
  alturaAssento = 0;
  item: ItemNaMao = null;
  /** Fase da caminhada, usada para balançar braços e pernas. */
  passo = 0;

  private readonly mesa: Lugar;
  private percurso: Ponto[] = []; // [onde estava, ...pontos]
  private proximo = 0;
  private destino: Destino;
  private chegou = true;
  private timer: number;
  private poiAtual: number | null = null;

  constructor(private readonly id: string) {
    this.mesa = assentoDaMesa(id);
    this.x = this.mesa.x;
    this.z = this.mesa.z;
    this.destino = this.destinoMesa(false);
    this.timer = 6 + Math.random() * 50;
  }

  get livreForaDaMesa() {
    return this.destino.chave !== "mesa" && !this.destino.rapido;
  }

  /** Balão com emoji sobre a cabeça: só depois de chegar (no café, no puff, conversando…). */
  get balao(): string | null {
    return this.chegou ? (this.destino.emoji ?? null) : null;
  }

  get sentadoNaMesa() {
    return this.chegou && this.destino.chave === "mesa";
  }

  private destinoMesa(rapido: boolean): Destino {
    return { chave: "mesa", lugar: this.mesa, rot: 0, sentado: true, alturaAssento: 0, item: null, texto: null, rapido };
  }

  /** Cadeira da mesa da Sala de Reunião (rituais). */
  private destinoReuniao(i: number): Destino {
    const a = assentosReuniao[i % assentosReuniao.length]!;
    return { chave: `reuniao:${i}`, lugar: a, rot: a.rot, sentado: true, alturaAssento: 0, item: null, texto: null, rapido: true };
  }

  private destinoAoLado(outro: string, texto: string | null, rapido: boolean): Destino {
    const assento = assentoDaMesa(outro);
    return {
      chave: `${rapido ? "visita" : "conversa"}:${outro}`,
      lugar: aoLadoDaMesa(outro),
      rot: (x, z) => Math.atan2(assento.x - x, assento.z - z),
      sentado: false,
      alturaAssento: 0,
      item: null,
      texto,
      rapido,
      emoji: rapido ? undefined : "💬",
    };
  }

  update(dt: number, status: AgentStatus, com: string | null) {
    const trabalhando = status !== "ocioso";

    if (trabalhando) {
      const reuniao = status === "em-reuniao" && com?.startsWith("reuniao:") ? Number(com.slice(8)) : null;
      const alvo =
        reuniao !== null
          ? this.destinoReuniao(reuniao)
          : status === "validando" && com && com !== this.id && agentById[com]
            ? this.destinoAoLado(com, null, true)
            : this.destinoMesa(true);
      if (alvo.chave !== this.destino.chave) this.irPara(alvo);
    } else if (this.destino.rapido) {
      // Terminou o trabalho: se estava fora (validando), volta com calma para a mesa.
      this.irPara(this.destinoMesa(false));
    } else if (this.chegou) {
      this.timer -= dt;
      if (this.timer <= 0) {
        if (this.destino.chave === "mesa") this.escolherPasseio();
        else this.irPara(this.destinoMesa(false));
      }
    }

    this.andar(dt);
  }

  private escolherPasseio() {
    this.timer = 15 + Math.random() * 45;
    if (passeando() >= MAX_PASSEANDO) return;

    const sala = this.mesa.sala;
    const r = Math.random();
    if (r < 0.25) {
      const colegas = agents.filter((a) => a.id !== this.id && comportamentoDe(a.id).sentadoNaMesa && a.sala === sala);
      const candidatos = colegas.length ? colegas : agents.filter((a) => a.id !== this.id && comportamentoDe(a.id).sentadoNaMesa);
      if (candidatos.length) {
        const outro = sorteia(candidatos);
        const d = this.destinoAoLado(outro.id, `Conversando com ${outro.nome} 💬`, false);
        this.irPara(d);
        return;
      }
    }

    const livres = pois.map((p, i) => ({ p, i })).filter(({ i }) => !poisOcupados.has(i));
    if (!livres.length) return;
    const daSala = livres.filter(({ p }) => p.sala === sala);
    // Café é o lugar mais disputado do escritório.
    const pesados = livres.flatMap((e) => (e.p.acao === "cafe" || e.p.acao === "comer" ? [e, e] : [e]));
    const { p, i } = daSala.length && Math.random() < 0.5 ? sorteia(daSala) : sorteia(pesados);
    poisOcupados.add(i);
    this.poiAtual = i;
    this.irPara({
      chave: `poi:${i}`,
      lugar: p,
      rot: p.rot,
      sentado: p.sentado,
      alturaAssento: p.alturaAssento,
      item: itemDaAcao[p.acao] ?? null,
      texto: rotulosAcao[p.acao],
      rapido: false,
      emoji: emojiDaAcao[p.acao],
    });
  }

  private irPara(d: Destino) {
    if (this.poiAtual !== null && d.chave !== `poi:${this.poiAtual}`) {
      poisOcupados.delete(this.poiAtual);
      this.poiAtual = null;
    }

    // A busca de caminho parte de onde o agente está agora, inclusive no meio de outro trajeto.
    this.percurso = [{ x: this.x, z: this.z }, ...rota({ x: this.x, z: this.z }, d.lugar)];
    this.proximo = 1;

    this.destino = d;
    this.chegou = false;
    this.item = null;
    this.timer = 8 + Math.random() * 12;
    useStore.getState().setTempoLivre(this.id, d.texto ? `A caminho: ${d.texto}` : null);
  }

  private andar(dt: number) {
    if (this.chegou) {
      const alvo = typeof this.destino.rot === "function" ? this.destino.rot(this.x, this.z) : this.destino.rot;
      this.yaw = girarPara(this.yaw, alvo, dt * 6);
      return;
    }

    const vel = this.destino.rapido ? VELOCIDADE_TRABALHO : VELOCIDADE_LIVRE;
    let restante = vel * dt;
    while (restante > 0 && this.proximo < this.percurso.length) {
      const p = this.percurso[this.proximo]!;
      const dx = p.x - this.x;
      const dz = p.z - this.z;
      const dist = Math.hypot(dx, dz);
      if (dist <= restante) {
        this.x = p.x;
        this.z = p.z;
        restante -= dist;
        this.proximo++;
      } else {
        this.x += (dx / dist) * restante;
        this.z += (dz / dist) * restante;
        this.yaw = girarPara(this.yaw, Math.atan2(dx, dz), dt * 10);
        restante = 0;
      }
    }
    this.pose = "andando";
    this.passo += dt * vel * 4.2;

    if (this.proximo >= this.percurso.length) {
      this.chegou = true;
      this.pose = this.destino.sentado ? "sentado" : "em-pe";
      this.alturaAssento = this.destino.alturaAssento;
      this.item = this.destino.item;
      useStore.getState().setTempoLivre(this.id, this.destino.texto);
    }
  }
}

function girarPara(atual: number, alvo: number, k: number) {
  let d = alvo - atual;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return atual + d * Math.min(1, k);
}
