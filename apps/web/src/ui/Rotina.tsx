import { useEffect, useState } from "react";
import type { Ata, ConfigCritica, Indicadores, Meta, ResultadoChave, RitualInfo } from "@empresa/shared";
import { agentById, roomById, rooms } from "@empresa/org";
import { useStore } from "../store.ts";
import { api } from "../api.ts";
import { Markdown } from "./Markdown.tsx";
import { AbaConquistas, AbaOperacao } from "./Operacao.tsx";

type Aba = "metas" | "indicadores" | "rituais" | "atas" | "operacao" | "conquistas";

/** Metas do trimestre, indicadores, rituais e atas (PLANO.md, seção 4.2-C e D). */
export function Rotina() {
  const aberta = useStore((s) => s.rotinaAberta);
  const fechar = () => useStore.getState().setRotinaAberta(false);
  const aba = useStore((s) => s.rotinaAba);
  const setAba = (a: Aba) => useStore.setState({ rotinaAba: a });
  if (!aberta) return null;

  return (
    <div className="pointer-events-auto absolute inset-0 z-40 grid place-items-center bg-ink/35 p-4 backdrop-blur-sm" onClick={fechar}>
      <div
        className="flex h-[min(760px,100%)] w-[min(1040px,100%)] flex-col overflow-hidden rounded-2xl bg-surface shadow-3 ring-1 ring-line"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-1 border-b border-line px-5 pt-3">
          <h2 className="mr-3 pb-2.5 text-destaque font-bold">Rotina da empresa</h2>
          {(
            [
              ["metas", "Metas"],
              ["indicadores", "Indicadores"],
              ["rituais", "Rituais"],
              ["atas", "Atas"],
              ["operacao", "Operação"],
              ["conquistas", "Conquistas"],
            ] as const
          ).map(([id, nome]) => (
            <button
              key={id}
              onClick={() => setAba(id)}
              className={`-mb-px border-b-2 px-3 pb-2.5 text-pequeno font-semibold ${aba === id ? "border-ink" : "border-transparent text-fg-3 hover:text-fg"}`}
            >
              {nome}
            </button>
          ))}
          <div className="flex-1" />
          <button onClick={fechar} className="mb-2 grid h-8 w-8 place-items-center rounded-full text-fg-3 hover:bg-hover" aria-label="Fechar">
            ✕
          </button>
        </header>
        <div className="scroll-fino min-h-0 flex-1 overflow-y-auto p-5">
          {aba === "metas" && <AbaMetas />}
          {aba === "indicadores" && <AbaIndicadores />}
          {aba === "rituais" && <AbaRituais />}
          {aba === "atas" && <AbaAtas />}
          {aba === "operacao" && <AbaOperacao />}
          {aba === "conquistas" && <AbaConquistas />}
        </div>
      </div>
    </div>
  );
}

function useAcao() {
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const acao = async (fn: () => Promise<unknown>) => {
    setErro(null);
    setOcupado(true);
    try {
      await fn();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  };
  return { erro, ocupado, acao };
}

/* ---------- Metas ---------- */

const trimestreAtual = (d = new Date()) => `${d.getFullYear()}-T${Math.floor(d.getMonth() / 3) + 1}`;

export function AbaMetas() {
  const metas = useStore((s) => s.metas);
  const { erro, ocupado, acao } = useAcao();
  const doTrimestre = metas.filter((m) => m.trimestre === trimestreAtual());
  const anteriores = metas.filter((m) => m.trimestre !== trimestreAtual());

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <p className="flex-1 text-pequeno text-fg-2">
          Metas de {trimestreAtual()}: 1 a 3 objetivos com resultados-chave mensuráveis. Todos os agentes e rituais trabalham em cima delas.
        </p>
        <button
          disabled={ocupado}
          onClick={() => acao(() => api("/api/metas/sugerir", "POST"))}
          className="rounded-lg px-3 py-1.5 text-pequeno font-semibold ring-1 ring-line hover:bg-hover disabled:opacity-40"
        >
          {ocupado ? "A Helena está pensando…" : "Sugerir com a Helena"}
        </button>
        <button
          onClick={() => acao(() => api("/api/metas", "POST", { objetivo: "Novo objetivo", resultados: [{ descricao: "Resultado-chave", atual: 0, alvo: 10, unidade: "" }] }))}
          className="rounded-lg bg-ink px-3 py-1.5 text-pequeno font-semibold text-on-ink"
        >
          + Nova meta
        </button>
      </div>
      {erro && <p className="rounded-lg bg-danger-soft px-3 py-2 text-pequeno text-danger-fg">{erro}</p>}
      {doTrimestre.length === 0 && (
        <p className="rounded-xl border border-dashed border-line py-10 text-center text-pequeno text-fg-3">
          Nenhuma meta para este trimestre. Crie uma ou peça para a Helena sugerir a partir do Livro da Empresa.
        </p>
      )}
      {doTrimestre.map((m) => (
        <CartaoMeta key={m.id} meta={m} />
      ))}
      {anteriores.length > 0 && (
        <details className="text-pequeno text-fg-2">
          <summary className="cursor-pointer">Trimestres anteriores ({anteriores.length})</summary>
          <div className="mt-2 space-y-3">
            {anteriores.map((m) => (
              <CartaoMeta key={m.id} meta={m} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function CartaoMeta({ meta }: { meta: Meta }) {
  const [rascunho, setRascunho] = useState(meta);
  const { erro, acao } = useAcao();
  useEffect(() => setRascunho(meta), [meta]);
  const salvar = (m: Meta) => acao(() => api(`/api/metas/${meta.id}`, "PUT", m));
  const mudarKr = (i: number, kr: Partial<ResultadoChave>) =>
    setRascunho({ ...rascunho, resultados: rascunho.resultados.map((r, j) => (j === i ? { ...r, ...kr } : r)) });
  const mudou = JSON.stringify(rascunho) !== JSON.stringify(meta);
  const progresso = meta.resultados.length
    ? Math.round((meta.resultados.reduce((s, r) => s + Math.min(1, r.alvo ? r.atual / r.alvo : 0), 0) / meta.resultados.length) * 100)
    : 0;

  return (
    <div className={`rounded-2xl p-4 ring-1 ${meta.confirmada ? "ring-line" : "bg-warning-soft/50 ring-warning"}`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {!meta.confirmada && <div className="mb-1 text-legenda font-bold uppercase text-warning-fg">Sugerida pela Helena · confirme ou ajuste</div>}
          <input
            value={rascunho.objetivo}
            onChange={(e) => setRascunho({ ...rascunho, objetivo: e.target.value })}
            className="w-full rounded-lg px-1 py-0.5 text-corpo font-bold outline-none hover:bg-hover focus:bg-sunken"
          />
        </div>
        <div className="text-right">
          <div className="text-secao font-bold">{progresso}%</div>
          <div className="text-legenda text-fg-3">{meta.trimestre}</div>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {rascunho.resultados.map((r, i) => {
          const pct = r.alvo ? Math.min(100, Math.round((r.atual / r.alvo) * 100)) : 0;
          return (
            <div key={r.id} className="grid grid-cols-[1fr_70px_70px_80px_140px_24px] items-center gap-2 text-pequeno">
              <div>
                <input value={r.descricao} onChange={(e) => mudarKr(i, { descricao: e.target.value })} className="campo" />
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-sunken">
                  <div className="h-full rounded-full bg-success transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
              <input type="number" value={r.atual} onChange={(e) => mudarKr(i, { atual: Number(e.target.value) })} className="campo" title="Atual" />
              <input type="number" value={r.alvo} onChange={(e) => mudarKr(i, { alvo: Number(e.target.value) })} className="campo" title="Alvo" />
              <input value={r.unidade} onChange={(e) => mudarKr(i, { unidade: e.target.value })} placeholder="unidade" className="campo" />
              <select value={r.sala ?? ""} onChange={(e) => mudarKr(i, { sala: (e.target.value || null) as ResultadoChave["sala"] })} className="campo">
                <option value="">Sem área</option>
                {rooms
                  .filter((x) => x.id !== "reuniao")
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.nome}
                    </option>
                  ))}
              </select>
              <button
                onClick={() => setRascunho({ ...rascunho, resultados: rascunho.resultados.filter((_, j) => j !== i) })}
                className="text-fg-disabled hover:text-danger-fg"
                title="Remover resultado-chave"
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={() =>
            setRascunho({
              ...rascunho,
              resultados: [...rascunho.resultados, { id: crypto.randomUUID(), descricao: "Novo resultado-chave", atual: 0, alvo: 10, unidade: "", sala: null }],
            })
          }
          className="text-legenda font-semibold text-fg-2 hover:text-fg"
        >
          + resultado-chave
        </button>
        {erro && <span className="text-legenda text-danger-fg">{erro}</span>}
        <div className="flex-1" />
        <button
          onClick={() => acao(async () => {
            if (confirm("Excluir esta meta?")) await api(`/api/metas/${meta.id}`, "DELETE");
          })}
          className="rounded-lg px-2 py-1 text-legenda text-danger-fg hover:bg-danger-soft"
        >
          Excluir
        </button>
        {(mudou || !meta.confirmada) && (
          <button onClick={() => salvar({ ...rascunho, confirmada: true })} className="rounded-lg bg-ink px-3 py-1.5 text-legenda font-semibold text-on-ink">
            {meta.confirmada ? "Salvar" : "Confirmar meta"}
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------- Indicadores ---------- */

export function AbaIndicadores() {
  const [ind, setInd] = useState<Indicadores | null>(null);
  const carregar = () => void api<Indicadores>("/api/indicadores").then(setInd).catch(() => setInd(null));
  useEffect(carregar, []);
  if (!ind) return <p className="text-pequeno text-fg-3">Carregando…</p>;
  const usd = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "USD" });
  const ativas = ind.areas.filter((a) => a.concluidos7d || a.emAndamento || a.aguardandoCeo || a.bugsAbertos || a.custo7dUsd);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          ["Custo de IA hoje", ind.custoHojeUsd],
          ["Últimos 7 dias", ind.custo7dUsd],
          ["Este mês", ind.custoMesUsd],
        ].map(([rotulo, v]) => (
          <div key={rotulo as string} className="rounded-xl bg-sunken p-3">
            <div className="text-legenda font-semibold uppercase tracking-wide text-fg-3">{rotulo}</div>
            <div className="text-xl font-bold tabular-nums">{usd(v as number)}</div>
          </div>
        ))}
      </div>
      <div className="flex items-center">
        <p className="flex-1 text-pequeno text-fg-2">Calculados da própria board (sem integrações). Aprovação de primeira e devoluções olham os últimos 30 dias.</p>
        <button onClick={carregar} className="text-legenda font-semibold text-fg-2 underline">
          atualizar
        </button>
      </div>
      {ativas.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line py-10 text-center text-pequeno text-fg-3">Sem atividade ainda. Os números aparecem quando a equipe começar a trabalhar.</p>
      ) : (
        <table className="w-full text-pequeno">
          <thead className="text-left text-legenda uppercase tracking-wide text-fg-3">
            <tr>
              <th className="py-2">Área</th>
              <th>Concluídos 7d</th>
              <th>Em andamento</th>
              <th>Esperando você</th>
              <th>Aprovação de 1ª</th>
              <th>Devoluções/card</th>
              <th>Bugs abertos</th>
              <th>Tempo médio</th>
              <th className="text-right">Custo 7d</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {ativas.map((a) => (
              <tr key={a.sala} className="border-t border-line">
                <td className="py-2 font-medium">{roomById[a.sala].nome}</td>
                <td>{a.concluidos7d}</td>
                <td>{a.emAndamento}</td>
                <td className={a.aguardandoCeo ? "font-semibold text-danger-fg" : ""}>{a.aguardandoCeo}</td>
                <td>{a.aprovacaoPrimeira === null ? "–" : `${a.aprovacaoPrimeira}%`}</td>
                <td>{a.devolucoesMedias ?? "–"}</td>
                <td className={a.bugsAbertos ? "font-semibold text-danger-fg" : ""}>{a.bugsAbertos}</td>
                <td>{a.tempoMedioHoras === null ? "–" : `${a.tempoMedioHoras} h`}</td>
                <td className="text-right">{usd(a.custo7dUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ---------- Rituais ---------- */

export function AbaRituais() {
  const rituais = useStore((s) => s.rituais);
  const chave = useStore((s) => s.chaveConfigurada);
  const { erro, acao } = useAcao();
  const quando = (t: number | null) => (t ? new Date(t).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "–");

  return (
    <div className="space-y-3">
      <p className="text-pequeno text-fg-2">
        Os rituais rodam no seu Mac. Se ele estiver desligado na hora, o ritual roda quando você abrir o app (marcado como atrasado).
        {!chave && <b className="text-warning-fg"> Configure a chave da API para os rituais rodarem.</b>}
      </p>
      {erro && <p className="rounded-lg bg-danger-soft px-3 py-2 text-pequeno text-danger-fg">{erro}</p>}
      <Gatilhos />
      <OlharCritico />
      <h3 className="pt-2 text-legenda font-bold uppercase tracking-wide text-fg-3">Rituais</h3>
      {rituais.map((r: RitualInfo) => (
        <div key={r.id} className="flex items-start gap-3 rounded-xl p-3 ring-1 ring-line">
          <label className="mt-0.5 flex cursor-pointer items-center" title={r.ativo ? "Desligar" : "Ligar"}>
            <input type="checkbox" checked={r.ativo} onChange={(e) => acao(() => api(`/api/rituais/${r.id}`, "PUT", { ativo: e.target.checked }))} />
          </label>
          <div className="min-w-0 flex-1">
            <div className="text-corpo font-semibold">{r.nome}</div>
            <div className="text-pequeno text-fg-2">{r.descricao}</div>
            <div className="mt-1 text-legenda text-fg-3">
              {r.quando} · última: {quando(r.ultimaExecucao)} · próxima: {r.ativo ? quando(r.proximaExecucao) : "desligado"}
            </div>
          </div>
          <input
            type="time"
            defaultValue={r.hora}
            onBlur={(e) => e.target.value !== r.hora && acao(() => api(`/api/rituais/${r.id}`, "PUT", { hora: e.target.value }))}
            className="campo tabular w-[112px] shrink-0"
          />
          <button
            disabled={!chave}
            onClick={() => acao(() => api(`/api/rituais/${r.id}/rodar`, "POST"))}
            className="rounded-lg px-3 py-1.5 text-legenda font-semibold ring-1 ring-line hover:bg-hover disabled:opacity-30"
          >
            Rodar agora
          </button>
        </div>
      ))}
    </div>
  );
}

interface Gatilho {
  id: string;
  nome: string;
  descricao: string;
  ativo: boolean;
}

/** O que a equipe faz sozinha quando você aprova uma funcionalidade. */
function Gatilhos() {
  const [gatilhos, setGatilhos] = useState<Gatilho[]>([]);
  const { erro, acao } = useAcao();
  useEffect(() => void api<Gatilho[]>("/api/gatilhos").then(setGatilhos).catch(() => setGatilhos([])), []);
  if (!gatilhos.length) return null;
  return (
    <div className="rounded-xl bg-sunken p-3">
      <div className="mb-2 text-legenda font-bold uppercase tracking-wide text-fg-3">Quando você aprova uma funcionalidade</div>
      <div className="grid gap-2 sm:grid-cols-3">
        {gatilhos.map((g) => (
          <label key={g.id} className="flex cursor-pointer items-start gap-2 rounded-lg bg-surface p-2.5 text-pequeno ring-1 ring-line">
            <input
              type="checkbox"
              checked={g.ativo}
              onChange={(e) => acao(async () => setGatilhos(await api<Gatilho[]>(`/api/gatilhos/${g.id}`, "PUT", { ativo: e.target.checked })))}
              className="mt-0.5"
            />
            <span>
              <b>{g.nome}</b>
              <span className="block text-legenda text-fg-2">{g.descricao}</span>
            </span>
          </label>
        ))}
      </div>
      {erro && <p className="mt-2 text-legenda text-danger-fg">{erro}</p>}
    </div>
  );
}

/** Liga e desliga a autocrítica, o advogado do diabo e as lições aprendidas (cada um custa chamadas extras). */
function OlharCritico() {
  const critica = useStore((s) => s.critica);
  const { erro, acao } = useAcao();
  const opcoes: { id: keyof ConfigCritica; nome: string; descricao: string }[] = [
    { id: "autocritica", nome: "Autocrítica", descricao: "Antes de entregar, o autor confere a própria entrega contra o checklist e corrige." },
    { id: "advogado", nome: "Advogado do diabo", descricao: "Em entregas importantes (N2/N3, épicos, P0), um sênior de outra área questiona as premissas antes do validador." },
    { id: "licoes", nome: "Lições aprendidas", descricao: "Card concluído depois de devoluções ou dos seus comentários vira uma lição para você aprovar." },
  ];
  return (
    <div className="rounded-xl bg-sunken p-3">
      <div className="mb-2 text-legenda font-bold uppercase tracking-wide text-fg-3">Olhar crítico</div>
      <div className="grid gap-2 sm:grid-cols-3">
        {opcoes.map((o) => (
          <label key={o.id} className="flex cursor-pointer items-start gap-2 rounded-lg bg-surface p-2.5 text-pequeno ring-1 ring-line">
            <input
              type="checkbox"
              checked={critica[o.id]}
              onChange={(e) => acao(() => api("/api/critica", "PUT", { [o.id]: e.target.checked }))}
              className="mt-0.5"
            />
            <span>
              <b>{o.nome}</b>
              <span className="block text-legenda text-fg-2">{o.descricao}</span>
            </span>
          </label>
        ))}
      </div>
      {erro && <p className="mt-2 text-legenda text-danger-fg">{erro}</p>}
    </div>
  );
}

/* ---------- Atas ---------- */

export function AbaAtas() {
  const novas = useStore((s) => s.atasNovas);
  const rituais = useStore((s) => s.rituais);
  const [antigas, setAntigas] = useState<Ata[]>([]);
  useEffect(() => void api<Ata[]>("/api/atas").then(setAntigas).catch(() => setAntigas([])), []);
  const todas = [...novas, ...antigas.filter((a) => !novas.some((n) => n.id === a.id))].sort((a, b) => b.ts - a.ts);
  if (!todas.length) return <p className="rounded-xl border border-dashed border-line py-10 text-center text-pequeno text-fg-3">Nenhum ritual rodou ainda.</p>;

  return (
    <div className="space-y-2">
      {todas.map((a, i) => (
        <details key={a.id} open={i === 0} className="rounded-xl p-3 ring-1 ring-line">
          <summary className="cursor-pointer text-corpo">
            <b>{rituais.find((r) => r.id === a.ritual)?.nome ?? a.ritual}</b>
            <span className="ml-2 text-pequeno text-fg-3">
              {new Date(a.ts).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} · {agentById[a.autor]?.nome ?? a.autor}
              {a.atrasado && <span className="ml-1 font-semibold text-warning-fg">atrasado</span>}
            </span>
          </summary>
          <Markdown texto={a.conteudo} className="mt-2 text-pequeno text-fg" />
        </details>
      ))}
    </div>
  );
}
