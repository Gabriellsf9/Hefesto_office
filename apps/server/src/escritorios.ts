import { FERRAMENTAS_DE_AGENTE, type EscritorioDef, type EscritorioResumo, type Fluxo } from "@empresa/shared";
import { escritorioSede, listarDefinicoes, registrarEscritorios, SEDE } from "@empresa/org";
import { db } from "./db.ts";
import { emit } from "./bus.ts";
import { ErroCard, listarCards } from "./tarefas.ts";

// Escritórios personalizáveis (DESIGN-ESCRITORIOS.md): definições guardadas no SQLite e registradas
// no @empresa/org (que alimenta o motor, os prompts e o 3D). A sede vem do código, mas pode ser
// editada: a versão salva substitui a padrão.

db.exec(`CREATE TABLE IF NOT EXISTS escritorios (
  id         TEXT PRIMARY KEY,
  definicao  TEXT NOT NULL,
  criado_em  INTEGER NOT NULL,
  atualizado_em INTEGER NOT NULL
)`);

const ler = (): EscritorioDef[] => (db.prepare("SELECT definicao FROM escritorios ORDER BY criado_em").all() as { definicao: string }[]).map((r) => JSON.parse(r.definicao) as EscritorioDef);

export function carregarEscritorios() {
  registrarEscritorios(ler());
}

export const resumo = (d: EscritorioDef): EscritorioResumo => ({ id: d.id, nome: d.nome, descricao: d.descricao, modelo: d.modelo, projetoId: d.projetoId, salas: d.salas.length, agentes: d.agentes.length, fluxos: d.fluxos.length });
export const listarEscritorios = () => listarDefinicoes();

function avisar() {
  emit({ type: "escritorios", definicoes: listarDefinicoes() });
}

const ID = /^[a-z0-9][a-z0-9.-]{0,60}$/;
const COR = /^#[0-9a-f]{6}$/i;
const TIPOS_COLUNA = new Set(["fila", "trabalho", "validacao", "bug", "ceo", "feito", "perdido"]);
const FERRAMENTAS = new Set<string>(FERRAMENTAS_DE_AGENTE);
const MODELOS_IA = new Set(["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"]);

/** Confere a definição inteira; devolve a lista de problemas (vazia = ok). */
export function validar(d: EscritorioDef, outras: EscritorioDef[]): string[] {
  const erros: string[] = [];
  if (!d.nome?.trim()) erros.push("Dê um nome ao escritório.");
  if (!d.salas?.length) erros.push("O escritório precisa de pelo menos uma sala.");
  if (!d.agentes?.length) erros.push("O escritório precisa de pelo menos um agente (o coordenador).");
  if (!d.fluxos?.length) erros.push("O escritório precisa de pelo menos um fluxo.");
  const idsDeFora = new Set(outras.filter((o) => o.id !== d.id).flatMap((o) => [...o.salas.map((s) => s.id), ...o.agentes.map((a) => a.id), ...o.fluxos.map((f) => f.id)]));
  const salas = new Set<string>();
  for (const s of d.salas ?? []) {
    if (!ID.test(s.id)) erros.push(`Sala "${s.nome}": id inválido.`);
    if (salas.has(s.id) || idsDeFora.has(s.id)) erros.push(`Sala "${s.nome}": id repetido (${s.id}).`);
    salas.add(s.id);
    if (!s.nome?.trim()) erros.push(`Uma sala está sem nome.`);
    if (!COR.test(s.cor ?? "")) erros.push(`Sala "${s.nome}": cor inválida.`);
  }
  const agentes = new Set<string>();
  for (const a of d.agentes ?? []) {
    if (!ID.test(a.id)) erros.push(`Agente "${a.nome}": id inválido.`);
    if (agentes.has(a.id) || idsDeFora.has(a.id)) erros.push(`Agente "${a.nome}": id repetido (${a.id}).`);
    agentes.add(a.id);
    if (!a.nome?.trim() || !a.cargo?.trim()) erros.push(`Todo agente precisa de nome e cargo.`);
    if (!salas.has(a.sala)) erros.push(`Agente "${a.nome}": a sala "${a.sala}" não existe neste escritório.`);
    if (!a.persona?.trim()) erros.push(`Agente "${a.nome}": descreva a persona (como ele trabalha).`);
    if (a.modelo && !MODELOS_IA.has(a.modelo)) erros.push(`Agente "${a.nome}": modelo inválido.`);
    for (const f of a.ferramentas ?? []) if (!FERRAMENTAS.has(f)) erros.push(`Agente "${a.nome}": ferramenta desconhecida "${f}".`);
    if (!COR.test(a.camisa ?? "")) erros.push(`Agente "${a.nome}": cor da camisa inválida.`);
  }
  for (const s of d.salas ?? []) {
    if (s.validador && !agentes.has(s.validador)) erros.push(`Sala "${s.nome}": o validador não é deste escritório.`);
    if (d.id !== SEDE && d.modelo !== "software-house" && s.validador && d.agentes.find((a) => a.id === s.validador)?.sala === s.id && d.salas.length > 1) erros.push(`Sala "${s.nome}": o validador precisa ser de OUTRA sala (é o olhar de fora).`);
  }
  if (d.agentes?.length && !d.agentes.some((a) => a.papel === "coordenador")) erros.push("Escolha um coordenador (quem recebe os seus pedidos no chat).");
  if (d.agentes?.filter((a) => a.papel === "coordenador").length > 1) erros.push("Só um coordenador por escritório.");
  const fluxos = new Set<string>();
  for (const f of d.fluxos ?? []) {
    erros.push(...validarFluxo(f, salas));
    if (fluxos.has(f.id) || idsDeFora.has(f.id)) erros.push(`Fluxo "${f.nome}": id repetido (${f.id}).`);
    fluxos.add(f.id);
  }
  for (const [sala, fluxo] of Object.entries(d.fluxoDaSala ?? {})) {
    if (!salas.has(sala)) erros.push(`Fluxo padrão de uma sala que não existe (${sala}).`);
    if (!fluxos.has(fluxo)) erros.push(`Sala ${sala}: o fluxo padrão "${fluxo}" não é deste escritório.`);
  }
  for (const s of d.planta?.fileiras.flat() ?? []) if (!salas.has(s)) erros.push(`A planta cita uma sala que não existe (${s}).`);
  return [...new Set(erros)];
}

/** Colunas essenciais: uma fila, uma de trabalho, "Aguardando CEO" e uma de concluído. */
export function validarFluxo(f: Fluxo, salas: Set<string>): string[] {
  const e: string[] = [];
  const nome = f.nome?.trim() || f.id;
  if (!ID.test(f.id)) e.push(`Fluxo "${nome}": id inválido.`);
  if (!f.nome?.trim()) e.push("Todo fluxo precisa de nome.");
  const cols = f.colunas ?? [];
  const ids = new Set<string>();
  for (const c of cols) {
    if (!c.id || !/^[a-z0-9-]{1,40}$/.test(c.id)) e.push(`Fluxo "${nome}": coluna "${c.nome}" com id inválido.`);
    if (ids.has(c.id)) e.push(`Fluxo "${nome}": duas colunas com o id "${c.id}".`);
    ids.add(c.id);
    if (!c.nome?.trim()) e.push(`Fluxo "${nome}": coluna sem nome.`);
    if (!TIPOS_COLUNA.has(c.tipo)) e.push(`Fluxo "${nome}": coluna "${c.nome}" com papel inválido.`);
    if (c.sala && !salas.has(c.sala)) e.push(`Fluxo "${nome}": a coluna "${c.nome}" aponta para uma sala que não existe.`);
  }
  const tem = (t: string) => cols.some((c) => c.tipo === t);
  if (!tem("fila")) e.push(`Fluxo "${nome}": precisa de uma coluna de fila (onde o card espera).`);
  if (!tem("trabalho")) e.push(`Fluxo "${nome}": precisa de uma coluna de trabalho.`);
  if (!tem("ceo")) e.push(`Fluxo "${nome}": precisa da coluna "Aguardando CEO" (papel: aprovação do CEO).`);
  if (!tem("feito")) e.push(`Fluxo "${nome}": precisa de uma coluna de concluído.`);
  if (!ids.has(f.aprovarPara) || cols.find((c) => c.id === f.aprovarPara)?.tipo === "ceo") e.push(`Fluxo "${nome}": escolha para onde o card vai quando você aprova.`);
  if (!ids.has(f.devolverPara)) e.push(`Fluxo "${nome}": escolha para onde o card volta quando você devolve.`);
  return e;
}

export function salvarEscritorio(d: EscritorioDef): EscritorioDef {
  const agora = Date.now();
  const existente = listarDefinicoes().find((x) => x.id === d.id);
  const def: EscritorioDef = { ...d, criadoEm: existente?.criadoEm || d.criadoEm || agora, atualizadoEm: agora };
  // Sala que saiu do escritório com cards abertos: não deixa (os cards ficariam sem time).
  if (existente) {
    const saindo = existente.salas.map((s) => s.id).filter((s) => !def.salas.some((x) => x.id === s));
    const presos = listarCards().filter((c) => saindo.includes(c.sala) && !["feito", "perdido"].includes(fluxoTipo(c.fluxo, c.coluna)));
    if (presos.length) throw new ErroCard(`A sala "${existente.salas.find((s) => s.id === presos[0]!.sala)?.nome}" tem ${presos.length} card(s) em aberto (ex.: ${presos[0]!.chave}). Conclua ou mova os cards antes de remover a sala.`);
    const fluxosSaindo = existente.fluxos.map((f) => f.id).filter((f) => !def.fluxos.some((x) => x.id === f));
    const noFluxo = listarCards().filter((c) => fluxosSaindo.includes(c.fluxo));
    if (noFluxo.length) throw new ErroCard(`O fluxo "${existente.fluxos.find((f) => f.id === noFluxo[0]!.fluxo)?.nome}" tem ${noFluxo.length} card(s). Mova-os antes de remover o fluxo.`);
  }
  const erros = validar(def, listarDefinicoes());
  if (erros.length) throw new ErroCard(erros.slice(0, 6).join(" "));
  db.prepare("INSERT INTO escritorios (id, definicao, criado_em, atualizado_em) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET definicao = excluded.definicao, atualizado_em = excluded.atualizado_em")
    .run(def.id, JSON.stringify(def), def.criadoEm, def.atualizadoEm);
  carregarEscritorios();
  avisar();
  return def;
}

function fluxoTipo(fluxo: string, coluna: string): string {
  return listarDefinicoes().flatMap((d) => d.fluxos).find((f) => f.id === fluxo)?.colunas.find((c) => c.id === coluna)?.tipo ?? "";
}

export function excluirEscritorio(id: string) {
  if (id === SEDE) throw new ErroCard("A sede não pode ser excluída (ela guarda as funções da empresa: prospecção, WhatsApp, rituais).");
  const def = listarDefinicoes().find((d) => d.id === id);
  if (!def) throw new ErroCard("Escritório não encontrado.", 404);
  const fluxos = new Set(def.fluxos.map((f) => f.id));
  const cards = listarCards().filter((c) => fluxos.has(c.fluxo));
  if (cards.some((c) => !["feito", "perdido"].includes(fluxoTipo(c.fluxo, c.coluna)))) throw new ErroCard("Este escritório tem cards em aberto. Conclua ou exclua os cards antes.");
  db.prepare("DELETE FROM escritorios WHERE id = ?").run(id);
  carregarEscritorios();
  avisar();
}

/** Volta a sede para o padrão do sistema (desfaz as suas edições nela). */
export function restaurarSede(): EscritorioDef {
  db.prepare("DELETE FROM escritorios WHERE id = ?").run(SEDE);
  carregarEscritorios();
  avisar();
  return escritorioSede();
}
