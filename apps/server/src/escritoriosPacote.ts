import type { AgenteDef, EscritorioDef, Fluxo } from "@empresa/shared";
import { listarDefinicoes } from "@empresa/org";
import { ErroCard } from "./tarefas.ts";
import { salvarEscritorio } from "./escritorios.ts";
import { auditar } from "./confianca/auditoria.ts";

// Exportar e importar: um escritório inteiro, um agente ou um fluxo vira um arquivo JSON que você
// guarda, versiona ou passa para outra pessoa. Na importação, ids que já existem ganham um sufixo
// (e as referências entre salas, agentes e fluxos acompanham). Nada de segredo vai no arquivo.

const VERSAO = 1;
type Pacote =
  | { formato: "hefesto/escritorio"; versao: number; exportadoEm: number; escritorio: EscritorioDef }
  | { formato: "hefesto/agente"; versao: number; exportadoEm: number; agente: AgenteDef }
  | { formato: "hefesto/fluxo"; versao: number; exportadoEm: number; fluxo: Fluxo };

const definicao = (id: string) => {
  const d = listarDefinicoes().find((x) => x.id === id);
  if (!d) throw new ErroCard("Escritório não encontrado.", 404);
  return d;
};

export function exportarEscritorio(id: string): Pacote {
  const d = structuredClone(definicao(id));
  // O projeto ligado é do seu Mac: não faz sentido em outra máquina.
  return { formato: "hefesto/escritorio", versao: VERSAO, exportadoEm: Date.now(), escritorio: { ...d, projetoId: null } };
}

export function exportarAgente(escritorioId: string, agenteId: string): Pacote {
  const a = definicao(escritorioId).agentes.find((x) => x.id === agenteId);
  if (!a) throw new ErroCard("Agente não encontrado neste escritório.", 404);
  return { formato: "hefesto/agente", versao: VERSAO, exportadoEm: Date.now(), agente: structuredClone(a) };
}

export function exportarFluxo(escritorioId: string, fluxoId: string): Pacote {
  const f = definicao(escritorioId).fluxos.find((x) => x.id === fluxoId);
  if (!f) throw new ErroCard("Fluxo não encontrado neste escritório.", 404);
  return { formato: "hefesto/fluxo", versao: VERSAO, exportadoEm: Date.now(), fluxo: structuredClone(f) };
}

/** Todos os ids em uso (escritórios, salas, agentes e fluxos), para não colidir. */
function idsEmUso(): Set<string> {
  return new Set(listarDefinicoes().flatMap((d) => [d.id, ...d.salas.map((s) => s.id), ...d.agentes.map((a) => a.id), ...d.fluxos.map((f) => f.id)]));
}

function livre(id: string, usados: Set<string>): string {
  const base = id.toLowerCase().replace(/[^a-z0-9.-]/g, "-").replace(/^-+/, "").slice(0, 50) || "item";
  let novo = base;
  for (let n = 2; usados.has(novo); n++) novo = `${base}-${n}`;
  usados.add(novo);
  return novo;
}

function conferirPacote(p: unknown): Pacote {
  const x = p as Partial<Pacote> | null;
  if (!x || typeof x !== "object" || typeof x.formato !== "string" || !x.formato.startsWith("hefesto/")) throw new ErroCard("Este arquivo não é um pacote do Hefesto.");
  if (typeof x.versao !== "number" || x.versao > VERSAO) throw new ErroCard("Pacote de uma versão mais nova do Hefesto: atualize antes de importar.");
  const corpo = x.formato === "hefesto/escritorio" ? (x as { escritorio?: unknown }).escritorio : x.formato === "hefesto/agente" ? (x as { agente?: unknown }).agente : x.formato === "hefesto/fluxo" ? (x as { fluxo?: unknown }).fluxo : undefined;
  if (!corpo || typeof corpo !== "object") throw new ErroCard("Pacote incompleto ou de um tipo desconhecido.");
  if (JSON.stringify(p).length > 2_000_000) throw new ErroCard("Pacote grande demais.");
  return x as Pacote;
}

export interface Importado {
  tipo: "escritorio" | "agente" | "fluxo";
  escritorioId: string;
  id: string;
  /** Ids trocados por já existirem (antigo → novo). */
  renomeados: Record<string, string>;
}

export function importarPacote(entrada: unknown, destino?: { escritorioId?: string; sala?: string }): Importado {
  const p = conferirPacote(entrada);
  const usados = idsEmUso();
  const renomeados: Record<string, string> = {};
  const trocar = (id: string) => {
    if (!usados.has(id)) {
      usados.add(id);
      return id;
    }
    const n = livre(id, usados);
    renomeados[id] = n;
    return n;
  };

  if (p.formato === "hefesto/escritorio") {
    const d = structuredClone(p.escritorio);
    if (!Array.isArray(d.salas) || !Array.isArray(d.agentes) || !Array.isArray(d.fluxos)) throw new ErroCard("Pacote de escritório incompleto.");
    const mS = new Map(d.salas.map((s) => [s.id, trocar(s.id)]));
    const mA = new Map(d.agentes.map((a) => [a.id, trocar(a.id)]));
    const mF = new Map(d.fluxos.map((f) => [f.id, trocar(f.id)]));
    const s = (id: string) => mS.get(id) ?? id;
    const a = (id: string) => mA.get(id) ?? id;
    const novo: EscritorioDef = {
      ...d,
      id: livre(d.id, usados),
      nome: listarDefinicoes().some((x) => x.nome === d.nome) ? `${d.nome} (importado)` : d.nome,
      projetoId: null,
      salas: d.salas.map((x) => ({ ...x, id: s(x.id), validador: x.validador ? a(x.validador) : null })),
      agentes: d.agentes.map((x) => ({ ...x, id: a(x.id), sala: s(x.sala), podeChamar: x.podeChamar?.map((c) => mA.get(c) ?? mS.get(c) ?? c) })),
      fluxos: d.fluxos.map((f) => ({ ...f, id: mF.get(f.id)!, colunas: f.colunas.map((c) => ({ ...c, ...(c.sala ? { sala: s(c.sala) } : {}) })) })),
      fluxoDaSala: Object.fromEntries(Object.entries(d.fluxoDaSala ?? {}).map(([sala, f]) => [s(sala), mF.get(f) ?? f])),
      planta: { fileiras: (d.planta?.fileiras ?? []).map((l) => l.map(s)) },
      criadoEm: 0,
      atualizadoEm: 0,
    };
    const salvo = salvarEscritorio(novo);
    auditar("voce", "importou escritório", salvo.id, `${salvo.nome}: ${salvo.salas.length} sala(s), ${salvo.agentes.length} agente(s), ${salvo.fluxos.length} fluxo(s)`);
    return { tipo: "escritorio", escritorioId: salvo.id, id: salvo.id, renomeados };
  }

  if (!destino?.escritorioId) throw new ErroCard("Escolha em qual escritório importar.");
  const alvo = structuredClone(definicao(destino.escritorioId));
  if (p.formato === "hefesto/agente") {
    const sala = destino.sala ?? p.agente.sala;
    if (!alvo.salas.some((x) => x.id === sala)) throw new ErroCard("Escolha uma sala deste escritório para o agente.");
    const existentes = new Set([...alvo.agentes.map((x) => x.id), ...alvo.salas.map((x) => x.id)]);
    const ag: AgenteDef = { ...p.agente, id: trocar(p.agente.id), sala, papel: undefined, lider: false, podeChamar: p.agente.podeChamar?.filter((c) => existentes.has(c)) };
    alvo.agentes.push(ag);
    salvarEscritorio(alvo);
    auditar("voce", "importou agente", ag.id, `${ag.nome} em ${alvo.nome}`);
    return { tipo: "agente", escritorioId: alvo.id, id: ag.id, renomeados };
  }
  const salas = new Set(alvo.salas.map((x) => x.id));
  const fl: Fluxo = { ...p.fluxo, id: trocar(p.fluxo.id), colunas: p.fluxo.colunas.map((c) => ({ ...c, sala: c.sala && salas.has(c.sala) ? c.sala : undefined })) };
  alvo.fluxos.push(fl);
  salvarEscritorio(alvo);
  auditar("voce", "importou fluxo", fl.id, `${fl.nome} em ${alvo.nome}`);
  return { tipo: "fluxo", escritorioId: alvo.id, id: fl.id, renomeados };
}
