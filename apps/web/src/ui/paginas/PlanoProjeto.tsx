import { useEffect, useState } from "react";
import { CalendarClock, Flag, RefreshCw } from "lucide-react";
import { agentById } from "@empresa/org";
import { useStore } from "../../store.ts";
import { api } from "../../api.ts";
import { Botao, Campo, Etiqueta, avisar, avisarErro, cx } from "../kit/index.ts";

// Operação → Projetos → Plano: previsão de término, caminho crítico (a corrente de cards que define o fim)
// e orçamento do projeto. A previsão simula as dependências e um card por agente de cada vez; não conta o
// tempo das suas aprovações.

interface Item {
  id: number;
  chave: string;
  titulo: string;
  dono: string | null;
  estado: "feito" | "andamento" | "fila" | "voce" | "bloqueado";
  estimativa: { horas: number; custoUsd: number; base: "historico" | "area" | "padrao" };
  inicio: number;
  fim: number;
  critico: boolean;
}
interface Plano {
  itens: Item[];
  caminhoCritico: number[];
  horasRestantes: number;
  previsaoFim: number | null;
  linhaDeBase: number | null;
  atrasoHoras: number;
  gastoUsd: number;
  custoRestanteUsd: number;
  orcamentoUsd: number | null;
  aguardandoVoce: number;
  bloqueados: number;
}

const usd = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "USD" });
const data = (ts: number) => new Date(ts).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const ESTADO: Record<Item["estado"], { rotulo: string; tom: "sucesso" | "alerta" | "perigo" | "acento" | "neutro" }> = {
  feito: { rotulo: "feito", tom: "sucesso" },
  andamento: { rotulo: "em andamento", tom: "acento" },
  fila: { rotulo: "na fila", tom: "neutro" },
  voce: { rotulo: "com você", tom: "alerta" },
  bloqueado: { rotulo: "parado", tom: "perigo" },
};

export function PlanoProjeto({ projetoId }: { projetoId: number }) {
  const [p, setP] = useState<Plano | null>(null);
  const [orc, setOrc] = useState("");
  const carregar = () =>
    void api<Plano>(`/api/projetos/${projetoId}/plano`)
      .then((n) => {
        setP(n);
        setOrc(n.orcamentoUsd ? String(n.orcamentoUsd) : "");
      })
      .catch(() => setP(null));
  useEffect(carregar, [projetoId]);
  if (!p) return null;
  const abertos = p.itens.filter((i) => i.estado !== "feito");
  const feitos = p.itens.length - abertos.length;
  const total = Math.max(p.horasRestantes, 0.1);
  const projecao = p.gastoUsd + p.custoRestanteUsd;

  const salvarOrcamento = async () => {
    const n = orc.trim() ? Number(orc.replace(",", ".")) : null;
    if (n !== null && (!Number.isFinite(n) || n < 0)) return avisarErro(new Error("Orçamento inválido."));
    try {
      await api(`/api/projetos/${projetoId}/orcamento`, "PUT", { orcamentoUsd: n });
      avisar(n ? "Orçamento salvo" : "Orçamento removido");
      carregar();
    } catch (e) {
      avisarErro(e);
    }
  };

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5 text-pequeno font-medium text-fg">
        <CalendarClock className="size-4 text-fg-3" /> Plano do projeto
        <span className="flex-1" />
        <Botao tamanho="p" variante="discreto" icone={RefreshCw} onClick={carregar}>Atualizar</Botao>
      </div>
      {abertos.length === 0 ? (
        <p className="text-pequeno text-fg-3">{feitos ? `Tudo entregue (${feitos} card(s)).` : "Nenhum card neste projeto ainda."}</p>
      ) : (
        <>
          <div className="grid gap-2 text-pequeno sm:grid-cols-3">
            <div>
              <div className="text-legenda text-fg-3">Previsão de término</div>
              <div className="font-semibold text-fg">{p.previsaoFim ? data(p.previsaoFim) : "—"}</div>
              <div className="text-legenda text-fg-3">
                {p.horasRestantes} h de trabalho
                {p.linhaDeBase && Math.abs(p.atrasoHoras) >= 0.5 && (
                  <span className={p.atrasoHoras > 0 ? "text-danger-fg" : "text-success-fg"}> · {p.atrasoHoras > 0 ? `+${p.atrasoHoras} h` : `${p.atrasoHoras} h`} vs. combinado</span>
                )}
              </div>
            </div>
            <div>
              <div className="text-legenda text-fg-3">Custo</div>
              <div className={cx("font-semibold", p.orcamentoUsd && projecao > p.orcamentoUsd ? "text-danger-fg" : "text-fg")}>
                {usd(p.gastoUsd)} <span className="font-normal text-fg-3">+ ~{usd(p.custoRestanteUsd)}</span>
              </div>
              <div className="text-legenda text-fg-3">{p.orcamentoUsd ? `de ${usd(p.orcamentoUsd)} (${Math.round((p.gastoUsd / p.orcamentoUsd) * 100)}% usado)` : "sem orçamento"}</div>
            </div>
            <div>
              <div className="text-legenda text-fg-3">Pendências</div>
              <div className="flex flex-wrap gap-1">
                {p.aguardandoVoce > 0 && <Etiqueta tom="alerta">{p.aguardandoVoce} com você</Etiqueta>}
                {p.bloqueados > 0 && <Etiqueta tom="perigo">{p.bloqueados} parado(s)</Etiqueta>}
                {!p.aguardandoVoce && !p.bloqueados && <span className="text-fg-3">nenhuma</span>}
              </div>
            </div>
          </div>
          <ul className="mt-3 space-y-1">
            {abertos.map((i) => (
              <li key={i.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] items-center gap-2 text-legenda">
                <button type="button" onClick={() => useStore.getState().abrirCard(i.id)} className="flex min-w-0 items-center gap-1.5 text-left hover:text-accent-fg">
                  {i.critico && <Flag className="size-3 shrink-0 text-danger" aria-label="caminho crítico" />}
                  <span className="tabular shrink-0 text-fg-3">{i.chave}</span>
                  <span className="truncate text-fg">{i.titulo}</span>
                </button>
                <div className="flex items-center gap-2">
                  <div className="relative h-2.5 flex-1 rounded-full bg-sunken" title={`${i.inicio.toFixed(1)}–${i.fim.toFixed(1)} h · estimativa ${i.estimativa.horas.toFixed(1)} h (${i.estimativa.base})`}>
                    <span
                      className={cx("absolute inset-y-0 rounded-full", i.critico ? "bg-danger" : i.estado === "voce" ? "bg-warning" : "bg-accent")}
                      style={{ left: `${(i.inicio / total) * 100}%`, width: `${Math.max(1.5, ((i.fim - i.inicio) / total) * 100)}%` }}
                    />
                  </div>
                  <Etiqueta tom={ESTADO[i.estado].tom}>{ESTADO[i.estado].rotulo}</Etiqueta>
                  <span className="hidden w-20 truncate text-fg-3 sm:inline">{i.dono ? agentById[i.dono]?.nome ?? i.dono : "—"}</span>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-legenda text-fg-3">
            <Flag className="inline size-3 text-danger" /> Caminho crítico: atrasar qualquer um deles atrasa o projeto. A previsão não conta o tempo das suas aprovações.
          </p>
        </>
      )}
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="w-40">
          <Campo tamanho="p" rotulo="Orçamento (US$)" inputMode="decimal" value={orc} onChange={(e) => setOrc(e.target.value)} placeholder="sem limite" onKeyDown={(e) => e.key === "Enter" && void salvarOrcamento()} />
        </div>
        <Botao tamanho="p" onClick={() => void salvarOrcamento()}>Salvar orçamento</Botao>
        {abertos.length > 0 && (
          <Botao
            tamanho="p"
            variante="discreto"
            onClick={() =>
              void api(`/api/projetos/${projetoId}/plano/base`, "POST")
                .then(() => {
                  avisar("Previsão atual combinada");
                  carregar();
                })
                .catch(avisarErro)
            }
          >
            Combinar esta previsão
          </Botao>
        )}
      </div>
      <p className="mt-1 text-legenda text-fg-3">No teto, os cards do projeto param e esperam você. Se a previsão escorregar ou o custo projetado passar do orçamento, o coordenador recebe um card para replanejar.</p>
    </div>
  );
}
