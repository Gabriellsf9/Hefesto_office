import { useEffect, useMemo, useRef, useState } from "react";
import { MessageSquareText, Paperclip, Plus, Send, Square, Trash2 } from "lucide-react";
import type { Conversa, EstadoProvedores, MensagemConversa } from "@empresa/shared";
import { agentById, agents } from "@empresa/org";
import { api } from "../../api.ts";
import { useStore } from "../../store.ts";
import { navegar, useNav } from "../../nav.ts";
import { Markdown } from "../Markdown.tsx";
import { enviarDocumento, enviarImagem } from "../anexos.ts";
import { AreaTexto, Botao, BotaoIcone, EstadoVazio, Seletor, avisarErro, cx } from "../kit/index.ts";

// Conversas (como no app do Claude): você conversa com qualquer agente, no modelo que escolher (Claude, Gemini ou
// local), com histórico e as ferramentas de leitura do projeto, pesquisa e web. Mandar mensagem enquanto ele
// responde entra na próxima rodada, sem reiniciar. Trabalho grande ele transforma em card.

const CLAUDE = [
  { id: "claude-opus-5-5", nome: "Claude Opus 5.5" },
  { id: "claude-sonnet-5-5", nome: "Claude Sonnet 5.5" },
  { id: "claude-haiku-5-5", nome: "Claude Haiku 5.5" },
];

function useModelos() {
  const [prov, setProv] = useState<EstadoProvedores | null>(null);
  useEffect(() => void api<EstadoProvedores>("/api/provedores").then(setProv).catch(() => null), []);
  return useMemo(
    () => [
      ...CLAUDE,
      ...(prov?.gemini.temChave ? prov.gemini.modelos : []).map((m) => ({ id: m.id, nome: `Gemini · ${m.nome}` })),
      ...(prov?.ollama.online ? prov.ollama.modelos.filter((m) => m.ferramentas !== false) : []).map((m) => ({ id: m.id, nome: `Local · ${m.nome}` })),
    ],
    [prov],
  );
}

export default function PaginaConversas() {
  const rota = useNav((s) => s.rota);
  const [conversas, setConversas] = useState<Conversa[] | null>(null);
  const carregar = () => void api<Conversa[]>("/api/conversas").then(setConversas).catch(() => setConversas([]));
  useEffect(carregar, []);
  const aberta = conversas?.find((c) => String(c.id) === rota.sub) ?? null;

  const nova = async () => {
    try {
      const c = await api<Conversa>("/api/conversas", "POST", { agente: "chief-of-staff" });
      setConversas((cs) => [c, ...(cs ?? [])]);
      navegar("conversas", String(c.id));
    } catch (e) {
      avisarErro(e);
    }
  };

  return (
    // pb-24: a barra de comandos fixa no rodapé não cobre o campo de mensagem.
    <div className="flex h-full pb-24">
      <aside className="scroll-fino flex w-64 shrink-0 flex-col gap-1 overflow-y-auto border-r border-line p-3">
        <Botao variante="principal" icone={Plus} onClick={() => void nova()}>
          Nova conversa
        </Botao>
        <ul className="mt-2 space-y-0.5">
          {(conversas ?? []).map((c) => (
            <li key={c.id}>
              <button
                onClick={() => navegar("conversas", String(c.id))}
                className={cx("w-full rounded-ctl px-2.5 py-2 text-left text-pequeno hover:bg-hover", aberta?.id === c.id && "bg-press font-semibold")}
              >
                <span className="block truncate text-fg">{c.titulo}</span>
                <span className="block truncate text-legenda text-fg-3">{agentById[c.agente]?.nome ?? c.agente}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <section className="min-w-0 flex-1">
        {aberta ? (
          <Chat
            key={aberta.id}
            conversa={aberta}
            aoMudar={(c) => setConversas((cs) => (cs ?? []).map((x) => (x.id === c.id ? c : x)))}
            aoApagar={() => {
              setConversas((cs) => (cs ?? []).filter((x) => x.id !== aberta.id));
              navegar("conversas");
            }}
          />
        ) : (
          <div className="grid h-full place-items-center">
            <EstadoVazio
              icone={MessageSquareText}
              titulo="Converse com qualquer agente"
              texto="Escolha o agente e o modelo (Claude, Gemini ou local). Ele lê o projeto, pesquisa na web e, se o trabalho for grande, cria um card."
            />
          </div>
        )}
      </section>
    </div>
  );
}

function Chat({ conversa, aoMudar, aoApagar }: { conversa: Conversa; aoMudar: (c: Conversa) => void; aoApagar: () => void }) {
  const [carregadas, setCarregadas] = useState<MensagemConversa[]>([]);
  const [texto, setTexto] = useState("");
  const projetos = useStore((s) => s.projetos);
  const doEvento = useStore((s) => s.conversaMsgs);
  const parcial = useStore((s) => s.conversaParcial[conversa.id] ?? "");
  const rodandoEvento = useStore((s) => s.conversaRodando[conversa.id]);
  const rodando = rodandoEvento ?? conversa.rodando;
  const modelos = useModelos();
  const fim = useRef<HTMLDivElement>(null);

  useEffect(() => void api<MensagemConversa[]>(`/api/conversas/${conversa.id}/mensagens`).then(setCarregadas).catch(() => null), [conversa.id]);
  // As carregadas mais as que chegaram por evento depois delas (sem repetir).
  const msgs = useMemo(() => {
    const ultimo = carregadas.at(-1)?.id ?? 0;
    return [...carregadas, ...doEvento.filter((m) => m.conversaId === conversa.id && m.id > ultimo)];
  }, [carregadas, doEvento, conversa.id]);
  useEffect(() => {
    // Em bloco: no Chrome novo o scrollIntoView devolve uma Promise, e o React a trataria como limpeza do efeito.
    void fim.current?.scrollIntoView({ block: "end" });
  }, [msgs.length, parcial]);

  const mudar = async (d: Partial<Pick<Conversa, "modelo" | "projetoId" | "titulo">> & { agente?: string }) => {
    try {
      aoMudar(await api<Conversa>(`/api/conversas/${conversa.id}`, "PATCH", d));
    } catch (e) {
      avisarErro(e);
    }
  };
  const [anexos, setAnexos] = useState<{ imagens: string[]; arquivos: { url: string; nome: string }[] }>({ imagens: [], arquivos: [] });
  const [enviandoAnexo, setEnviandoAnexo] = useState(false);
  const entradaArquivo = useRef<HTMLInputElement>(null);
  // Imagens vão reduzidas (até 1600 px); documentos (PDF, Word, planilhas, texto) como estão.
  const anexar = async (lista: FileList | File[] | null) => {
    if (!lista?.length) return;
    setEnviandoAnexo(true);
    try {
      for (const f of Array.from(lista)) {
        if (f.type.startsWith("image/")) {
          const url = await enviarImagem(f);
          setAnexos((a) => ({ ...a, imagens: [...a.imagens, url] }));
        } else {
          const doc = await enviarDocumento(f);
          setAnexos((a) => ({ ...a, arquivos: [...a.arquivos, doc] }));
        }
      }
    } catch (e) {
      avisarErro(e);
    } finally {
      setEnviandoAnexo(false);
    }
  };
  const enviar = async () => {
    const t = texto.trim();
    if (!t) return;
    const comAnexos = anexos;
    setTexto("");
    setAnexos({ imagens: [], arquivos: [] });
    try {
      await api(`/api/conversas/${conversa.id}/mensagens`, "POST", { texto: t, ...comAnexos });
    } catch (e) {
      setTexto(t);
      setAnexos(comAnexos);
      avisarErro(e);
    }
  };
  const agente = agentById[conversa.agente];

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-end gap-2 border-b border-line px-4 py-3">
        <h2 className="mr-auto min-w-0 truncate text-corpo font-semibold text-fg">{conversa.titulo}</h2>
        <Seletor tamanho="p" rotulo="Agente" value={conversa.agente} onChange={(e) => void mudar({ agente: e.target.value })}>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nome} · {a.cargo}
            </option>
          ))}
        </Seletor>
        <Seletor tamanho="p" rotulo="Modelo" value={conversa.modelo ?? ""} onChange={(e) => void mudar({ modelo: e.target.value || null })}>
          <option value="">O do agente</option>
          {modelos.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nome}
            </option>
          ))}
        </Seletor>
        <Seletor tamanho="p" rotulo="Projeto" value={conversa.projetoId ?? ""} onChange={(e) => void mudar({ projetoId: e.target.value ? Number(e.target.value) : null })}>
          <option value="">Nenhum</option>
          {projetos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </Seletor>
        <BotaoIcone
          icone={Trash2}
          rotulo="Apagar conversa"
          onClick={() => void api(`/api/conversas/${conversa.id}`, "DELETE").then(aoApagar).catch(avisarErro)}
        />
      </header>
      <div className="scroll-fino flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {msgs.length === 0 && <p className="text-pequeno text-fg-3">Comece a conversa. {agente ? `${agente.nome} responde` : "O agente responde"} com o modelo escolhido.</p>}
        {msgs.map((m) => (
          <div key={m.id} className={cx("max-w-[820px] rounded-card px-3.5 py-2.5", m.papel === "voce" ? "ml-auto bg-ink text-on-ink" : "bg-sunken")}>
            {m.papel === "voce" ? <p className="whitespace-pre-wrap text-pequeno">{m.texto}</p> : <ComArtifacts texto={m.texto} />}
            {(m.imagens?.length || m.arquivos?.length) ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {m.imagens?.map((u) => <img key={u} src={u} alt="" className="h-20 rounded-ctl object-cover ring-1 ring-line" />)}
                {m.arquivos?.map((a) => (
                  <a key={a.url} href={a.url} target="_blank" rel="noreferrer" className="rounded-ctl bg-surface px-2 py-1 text-legenda text-fg underline ring-1 ring-line">
                    {a.nome}
                  </a>
                ))}
              </div>
            ) : null}
            {m.papel === "agente" && m.modelo && (
              <p className="mt-1 text-legenda text-fg-3">
                {m.modelo}
                {m.custoUsd ? ` · US$ ${m.custoUsd.toFixed(3)}` : ""}
              </p>
            )}
          </div>
        ))}
        {rodando && (
          <div className="max-w-[820px] rounded-card bg-sunken px-3.5 py-2.5">
            {parcial ? <Markdown texto={parcial} className="text-pequeno text-fg" /> : <p className="text-pequeno text-fg-3">{agente?.nome ?? "O agente"} está trabalhando…</p>}
          </div>
        )}
        <div ref={fim} />
      </div>
      {(anexos.imagens.length > 0 || anexos.arquivos.length > 0 || enviandoAnexo) && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 pt-2 text-legenda text-fg-2">
          {anexos.imagens.map((u) => <img key={u} src={u} alt="" className="h-10 rounded-ctl object-cover ring-1 ring-line" />)}
          {anexos.arquivos.map((a) => <span key={a.url} className="rounded-ctl bg-sunken px-2 py-1">{a.nome}</span>)}
          {enviandoAnexo && <span>Enviando anexo…</span>}
          {!enviandoAnexo && <button className="underline" onClick={() => setAnexos({ imagens: [], arquivos: [] })}>tirar anexos</button>}
        </div>
      )}
      <div className="flex items-end gap-2 border-t border-line px-4 py-3">
        <input ref={entradaArquivo} type="file" multiple hidden accept="image/*,.pdf,.docx,.doc,.rtf,.xlsx,.pptx,.csv,.txt,.md,.json" onChange={(e) => void anexar(e.target.files).then(() => (e.target.value = ""))} />
        <BotaoIcone icone={Paperclip} rotulo="Anexar imagem ou documento" onClick={() => entradaArquivo.current?.click()} />
        <AreaTexto
          onPaste={(e) => {
            const imgs = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
            if (imgs.length) {
              e.preventDefault();
              void anexar(imgs);
            }
          }}
          className="flex-1"
          rows={2}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void enviar();
            }
          }}
          placeholder={rodando ? "Oriente agora: entra na próxima rodada, sem reiniciar" : "Escreva (Enter envia, Shift+Enter quebra linha)"}
        />
        {rodando && <BotaoIcone icone={Square} rotulo="Parar" onClick={() => void api(`/api/conversas/${conversa.id}/parar`, "POST").catch(avisarErro)} />}
        <BotaoIcone icone={Send} rotulo="Enviar" onClick={() => void enviar()} disabled={!texto.trim()} />
      </div>
    </div>
  );
}

/** Texto do agente com os artifacts ([[artifact:url|título]]) trocados por quadros interativos isolados. */
function ComArtifacts({ texto }: { texto: string }) {
  const partes = texto.split(/(\[\[artifact:[^|\]]+\|[^\]]*\]\])/g);
  return (
    <>
      {partes.map((p, i) => {
        const m = /^\[\[artifact:([^|\]]+)\|([^\]]*)\]\]$/.exec(p);
        if (!m) return p.trim() ? <Markdown key={i} texto={p} className="text-pequeno text-fg" /> : null;
        return (
          <div key={i} className="my-2 overflow-hidden rounded-card ring-1 ring-line">
            <div className="flex items-center gap-2 bg-surface px-3 py-1.5 text-legenda text-fg-2">
              <span className="flex-1 font-semibold text-fg">{m[2] || "Artifact"}</span>
              <a href={m[1]} target="_blank" rel="noreferrer" className="underline">abrir em outra aba</a>
            </div>
            <iframe src={m[1]} title={m[2] || "Artifact"} sandbox="allow-scripts allow-forms" className="h-[480px] w-full bg-white" />
          </div>
        );
      })}
    </>
  );
}
