import { useMemo, useState } from "react";
import { Activity, ArrowLeft, ChevronDown, ChevronUp, FileCheck2, KanbanSquare, LayoutList, MessageSquare, Minus, ShieldCheck, Users, Volume2, X } from "lucide-react";
import { colunaDe, type Agent, type RoomId } from "@empresa/shared";
import { agentById, agentsByRoom, roomById, rooms } from "@empresa/org";
import { useStore } from "../../store.ts";
import { statusInfo } from "../../status.ts";
import { usePaineis } from "../../paineis.ts";
import { navegar } from "../../nav.ts";
import { escolherVoz, falar, pararDeFalar, vozEscolhida, vozesDisponiveis } from "../../voz/falar.ts";
import { Abas, Botao, BotaoIcone, ChaveValor, Etiqueta, EstadoVazio, Seletor, cx } from "../kit/index.ts";
import { Avatarzinho, desempenhoDe, hora, nomesModelo, usd } from "../comum.tsx";
import { LinhaCard } from "../trabalho/cartao.tsx";

// Painéis do escritório 3D (DESIGN-INTERFACE.md §6.1): um estilo só (.painel), todos recolhíveis.

/** Lista de salas (canto superior esquerdo). */
export function PainelSalas() {
  const estados = useStore((s) => s.estados);
  const cards = useStore((s) => s.cards);
  const salaSel = useStore((s) => s.salaSelecionada);
  const selecionarSala = useStore((s) => s.selecionarSala);
  const recolhido = usePaineis((s) => s.minimizados.salas);
  const alternar = usePaineis((s) => s.alternar);
  const emAndamento = useMemo(() => {
    const m: Partial<Record<RoomId, number>> = {};
    for (const c of Object.values(cards)) {
      const t = colunaDe(c.fluxo, c.coluna)?.tipo;
      if (t === "trabalho" || t === "validacao" || t === "bug") m[c.sala] = (m[c.sala] ?? 0) + 1;
    }
    return m;
  }, [cards]);

  return (
    <nav aria-label="Salas" className="painel pointer-events-auto absolute left-3 top-3 flex max-h-[calc(100%-120px)] w-60 flex-col overflow-hidden">
      <button type="button" onClick={() => alternar("salas")} className="flex h-10 shrink-0 items-center gap-2 px-3 text-left">
        <LayoutList className="size-4 text-fg-3" strokeWidth={1.75} />
        <span className="flex-1 text-pequeno font-semibold text-fg">Salas</span>
        {recolhido ? <ChevronDown className="size-4 text-fg-3" /> : <ChevronUp className="size-4 text-fg-3" />}
      </button>
      {!recolhido && (
        <div className="scroll-fino min-h-0 overflow-y-auto px-1.5 pb-1.5">
          {rooms.map((r) => {
            const membros = agentsByRoom(r.id);
            const ativos = membros.filter((a) => (estados[a.id]?.status ?? "ocioso") !== "ocioso").length;
            const sel = salaSel === r.id;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => selecionarSala(r.id)}
                className={cx("flex w-full items-center gap-2.5 rounded-ctl px-2 py-1.5 text-left text-pequeno transition-colors", sel ? "bg-ink text-on-ink" : "text-fg hover:bg-hover")}
              >
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: r.cor }} />
                <span className="min-w-0 flex-1 truncate">{r.nome}</span>
                {(emAndamento[r.id] ?? 0) > 0 && <span className={cx("tabular text-legenda", sel ? "text-on-ink/70" : "text-fg-3")} title="Cards em andamento">{emAndamento[r.id]}</span>}
                {membros.length > 0 && ativos > 0 && <span className={cx("size-1.5 rounded-full", sel ? "bg-on-ink" : "pulsar bg-accent")} title={`${ativos} de ${membros.length} trabalhando`} />}
              </button>
            );
          })}
        </div>
      )}
    </nav>
  );
}

/** Uma linha que mostra o último acontecimento; expande ao passar o mouse. */
export function TickerAtividade() {
  const feed = useStore((s) => s.feed);
  const selecionarSala = useStore((s) => s.selecionarSala);
  const [aberto, setAberto] = useState(false);
  // Com uma sala aberta, a atividade dela já aparece na gaveta à direita.
  const salaAberta = useStore((s) => s.salaSelecionada !== null);
  const itens = feed.slice(-8).reverse();
  if (!itens.length || salaAberta) return null;
  const ultimo = itens[0]!;
  return (
    <div
      className="painel pointer-events-auto absolute left-1/2 top-3 w-[min(460px,calc(100%-560px))] min-w-[280px] -translate-x-1/2 overflow-hidden max-lg:hidden"
      onMouseEnter={() => setAberto(true)}
      onMouseLeave={() => setAberto(false)}
      onFocus={() => setAberto(true)}
      onBlur={() => setAberto(false)}
    >
      {aberto ? (
        <div className="p-2">
          <div className="flex items-center gap-2 px-1.5 pb-1.5 pt-0.5 text-legenda font-semibold text-fg-3">
            <Activity className="size-3.5" /> Acontecendo agora
          </div>
          <ul className="space-y-0.5">
            {itens.map((f) => (
              <li key={f.id}>
                <button type="button" onClick={() => selecionarSala(f.sala)} className="flex w-full gap-2 rounded-ctl px-1.5 py-1 text-left text-pequeno hover:bg-hover">
                  <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: roomById[f.sala].cor }} />
                  <span className="min-w-0 flex-1 text-fg">{f.texto}</span>
                  <span className="tabular shrink-0 text-legenda text-fg-3">{hora(f.ts)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <button type="button" onClick={() => selecionarSala(ultimo.sala)} className="flex h-10 w-full items-center gap-2.5 px-3 text-left">
          <span className="pulsar size-2 shrink-0 rounded-full" style={{ background: roomById[ultimo.sala].cor }} />
          <span className="min-w-0 flex-1 truncate text-pequeno text-fg">{ultimo.texto}</span>
          <span className="tabular shrink-0 text-legenda text-fg-3">{hora(ultimo.ts)}</span>
        </button>
      )}
    </div>
  );
}

/** Gaveta de contexto (sala ou agente) à direita do 3D. */
export function PainelContexto() {
  const sala = useStore((s) => s.salaSelecionada);
  const agente = useStore((s) => s.agenteSelecionado);
  const visaoGeral = useStore((s) => s.visaoGeral);
  const entrevistaAberta = useStore((s) => s.entrevistaAberta);
  const recolhido = usePaineis((s) => s.minimizados.lateral);
  const alternar = usePaineis((s) => s.alternar);
  if (!sala || entrevistaAberta) return null;
  const room = roomById[sala];
  if (recolhido) {
    return (
      <button type="button" onClick={() => alternar("lateral")} className="painel pointer-events-auto absolute right-3 top-3 flex h-10 items-center gap-2 px-3 text-pequeno font-semibold text-fg">
        <span className="size-2.5 rounded-full" style={{ background: room.cor }} />
        {agente ? `${agentById[agente]!.nome} · ${room.nome}` : room.nome}
        <ChevronDown className="size-4 text-fg-3" />
      </button>
    );
  }
  return (
    <aside className="painel anima-lado pointer-events-auto absolute bottom-3 right-3 top-3 flex w-[400px] max-w-[calc(100%-24px)] flex-col overflow-hidden">
      <div className="absolute right-2 top-2 z-10 flex">
        <BotaoIcone icone={Minus} rotulo="Recolher" tamanho="p" onClick={() => alternar("lateral")} />
        <BotaoIcone icone={X} rotulo="Fechar" tamanho="p" onClick={visaoGeral} />
      </div>
      {agente ? <VistaAgente agent={agentById[agente]!} /> : <VistaSala sala={sala} />}
    </aside>
  );
}

function VistaSala({ sala }: { sala: RoomId }) {
  const room = roomById[sala];
  const membros = agentsByRoom(sala);
  const validador = room.validador ? agentById[room.validador] : null;
  const cards = useStore((s) => s.cards);
  const feed = useStore((s) => s.feed);
  const [aba, setAba] = useState<"agora" | "cards" | "entregas" | "atividade">("agora");
  const daSala = useMemo(() => Object.values(cards).filter((c) => c.sala === sala).sort((a, b) => b.atualizadoEm - a.atualizadoEm), [cards, sala]);
  const ativos = daSala.filter((c) => !["feito", "perdido", "ceo"].includes(colunaDe(c.fluxo, c.coluna)?.tipo ?? ""));
  const entregues = daSala.filter((c) => ["feito", "ceo"].includes(colunaDe(c.fluxo, c.coluna)?.tipo ?? ""));
  const atividade = feed.filter((f) => f.sala === sala).slice(-40).reverse();

  return (
    <>
      <div className="px-4 pb-3 pr-20 pt-4">
        <div className="flex items-center gap-2">
          <span className="size-3 rounded-full" style={{ background: room.cor }} />
          <h2 className="text-secao font-semibold text-fg">{room.nome}</h2>
        </div>
        <p className="mt-1 text-pequeno text-fg-2">{room.descricao}</p>
        {validador && (
          <p className="mt-2.5 flex items-start gap-2 rounded-ctl bg-success-soft px-3 py-2 text-pequeno text-success-fg">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" />
            <span>Entregas validadas por <b className="font-semibold">{validador.nome}</b> ({validador.cargo}) e depois por você.</span>
          </p>
        )}
      </div>
      <Abas
        className="px-3"
        ativa={aba}
        onChange={setAba}
        abas={[
          { id: "agora", rotulo: "Agora", icone: Users },
          { id: "cards", rotulo: "Cards", icone: KanbanSquare, contador: ativos.length },
          { id: "entregas", rotulo: "Entregas", icone: FileCheck2, contador: entregues.length },
          { id: "atividade", rotulo: "Atividade", icone: Activity },
        ]}
      />
      <div className="scroll-fino min-h-0 flex-1 overflow-y-auto p-2">
        {aba === "agora" &&
          (membros.length ? membros.map((a) => <LinhaAgente key={a.id} agent={a} />) : <EstadoVazio compacto icone={Users} titulo="Área comum" texto="Ninguém trabalha aqui; os agentes passam para descansar." />)}
        {aba === "cards" &&
          (ativos.length ? ativos.map((c) => <LinhaCard key={c.id} card={c} />) : <EstadoVazio compacto icone={KanbanSquare} titulo="Nenhum card em andamento" texto="Peça algo à Helena ou crie um card para esta área." />)}
        {aba === "entregas" &&
          (entregues.length ? entregues.map((c) => <LinhaCard key={c.id} card={c} />) : <EstadoVazio compacto icone={FileCheck2} titulo="Nenhuma entrega ainda" texto="O que a equipe entregar (código, textos, relatórios) aparece aqui com o status de validação." />)}
        {aba === "atividade" &&
          (atividade.length ? (
            <ul className="space-y-1 p-1">
              {atividade.map((f) => (
                <li key={f.id} className="flex gap-3 text-pequeno">
                  <span className="tabular w-10 shrink-0 text-fg-3">{hora(f.ts)}</span>
                  <span className="text-fg">{f.texto}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EstadoVazio compacto icone={Activity} titulo="Nada aconteceu aqui ainda" />
          ))}
      </div>
    </>
  );
}

function LinhaAgente({ agent }: { agent: Agent }) {
  const estado = useStore((s) => s.estados[agent.id]);
  const tempoLivre = useStore((s) => s.tempoLivre[agent.id]);
  const selecionarAgente = useStore((s) => s.selecionarAgente);
  const info = statusInfo[estado?.status ?? "ocioso"];
  return (
    <button type="button" onClick={() => selecionarAgente(agent.id)} className="flex w-full items-center gap-3 rounded-ctl px-2 py-2 text-left hover:bg-hover">
      <Avatarzinho agent={agent} tamanho={32} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-corpo font-medium text-fg">
          {agent.nome}
          {agent.lider && <Etiqueta tom="alerta">líder</Etiqueta>}
        </span>
        <span className="block truncate text-legenda text-fg-3">{estado?.atividade ?? tempoLivre ?? agent.cargo}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5 text-legenda font-medium" style={{ color: info.cor }}>
        <span className="size-1.5 rounded-full" style={{ background: info.cor }} />
        {info.rotulo}
      </span>
    </button>
  );
}

function VistaAgente({ agent }: { agent: Agent }) {
  const estado = useStore((s) => s.estados[agent.id]);
  const tempoLivre = useStore((s) => s.tempoLivre[agent.id]);
  const cards = useStore((s) => s.cards);
  const selecionarSala = useStore((s) => s.selecionarSala);
  const info = statusInfo[estado?.status ?? "ocioso"];
  const d = useMemo(() => desempenhoDe(agent.id, Object.values(cards)), [agent.id, cards]);
  const meus = useMemo(() => Object.values(cards).filter((c) => (c.dono === agent.id || c.validador === agent.id) && !["feito", "perdido"].includes(colunaDe(c.fluxo, c.coluna)?.tipo ?? "")).slice(0, 6), [cards, agent.id]);

  return (
    <div className="scroll-fino min-h-0 flex-1 overflow-y-auto">
      <div className="px-4 pb-4 pr-20 pt-3">
        <button type="button" onClick={() => selecionarSala(agent.sala)} className="mb-3 flex items-center gap-1 text-legenda text-fg-3 hover:text-fg">
          <ArrowLeft className="size-3.5" /> {roomById[agent.sala].nome}
        </button>
        <div className="flex items-center gap-3">
          <Avatarzinho agent={agent} tamanho={48} />
          <div className="min-w-0">
            <h2 className="text-secao font-semibold text-fg">{agent.nome}</h2>
            <p className="truncate text-pequeno text-fg-2">{agent.cargo}</p>
          </div>
        </div>
        <div className="mt-3 rounded-ctl px-3 py-2" style={{ background: `color-mix(in srgb, ${info.cor} 12%, transparent)` }}>
          <div className="text-pequeno font-semibold" style={{ color: info.cor }}>{info.rotulo}</div>
          {(estado?.atividade ?? tempoLivre) && <div className="mt-0.5 text-pequeno text-fg">{estado?.atividade ?? tempoLivre}</div>}
        </div>
        <div className="mt-3 flex gap-2">
          <Botao tamanho="p" icone={MessageSquare} onClick={() => window.dispatchEvent(new CustomEvent("chat:mencionar", { detail: agent.nome }))}>Conversar</Botao>
          <Botao tamanho="p" variante="discreto" onClick={() => navegar("equipe", "agentes", agent.id)}>Ver perfil completo</Botao>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 border-y border-line bg-surface-2 px-4 py-3 text-center">
        <Numero rotulo="Entregas" valor={d.concluidos} />
        <Numero rotulo="De primeira" valor={d.concluidos ? `${Math.round((d.dePrimeira / d.concluidos) * 100)}%` : "—"} />
        <Numero rotulo="Custo" valor={usd(d.custo)} />
      </div>
      <div className="space-y-4 p-4">
        {meus.length > 0 && (
          <div>
            <div className="mb-1 text-legenda font-semibold text-fg-3">Cards agora</div>
            {meus.map((c) => <LinhaCard key={c.id} card={c} />)}
          </div>
        )}
        <ChaveValor
          itens={[
            ["Perfil", <span className="text-fg-2">{agent.persona}</span>],
            ["Modelo", nomesModelo[agent.modelo]],
            ["Ferramentas", agent.ferramentas.length ? <span className="flex flex-wrap gap-1">{agent.ferramentas.map((f) => <Etiqueta key={f}>{f}</Etiqueta>)}</span> : "Só conversa e documentos"],
            ["Aciona", agent.podeChamar.includes("*") ? "Toda a empresa" : agent.podeChamar.map((id) => agentById[id]?.nome ?? roomById[id as RoomId]?.nome ?? id).join(", ")],
            ["Voz", <SeletorDeVoz agenteId={agent.id} />],
          ]}
        />
      </div>
    </div>
  );
}

const Numero = ({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) => (
  <div>
    <div className="tabular text-destaque font-semibold text-fg">{valor}</div>
    <div className="text-legenda text-fg-3">{rotulo}</div>
  </div>
);

/** Voz do Mac usada por este agente (automática ou escolhida). */
export function SeletorDeVoz({ agenteId }: { agenteId: string }) {
  const [escolhida, setEscolhida] = useState<string | null>(() => vozEscolhida(agenteId));
  const vozes = vozesDisponiveis();
  if (!vozes.length) return <span className="text-fg-3">Nenhuma voz em português instalada no Mac.</span>;
  return (
    <div className="flex items-center gap-1.5">
      <Seletor
        tamanho="p"
        className="min-w-0 flex-1"
        value={escolhida ?? ""}
        onChange={(e) => {
          const v = e.target.value || null;
          escolherVoz(agenteId, v);
          setEscolhida(v);
        }}
      >
        <option value="">Automática</option>
        {vozes.map((v) => <option key={v} value={v}>{v}</option>)}
      </Seletor>
      <BotaoIcone
        icone={Volume2}
        rotulo="Ouvir"
        tamanho="p"
        onClick={() => {
          pararDeFalar();
          falar(`Oi! Eu sou ${agentById[agenteId]?.nome ?? ""}.`, agenteId);
        }}
      />
    </div>
  );
}

