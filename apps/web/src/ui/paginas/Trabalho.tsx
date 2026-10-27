import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Bug, CalendarDays, Columns3, FilePlus2, Hourglass, KanbanSquare, List, Lock, SlidersHorizontal, Trash2, X } from "lucide-react";
import { colunaDe, fluxos, prioridades, tiposCard, type Card, type Coluna, type FluxoId } from "@empresa/shared";
import { agentById, agents, rooms, fluxosDe, escritorioAtivo } from "@empresa/org";
import { useStore } from "../../store.ts";
import { api } from "../../api.ts";
import { navegar, useNav } from "../../nav.ts";
import { Abas, Botao, Caixa, Chip, EstadoVazio, Popover, Segmentado, Seletor, avisar, avisarErro, confirmar, cx } from "../kit/index.ts";
import { CartaoBoard, IconeTipo, SeloPrioridade } from "../trabalho/cartao.tsx";
import { Avatarzinho, quando } from "../comum.tsx";
import { CalendarioEditorial } from "../board/Marketing.tsx";

// Trabalho (DESIGN-INTERFACE.md §6.3): um quadro por fluxo, filtros numa linha, Quadro/Lista/Calendário.

interface Filtros {
  busca: string;
  sala: string;
  pessoa: string;
  tipo: string;
  prioridade: string;
  soMeus: boolean;
  soBugs: boolean;
  bloqueados: boolean;
  ocultarDemo: boolean;
  soProjeto: boolean;
}
const INICIAIS: Filtros = { busca: "", sala: "", pessoa: "", tipo: "", prioridade: "", soMeus: false, soBugs: false, bloqueados: false, ocultarDemo: false, soProjeto: false };
type Visao = "quadro" | "lista" | "calendario";

const COR_COLUNA: Record<Coluna["tipo"], string> = {
  fila: "var(--fg-3)", trabalho: "var(--accent)", validacao: "var(--success)", bug: "var(--danger)", ceo: "var(--warning)", feito: "var(--success)", perdido: "var(--fg-disabled)",
};

export default function PaginaTrabalho() {
  const rota = useNav((s) => s.rota);
  // Fluxos do escritório ativo; um endereço de outro escritório cai no primeiro fluxo deste.
  const doEscritorio = fluxosDe(escritorioAtivo()).map((x) => x.id);
  const preferido = rota.sub ?? useStore.getState().fluxoBoard;
  const fluxoId: FluxoId = doEscritorio.includes(preferido) ? preferido : doEscritorio[0]!;
  const cards = useStore((s) => s.cards);
  const projetoAtivo = useStore((s) => s.projetoAtivo);
  const [f, setF] = useState<Filtros>(INICIAIS);
  const [visao, setVisao] = useState<Visao>("quadro");
  const todos = useMemo(() => Object.values(cards), [cards]);
  const fluxo = fluxos[fluxoId]!;

  useEffect(() => {
    useStore.getState().setFluxoBoard(fluxoId);
    if (rota.sub !== fluxoId) navegar("trabalho", fluxoId, null, { substituir: true, manterCard: true });
    if (fluxoId !== "marketing" && visao === "calendario") setVisao("quadro");
  }, [fluxoId, rota.sub, visao]);

  const bugsPorCard = useMemo(() => {
    const m = new Map<number, number>();
    for (const c of todos) if (c.tipo === "bug" && c.bugDe && c.coluna !== "concluido") m.set(c.bugDe, (m.get(c.bugDe) ?? 0) + 1);
    return m;
  }, [todos]);

  const visiveis = todos.filter((c) => {
    if (c.fluxo !== fluxoId) return false;
    if (f.soProjeto && projetoAtivo !== null && c.projetoId !== projetoAtivo) return false;
    if (f.ocultarDemo && c.demo) return false;
    if (f.soBugs && c.tipo !== "bug") return false;
    if (f.soMeus && colunaDe(c.fluxo, c.coluna)?.tipo !== "ceo") return false;
    if (f.bloqueados && !c.bloqueado) return false;
    if (f.sala && c.sala !== f.sala) return false;
    if (f.pessoa && c.dono !== f.pessoa && c.validador !== f.pessoa) return false;
    if (f.tipo && c.tipo !== f.tipo) return false;
    if (f.prioridade && c.prioridade !== f.prioridade) return false;
    if (f.busca) {
      const q = f.busca.toLowerCase();
      if (!c.titulo.toLowerCase().includes(q) && !c.chave.toLowerCase().includes(q)) return false;
    }
    return true;
  });
  const nFiltros = [f.sala, f.pessoa, f.tipo, f.prioridade].filter(Boolean).length + [f.ocultarDemo, f.soProjeto].filter(Boolean).length;
  const temFiltro = JSON.stringify(f) !== JSON.stringify(INICIAIS);
  const temDemo = todos.some((c) => c.demo && doEscritorio.includes(c.fluxo));

  const soltar = async (card: Card, destino: Coluna) => {
    if (card.coluna === destino.id) return;
    const origem = fluxo.colunas.find((c) => c.id === card.coluna);
    try {
      if (origem?.tipo === "ceo" && destino.id === fluxo.aprovarPara) {
        await api(`/api/cards/${card.id}/aprovar`, "POST", {});
        avisar(`${card.chave} aprovado`);
        return;
      }
      if ((destino.tipo === "feito" || destino.tipo === "perdido") && origem?.tipo !== "ceo") {
        const ok = await confirmar({ titulo: `Mover ${card.chave} para "${destino.nome}"?`, texto: "Isso passa por cima da validação e da sua aprovação.", confirmar: "Mover mesmo assim", perigo: true });
        if (!ok) return;
      }
      await api(`/api/cards/${card.id}/mover`, "POST", { coluna: destino.id });
    } catch (e) {
      avisarErro(e);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 px-6 pt-5 lg:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="flex items-center gap-2.5 text-pagina font-semibold text-fg">
            <KanbanSquare className="size-6 text-fg-3" strokeWidth={1.75} />
            Trabalho
          </h1>
          <div className="flex-1" />
          {temDemo && (
            <Botao
              variante="discreto"
              icone={Trash2}
              onClick={async () => {
                if (await confirmar({ titulo: "Apagar os cards de demonstração?", confirmar: "Apagar", perigo: true })) await api("/api/cards-demo", "DELETE").catch(avisarErro);
              }}
            >
              Limpar demonstração
            </Botao>
          )}
          <Segmentado<Visao>
            valor={visao}
            onChange={setVisao}
            opcoes={[
              { id: "quadro", rotulo: <><Columns3 className="size-4" /> Quadro</> },
              { id: "lista", rotulo: <><List className="size-4" /> Lista</> },
              ...(fluxoId === "marketing" ? [{ id: "calendario" as const, rotulo: <><CalendarDays className="size-4" /> Calendário</> }] : []),
            ]}
          />
          <Botao variante="principal" icone={FilePlus2} onClick={() => useStore.getState().setNovoCardAberto(true)}>Novo card</Botao>
        </div>
        <Abas
          className="mt-4"
          ativa={fluxoId}
          onChange={(id) => navegar("trabalho", id)}
          abas={fluxosDe(escritorioAtivo()).map((x) => x.id).map((id) => ({
            id,
            rotulo: fluxos[id]!.nome,
            contador: todos.filter((c) => c.fluxo === id && colunaDe(c.fluxo, c.coluna)?.tipo === "ceo").length,
            alerta: true,
          }))}
        />
        <div className="flex flex-wrap items-center gap-2 py-3">
          <input
            value={f.busca}
            onChange={(e) => setF({ ...f, busca: e.target.value })}
            placeholder="Buscar título ou EMP-…"
            className="h-8 w-56 rounded-full bg-surface px-3.5 text-pequeno text-fg shadow-[inset_0_0_0_1px_var(--line)] outline-none placeholder:text-fg-3 focus:shadow-[inset_0_0_0_1px_var(--accent)]"
          />
          <Chip ativo={f.soMeus} onClick={() => setF({ ...f, soMeus: !f.soMeus })} icone={Hourglass}>Esperando por mim</Chip>
          <Chip ativo={f.soBugs} onClick={() => setF({ ...f, soBugs: !f.soBugs })} icone={Bug}>Bugs</Chip>
          <Chip ativo={f.bloqueados} onClick={() => setF({ ...f, bloqueados: !f.bloqueados })} icone={Lock}>Bloqueados</Chip>
          <MaisFiltros f={f} setF={setF} n={nFiltros} temProjeto={projetoAtivo !== null} />
          {temFiltro && (
            <Botao tamanho="p" variante="discreto" icone={X} onClick={() => setF(INICIAIS)}>Limpar filtros</Botao>
          )}
          <span className="tabular ml-auto text-legenda text-fg-3">{visiveis.length} card{visiveis.length === 1 ? "" : "s"}</span>
        </div>
        {fluxoId === "comercial" && (
          <AvisoLink texto="Leads, prospecção e conversas do WhatsApp ficam em Clientes." rotulo="Abrir Clientes" fazer={() => navegar("clientes", "leads")} />
        )}
        {fluxoId === "geral" && <AvisoLink texto="Atendimentos de clientes ficam em Clientes → Atendimentos." rotulo="Abrir atendimentos" fazer={() => navegar("clientes", "atendimentos")} />}
      </div>

      {visao === "calendario" && fluxoId === "marketing" ? (
        <div className="scroll-fino min-h-0 flex-1 overflow-auto px-6 pb-28 lg:px-8">
          <CalendarioEditorial cards={visiveis} />
        </div>
      ) : visao === "lista" ? (
        <ListaCards cards={visiveis} />
      ) : (
        <div className="scroll-fino flex min-h-0 flex-1 gap-3 overflow-x-auto px-6 pb-28 lg:px-8">
          {fluxo.colunas.map((col) => (
            <ColunaQuadro key={col.id} coluna={col} cards={visiveis.filter((c) => c.coluna === col.id).sort((a, b) => a.ordem - b.ordem)} bugsPorCard={bugsPorCard} todos={todos} onSoltar={soltar} />
          ))}
        </div>
      )}
    </div>
  );
}

function AvisoLink({ texto, rotulo, fazer }: { texto: string; rotulo: string; fazer: () => void }) {
  return (
    <div className="mb-3 flex items-center gap-3 rounded-card bg-accent-soft px-4 py-2 text-pequeno text-accent-fg">
      <span className="flex-1">{texto}</span>
      <button type="button" onClick={fazer} className="flex items-center gap-1 font-semibold hover:underline">{rotulo} <ArrowRight className="size-3.5" /></button>
    </div>
  );
}

function MaisFiltros({ f, setF, n, temProjeto }: { f: Filtros; setF: (f: Filtros) => void; n: number; temProjeto: boolean }) {
  const [aberto, setAberto] = useState(false);
  const ancora = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={ancora}
        type="button"
        onClick={() => setAberto(!aberto)}
        className={cx("inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-pequeno font-medium", n ? "bg-accent-soft text-accent-fg shadow-[inset_0_0_0_1px_var(--accent)]" : "bg-surface text-fg-2 shadow-[inset_0_0_0_1px_var(--line)] hover:text-fg")}
      >
        <SlidersHorizontal className="size-3.5" /> Filtros {n > 0 && <span className="tabular">{n}</span>}
      </button>
      <Popover aberto={aberto} fechar={() => setAberto(false)} ancora={ancora} largura={300}>
        <div className="space-y-3 p-2">
          <Seletor rotulo="Área" tamanho="p" value={f.sala} onChange={(e) => setF({ ...f, sala: e.target.value })}>
            <option value="">Todas as áreas</option>
            {rooms.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
          </Seletor>
          <Seletor rotulo="Pessoa (autor ou validador)" tamanho="p" value={f.pessoa} onChange={(e) => setF({ ...f, pessoa: e.target.value })}>
            <option value="">Todas as pessoas</option>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.nome} · {a.cargo}</option>)}
          </Seletor>
          <div className="grid grid-cols-2 gap-2">
            <Seletor rotulo="Tipo" tamanho="p" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
              <option value="">Todos</option>
              {tiposCard.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </Seletor>
            <Seletor rotulo="Prioridade" tamanho="p" value={f.prioridade} onChange={(e) => setF({ ...f, prioridade: e.target.value })}>
              <option value="">Todas</option>
              {prioridades.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.nome}</option>)}
            </Seletor>
          </div>
          <div className="border-t border-line pt-2">
            <Caixa marcada={f.ocultarDemo} onChange={(v) => setF({ ...f, ocultarDemo: v })} rotulo="Ocultar demonstração" />
            {temProjeto && <Caixa marcada={f.soProjeto} onChange={(v) => setF({ ...f, soProjeto: v })} rotulo="Só o projeto ativo" />}
          </div>
        </div>
      </Popover>
    </>
  );
}

function ColunaQuadro({ coluna, cards, bugsPorCard, todos, onSoltar }: { coluna: Coluna; cards: Card[]; bugsPorCard: Map<number, number>; todos: Card[]; onSoltar: (card: Card, destino: Coluna) => void }) {
  const [sobre, setSobre] = useState(false);
  const vazia = cards.length === 0;
  return (
    <section
      aria-label={coluna.nome}
      onDragOver={(e) => {
        e.preventDefault();
        setSobre(true);
      }}
      onDragLeave={() => setSobre(false)}
      onDrop={(e) => {
        setSobre(false);
        const card = todos.find((c) => c.id === Number(e.dataTransfer.getData("text/card")));
        if (card) onSoltar(card, coluna);
      }}
      className={cx("flex shrink-0 flex-col rounded-panel transition-[width,background-color] duration-150", vazia && !sobre ? "w-[180px]" : "w-[288px]", sobre ? "bg-accent-soft shadow-[inset_0_0_0_2px_var(--accent)]" : "bg-sunken")}
    >
      <header className="flex items-center gap-2 px-3 pb-2 pt-3">
        <span className="size-2 shrink-0 rounded-full" style={{ background: COR_COLUNA[coluna.tipo] }} />
        <h2 className="min-w-0 flex-1 truncate text-pequeno font-semibold text-fg">{coluna.nome}</h2>
        <span className="tabular text-legenda text-fg-3">{cards.length}</span>
      </header>
      <div className="scroll-fino min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-2">
        {cards.map((c) => <CartaoBoard key={c.id} card={c} bugsAbertos={bugsPorCard.get(c.id) ?? 0} />)}
        {vazia && <div className="rounded-card border border-dashed border-line-strong px-2 py-5 text-center text-legenda text-fg-3">Arraste um card para cá</div>}
      </div>
    </section>
  );
}

/** Visão em lista: uma tabela com as colunas que importam, ordenável por prioridade e atualização. */
function ListaCards({ cards }: { cards: Card[] }) {
  const abrirCard = useStore((s) => s.abrirCard);
  const ordenados = [...cards].sort((a, b) => a.prioridade.localeCompare(b.prioridade) || b.atualizadoEm - a.atualizadoEm);
  if (!cards.length) return <EstadoVazio icone={KanbanSquare} titulo="Nenhum card com esses filtros" texto="Limpe os filtros ou crie um card novo." />;
  return (
    <div className="scroll-fino min-h-0 flex-1 overflow-auto px-6 pb-28 lg:px-8">
      <table className="w-full min-w-[820px] overflow-hidden rounded-panel bg-surface text-left text-pequeno shadow-1">
        <thead className="bg-surface-2 text-legenda text-fg-3">
          <tr>
            <th className="px-4 py-2.5 font-medium">Card</th>
            <th className="px-3 py-2.5 font-medium">Coluna</th>
            <th className="px-3 py-2.5 font-medium">Prioridade</th>
            <th className="px-3 py-2.5 font-medium">Responsável</th>
            <th className="px-3 py-2.5 font-medium">Atualizado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {ordenados.map((c) => {
            const dono = c.dono ? agentById[c.dono] : null;
            return (
              <tr key={c.id} onClick={() => abrirCard(c.id)} className="cursor-pointer hover:bg-hover">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <IconeTipo tipo={c.tipo} />
                    <span className="tabular text-fg-3">{c.chave}</span>
                    <span className="truncate font-medium text-fg">{c.titulo}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-fg-2">{colunaDe(c.fluxo, c.coluna)?.nome ?? c.coluna}</td>
                <td className="px-3 py-2.5"><SeloPrioridade p={c.prioridade} /></td>
                <td className="px-3 py-2.5">{dono ? <span className="flex items-center gap-2 text-fg-2"><Avatarzinho agent={dono} tamanho={22} />{dono.nome}</span> : <span className="text-fg-3">—</span>}</td>
                <td className="px-3 py-2.5 text-fg-3">{quando(c.atualizadoEm)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
