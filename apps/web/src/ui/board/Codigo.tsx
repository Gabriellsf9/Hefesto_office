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
    <section className="mt-5 rounded-xl bg-black/[0.03] p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="flex-1 text-[11px] font-bold uppercase tracking-wide text-black/50">Código</h3>
        <code className="rounded bg-white px-1.5 py-0.5 text-[11px] ring-1 ring-black/10">{codigo.branch}</code>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${ativo ? "bg-sky-50 text-sky-700" : codigo.status === "mesclado" ? "bg-emerald-50 text-emerald-700" : "bg-black/5 text-black/50"}`}>
          {ativo ? "cópia isolada" : codigo.status === "mesclado" ? "mesclado no projeto" : "descartado"}
        </span>
      </div>

      {ativo && (
        <>
          {codigo.arquivos.length ? (
            <ul className="mb-2 space-y-0.5 font-mono text-[11px]">
              {codigo.arquivos.map((a) => (
                <li key={a.caminho}>
                  <span className={`inline-block w-4 font-bold ${corDoStatus[a.status[0]!] ?? ""}`}>{a.status[0]}</span>
                  {a.caminho}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-2 text-xs text-black/45">Nenhuma mudança ainda.</p>
          )}
          {codigo.commits.length > 0 && (
            <ul className="mb-2 space-y-0.5 text-[11px] text-black/60">
              {codigo.commits.map((c) => (
                <li key={c.hash}>
                  <code className="text-black/40">{c.hash}</code> {c.mensagem} <span className="text-black/35">· {c.autor}</span>
                </li>
              ))}
            </ul>
          )}
          {codigo.patch && (
            <button onClick={() => setVerDiff(!verDiff)} className="text-[11px] font-semibold text-[#1f2430] underline">
              {verDiff ? "Esconder o diff" : "Ver o diff"}
            </button>
          )}
          {verDiff && (
            <pre className="scroll-fino mt-2 max-h-96 overflow-auto rounded-lg bg-[#1f2430] p-3 text-[11px] leading-relaxed">
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
                          : "text-white/70"
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
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-30"
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
              className="rounded-lg px-3 py-1.5 text-[11px] font-semibold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-50"
            >
              Descartar
            </button>
            {card.coluna !== "concluido" && <span className="text-[11px] text-black/45">O merge libera depois da sua aprovação.</span>}
            {erro && <span className="text-[11px] text-rose-600">{erro}</span>}
            {ok && <span className="text-[11px] text-emerald-700">{ok}</span>}
          </div>
        </>
      )}
    </section>
  );
}
