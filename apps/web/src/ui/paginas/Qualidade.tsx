import { useEffect, useState } from "react";
import { CheckCircle2, FlaskConical, Import, Trash2, XCircle } from "lucide-react";
import { api } from "../../api.ts";
import { Aprendizado } from "./Aprendizado.tsx";
import { Botao, EstadoVazio, Etiqueta, Indicador, avisarErro, confirmar } from "../kit/index.ts";

// Operação → Qualidade: avaliações (evals). Tarefas fixas, com respostas que dá para conferir, rodadas
// com os prompts e os modelos de agora. Compare a nota antes e depois de mudar o modo de custo ou um modelo.

interface Rodada {
  id: number;
  ts: number;
  config: { modoCusto: string; modelos?: Record<string, string>; prompts?: string; juiz?: string };
  nota: number;
  usd: number;
  resultados: { tarefa: string; nome: string; modelo: string; nota: number; usd: number; checagens: { descricao: string; passou: boolean; peso: number }[] }[];
}

interface Caso {
  id: number;
  cardId: number;
  nome: string;
  agente: string;
}

/** O que mudou de uma rodada para a outra: modo de custo, modelo de algum agente ou os prompts. */
function mudancas(a: Rodada["config"], b: Rodada["config"]): string[] {
  const out: string[] = [];
  if (a.modoCusto !== b.modoCusto) out.push(`modo de custo: ${MODO[b.modoCusto] ?? b.modoCusto} → ${MODO[a.modoCusto] ?? a.modoCusto}`);
  for (const [ag, m] of Object.entries(a.modelos ?? {})) {
    const antes = b.modelos?.[ag];
    if (antes && antes !== m) out.push(`${ag}: ${antes} → ${m}`);
  }
  if (a.prompts && b.prompts && a.prompts !== b.prompts) out.push("prompts mudaram");
  return out;
}

const usd = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "USD" });
const MODO: Record<string, string> = { economico: "Econômico", equilibrado: "Equilibrado", maximo: "Qualidade máxima" };

export function Qualidade() {
  const [rodadas, setRodadas] = useState<Rodada[] | null>(null);
  const [rodando, setRodando] = useState(false);
  const [casos, setCasos] = useState<Caso[]>([]);
  const carregar = () => {
    void api<Rodada[]>("/api/evals").then(setRodadas).catch(() => setRodadas([]));
    void api<Caso[]>("/api/evals/casos").then(setCasos).catch(() => setCasos([]));
  };
  useEffect(carregar, []);
  const ultima = rodadas?.[0];
  const anterior = rodadas?.[1];
  const custoTipico = rodadas?.length ? rodadas.slice(0, 5).reduce((s, r) => s + r.usd, 0) / Math.min(5, rodadas.length) : 0.5;

  const rodar = async () => {
    const ok = await confirmar({
      titulo: "Rodar a avaliação?",
      texto: `Os agentes fazem 5 tarefas de teste${casos.length ? ` e refazem ${Math.min(casos.length, 8)} cards reais (um juiz compara com a entrega aprovada)` : ""} com os modelos e prompts de agora. Custa cerca de ${usd(custoTipico)} de API e leva alguns minutos.`,
      confirmar: "Rodar",
    });
    if (!ok) return;
    setRodando(true);
    try {
      await api("/api/evals", "POST");
      carregar();
    } catch (e) {
      avisarErro(e);
    } finally {
      setRodando(false);
    }
  };

  if (!rodadas) return null;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Botao variante="principal" icone={FlaskConical} carregando={rodando} onClick={() => void rodar()}>
          {rodando ? "Avaliando… (alguns minutos)" : "Rodar avaliação"}
        </Botao>
        <p className="text-pequeno text-fg-3">Rode antes e depois de mudar o modo de custo ou o modelo de um agente para ver se a qualidade caiu.</p>
      </div>
      <section className="rounded-panel bg-surface p-4 shadow-1">
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <h3 className="flex-1 text-corpo font-semibold text-fg">Casos reais ({casos.length})</h3>
          <Botao icone={Import} onClick={() => void api<Caso[]>("/api/evals/casos/importar", "POST").then(setCasos).catch(avisarErro)}>
            Usar cards concluídos
          </Botao>
        </div>
        <p className="mb-2 text-pequeno text-fg-3">
          Cards concluídos viram casos de teste: o agente refaz o card só com a descrição e os critérios, e um juiz (sempre o mesmo) compara com a entrega que você aprovou. Até 8 por rodada.
        </p>
        {casos.length > 0 && (
          <ul className="space-y-1">
            {casos.map((c) => (
              <li key={c.id} className="flex items-center gap-2 text-pequeno text-fg-2">
                <span className="flex-1 truncate">{c.nome}</span>
                <span className="text-legenda text-fg-3">{c.agente}</span>
                <button aria-label="Tirar dos casos" className="text-fg-disabled hover:text-danger-fg" onClick={() => void api<Caso[]>(`/api/evals/casos/${c.id}`, "DELETE").then(setCasos).catch(avisarErro)}>
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {!ultima ? (
        <div className="rounded-panel bg-surface shadow-1">
          <EstadoVazio icone={FlaskConical} titulo="Nenhuma avaliação ainda" texto="Cinco tarefas de teste (histórias, revisão de segurança, migração, prospecção e um bug) com nota de 0 a 10." />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Indicador
              rotulo="Nota da última"
              valor={ultima.nota.toFixed(1)}
              detalhe={anterior ? `${ultima.nota >= anterior.nota ? "▲" : "▼"} ${Math.abs(ultima.nota - anterior.nota).toFixed(1)} vs. anterior` : "primeira avaliação"}
              tom={anterior && ultima.nota < anterior.nota - 0.5 ? "alerta" : undefined}
            />
            <Indicador
              rotulo="Modo de custo"
              valor={MODO[ultima.config.modoCusto] ?? ultima.config.modoCusto}
              detalhe={anterior ? mudancas(ultima.config, anterior.config).join(" · ") || "nada mudou vs. anterior" : ultima.config.prompts ? `prompts ${ultima.config.prompts}` : undefined}
            />
            <Indicador rotulo="Custo da avaliação" valor={usd(ultima.usd)} />
            <Indicador rotulo="Quando" valor={new Date(ultima.ts).toLocaleDateString("pt-BR")} detalhe={new Date(ultima.ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} />
          </div>
          <section className="space-y-3 rounded-panel bg-surface p-4 shadow-1">
            {ultima.resultados.map((r) => (
              <div key={r.tarefa}>
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-corpo font-medium text-fg">{r.nome}</span>
                  <span className="font-mono text-legenda text-fg-3">{r.modelo.replace("claude-", "")}</span>
                  <Etiqueta tom={r.nota >= 8 ? "sucesso" : r.nota >= 5 ? "alerta" : "perigo"}>{r.nota.toFixed(1)}</Etiqueta>
                </div>
                <ul className="mt-1 grid gap-0.5 pl-1 sm:grid-cols-2">
                  {r.checagens.map((c) => (
                    <li key={c.descricao} className="flex items-center gap-1.5 text-legenda text-fg-2">
                      {c.passou ? <CheckCircle2 className="size-3.5 shrink-0 text-success" /> : <XCircle className="size-3.5 shrink-0 text-danger" />}
                      {c.descricao}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
          {rodadas.length > 1 && (
            <section className="rounded-panel bg-surface p-4 shadow-1">
              <h3 className="mb-2 text-corpo font-semibold text-fg">Histórico</h3>
              <table className="w-full text-pequeno">
                <tbody>
                  {rodadas.map((r) => (
                    <tr key={r.id} className="border-t border-line">
                      <td className="py-1.5 text-fg-3">{new Date(r.ts).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</td>
                      <td className="text-fg-2">{MODO[r.config.modoCusto] ?? r.config.modoCusto}</td>
                      <td className="tabular text-right text-fg-3">{usd(r.usd)}</td>
                      <td className="tabular text-right font-semibold text-fg">{r.nota.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}
      <Aprendizado />
    </div>
  );
}
