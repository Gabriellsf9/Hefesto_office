import { useEffect, useState } from "react";
import type { Medicao } from "@empresa/shared";
import { api } from "../../api.ts";
import { Botao, Etiqueta, Indicador, avisar, avisarErro } from "../kit/index.ts";
import { usd } from "../comum.tsx";

// Medição: entrega por dia, quanto o CEO precisou entrar e como cada modelo se sai nos cards de verdade.
// A meta é 9 de 10 cards concluídos sem você precisar comentar ou devolver.

const META_SEM_CEO = 90;
const nomeModelo = (m: string) => m.replace(/^ollama:/, "").replace(/^gemini:/, "");
const tomPct = (v: number | null, bom: number) => (v == null ? undefined : v >= bom ? "sucesso" : v >= bom - 30 ? "alerta" : "perigo");

export function PainelMedicao() {
  const [m, setM] = useState<Medicao | null>(null);
  const carregar = () => void api<Medicao>("/api/medicao").then(setM).catch(avisarErro);
  useEffect(carregar, []);
  if (!m) return <p className="text-pequeno text-fg-3">Carregando…</p>;
  const r = m.resumo;
  const maxDia = Math.max(1, ...m.dias.map((d) => d.concluidos + d.devolucoes));
  const usar = async (agente: string, modelo: string) => {
    try {
      await api("/api/provedores", "PUT", { escolhas: { [agente]: modelo } });
      avisar("Modelo trocado");
      carregar();
    } catch (err) {
      avisarErro(err);
    }
  };
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-4">
        <Indicador rotulo="Concluídos (30 dias)" valor={r.concluidos} detalhe={r.horasPorCard != null ? `${r.horasPorCard} h por card, em média` : undefined} />
        <Indicador rotulo="Sem você precisar entrar" valor={r.semCeo != null ? `${r.semCeo}%` : "—"} tom={tomPct(r.semCeo, META_SEM_CEO)} detalhe={`Meta: ${META_SEM_CEO}%`} />
        <Indicador rotulo="Aprovados de primeira" valor={r.aprovadosDePrimeira != null ? `${r.aprovadosDePrimeira}%` : "—"} tom={tomPct(r.aprovadosDePrimeira, 70)} />
        <Indicador rotulo="Custo por card" valor={r.custoPorCardUsd != null ? usd(r.custoPorCardUsd) : "—"} detalhe={`${usd(r.custoUsd)} no total`} />
      </div>

      <section className="rounded-panel bg-surface p-5 shadow-1">
        <h3 className="mb-1 text-destaque font-semibold text-fg">Entregas por dia</h3>
        <p className="mb-4 text-legenda text-fg-3">
          <span className="mr-1 inline-block size-2 rounded-full bg-accent" /> concluídos · <span className="mx-1 inline-block size-2 rounded-full bg-warning" /> devoluções
        </p>
        <div className="flex h-32 items-end gap-1" role="img" aria-label="Cards concluídos e devolvidos por dia nos últimos 30 dias">
          {m.dias.map((d) => (
            <div key={d.dia} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${d.dia}: ${d.concluidos} concluído(s), ${d.devolucoes} devolução(ões), ${usd(d.custoUsd)}, ${d.horasDeModelo.toFixed(1)} h de modelo`}>
              <div className="rounded-t-sm bg-warning" style={{ height: `${(d.devolucoes / maxDia) * 100}%` }} />
              <div className="bg-accent" style={{ height: `${(d.concluidos / maxDia) * 100}%`, minHeight: d.concluidos ? 2 : 0 }} />
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-legenda text-fg-3">
          <span>{m.dias[0]?.dia.slice(5)}</span>
          <span>hoje</span>
        </div>
      </section>

      {m.sugestoes.length > 0 && (
        <section className="rounded-panel bg-surface p-5 shadow-1">
          <h3 className="mb-3 text-destaque font-semibold text-fg">Sugestões de modelo</h3>
          <ul className="divide-y divide-line">
            {m.sugestoes.map((s) => (
              <li key={s.agente} className="flex flex-wrap items-center gap-3 py-2.5 text-pequeno">
                <span className="min-w-0 flex-1 text-fg">
                  <b>{s.nomeAgente}</b>: trocar {nomeModelo(s.de)} por <b>{nomeModelo(s.para)}</b>
                  <span className="block text-legenda text-fg-3">{s.motivo}</span>
                </span>
                <Botao tamanho="p" onClick={() => void usar(s.agente, s.para)}>Usar</Botao>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-panel bg-surface p-5 shadow-1">
        <h3 className="mb-1 text-destaque font-semibold text-fg">Modelos nos cards de verdade</h3>
        <p className="mb-3 text-legenda text-fg-3">Últimos 30 dias. Cada card conta para o modelo que mais escreveu nele. A nota de avaliação vem da última rodada em Qualidade.</p>
        {m.modelos.length === 0 ? (
          <p className="text-pequeno text-fg-3">Nenhuma chamada de IA ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-pequeno">
              <thead className="text-left text-legenda text-fg-3">
                <tr>
                  <th className="py-1.5 font-medium">Modelo</th>
                  <th className="font-medium">Cards</th>
                  <th className="font-medium">Concluídos</th>
                  <th className="font-medium">De primeira</th>
                  <th className="font-medium">Sem você</th>
                  <th className="font-medium">Min/card</th>
                  <th className="font-medium">Tokens/s</th>
                  <th className="font-medium">Avaliação</th>
                  <th className="text-right font-medium">Custo</th>
                </tr>
              </thead>
              <tbody className="tabular divide-y divide-line">
                {m.modelos.map((x) => (
                  <tr key={x.modelo}>
                    <td className="py-2 text-fg">
                      {nomeModelo(x.modelo)} {x.local && <Etiqueta tom="sucesso">local</Etiqueta>}
                    </td>
                    <td>{x.cards}</td>
                    <td>{x.concluidos}</td>
                    <td>{x.aprovadosDePrimeira != null ? `${x.aprovadosDePrimeira}%` : "—"}</td>
                    <td>{x.semCeo != null ? `${x.semCeo}%` : "—"}</td>
                    <td>{x.minutosPorCard ?? "—"}</td>
                    <td>{x.tokensPorSegundo ?? "—"}</td>
                    <td>{x.notaEval != null ? `${x.notaEval}/10` : "—"}</td>
                    <td className="text-right">{usd(x.custoUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
