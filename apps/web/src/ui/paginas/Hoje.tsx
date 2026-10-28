import { useEffect, useState } from "react";
import { AlertTriangle, Inbox, Layers, Send, Sparkles } from "lucide-react";
import { agentById } from "@empresa/org";
import { useStore } from "../../store.ts";
import { api } from "../../api.ts";
import { navegar } from "../../nav.ts";
import { Botao, EstadoVazio, Etiqueta, Indicador, Interruptor, Janela, Seletor, AreaTexto, avisar, avisarErro, cx } from "../kit/index.ts";

// Operação → Hoje: o dia da empresa numa tela só, o relatório diário e os modelos de projeto.
// Operação → Chamadas de IA: cada chamada, com tokens, cache, custo e tempo (para achar desperdício).

interface Painel {
  dia: string;
  entregues: { chave: string; titulo: string; sala: string; usd: number }[];
  concluidos: number;
  esperandoVoce: { chave: string; titulo: string; motivo: string }[];
  riscos: { chave: string; titulo: string; risco: string }[];
  gasto: { hoje: number; orcamento: number; taxaCache: number; chamadas: number; maisCaros: { chave: string; usd: number }[] };
  emAndamento: number;
  naFila: number;
}

const usd = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "USD" });

/** Abre o card pela chave (EMP-12). */
function abrirChave(chave: string) {
  const card = Object.values(useStore.getState().cards).find((c) => c.chave === chave);
  if (card) useStore.getState().abrirCard(card.id);
}

function Linha({ chave, titulo, extra }: { chave: string; titulo: string; extra: React.ReactNode }) {
  return (
    <li>
      <button type="button" onClick={() => abrirChave(chave)} className="flex w-full items-center gap-2.5 rounded-ctl px-2 py-1.5 text-left hover:bg-hover">
        <span className="tabular shrink-0 text-legenda text-fg-3">{chave}</span>
        <span className="min-w-0 flex-1 truncate text-pequeno text-fg">{titulo}</span>
        <span className="shrink-0 text-legenda">{extra}</span>
      </button>
    </li>
  );
}

export function PainelHoje() {
  const [p, setP] = useState<Painel | null>(null);
  const [modelos, setModelos] = useState(false);
  const versao = useStore((s) => s.custoHojeUsd);
  useEffect(() => void api<Painel>("/api/painel").then(setP).catch(() => setP(null)), [versao]);
  if (!p) return null;
  const pct = p.gasto.orcamento ? Math.min(100, Math.round((p.gasto.hoje / p.gasto.orcamento) * 100)) : 0;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Indicador rotulo="Entregas hoje" valor={p.entregues.length} detalhe={`${p.concluidos} concluído(s)`} />
        <Indicador rotulo="Esperando você" valor={p.esperandoVoce.length} tom={p.esperandoVoce.length ? "alerta" : undefined} />
        <Indicador rotulo="Gasto hoje" valor={usd(p.gasto.hoje)} detalhe={`${pct}% de ${usd(p.gasto.orcamento)}`} tom={pct >= 80 ? "alerta" : undefined} />
        <Indicador rotulo="Do cache" valor={`${Math.round(p.gasto.taxaCache * 100)}%`} detalhe={`${p.gasto.chamadas} chamadas`} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Botao variante="principal" icone={Layers} onClick={() => setModelos(true)}>Novo projeto a partir de modelo</Botao>
        <Botao icone={Send} onClick={() => void api<{ texto: string }>("/api/relatorio/agora", "POST").then(() => avisar("Resumo enviado no chat (e no Telegram, se pareado)")).catch(avisarErro)}>Mandar o resumo agora</Botao>
        <ConfigRelatorio />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-panel bg-surface p-4 shadow-1">
          <h3 className="mb-2 flex items-center gap-2 text-corpo font-semibold text-fg"><Inbox className="size-4" />Esperando você</h3>
          {p.esperandoVoce.length ? (
            <ul>{p.esperandoVoce.map((e) => <Linha key={e.chave} chave={e.chave} titulo={e.titulo} extra={<Etiqueta tom="alerta">{e.motivo}</Etiqueta>} />)}</ul>
          ) : (
            <p className="px-2 text-pequeno text-fg-3">Nada esperando você.</p>
          )}
          {p.esperandoVoce.length > 0 && <Botao tamanho="p" variante="discreto" className="mt-2" onClick={() => navegar("entrada")}>Abrir a Caixa de entrada</Botao>}
        </section>
        <section className="rounded-panel bg-surface p-4 shadow-1">
          <h3 className="mb-2 flex items-center gap-2 text-corpo font-semibold text-fg"><AlertTriangle className="size-4" />Riscos</h3>
          {p.riscos.length ? (
            <ul>{p.riscos.map((r, i) => <Linha key={`${r.chave}-${i}`} chave={r.chave} titulo={r.titulo} extra={<span className="text-warning-fg">{r.risco}</span>} />)}</ul>
          ) : (
            <p className="px-2 text-pequeno text-fg-3">Nenhum risco à vista.</p>
          )}
        </section>
        <section className="rounded-panel bg-surface p-4 shadow-1">
          <h3 className="mb-2 flex items-center gap-2 text-corpo font-semibold text-fg"><Sparkles className="size-4" />Entregas de hoje</h3>
          {p.entregues.length ? (
            <ul>{p.entregues.map((e) => <Linha key={e.chave} chave={e.chave} titulo={e.titulo} extra={<span className="tabular text-fg-3">{usd(e.usd)}</span>} />)}</ul>
          ) : (
            <p className="px-2 text-pequeno text-fg-3">Nenhuma entrega ainda hoje.</p>
          )}
        </section>
        <section className="rounded-panel bg-surface p-4 shadow-1">
          <h3 className="mb-2 text-corpo font-semibold text-fg">Cards mais caros hoje</h3>
          {p.gasto.maisCaros.length ? (
            <ul>{p.gasto.maisCaros.map((m) => <Linha key={m.chave} chave={m.chave} titulo="" extra={<span className="tabular text-fg-2">{usd(m.usd)}</span>} />)}</ul>
          ) : (
            <p className="px-2 text-pequeno text-fg-3">Sem gasto hoje.</p>
          )}
          <p className="mt-2 px-2 text-legenda text-fg-3">Agora: {p.emAndamento} em andamento, {p.naFila} na fila.</p>
        </section>
      </div>
      <JanelaModelos aberta={modelos} fechar={() => setModelos(false)} />
    </div>
  );
}

function ConfigRelatorio() {
  const [c, setC] = useState<{ ativo: boolean; hora: number } | null>(null);
  useEffect(() => void api<{ ativo: boolean; hora: number }>("/api/relatorio").then(setC).catch(() => {}), []);
  if (!c) return null;
  const salvar = (n: Partial<typeof c>) => void api<typeof c>("/api/relatorio", "PUT", n).then(setC).catch(avisarErro);
  return (
    <div className="flex items-center gap-2 rounded-ctl bg-surface px-3 py-1 shadow-1">
      <Interruptor ativo={c.ativo} onChange={(v) => salvar({ ativo: v })} rotulo="Resumo diário" />
      <Seletor tamanho="p" aria-label="Hora do resumo" value={c.hora} onChange={(e) => salvar({ hora: Number(e.target.value) })} disabled={!c.ativo}>
        {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}h</option>)}
      </Seletor>
    </div>
  );
}

interface Modelo {
  id: string;
  nome: string;
  descricao: string;
  etapas: { titulo: string; sala: string }[];
}

function JanelaModelos({ aberta, fechar }: { aberta: boolean; fechar: () => void }) {
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [escolhido, setEscolhido] = useState<string>("mvp");
  const [contexto, setContexto] = useState("");
  const [criando, setCriando] = useState(false);
  const projetoAtivo = useStore((s) => s.projetoAtivo);
  useEffect(() => {
    if (aberta) void api<Modelo[]>("/api/modelos-projeto").then(setModelos).catch(avisarErro);
  }, [aberta]);
  const m = modelos.find((x) => x.id === escolhido);
  const criar = async () => {
    setCriando(true);
    try {
      const cards = await api<{ chave: string }[]>(`/api/modelos-projeto/${escolhido}`, "POST", { contexto, projetoId: projetoAtivo });
      avisar(`${cards.length} cards criados (${cards[0]?.chave} em diante)`);
      setContexto("");
      fechar();
      navegar("trabalho");
    } catch (e) {
      avisarErro(e);
    } finally {
      setCriando(false);
    }
  };
  return (
    <Janela
      aberta={aberta}
      fechar={fechar}
      titulo="Novo projeto a partir de modelo"
      descricao="A sequência de cards já vem pronta, com as dependências. A Helena distribui e a equipe começa pela primeira etapa."
      largura={640}
      rodape={
        <>
          <Botao variante="secundario" onClick={fechar}>Cancelar</Botao>
          <Botao variante="principal" carregando={criando} disabled={!contexto.trim()} onClick={() => void criar()}>Criar {m?.etapas.length ?? ""} cards</Botao>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2">
          {modelos.map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => setEscolhido(x.id)}
              className={cx("rounded-card p-3 text-left ring-1 transition-colors", escolhido === x.id ? "bg-accent-soft ring-accent" : "bg-surface ring-line hover:bg-hover")}
            >
              <div className="text-corpo font-semibold text-fg">{x.nome}</div>
              <div className="mt-0.5 text-legenda text-fg-2">{x.descricao}</div>
            </button>
          ))}
        </div>
        {m && (
          <ol className="list-decimal space-y-0.5 pl-5 text-pequeno text-fg-2">
            {m.etapas.map((e) => <li key={e.titulo}>{e.titulo}</li>)}
          </ol>
        )}
        <AreaTexto rotulo="Do que se trata (uma ou duas frases)" rows={3} value={contexto} onChange={(e) => setContexto(e.target.value)} placeholder="Ex.: Boards nativas no Parliamo, com integrações opcionais com Yondra, Jira e Trello" />
        <p className="text-legenda text-fg-3">{projetoAtivo ? "Os cards ficam ligados ao projeto ativo." : "Sem projeto ativo: os cards não ficam ligados a um repositório."}</p>
      </div>
    </Janela>
  );
}

interface Chamadas {
  chamadas: { id: number; ts: number; cardId: number | null; agente: string | null; modelo: string; rodada: number; entrada: number; saida: number; cacheEscrita: number; cacheLeitura: number; usd: number; ms: number; parada: string | null }[];
  total: { chamadas: number; usd: number; entrada: number; saida: number; cacheLeitura: number; taxaCache: number };
  porAgente: { agente: string; chamadas: number; usd: number; taxaCache: number }[];
  porModelo: { modelo: string; chamadas: number; usd: number }[];
}

export function ChamadasIA() {
  const [horas, setHoras] = useState(24);
  const [d, setD] = useState<Chamadas | null>(null);
  const cards = useStore((s) => s.cards);
  const versao = useStore((s) => s.custoHojeUsd);
  useEffect(() => void api<Chamadas>(`/api/chamadas?horas=${horas}`).then(setD).catch(() => setD(null)), [horas, versao]);
  const nomeAgente = (id: string | null) => (id ? (agentById[id]?.nome ?? id) : "—");
  if (!d) return null;
  if (!d.total.chamadas)
    return (
      <div className="rounded-panel bg-surface shadow-1">
        <EstadoVazio icone={Layers} titulo="Nenhuma chamada no período" texto="Cada chamada à IA aparece aqui, com tokens, cache, custo e tempo." />
      </div>
    );
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Seletor tamanho="p" aria-label="Período" value={horas} onChange={(e) => setHoras(Number(e.target.value))}>
          <option value={1}>Última hora</option>
          <option value={24}>Últimas 24 h</option>
          <option value={168}>Últimos 7 dias</option>
        </Seletor>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Indicador rotulo="Chamadas" valor={d.total.chamadas} />
        <Indicador rotulo="Custo" valor={usd(d.total.usd)} />
        <Indicador rotulo="Do cache" valor={`${Math.round(d.total.taxaCache * 100)}%`} detalhe="da entrada veio do cache" />
        <Indicador rotulo="Tokens" valor={`${Math.round((d.total.entrada + d.total.cacheLeitura) / 1000)}k / ${Math.round(d.total.saida / 1000)}k`} detalhe="entrada / saída" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-panel bg-surface p-4 shadow-1">
          <h3 className="mb-2 text-corpo font-semibold text-fg">Por agente</h3>
          <table className="w-full text-pequeno">
            <tbody>
              {d.porAgente.slice(0, 12).map((a) => (
                <tr key={a.agente} className="border-t border-line">
                  <td className="py-1.5 text-fg">{nomeAgente(a.agente === "—" ? null : a.agente)}</td>
                  <td className="tabular py-1.5 text-right text-fg-3">{a.chamadas}</td>
                  <td className="tabular py-1.5 text-right text-fg-3">{Math.round(a.taxaCache * 100)}% cache</td>
                  <td className="tabular py-1.5 text-right text-fg">{usd(a.usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="rounded-panel bg-surface p-4 shadow-1">
          <h3 className="mb-2 text-corpo font-semibold text-fg">Por modelo</h3>
          <table className="w-full text-pequeno">
            <tbody>
              {d.porModelo.map((m) => (
                <tr key={m.modelo} className="border-t border-line">
                  <td className="py-1.5 font-mono text-legenda text-fg">{m.modelo}</td>
                  <td className="tabular py-1.5 text-right text-fg-3">{m.chamadas}</td>
                  <td className="tabular py-1.5 text-right text-fg">{usd(m.usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
      <section className="overflow-x-auto rounded-panel bg-surface p-4 shadow-1">
        <h3 className="mb-2 text-corpo font-semibold text-fg">Chamadas recentes</h3>
        <table className="w-full min-w-[720px] text-pequeno">
          <thead>
            <tr className="text-left text-legenda text-fg-3">
              <th className="py-1 font-medium">Quando</th><th className="font-medium">Card</th><th className="font-medium">Agente</th><th className="font-medium">Modelo</th>
              <th className="text-right font-medium">Entrada</th><th className="text-right font-medium">Cache</th><th className="text-right font-medium">Saída</th>
              <th className="text-right font-medium">Tempo</th><th className="text-right font-medium">Custo</th><th className="font-medium">Parada</th>
            </tr>
          </thead>
          <tbody>
            {d.chamadas.map((c) => (
              <tr key={c.id} className="border-t border-line">
                <td className="tabular py-1.5 text-fg-3">{new Date(c.ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</td>
                <td className="tabular text-fg-2">{c.cardId ? (cards[c.cardId]?.chave ?? `#${c.cardId}`) : "chat"}</td>
                <td className="text-fg">{nomeAgente(c.agente)}</td>
                <td className="font-mono text-legenda text-fg-3">{c.modelo.replace("claude-", "")}</td>
                <td className="tabular text-right text-fg-2">{c.entrada.toLocaleString("pt-BR")}</td>
                <td className="tabular text-right text-fg-2">{c.cacheLeitura.toLocaleString("pt-BR")}</td>
                <td className="tabular text-right text-fg-2">{c.saida.toLocaleString("pt-BR")}</td>
                <td className="tabular text-right text-fg-3">{(c.ms / 1000).toFixed(1)}s</td>
                <td className="tabular text-right text-fg">{usd(c.usd)}</td>
                <td className="text-legenda text-fg-3">{c.parada}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
