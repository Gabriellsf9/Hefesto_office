import { useEffect, useState } from "react";
import type { Card, CodigoDoCard } from "@empresa/shared";
import { useStore } from "../../store.ts";
import { api } from "../../api.ts";
import { ExternalLink, Play, Square, TerminalSquare } from "lucide-react";
import type { Previa, PreviaPublicada as TPreviaPublicada } from "@empresa/shared";
import { Botao, Etiqueta, avisarErro } from "../kit/index.ts";

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

      {ativo && <PreviaDoApp cardId={card.id} />}

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
            <pre className="scroll-fino mt-2 max-h-96 overflow-auto rounded-lg bg-codigo p-3 text-legenda leading-relaxed text-codigo-fg ring-1 ring-line">
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
            <button
              disabled={ocupado}
              title="Roda os testes do projeto nesta branch, na sandbox (o resultado vai para a atividade do card)"
              onClick={() => void acao(() => api<{ passou: boolean }>(`/api/cards/${card.id}/codigo/testar`, "POST"), "Testes rodados: veja o resultado na atividade.")}
              className="rounded-lg px-3 py-1.5 text-legenda font-semibold text-fg ring-1 ring-line hover:bg-hover disabled:opacity-30"
            >
              Rodar testes
            </button>
            <PullRequest card={card} ocupado={ocupado} acao={acao} />
            <PreviaPublicada card={card} />
            {card.coluna !== "concluido" && <span className="text-legenda text-fg-3">O merge libera depois da sua aprovação.</span>}
            {erro && <span className="text-legenda text-danger-fg">{erro}</span>}
            {ok && <span className="text-legenda text-success-fg">{ok}</span>}
          </div>
        </>
      )}
    </section>
  );
}

/** Prévia do app com o código deste card (antes do merge), numa porta local e dentro da sandbox. */
function PreviaDoApp({ cardId }: { cardId: number }) {
  const aoVivo = useStore((s) => s.previas[cardId]);
  const [inicial, setInicial] = useState<Previa | null>(null);
  const [log, setLog] = useState(false);
  useEffect(() => void api<Previa>(`/api/cards/${cardId}/previa`).then(setInicial).catch(() => {}), [cardId]);
  const p = aoVivo ?? inicial;
  const rodando = p && ["instalando", "iniciando", "no-ar"].includes(p.status);
  const tom = p?.status === "no-ar" ? "sucesso" : p?.status === "erro" ? "perigo" : rodando ? "alerta" : "neutro";
  const rotulo = { instalando: "instalando dependências…", iniciando: "subindo…", "no-ar": "no ar", erro: "erro", parada: "parada" }[p?.status ?? "parada"];
  return (
    <div className="mb-3 rounded-ctl bg-surface p-3 shadow-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-pequeno font-semibold text-fg">Prévia do app</span>
        <Etiqueta tom={tom}>{rotulo}</Etiqueta>
        <span className="flex-1" />
        {p?.status === "no-ar" && p.url && (
          <a href={p.url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-ctl bg-ink px-3 text-pequeno font-medium text-on-ink">
            <ExternalLink className="size-4" /> Abrir
          </a>
        )}
        {rodando ? (
          <Botao tamanho="p" icone={Square} onClick={() => void api(`/api/cards/${cardId}/previa`, "DELETE").catch(avisarErro)}>Parar</Botao>
        ) : (
          <Botao tamanho="p" icone={Play} onClick={() => void api(`/api/cards/${cardId}/previa`, "POST").catch(avisarErro)}>{p?.status === "erro" ? "Tentar de novo" : "Subir prévia"}</Botao>
        )}
        {p && p.log.length > 0 && <Botao tamanho="p" variante="discreto" icone={TerminalSquare} onClick={() => setLog(!log)}>{log ? "Esconder log" : "Log"}</Botao>}
      </div>
      <p className="mt-1 text-legenda text-fg-3">{p?.url ? <span className="font-mono">{p.url}</span> : "Roda o código desta branch numa porta local, sem internet e sem acesso aos seus segredos. Para sozinha depois de 60 min sem uso."}</p>
      {p?.erro && <p className="mt-1.5 text-legenda text-danger-fg">{p.erro}</p>}
      {log && p && <pre className="scroll-fino mt-2 max-h-56 overflow-auto rounded-ctl bg-sunken p-2 font-mono text-legenda text-fg-2">{p.log.join("\n")}</pre>}
    </div>
  );
}

/** Prévia publicada na Vercel (antes de aprovar): publica a branch no GitHub e acompanha o deploy. Só com o seu clique. */
function PreviaPublicada({ card }: { card: Card }) {
  const aoVivo = useStore((s) => s.previasPublicadas[card.id]);
  const [inicial, setInicial] = useState<TPreviaPublicada | null>(null);
  const [enviando, setEnviando] = useState(false);
  useEffect(() => void api<TPreviaPublicada | { semPrevia: true }>(`/api/cards/${card.id}/previa-publicada`).then((r) => setInicial("semPrevia" in r ? null : r)).catch(() => {}), [card.id]);
  const p = aoVivo ?? inicial;
  const andando = p && (p.status === "publicando" || p.status === "construindo");
  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        disabled={enviando || !!andando}
        title="Publica a branch no GitHub e espera o deploy de prévia da Vercel (precisa do GitHub e da Vercel ligados ao projeto)"
        onClick={() => {
          if (!confirm("Publicar esta branch no GitHub para a Vercel gerar uma prévia? O código sai do seu Mac para o repositório do projeto.")) return;
          setEnviando(true);
          void api<TPreviaPublicada>(`/api/cards/${card.id}/previa-publicada`, "POST")
            .then(setInicial)
            .catch(avisarErro)
            .finally(() => setEnviando(false));
        }}
        className="rounded-lg px-3 py-1.5 text-legenda font-semibold text-fg ring-1 ring-line hover:bg-hover disabled:opacity-30"
      >
        {andando ? (p!.status === "publicando" ? "Publicando…" : "Vercel construindo…") : p?.status === "pronta" ? "Republicar prévia" : "Prévia na Vercel"}
      </button>
      {p?.status === "pronta" && p.url && (
        <a href={p.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-legenda font-medium text-accent-fg hover:underline">
          <ExternalLink className="size-3.5" /> Abrir prévia
        </a>
      )}
      {p?.status === "erro" && <span className="text-legenda text-danger-fg" title={p.erro ?? ""}>{p.inspetor ? <a href={p.inspetor} target="_blank" rel="noreferrer" className="underline">deploy falhou</a> : "falhou"}</span>}
    </span>
  );
}

/** Pull request no GitHub (em vez do merge local): publica a branch e abre o PR. Token só seu, cifrado. */
function PullRequest({ card, ocupado, acao }: { card: Card; ocupado: boolean; acao: (fn: () => Promise<unknown>, msg: string) => Promise<void> }) {
  const [configurado, setConfigurado] = useState<boolean | null>(null);
  const [token, setToken] = useState("");
  const [editando, setEditando] = useState(false);
  useEffect(() => void api<{ configurado: boolean }>("/api/github").then((r) => setConfigurado(r.configurado)).catch(() => setConfigurado(false)), []);
  if (configurado === null) return null;
  if (!configurado || editando)
    return editando ? (
      <span className="flex items-center gap-1.5">
        <input
          type="password"
          autoComplete="off"
          aria-label="Token do GitHub"
          placeholder="github_pat_…"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          className="h-7 w-44 rounded-md bg-sunken px-2 font-mono text-legenda text-fg ring-1 ring-line"
        />
        <button
          disabled={!token.trim()}
          onClick={() =>
            void api("/api/github", "PUT", { token })
              .then(() => {
                setConfigurado(true);
                setEditando(false);
                setToken("");
              })
              .catch((e) => alert(e instanceof Error ? e.message : String(e)))
          }
          className="rounded-lg px-2 py-1 text-legenda font-semibold text-fg ring-1 ring-line disabled:opacity-30"
        >
          Salvar
        </button>
      </span>
    ) : (
      <button onClick={() => setEditando(true)} className="rounded-lg px-3 py-1.5 text-legenda text-fg-2 ring-1 ring-line hover:bg-hover" title="Token fine-grained com acesso a Contents e Pull requests do repositório">
        Conectar GitHub (pull request)
      </button>
    );
  return (
    <button
      disabled={ocupado || card.coluna !== "concluido"}
      title={card.coluna !== "concluido" ? "O pull request libera depois que você aprova o card." : "Publica a branch no GitHub e abre o pull request"}
      onClick={() => {
        if (confirm("Publicar esta branch no GitHub e abrir um pull request? O código sai do seu Mac para o repositório do projeto.")) {
          void acao(
            () => api<{ url: string }>(`/api/cards/${card.id}/pull-request`, "POST").then((r) => window.open(r.url, "_blank")),
            "Pull request aberto no GitHub.",
          );
        }
      }}
      className="rounded-lg px-3 py-1.5 text-legenda font-semibold text-fg ring-1 ring-line hover:bg-hover disabled:opacity-30"
    >
      Abrir pull request
    </button>
  );
}
