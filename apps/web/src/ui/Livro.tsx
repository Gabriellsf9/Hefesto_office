import { useState } from "react";
import { secoesLivro, type SecaoLivro, type SecaoLivroId } from "@empresa/shared";
import { useStore } from "../store.ts";
import { Markdown } from "./Markdown.tsx";

/** Livro da Empresa: o CEO revisa, edita e marca cada seção como conferida. */
export function ConteudoLivro() {
  const livro = useStore((s) => s.livro);
  const status = useStore((s) => s.onboarding.status);
  const abrirEntrevista = useStore((s) => s.setEntrevistaAberta);
  const [atual, setAtual] = useState<SecaoLivroId>("negocio");

  const porId = new Map(livro.map((s) => [s.id, s]));
  const meta = secoesLivro.find((s) => s.id === atual)!;
  const secao = porId.get(atual);
  const revisadas = livro.filter((s) => s.revisada).length;

  return (
      <div className="flex min-h-[620px] overflow-hidden rounded-panel bg-surface shadow-1">
        <nav className="flex w-60 shrink-0 flex-col border-r border-line bg-surface-2 p-3">
          <div className="px-2 pb-1 text-corpo font-semibold">Livro da Empresa</div>
          <div className="px-2 pb-3 text-legenda text-fg-3">
            {livro.length}/7 seções · {revisadas} revisadas por você
          </div>
          {secoesLivro.map((s) => {
            const sec = porId.get(s.id);
            return (
              <button
                key={s.id}
                onClick={() => setAtual(s.id)}
                className={`mb-0.5 flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-pequeno ${
                  atual === s.id ? "bg-ink text-on-ink" : "hover:bg-hover"
                }`}
              >
                <span className="flex-1 font-medium">{s.titulo}</span>
                <Selo secao={sec} escuro={atual === s.id} />
              </button>
            );
          })}
          <div className="flex-1" />
          {status !== "concluido" && (
            <button
              onClick={() => abrirEntrevista(true)}
              className="rounded-lg bg-ink px-3 py-2 text-pequeno font-semibold text-on-ink"
            >
              Continuar entrevista
            </button>
          )}
        </nav>

        <section className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-start gap-3 border-b border-line p-5">
            <div className="min-w-0 flex-1">
              <h2 className="text-secao font-bold">{meta.titulo}</h2>
              <p className="text-pequeno text-fg-2">{meta.objetivo}</p>
            </div>
          </header>
          {/* key: ao trocar de seção, o editor começa limpo */}
          <Conteudo key={atual} id={atual} secao={secao} />
        </section>
      </div>
  );
}

function Selo({ secao, escuro }: { secao?: SecaoLivro; escuro: boolean }) {
  if (!secao) return <span className={`text-legenda ${escuro ? "text-on-ink/70" : "text-fg-disabled"}`}>vazia</span>;
  if (secao.revisada) return <span className={`text-legenda font-semibold ${escuro ? "text-emerald-300" : "text-success-fg"}`}>✓ revisada</span>;
  return <span className={`text-legenda font-semibold ${escuro ? "text-amber-300" : "text-warning-fg"}`}>revisar</span>;
}

function Conteudo({ id, secao }: { id: SecaoLivroId; secao?: SecaoLivro }) {
  const setLivro = useStore((s) => s.setLivro);
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState(secao?.conteudo ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const salvar = async (corpo: { conteudo?: string; revisada?: boolean }) => {
    setSalvando(true);
    setErro(null);
    try {
      const res = await fetch(`/api/livro/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.erro ?? "Não foi possível salvar.");
      setLivro(body);
      setEditando(false);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  };

  if (!secao && !editando) {
    return (
      <div className="grid flex-1 place-items-center p-8 text-center text-corpo text-fg-3">
        <div>
          A Helena ainda não chegou neste bloco da entrevista.
          <br />
          <button onClick={() => setEditando(true)} className="mt-3 text-pequeno font-semibold text-fg underline">
            Escrever eu mesmo
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="scroll-fino min-h-0 flex-1 overflow-y-auto p-5">
        {editando ? (
          <textarea
            value={rascunho}
            onChange={(e) => setRascunho(e.target.value)}
            className="h-full min-h-80 w-full resize-none rounded-xl bg-sunken p-3 font-mono text-pequeno leading-relaxed outline-none ring-1 ring-line focus:ring-2 focus:ring-ink/30"
          />
        ) : (
          <Markdown texto={secao!.conteudo} className="text-corpo leading-relaxed text-fg" />
        )}
      </div>
      <footer className="flex items-center gap-2 border-t border-line p-4">
        {erro && <span className="text-pequeno text-danger-fg">{erro}</span>}
        {secao && !editando && (
          <span className="text-legenda text-fg-3">
            Atualizada em {new Date(secao.atualizadoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
          </span>
        )}
        <div className="flex-1" />
        {editando ? (
          <>
            <button onClick={() => setEditando(false)} className="rounded-lg px-3 py-2 text-pequeno text-fg-2 hover:bg-hover">
              Cancelar
            </button>
            <button
              disabled={salvando || !rascunho.trim()}
              onClick={() => salvar({ conteudo: rascunho })}
              className="rounded-lg bg-ink px-4 py-2 text-pequeno font-semibold text-on-ink disabled:opacity-30"
            >
              Salvar
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => {
                setRascunho(secao?.conteudo ?? "");
                setEditando(true);
              }}
              className="rounded-lg px-3 py-2 text-pequeno font-medium text-fg ring-1 ring-line hover:bg-hover"
            >
              Editar
            </button>
            {secao && (
              <button
                disabled={salvando}
                onClick={() => salvar({ revisada: !secao.revisada })}
                className={`rounded-lg px-4 py-2 text-xs font-semibold ${
                  secao.revisada ? "text-fg-2 ring-1 ring-line hover:bg-hover" : "bg-success text-white hover:bg-success"
                }`}
              >
                {secao.revisada ? "Desmarcar revisão" : "Marcar como revisada"}
              </button>
            )}
          </>
        )}
      </footer>
    </>
  );
}
