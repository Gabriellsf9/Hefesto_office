import { useEffect, useState } from "react";
import { CheckCircle2, FlaskConical, XCircle } from "lucide-react";
import { api } from "../../api.ts";
import { Botao, EstadoVazio, Etiqueta, Indicador, avisarErro, confirmar } from "../kit/index.ts";

// Operação → Qualidade: avaliações (evals). Tarefas fixas, com respostas que dá para conferir, rodadas
// com os prompts e os modelos de agora. Compare a nota antes e depois de mudar o modo de custo ou um modelo.

interface Rodada {
  id: number;
  ts: number;
  config: { modoCusto: string };
  nota: number;
  usd: number;
  resultados: { tarefa: string; nome: string; modelo: string; nota: number; usd: number; checagens: { descricao: string; passou: boolean; peso: number }[] }[];
}

const usd = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "USD" });
const MODO: Record<string, string> = { economico: "Econômico", equilibrado: "Equilibrado", maximo: "Qualidade máxima" };

export function Qualidade() {
  const [rodadas, setRodadas] = useState<Rodada[] | null>(null);
  const [rodando, setRodando] = useState(false);
  const carregar = () => void api<Rodada[]>("/api/evals").then(setRodadas).catch(() => setRodadas([]));
  useEffect(carregar, []);
  const ultima = rodadas?.[0];
  const anterior = rodadas?.[1];
  const custoTipico = rodadas?.length ? rodadas.slice(0, 5).reduce((s, r) => s + r.usd, 0) / Math.min(5, rodadas.length) : 0.5;

  const rodar = async () => {
    const ok = await confirmar({
      titulo: "Rodar a avaliação?",
      texto: `Os agentes fazem 5 tarefas de teste com os modelos e prompts de agora. Custa cerca de ${usd(custoTipico)} de API e leva alguns minutos.`,
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
            <Indicador rotulo="Modo de custo" valor={MODO[ultima.config.modoCusto] ?? ultima.config.modoCusto} />
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
    </div>
  );
}
