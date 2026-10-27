import { useMemo, useState } from "react";
import { fluxos, prioridades, tiposCard, type Card, type Coluna, type FluxoId } from "@empresa/shared";
import { agents, rooms } from "@empresa/org";
import { useStore } from "../../store.ts";
import { api } from "../../api.ts";
import { CardItem } from "./CardItem.tsx";
import { BarraComercial, filtrarLead, type FiltroLeads } from "./Prospeccao.tsx";
import { CalendarioEditorial } from "./Marketing.tsx";
import { BarraGeral } from "./Atendimento.tsx";

interface Filtros {
  busca: string;
  sala: string;
  pessoa: string;
  tipo: string;
  prioridade: string;
  soBugs: boolean;
  soMeus: boolean;
  bloqueados: boolean;
  ocultarDemo: boolean;
  todosProjetos: boolean;
}

const filtrosIniciais: Filtros = {
  busca: "", sala: "", pessoa: "", tipo: "", prioridade: "", soBugs: false, soMeus: false, bloqueados: false,
  ocultarDemo: false, todosProjetos: true,
};

/** Board estilo Jira (PLANO.md, seção B.1): um fluxo por aba, cards arrastáveis entre colunas. */
export function Board() {
  const modo = useStore((s) => s.modoBoard);
  const setModo = useStore((s) => s.setModoBoard);
  const fluxoId = useStore((s) => s.fluxoBoard);
  const setFluxo = useStore((s) => s.setFluxoBoard);
  const cards = useStore((s) => s.cards);
  const projetoAtivo = useStore((s) => s.projetoAtivo);
  const setNovoCardAberto = useStore((s) => s.setNovoCardAberto);
  const [f, setF] = useState<Filtros>(filtrosIniciais);
  const [fLeads, setFLeads] = useState<FiltroLeads>({ cidade: "", notaMin: 0 });
  const leads = useStore((s) => s.leads);
  const [verCalendario, setVerCalendario] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const todos = useMemo(() => Object.values(cards), [cards]);
  const fluxo = fluxos[fluxoId];

  // Bugs abertos (fora de "Concluído") por card de origem.
  const bugsPorCard = useMemo(() => {
    const m = new Map<number, number>();
    for (const c of todos) if (c.tipo === "bug" && c.bugDe && c.coluna !== "concluido") m.set(c.bugDe, (m.get(c.bugDe) ?? 0) + 1);
    return m;
  }, [todos]);

  const visiveis = todos.filter((c) => {
    if (c.fluxo !== fluxoId) return false;
    if (!f.todosProjetos && projetoAtivo !== null && c.projetoId !== projetoAtivo) return false;
    if (f.ocultarDemo && c.demo) return false;
    if (f.soBugs && c.tipo !== "bug") return false;
    if (f.soMeus && c.coluna !== "aguardando-ceo") return false;
    if (f.bloqueados && !c.bloqueado) return false;
    if (f.sala && c.sala !== f.sala) return false;
    if (f.pessoa && c.dono !== f.pessoa && c.validador !== f.pessoa) return false;
    if (f.tipo && c.tipo !== f.tipo) return false;
    if (f.prioridade && c.prioridade !== f.prioridade) return false;
    if (fluxoId === "comercial" && !filtrarLead(c, leads[c.id], fLeads)) return false;
    if (f.busca) {
      const q = f.busca.toLowerCase();
      if (!c.titulo.toLowerCase().includes(q) && !c.chave.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  if (modo === "fechada") return null;

  const soltar = async (card: Card, destino: Coluna) => {
    if (card.coluna === destino.id) return;
    setErro(null);
    const origem = fluxo.colunas.find((c) => c.id === card.coluna);
    try {
      if (origem?.tipo === "ceo" && destino.id === fluxo.aprovarPara) {
        await api(`/api/cards/${card.id}/aprovar`, "POST", {});
        return;
      }
      if ((destino.tipo === "feito" || destino.tipo === "perdido") && origem?.tipo !== "ceo") {
        const ok = confirm(`Mover ${card.chave} direto para "${destino.nome}" passa por cima da validação e da sua aprovação. Continuar?`);
        if (!ok) return;
      }
      await api(`/api/cards/${card.id}/mover`, "POST", { coluna: destino.id });
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  };

  const limparDemo = async () => {
    if (!confirm("Apagar todos os cards criados pelo modo demonstração?")) return;
    await api("/api/cards-demo", "DELETE");
  };

  const temDemo = todos.some((c) => c.demo);
  const posicao = modo === "cheia" ? "left-4 right-4" : "right-4 w-[62%]";

  return (
    <section className={`pointer-events-auto absolute bottom-4 top-24 flex flex-col overflow-hidden rounded-2xl bg-[#f7f5f1] shadow-[0_8px_30px_rgba(31,36,48,0.18)] ring-1 ring-black/5 ${posicao}`}>
      {/* Cabeçalho: abas de fluxo e ações */}
      <div className="flex flex-wrap items-center gap-2 border-b border-black/5 px-4 pt-3">
        <h2 className="mr-2 pb-2 text-sm font-bold">Board</h2>
        {(Object.keys(fluxos) as FluxoId[]).map((id) => {
          const n = todos.filter((c) => c.fluxo === id && c.coluna === "aguardando-ceo").length;
          return (
            <button
              key={id}
              onClick={() => setFluxo(id)}
              className={`-mb-px border-b-2 px-2.5 pb-2 text-xs font-semibold ${
                fluxoId === id ? "border-[#1f2430] text-[#1f2430]" : "border-transparent text-black/45 hover:text-black/70"
              }`}
            >
              {fluxos[id].nome}
              {n > 0 && <span className="ml-1 rounded-full bg-rose-600 px-1.5 text-[10px] text-white">{n}</span>}
            </button>
          );
        })}
        <div className="flex-1" />
        <div className="flex items-center gap-1.5 pb-2">
          {temDemo && (
            <button onClick={limparDemo} className="rounded-lg px-2.5 py-1.5 text-[11px] text-black/55 hover:bg-black/5">
              Limpar demonstração
            </button>
          )}
          <button
            onClick={() => setModo(modo === "cheia" ? "lado" : "cheia")}
            className="rounded-lg px-2.5 py-1.5 text-[11px] text-black/60 ring-1 ring-black/10 hover:bg-black/5"
            title="Alterna entre tela cheia e lado a lado com o escritório"
          >
            {modo === "cheia" ? "Ver escritório ao lado" : "Tela cheia"}
          </button>
          <button
            onClick={() => setNovoCardAberto(true)}
            className="rounded-lg bg-[#1f2430] px-3 py-1.5 text-xs font-semibold text-white"
          >
            + Criar card
          </button>
          <button onClick={() => setModo("fechada")} className="grid h-7 w-7 place-items-center rounded-full text-black/50 hover:bg-black/5" aria-label="Fechar board">
            ✕
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-black/5 px-4 py-2 text-[11px]">
        <input
          value={f.busca}
          onChange={(e) => setF({ ...f, busca: e.target.value })}
          placeholder="Buscar título ou EMP-…"
          className="h-7 w-44 rounded-lg bg-black/5 px-2 outline-none"
        />
        <Seletor valor={f.sala} onChange={(sala) => setF({ ...f, sala })} vazio="Todas as áreas" opcoes={rooms.map((r) => [r.id, r.nome])} />
        <Seletor valor={f.pessoa} onChange={(pessoa) => setF({ ...f, pessoa })} vazio="Todas as pessoas" opcoes={agents.map((a) => [a.id, a.nome])} />
        <Seletor valor={f.tipo} onChange={(tipo) => setF({ ...f, tipo })} vazio="Todos os tipos" opcoes={tiposCard.map((t) => [t.id, t.nome])} />
        <Seletor valor={f.prioridade} onChange={(prioridade) => setF({ ...f, prioridade })} vazio="Prioridade" opcoes={prioridades.map((p) => [p.id, `${p.id} · ${p.nome}`])} />
        <Chip ativo={f.soMeus} onClick={() => setF({ ...f, soMeus: !f.soMeus })}>Esperando por mim</Chip>
        <Chip ativo={f.soBugs} onClick={() => setF({ ...f, soBugs: !f.soBugs })}>Só bugs</Chip>
        <Chip ativo={f.bloqueados} onClick={() => setF({ ...f, bloqueados: !f.bloqueados })}>Bloqueados</Chip>
        <Chip ativo={f.ocultarDemo} onClick={() => setF({ ...f, ocultarDemo: !f.ocultarDemo })}>Ocultar demo</Chip>
        {projetoAtivo !== null && (
          <Chip ativo={!f.todosProjetos} onClick={() => setF({ ...f, todosProjetos: !f.todosProjetos })}>Só o projeto ativo</Chip>
        )}
        {JSON.stringify(f) !== JSON.stringify(filtrosIniciais) && (
          <button onClick={() => setF(filtrosIniciais)} className="ml-1 text-black/45 underline">
            limpar filtros
          </button>
        )}
        {erro && <span className="ml-2 text-rose-600">{erro}</span>}
      </div>

      {fluxoId === "comercial" && <BarraComercial filtro={fLeads} setFiltro={setFLeads} />}
      {fluxoId === "geral" && <BarraGeral />}
      {fluxoId === "marketing" && (
        <div className="flex items-center gap-1.5 border-b border-black/5 bg-pink-50/40 px-4 py-2 text-[11px]">
          <span className="font-semibold text-black/55">Visão</span>
          <Chip ativo={!verCalendario} onClick={() => setVerCalendario(false)}>Quadro</Chip>
          <Chip ativo={verCalendario} onClick={() => setVerCalendario(true)}>Calendário editorial</Chip>
        </div>
      )}

      {fluxoId === "marketing" && verCalendario ? (
        <CalendarioEditorial cards={visiveis} />
      ) : (
        /* Colunas */
        <div className="scroll-fino flex min-h-0 flex-1 gap-3 overflow-x-auto p-3">
          {fluxo.colunas.map((col) => {
            const lista = visiveis.filter((c) => c.coluna === col.id).sort((a, b) => a.ordem - b.ordem);
            return <ColunaBoard key={col.id} coluna={col} cards={lista} bugsPorCard={bugsPorCard} todos={todos} onSoltar={soltar} />;
          })}
        </div>
      )}
    </section>
  );
}

const corDaColuna: Record<Coluna["tipo"], string> = {
  fila: "#94a3b8", trabalho: "#3b82f6", validacao: "#0d9488", bug: "#dc2626", ceo: "#e11d48", feito: "#16a34a", perdido: "#64748b",
};

function ColunaBoard({ coluna, cards, bugsPorCard, todos, onSoltar }: {
  coluna: Coluna;
  cards: Card[];
  bugsPorCard: Map<number, number>;
  todos: Card[];
  onSoltar: (card: Card, destino: Coluna) => void;
}) {
  const [sobre, setSobre] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setSobre(true);
      }}
      onDragLeave={() => setSobre(false)}
      onDrop={(e) => {
        setSobre(false);
        const id = Number(e.dataTransfer.getData("text/card"));
        const card = todos.find((c) => c.id === id);
        if (card) onSoltar(card, coluna);
      }}
      className={`flex w-64 shrink-0 flex-col rounded-2xl transition ${sobre ? "bg-blue-50 ring-2 ring-blue-300" : "bg-black/[0.045]"}`}
    >
      <div className="flex items-center gap-2 px-3 pb-1.5 pt-2.5">
        <span className="h-2 w-2 rounded-full" style={{ background: corDaColuna[coluna.tipo] }} />
        <span className="text-[11px] font-bold uppercase tracking-wide text-black/60">{coluna.nome}</span>
        <span className="text-[11px] text-black/35">{cards.length}</span>
      </div>
      <div className="scroll-fino min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-2">
        {cards.map((c) => (
          <CardItem key={c.id} card={c} bugsAbertos={bugsPorCard.get(c.id) ?? 0} />
        ))}
        {cards.length === 0 && <div className="rounded-xl border border-dashed border-black/10 py-6 text-center text-[11px] text-black/30">vazio</div>}
      </div>
    </div>
  );
}

function Seletor({ valor, onChange, vazio, opcoes }: { valor: string; onChange: (v: string) => void; vazio: string; opcoes: [string, string][] }) {
  return (
    <select value={valor} onChange={(e) => onChange(e.target.value)} className="h-7 rounded-lg bg-black/5 px-1.5 outline-none">
      <option value="">{vazio}</option>
      {opcoes.map(([v, r]) => (
        <option key={v} value={v}>
          {r}
        </option>
      ))}
    </select>
  );
}

function Chip({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`h-7 rounded-lg px-2 font-medium ${ativo ? "bg-[#1f2430] text-white" : "bg-black/5 text-black/60 hover:bg-black/10"}`}>
      {children}
    </button>
  );
}
