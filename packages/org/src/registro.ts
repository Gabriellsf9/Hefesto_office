import { fluxoDaSala, fluxos, type Agent, type EscritorioDef, type Fluxo, type Room, type RoomId } from "@empresa/shared";
import { AGENTES_SEDE, agentById, agents, montarAgente } from "./agents.ts";
import { roomById, rooms, SALAS_SEDE } from "./rooms.ts";
import { distribuirEmFileiras, FILEIRAS_SEDE, plantaAutomatica, recalcularPlanta } from "./layout.ts";

// Registro de escritórios (DESIGN-ESCRITORIOS.md): cada escritório tem salas, equipe, fluxos e planta.
// - agentById, roomById, fluxos e fluxoDaSala guardam TODOS os escritórios (o servidor trabalha em todos).
// - agents e rooms são do escritório ATIVO (a tela e o 3D mostram um por vez).
// Os objetos são alterados no lugar: quem já os importou continua com a referência certa.

export const SEDE = "sede";

const FLUXOS_SEDE: Fluxo[] = Object.values(fluxos).map((f) => ({ ...f, base: f.base ?? (f.id as Fluxo["base"]) }));
const FLUXO_DA_SALA_SEDE = { ...fluxoDaSala };

/** A sede: o escritório completo de hoje (58 agentes, 16 salas, 5 fluxos), com os ids de sempre. */
export function escritorioSede(): EscritorioDef {
  return {
    id: SEDE,
    nome: "Sede",
    descricao: "Software house completa: produto, design, engenharia, qualidade, dados, marketing, comercial, sucesso do cliente e administrativo.",
    modelo: "software-house",
    projetoId: null,
    salas: SALAS_SEDE.map((r) => ({ ...r })),
    agentes: AGENTES_SEDE.map((a) => ({ ...a })),
    fluxos: FLUXOS_SEDE.map((f) => ({ ...f, colunas: f.colunas.map((c) => ({ ...c })) })),
    fluxoDaSala: { ...FLUXO_DA_SALA_SEDE },
    planta: { fileiras: FILEIRAS_SEDE.map((f) => f.itens.map(([id]) => id).filter((id) => SALAS_SEDE.some((r) => r.id === id))) },
    criadoEm: 0,
    atualizadoEm: 0,
  };
}

const definicoes = new Map<string, EscritorioDef>([[SEDE, escritorioSede()]]);
const escritorioDaSala: Record<RoomId, string> = {};
const escritorioDoFluxo: Record<string, string> = {};
let ativo = SEDE;

const limpar = (o: Record<string, unknown>) => { for (const k of Object.keys(o)) delete o[k]; };

/** Registra os escritórios (a sede sempre existe; uma definição "sede" vinda do banco substitui a padrão). */
export function registrarEscritorios(defs: EscritorioDef[]) {
  definicoes.clear();
  definicoes.set(SEDE, escritorioSede());
  for (const d of defs) definicoes.set(d.id, d);
  limpar(agentById);
  limpar(roomById);
  limpar(fluxos);
  limpar(fluxoDaSala);
  limpar(escritorioDaSala);
  limpar(escritorioDoFluxo);
  for (const d of definicoes.values()) {
    d.agentes.forEach((a, i) => { agentById[a.id] = montarAgente(a, i, d.id); });
    for (const s of d.salas) {
      roomById[s.id] = { id: s.id, nome: s.nome, descricao: s.descricao, cor: s.cor, validador: s.validador };
      escritorioDaSala[s.id] = d.id;
    }
    for (const f of d.fluxos) {
      fluxos[f.id] = f;
      escritorioDoFluxo[f.id] = d.id;
    }
    Object.assign(fluxoDaSala, d.fluxoDaSala);
    // Toda sala tem um fluxo padrão: o do mapa ou o primeiro do escritório.
    for (const s of d.salas) if (!fluxoDaSala[s.id] && d.fluxos[0]) fluxoDaSala[s.id] = d.fluxos[0].id;
  }
  ativarEscritorio(definicoes.has(ativo) ? ativo : SEDE);
}

/** Troca o escritório mostrado (salas, equipe e planta do 3D). */
export function ativarEscritorio(id: string) {
  const d = definicoes.get(id) ?? definicoes.get(SEDE)!;
  ativo = d.id;
  rooms.length = 0;
  rooms.push(...d.salas.map((s) => roomById[s.id]!));
  agents.length = 0;
  agents.push(...d.agentes.map((a) => agentById[a.id]!));
  const membros = (sala: RoomId) => d.agentes.filter((a) => a.sala === sala).length;
  if (d.id === SEDE && d.planta.fileiras.flat().length === SALAS_SEDE.length && d.salas.length === SALAS_SEDE.length) recalcularPlanta(FILEIRAS_SEDE);
  else {
    const naPlanta = new Set(d.planta.fileiras.flat());
    const fora = d.salas.map((s) => s.id).filter((s) => !naPlanta.has(s));
    const fileiras = [...d.planta.fileiras.map((f) => f.filter((s) => roomById[s])).filter((f) => f.length), ...distribuirEmFileiras(fora, membros)];
    recalcularPlanta(plantaAutomatica(fileiras, membros));
  }
}

export const escritorioAtivo = () => ativo;
export const definicaoDe = (id: string) => definicoes.get(id) ?? null;
export const listarDefinicoes = () => [...definicoes.values()];
export const escritorioDe = (sala: RoomId) => escritorioDaSala[sala] ?? SEDE;
export const escritorioDoFluxoId = (fluxo: string) => escritorioDoFluxo[fluxo] ?? SEDE;
export const escritorioDoAgente = (id: string) => agentById[id]?.escritorio ?? SEDE;

/** Agentes de um escritório (para prompts, diretório e escolha de validadores). */
export const agentesDe = (escritorio: string): Agent[] => Object.values(agentById).filter((a) => (a.escritorio ?? SEDE) === escritorio);
export const salasDe = (escritorio: string): Room[] => (definicoes.get(escritorio)?.salas ?? []).map((s) => roomById[s.id]!).filter(Boolean);
export const fluxosDe = (escritorio: string): Fluxo[] => definicoes.get(escritorio)?.fluxos ?? [];
/** Quem recebe os pedidos do CEO no chat deste escritório. */
export function coordenadorDe(escritorio: string): Agent | null {
  const equipe = agentesDe(escritorio);
  return equipe.find((a) => a.papel === "coordenador") ?? equipe.find((a) => a.lider) ?? equipe[0] ?? null;
}
