import { useState } from "react";
import { History, MessageSquareText, Wrench } from "lucide-react";
import type { Card } from "@empresa/shared";
import { agentById } from "@empresa/org";
import { api } from "../../api.ts";
import { Botao, Etiqueta, avisarErro, cx } from "../kit/index.ts";
import { Avatarzinho, hora } from "../comum.tsx";

// Replay do card: cada execução dos agentes (autor, validador, atacante…) passo a passo, com o que
// escreveram e cada ferramenta (entrada e resultado). Carrega só quando você abre.

interface Passo {
  id: number;
  ts: number;
  rodada: number;
  tipo: "texto" | "ferramenta";
  nome: string | null;
  entrada: string | null;
  saida: string | null;
  erro: boolean;
  ms: number;
}
interface Execucao {
  id: string;
  agente: string | null;
  modelo: string;
  inicio: number;
  fim: number;
  passos: Passo[];
}

const duracao = (ms: number) => (ms < 1000 ? `${ms} ms` : ms < 60_000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms / 60_000)} min`);

export function Replay({ card }: { card: Card }) {
  const [execs, setExecs] = useState<Execucao[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [aberta, setAberta] = useState<string | null>(null);
  const carregar = async () => {
    setCarregando(true);
    try {
      const e = await api<Execucao[]>(`/api/cards/${card.id}/execucoes`);
      setExecs(e);
      setAberta(e.at(-1)?.id ?? null);
    } catch (err) {
      avisarErro(err);
    } finally {
      setCarregando(false);
    }
  };
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <h3 className="flex-1 text-pequeno font-semibold text-fg">Replay das execuções{execs ? ` · ${execs.length}` : ""}</h3>
        <Botao tamanho="p" variante="discreto" icone={History} carregando={carregando} onClick={() => void carregar()}>
          {execs ? "Atualizar" : "Ver passo a passo"}
        </Botao>
      </div>
      {execs && execs.length === 0 && <p className="text-pequeno text-fg-3">Nenhuma execução registrada neste card ainda.</p>}
      {execs?.map((x, i) => {
        const a = x.agente ? agentById[x.agente] : undefined;
        const ferramentas = x.passos.filter((p) => p.tipo === "ferramenta").length;
        const erros = x.passos.filter((p) => p.erro).length;
        return (
          <div key={x.id} className="mb-2 rounded-card bg-surface shadow-1">
            <button type="button" onClick={() => setAberta(aberta === x.id ? null : x.id)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-pequeno">
              <span className="tabular w-5 text-fg-3">{i + 1}</span>
              {a && <Avatarzinho agent={a} tamanho={20} />}
              <span className="min-w-0 flex-1 truncate text-fg">{a?.nome ?? x.agente ?? "—"} <span className="text-fg-3">· {x.modelo.replace("claude-", "")}</span></span>
              <span className="text-legenda text-fg-3">{ferramentas} ferramenta(s) · {duracao(x.fim - x.inicio)} · {hora(x.inicio)}</span>
              {erros > 0 && <Etiqueta tom="perigo">{erros} erro(s)</Etiqueta>}
            </button>
            {aberta === x.id && (
              <ol className="space-y-1.5 border-t border-line px-3 py-2">
                {x.passos.map((p) => (
                  <li key={p.id} className="text-legenda">
                    {p.tipo === "texto" ? (
                      <div className="flex gap-2 text-fg-2">
                        <MessageSquareText className="mt-0.5 size-3.5 shrink-0 text-fg-3" />
                        <p className="line-clamp-4 whitespace-pre-wrap">{p.saida}</p>
                      </div>
                    ) : (
                      <details className={cx("rounded-control px-2 py-1", p.erro ? "bg-danger-soft" : "bg-sunken")}>
                        <summary className="flex cursor-pointer items-center gap-2">
                          <Wrench className="size-3.5 shrink-0 text-fg-3" />
                          <span className="font-mono text-fg">{p.nome}</span>
                          <span className="min-w-0 flex-1 truncate font-mono text-fg-3">{(p.entrada ?? "").replace(/\s+/g, " ").slice(0, 120)}</span>
                          <span className="text-fg-3">{duracao(p.ms)}</span>
                        </summary>
                        <div className="mt-1 grid gap-1">
                          <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-surface p-1.5 font-mono text-fg-2">{p.entrada}</pre>
                          <pre className={cx("max-h-64 overflow-auto whitespace-pre-wrap rounded bg-surface p-1.5 font-mono", p.erro ? "text-danger-fg" : "text-fg-2")}>{p.saida}</pre>
                        </div>
                      </details>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        );
      })}
    </section>
  );
}
