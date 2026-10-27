import { useEffect, useState } from "react";
import type { Card, CodigoDoCard } from "@empresa/shared";
import { useStore } from "../../store.ts";
import { api } from "../../api.ts";

// Código do card (Fase 4): a branch na cópia isolada, o que mudou e o merge no seu projeto.

const corDoStatus: Record<string, string> = { A: "text-emerald-700", M: "text-amber-700", D: "text-rose-700", R: "text-sky-700" };

export function SecaoCodigo({ card }: { card: Card }) {
  const entregas = useStore((s) => s.entregas.length);
  const [codigo, setCodigo] = useState<CodigoDoCard | null>(null);
  const [verDiff, setVerDiff] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = () =>
    api<CodigoDoCard | { semCodigo: true }>(`/api/cards/${card.id}/codigo`)
      .then((c) => setCodigo("semCodigo" in c ? null : c))
      .catch(() => setCodigo(null));
  useEffect(() => {
    void carregar();
    // Recarrega quando chega uma entrega nova ou o card muda de coluna.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.id, card.coluna, entregas]);

  if (!codigo) return null;

  const acao = async (fn: () => Promise<unknown>, msg: string) => {
    setErro(null);
    setOk(null);
    setOcupado(true);
    try {
      await fn();
      setOk(msg);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  };

  const ativo = codigo.status === "ativo";
  return (
    <section className="mt-5 rounded-xl bg-sunken p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="flex-1 text-legenda font-bold uppercase tracking-wide text-fg-3">Código</h3>
        <code className="rounded bg-surface px-1.5 py-0.5 text-legenda ring-1 ring-line">{codigo.branch}</code>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${ativo ? "bg-info-soft text-info-fg" : codigo.status === "mesclado" ? "bg-success-soft text-success-fg" : "bg-sunken text-fg-3"}`}>
          {ativo ? "cópia isolada" : codigo.status === "mesclado" ? "mesclado no projeto" : "descartado"}
        </span>
      </div>

      {ativo && (
        <>
          {codigo.arquivos.length ? (
            <ul className="mb-2 space-y-0.5 font-mono text-legenda">
              {codigo.arquivos.map((a) => (
                <li key={a.caminho}>
                  <span className={`inline-block w-4 font-bold ${corDoStatus[a.status[0]!] ?? ""}`}>{a.status[0]}</span>
                  {a.caminho}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-2 text-pequeno text-fg-3">Nenhuma mudança ainda.</p>
          )}
          {codigo.commits.length > 0 && (
            <ul className="mb-2 space-y-0.5 text-legenda text-fg-2">
              {codigo.commits.map((c) => (
                <li key={c.hash}>
                  <code className="text-fg-3">{c.hash}</code> {c.mensagem} <span className="text-fg-disabled">· {c.autor}</span>
                </li>
              ))}
            </ul>
          )}
          {codigo.patch && (
            <button onClick={() => setVerDiff(!verDiff)} className="text-legenda font-semibold text-fg underline">
              {verDiff ? "Esconder o diff" : "Ver o diff"}
            </button>
          )}
          {verDiff && (
            <pre className="scroll-fino mt-2 max-h-96 overflow-auto rounded-lg bg-ink p-3 text-legenda leading-relaxed">
              {codigo.patch.split("\n").map((l, i) => (
                <div
                  key={i}
                  className={
                    l.startsWith("+") && !l.startsWith("+++")
                      ? "text-emerald-300"
                      : l.startsWith("-") && !l.startsWith("---")
                        ? "text-rose-300"
                        : l.startsWith("@@")
                          ? "text-sky-300"
                          : "text-on-ink/70"
                  }
                >
                  {l || " "}
                </div>
              ))}
            </pre>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              disabled={ocupado || card.coluna !== "concluido" || !codigo.arquivos.length}
              title={card.coluna !== "concluido" ? "O merge libera depois que você aprova o card." : "Junta a branch no branch atual do seu projeto"}
              onClick={() => {
                if (confirm(`Fazer o merge de ${codigo.branch} no seu projeto? Isso altera a sua pasta (com um commit de merge que dá para desfazer pelo git).`)) {
                  void acao(() => api(`/api/cards/${card.id}/merge`, "POST"), "Merge feito no seu projeto.");
                }
              }}
              className="rounded-lg bg-success px-3 py-1.5 text-legenda font-semibold text-white disabled:opacity-30"
            >
              Fazer merge no projeto
            </button>
            <button
              disabled={ocupado}
              onClick={() => {
                if (confirm(`Descartar a branch ${codigo.branch}? O código deste card não vai entrar no projeto.`)) {
                  void acao(() => api(`/api/cards/${card.id}/descartar`, "POST"), "Código descartado.");
                }
              }}
              className="rounded-lg px-3 py-1.5 text-legenda font-semibold text-danger-fg ring-1 ring-danger hover:bg-danger-soft"
            >
              Descartar
            </button>
            {card.coluna !== "concluido" && <span className="text-legenda text-fg-3">O merge libera depois da sua aprovação.</span>}
            {erro && <span className="text-legenda text-danger-fg">{erro}</span>}
            {ok && <span className="text-legenda text-success-fg">{ok}</span>}
          </div>
        </>
      )}
    </section>
  );
}
