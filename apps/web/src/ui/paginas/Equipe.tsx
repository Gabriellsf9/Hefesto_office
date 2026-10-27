import { useMemo, useState } from "react";
import { ArrowLeft, BarChart3, Building2, Globe, LayoutGrid, MessageSquare, MonitorPlay, Search, Smartphone, Users } from "lucide-react";
import { colunaDe, type Agent, type RoomId, type SessaoNavegador } from "@empresa/shared";
import { agentById, agents, roomById, rooms } from "@empresa/org";
import { useStore } from "../../store.ts";
import { api } from "../../api.ts";
import { navegar, useNav } from "../../nav.ts";
import { statusInfo } from "../../status.ts";
import { Abas, Botao, CabecalhoPagina, ChaveValor, Chip, Etiqueta, EstadoVazio, Indicador, Pagina, avisarErro, cx } from "../kit/index.ts";
import { Avatarzinho, desempenhoDe, hora, nomesModelo, quando, usd } from "../comum.tsx";
import { LinhaCard } from "../trabalho/cartao.tsx";
import { SeletorDeVoz } from "../escritorio/Paineis.tsx";

// Equipe (DESIGN-INTERFACE.md §6.5): diretório, perfil com desempenho, ranking de desempenho e telas ao vivo.

type Sub = "agentes" | "desempenho" | "ao-vivo";

export default function PaginaEquipe() {
  const rota = useNav((s) => s.rota);
  const sub = (["agentes", "desempenho", "ao-vivo"].includes(rota.sub ?? "") ? rota.sub : "agentes") as Sub;
  const sessoes = useStore((s) => Object.values(s.navegador).filter((n) => n.ativa).length + Object.values(s.controle).filter((c) => c.ativa).length);
  if (sub === "agentes" && rota.id && agentById[rota.id]) return <Perfil agent={agentById[rota.id]!} />;
  return (
    <Pagina largura="media">
      <CabecalhoPagina
        icone={Users}
        titulo="Equipe"
        descricao={`${agents.length} agentes sêniores em ${rooms.filter((r) => agents.some((a) => a.sala === r.id)).length} áreas.`}
        abas={
          <Abas
            ativa={sub}
            onChange={(id) => navegar("equipe", id)}
            abas={[
              { id: "agentes", rotulo: "Agentes", icone: LayoutGrid },
              { id: "desempenho", rotulo: "Desempenho", icone: BarChart3 },
              { id: "ao-vivo", rotulo: "Ao vivo", icone: MonitorPlay, contador: sessoes },
            ]}
          />
        }
      />
      {sub === "agentes" && <Diretorio />}
      {sub === "desempenho" && <Desempenho />}
      {sub === "ao-vivo" && <AoVivo />}
    </Pagina>
  );
}

function Diretorio() {
  const estados = useStore((s) => s.estados);
  const [busca, setBusca] = useState("");
  const [soAtivos, setSoAtivos] = useState(false);
  const filtrar = (a: Agent) => (!soAtivos || (estados[a.id]?.status ?? "ocioso") !== "ocioso") && (!busca || `${a.nome} ${a.cargo}`.toLowerCase().includes(busca.toLowerCase()));
  const ativos = agents.filter((a) => (estados[a.id]?.status ?? "ocioso") !== "ocioso").length;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-3" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome ou cargo" className="h-9 w-64 rounded-ctl bg-surface pl-8 pr-3 text-corpo shadow-[inset_0_0_0_1px_var(--line)] outline-none placeholder:text-fg-3" />
        </div>
        <Chip ativo={soAtivos} onClick={() => setSoAtivos(!soAtivos)} contador={ativos}>Trabalhando agora</Chip>
      </div>
      {rooms.map((r) => {
        const membros = agents.filter((a) => a.sala === r.id).filter(filtrar);
        if (!membros.length) return null;
        return (
          <section key={r.id}>
            <h2 className="mb-2 flex items-center gap-2 text-pequeno font-semibold text-fg-2">
              <span className="size-2.5 rounded-full" style={{ background: r.cor }} /> {r.nome}
            </h2>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {membros.map((a) => <CartaoAgente key={a.id} agent={a} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function CartaoAgente({ agent }: { agent: Agent }) {
  const estado = useStore((s) => s.estados[agent.id]);
  const info = statusInfo[estado?.status ?? "ocioso"];
  return (
    <button type="button" onClick={() => navegar("equipe", "agentes", agent.id)} className="flex items-center gap-3 rounded-card bg-surface p-3 text-left shadow-1 transition-shadow hover:shadow-2">
      <Avatarzinho agent={agent} tamanho={40} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-corpo font-medium text-fg">{agent.nome}{agent.lider && <Etiqueta tom="alerta">líder</Etiqueta>}</span>
        <span className="block truncate text-legenda text-fg-3">{estado?.atividade ?? agent.cargo}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5 text-legenda font-medium" style={{ color: info.cor }}>
        <span className={cx("size-1.5 rounded-full", estado?.status && estado.status !== "ocioso" && "pulsar")} style={{ background: info.cor }} />
        {info.rotulo}
      </span>
    </button>
  );
}

function Perfil({ agent }: { agent: Agent }) {
  const estado = useStore((s) => s.estados[agent.id]);
  const cards = useStore((s) => s.cards);
  const feed = useStore((s) => s.feed);
  const info = statusInfo[estado?.status ?? "ocioso"];
  const todos = useMemo(() => Object.values(cards), [cards]);
  const d = desempenhoDe(agent.id, todos);
  const atuais = todos.filter((c) => (c.dono === agent.id || c.validador === agent.id) && !["feito", "perdido"].includes(colunaDe(c.fluxo, c.coluna)?.tipo ?? ""));
  const recentes = todos.filter((c) => c.dono === agent.id && colunaDe(c.fluxo, c.coluna)?.tipo === "feito").sort((a, b) => b.atualizadoEm - a.atualizadoEm).slice(0, 6);
  const atividade = feed.filter((f) => f.agenteId === agent.id).slice(-12).reverse();
  return (
    <Pagina largura="media">
      <button type="button" onClick={() => navegar("equipe", "agentes")} className="mb-4 flex items-center gap-1 text-pequeno text-fg-3 hover:text-fg"><ArrowLeft className="size-4" /> Equipe</button>
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <Avatarzinho agent={agent} tamanho={64} />
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-pagina font-semibold text-fg">{agent.nome}{agent.lider && <Etiqueta tom="alerta">líder</Etiqueta>}</h1>
          <p className="text-corpo text-fg-2">{agent.cargo} · {roomById[agent.sala].nome}</p>
          <p className="mt-1 flex items-center gap-1.5 text-pequeno font-medium" style={{ color: info.cor }}>
            <span className="size-2 rounded-full" style={{ background: info.cor }} /> {info.rotulo}{estado?.atividade ? ` · ${estado.atividade}` : ""}
          </p>
        </div>
        <Botao icone={Building2} onClick={() => { navegar("escritorio"); useStore.getState().selecionarAgente(agent.id); }}>Ver no escritório</Botao>
        <Botao variante="principal" icone={MessageSquare} onClick={() => window.dispatchEvent(new CustomEvent("chat:mencionar", { detail: agent.nome }))}>Conversar</Botao>
      </div>
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador rotulo="Entregas aprovadas" valor={d.concluidos} detalhe={`${d.emAndamento} em andamento`} />
        <Indicador rotulo="Aprovadas de primeira" valor={d.concluidos ? `${Math.round((d.dePrimeira / d.concluidos) * 100)}%` : "—"} tom={d.concluidos && d.dePrimeira / d.concluidos >= 0.7 ? "sucesso" : undefined} />
        <Indicador rotulo="Devoluções" valor={d.devolucoes} tom={d.devolucoes > d.concluidos ? "alerta" : undefined} />
        <Indicador rotulo="Custo de IA" valor={usd(d.custo)} detalhe={d.concluidos ? `${usd(d.custo / d.concluidos)} por entrega` : undefined} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <section className="rounded-panel bg-surface p-4 shadow-1">
            <h2 className="mb-2 px-1 text-destaque font-semibold text-fg">Cards agora</h2>
            {atuais.length ? atuais.map((c) => <LinhaCard key={c.id} card={c} />) : <EstadoVazio compacto icone={LayoutGrid} titulo="Nenhum card agora" />}
          </section>
          <section className="rounded-panel bg-surface p-4 shadow-1">
            <h2 className="mb-2 px-1 text-destaque font-semibold text-fg">Entregas recentes</h2>
            {recentes.length ? recentes.map((c) => <LinhaCard key={c.id} card={c} />) : <EstadoVazio compacto icone={LayoutGrid} titulo="Nenhuma entrega ainda" />}
          </section>
          <section className="rounded-panel bg-surface p-5 shadow-1">
            <h2 className="mb-3 text-destaque font-semibold text-fg">Atividade</h2>
            {atividade.length ? (
              <ul className="space-y-1.5">
                {atividade.map((f) => <li key={f.id} className="flex gap-3 text-pequeno"><span className="tabular w-12 shrink-0 text-fg-3">{hora(f.ts)}</span><span className="text-fg">{f.texto}</span></li>)}
              </ul>
            ) : (
              <p className="text-pequeno text-fg-3">Nada ainda.</p>
            )}
          </section>
        </div>
        <section className="h-fit rounded-panel bg-surface p-5 shadow-1">
          <ChaveValor
            itens={[
              ["Perfil", <span className="text-fg-2">{agent.persona}</span>],
              ["Modelo", nomesModelo[agent.modelo]],
              ["Ferramentas", agent.ferramentas.length ? <span className="flex flex-wrap gap-1">{agent.ferramentas.map((f) => <Etiqueta key={f}>{f}</Etiqueta>)}</span> : "Só conversa e documentos"],
              ["Aciona", agent.podeChamar.includes("*") ? "Toda a empresa" : agent.podeChamar.map((id) => agentById[id]?.nome ?? roomById[id as RoomId]?.nome ?? id).join(", ")],
              ["Voz", <SeletorDeVoz agenteId={agent.id} />],
            ]}
          />
        </section>
      </div>
    </Pagina>
  );
}

/** Painel de desempenho: quem entrega mais, melhor e mais barato. */
function Desempenho() {
  const cards = useStore((s) => s.cards);
  const [ordem, setOrdem] = useState<"concluidos" | "taxa" | "custo" | "devolucoes">("concluidos");
  const linhas = useMemo(() => {
    const todos = Object.values(cards);
    return agents
      .map((a) => ({ a, d: desempenhoDe(a.id, todos) }))
      .filter((x) => x.d.total > 0)
      .map((x) => ({ ...x, taxa: x.d.concluidos ? x.d.dePrimeira / x.d.concluidos : 0, medio: x.d.concluidos ? x.d.custo / x.d.concluidos : 0 }))
      .sort((a, b) => (ordem === "taxa" ? b.taxa - a.taxa : ordem === "custo" ? b.d.custo - a.d.custo : ordem === "devolucoes" ? b.d.devolucoes - a.d.devolucoes : b.d.concluidos - a.d.concluidos));
  }, [cards, ordem]);
  if (!linhas.length) return <div className="rounded-panel bg-surface shadow-1"><EstadoVazio icone={BarChart3} titulo="Sem dados ainda" texto="Quando a equipe começar a entregar (fora do modo demonstração), aqui aparece quem entrega mais, de primeira e mais barato." /></div>;
  const Th = ({ id, children }: { id?: typeof ordem; children: React.ReactNode }) => (
    <th className="px-3 py-2.5 text-right font-medium">
      {id ? <button type="button" onClick={() => setOrdem(id)} className={cx("hover:text-fg", ordem === id && "font-semibold text-fg")}>{children}{ordem === id ? " ↓" : ""}</button> : children}
    </th>
  );
  return (
    <div className="overflow-x-auto rounded-panel bg-surface shadow-1">
      <table className="w-full min-w-[760px] text-pequeno">
        <thead className="bg-surface-2 text-legenda text-fg-3">
          <tr>
            <th className="px-4 py-2.5 text-left font-medium">Agente</th>
            <Th id="concluidos">Entregas</Th>
            <Th id="taxa">De primeira</Th>
            <Th id="devolucoes">Devoluções</Th>
            <Th>Em andamento</Th>
            <Th id="custo">Custo total</Th>
            <Th>Por entrega</Th>
          </tr>
        </thead>
        <tbody className="tabular divide-y divide-line">
          {linhas.map(({ a, d, taxa, medio }) => (
            <tr key={a.id} onClick={() => navegar("equipe", "agentes", a.id)} className="cursor-pointer hover:bg-hover">
              <td className="px-4 py-2.5"><span className="flex items-center gap-2.5"><Avatarzinho agent={a} tamanho={26} /><span><span className="block font-medium text-fg">{a.nome}</span><span className="block text-legenda text-fg-3">{roomById[a.sala].nome}</span></span></span></td>
              <td className="px-3 py-2.5 text-right text-fg">{d.concluidos}</td>
              <td className="px-3 py-2.5 text-right"><Etiqueta tom={!d.concluidos ? "neutro" : taxa >= 0.7 ? "sucesso" : taxa >= 0.4 ? "alerta" : "perigo"}>{d.concluidos ? `${Math.round(taxa * 100)}%` : "—"}</Etiqueta></td>
              <td className="px-3 py-2.5 text-right text-fg-2">{d.devolucoes}</td>
              <td className="px-3 py-2.5 text-right text-fg-2">{d.emAndamento}</td>
              <td className="px-3 py-2.5 text-right text-fg">{usd(d.custo)}</td>
              <td className="px-3 py-2.5 text-right text-fg-2">{d.concluidos ? usd(medio) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Navegador e celulares dos agentes ao vivo (um print a cada ação), e as sessões de controle do Mac. */
function AoVivo() {
  const porCard = useStore((s) => s.navegador);
  const cards = useStore((s) => s.cards);
  const sessoes = useMemo(() => Object.values(porCard).sort((a, b) => Number(b.ativa) - Number(a.ativa) || b.atualizadoEm - a.atualizadoEm), [porCard]);
  const [foco, setFoco] = useState<number | null>(null);
  const atual = sessoes.find((s) => s.cardId === foco) ?? sessoes[0];
  const cardDa = (s: SessaoNavegador) => s.dispositivo?.cardId ?? s.cardId;
  if (!sessoes.length)
    return <div className="rounded-panel bg-surface shadow-1"><EstadoVazio icone={MonitorPlay} titulo="Nenhuma tela ao vivo" texto="Quando um agente abrir um site no navegador do sistema ou ligar um celular de teste (iPhone ou Android), a tela aparece aqui, com um print a cada ação." /></div>;
  return (
    <div className="flex min-h-[620px] overflow-hidden rounded-panel bg-surface shadow-1">
      <nav className="scroll-fino w-64 shrink-0 overflow-y-auto border-r border-line bg-surface-2 p-2">
        {sessoes.map((s) => {
          const a = agentById[s.agenteId];
          const sel = atual?.cardId === s.cardId;
          return (
            <button key={s.cardId} type="button" onClick={() => setFoco(s.cardId)} className={cx("mb-1 flex w-full items-center gap-2.5 rounded-ctl px-2 py-2 text-left", sel ? "bg-press" : "hover:bg-hover")}>
              {a && <Avatarzinho agent={a} tamanho={28} />}
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1 truncate text-pequeno font-medium text-fg">{s.dispositivo ? <Smartphone className="size-3.5" /> : <Globe className="size-3.5" />}{a?.nome ?? s.agenteId} · {cards[cardDa(s)]?.chave ?? `EMP-${cardDa(s)}`}</span>
                <span className="block truncate text-legenda text-fg-3">{s.url}</span>
              </span>
              <span className={cx("size-2 shrink-0 rounded-full", s.ativa ? "pulsar bg-success" : "bg-fg-disabled")} />
            </button>
          );
        })}
      </nav>
      {atual && (
        <section className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center gap-2 border-b border-line px-4 py-2.5">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-ctl bg-sunken px-3 py-1.5 text-pequeno">
              {atual.dispositivo && <Etiqueta tom="info">{atual.dispositivo.plataforma === "ios" ? "iPhone" : "Android"}</Etiqueta>}
              {atual.modo && <Etiqueta tom={atual.modo === "teste" ? "sucesso" : "info"}>{atual.modo === "teste" ? "teste" : "internet"}</Etiqueta>}
              <span className="truncate font-mono text-fg-2">{atual.url}</span>
            </div>
            <Botao tamanho="p" onClick={() => useStore.getState().abrirCard(cardDa(atual))}>Abrir card</Botao>
            {atual.ativa && (
              <Botao tamanho="p" variante="perigo" onClick={() => void api(atual.dispositivo ? `/api/celular/${cardDa(atual)}/desligar` : `/api/navegador/${atual.cardId}/fechar`, "POST").catch(avisarErro)}>
                {atual.dispositivo ? "Desligar aparelho" : "Fechar sessão"}
              </Botao>
            )}
          </header>
          <div className="flex min-h-0 flex-1">
            <div className="grid min-w-0 flex-1 place-items-center overflow-auto bg-sunken p-4">
              {atual.imagem ? <img src={atual.imagem} alt={`Tela de ${atual.titulo}`} className={cx("max-h-full max-w-full rounded-ctl shadow-2", atual.dispositivo && "max-h-[560px]")} /> : <span className="text-pequeno text-fg-3">Sem tela ainda.</span>}
            </div>
            <ol className="scroll-fino w-64 shrink-0 space-y-1 overflow-y-auto border-l border-line p-3">
              {[...atual.acoes].reverse().map((a, i) => (
                <li key={i} className={cx("rounded-ctl px-2.5 py-1.5 text-legenda", a.ok ? "bg-surface-2" : "bg-danger-soft text-danger-fg")}>
                  <span className="font-semibold text-fg">{a.acao}</span> <span className="text-fg-3">{quando(a.ts)}</span>
                  <div className="break-all text-fg-2">{a.detalhe}</div>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}
    </div>
  );
}
