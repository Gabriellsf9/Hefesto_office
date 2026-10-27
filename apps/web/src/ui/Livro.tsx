import { useState } from "react";
import { secoesLivro, type SecaoLivro, type SecaoLivroId } from "@empresa/shared";
import { useStore } from "../store.ts";
import { Markdown } from "./Markdown.tsx";
import { PainelConhecimento } from "./Conhecimento.tsx";

/** Livro da Empresa: o CEO revisa, edita e marca cada seção como conferida. */
export function Livro() {
  const aberto = useStore((s) => s.livroAberto);
  const fechar = () => useStore.getState().setLivroAberto(false);
  const livro = useStore((s) => s.livro);
  const status = useStore((s) => s.onboarding.status);
  const abrirEntrevista = useStore((s) => s.setEntrevistaAberta);
  const [atual, setAtual] = useState<SecaoLivroId>("negocio");
  const aba = useStore((s) => s.livroAba);
  const propostas = useStore((s) => s.conhecimento.filter((i) => !i.aprovado).length);
  if (!aberto) return null;

  const abas = (
    <div className="mb-3 flex rounded-lg bg-black/[0.05] p-0.5 text-xs font-semibold">
      {(["livro", "conhecimento"] as const).map((a) => (
        <button
          key={a}
          onClick={() => useStore.setState({ livroAba: a })}
          className={`flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 ${aba === a ? "bg-white shadow-sm" : "text-black/55 hover:text-black"}`}
        >
          {a === "livro" ? "Livro" : "Conhecimento"}
          {a === "conhecimento" && propostas > 0 && <span className="rounded-full bg-amber-500 px-1.5 text-[10px] text-white">{propostas}</span>}
        </button>
      ))}
    </div>
  );

  const porId = new Map(livro.map((s) => [s.id, s]));
  const meta = secoesLivro.find((s) => s.id === atual)!;
  const secao = porId.get(atual);
  const revisadas = livro.filter((s) => s.revisada).length;

  return (
    <div className="pointer-events-auto absolute inset-0 z-40 grid place-items-center bg-[#1f2430]/35 p-4 backdrop-blur-sm" onClick={fechar}>
      <div
        className="flex h-[min(720px,100%)] w-[min(980px,100%)] overflow-hidden rounded-2xl bg-white shadow-[0_8px_30px_rgba(31,36,48,0.18)] ring-1 ring-black/5"
        onClick={(e) => e.stopPropagation()}
      >
        {aba === "conhecimento" ? (
          <PainelConhecimento fechar={fechar} abas={abas} />
        ) : (
        <>
        <nav className="flex w-60 shrink-0 flex-col border-r border-black/5 bg-black/[0.02] p-3">
          {abas}
          <div className="px-2 pb-1 text-sm font-bold">Livro da Empresa</div>
          <div className="px-2 pb-3 text-[11px] text-black/50">
            {livro.length}/7 seções · {revisadas} revisadas por você
          </div>
          {secoesLivro.map((s) => {
            const sec = porId.get(s.id);
            return (
              <button
                key={s.id}
                onClick={() => setAtual(s.id)}
                className={`mb-0.5 flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs ${
                  atual === s.id ? "bg-[#1f2430] text-white" : "hover:bg-black/5"
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
              onClick={() => {
                fechar();
                abrirEntrevista(true);
              }}
              className="rounded-lg bg-[#1f2430] px-3 py-2 text-xs font-semibold text-white"
            >
              Continuar entrevista
            </button>
          )}
        </nav>

        <section className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-start gap-3 border-b border-black/5 p-5">
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold">{meta.titulo}</h2>
              <p className="text-xs text-black/55">{meta.objetivo}</p>
            </div>
            <button onClick={fechar} className="grid h-8 w-8 place-items-center rounded-full text-black/50 hover:bg-black/5" aria-label="Fechar">
              ✕
            </button>
          </header>
          {/* key: ao trocar de seção, o editor começa limpo */}
          <Conteudo key={atual} id={atual} secao={secao} />
        </section>
        </>
        )}
      </div>
    </div>
  );
}

function Selo({ secao, escuro }: { secao?: SecaoLivro; escuro: boolean }) {
  if (!secao) return <span className={`text-[10px] ${escuro ? "text-white/50" : "text-black/35"}`}>vazia</span>;
  if (secao.revisada) return <span className={`text-[10px] font-semibold ${escuro ? "text-emerald-300" : "text-emerald-700"}`}>✓ revisada</span>;
  return <span className={`text-[10px] font-semibold ${escuro ? "text-amber-300" : "text-amber-700"}`}>revisar</span>;
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
      <div className="grid flex-1 place-items-center p-8 text-center text-sm text-black/45">
        <div>
          A Helena ainda não chegou neste bloco da entrevista.
          <br />
          <button onClick={() => setEditando(true)} className="mt-3 text-xs font-semibold text-[#1f2430] underline">
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
            className="h-full min-h-80 w-full resize-none rounded-xl bg-black/[0.03] p-3 font-mono text-[13px] leading-relaxed outline-none ring-1 ring-black/10 focus:ring-2 focus:ring-[#1f2430]/30"
          />
        ) : (
          <Markdown texto={secao!.conteudo} className="text-sm leading-relaxed text-black/80" />
        )}
      </div>
      <footer className="flex items-center gap-2 border-t border-black/5 p-4">
        {erro && <span className="text-xs text-rose-600">{erro}</span>}
        {secao && !editando && (
          <span className="text-[11px] text-black/40">
            Atualizada em {new Date(secao.atualizadoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
          </span>
        )}
        <div className="flex-1" />
        {editando ? (
          <>
            <button onClick={() => setEditando(false)} className="rounded-lg px-3 py-2 text-xs text-black/60 hover:bg-black/5">
              Cancelar
            </button>
            <button
              disabled={salvando || !rascunho.trim()}
              onClick={() => salvar({ conteudo: rascunho })}
              className="rounded-lg bg-[#1f2430] px-4 py-2 text-xs font-semibold text-white disabled:opacity-30"
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
              className="rounded-lg px-3 py-2 text-xs font-medium text-black/70 ring-1 ring-black/10 hover:bg-black/5"
            >
              Editar
            </button>
            {secao && (
              <button
                disabled={salvando}
                onClick={() => salvar({ revisada: !secao.revisada })}
                className={`rounded-lg px-4 py-2 text-xs font-semibold ${
                  secao.revisada ? "text-black/60 ring-1 ring-black/10 hover:bg-black/5" : "bg-emerald-600 text-white hover:bg-emerald-700"
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
