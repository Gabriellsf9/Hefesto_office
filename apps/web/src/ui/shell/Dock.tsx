import { useEffect, useRef, useState } from "react";
import { ArrowUp, FileText, History, Loader2, Paperclip, X } from "lucide-react";
import { agentById } from "@empresa/org";
import type { ChatMessage } from "@empresa/shared";
import { useStore } from "../../store.ts";
import { send } from "../../ws.ts";
import { AvisosVoz, BotoesVoz } from "../Voz.tsx";
import { arquivosDe, enviarDocumento, enviarImagem } from "../anexos.ts";
import { BotaoIcone, Gaveta, cx } from "../kit/index.ts";
import { Avatarzinho, hora } from "../comum.tsx";
import { escritorioAtivo } from "../../escritorio.ts";

// Conversa com a empresa (DESIGN-INTERFACE.md §6.8): barra no rodapé de todas as páginas.
// As respostas aparecem por alguns segundos acima da barra; o histórico abre numa folha lateral.

export function Dock() {
  const chat = useStore((s) => s.chat);
  const conectado = useStore((s) => s.conectado);
  const parcial = useStore((s) => s.chatParcial);
  const [texto, setTexto] = useState("");
  const [historico, setHistorico] = useState(false);
  const [agora, setAgora] = useState(Date.now());
  const campo = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  // "Conversar" no perfil de um agente preenche o começo da mensagem com o nome dele.
  useEffect(() => {
    const f = (e: Event) => {
      setTexto(`${(e as CustomEvent<string>).detail}, `);
      campo.current?.focus();
    };
    window.addEventListener("chat:mencionar", f);
    return () => window.removeEventListener("chat:mencionar", f);
  }, []);

  const [anexos, setAnexos] = useState<string[]>([]);
  const [documentos, setDocumentos] = useState<{ url: string; nome: string }[]>([]);
  const [subindo, setSubindo] = useState(0);
  const [erroAnexo, setErroAnexo] = useState<string | null>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);
  const anexar = async (arquivos: File[]) => {
    if (!arquivos.length) return;
    setErroAnexo(null);
    const vagas = Math.max(0, 6 - anexos.length - documentos.length);
    if (arquivos.length > vagas) setErroAnexo("Até 6 anexos por mensagem.");
    for (const f of arquivos.slice(0, vagas)) {
      setSubindo((n) => n + 1);
      try {
        if (f.type.startsWith("image/")) {
          const url = await enviarImagem(f);
          setAnexos((a) => [...a, url]);
        } else {
          const d = await enviarDocumento(f);
          setDocumentos((x) => [...x, d]);
        }
      } catch (err) {
        setErroAnexo(err instanceof Error ? err.message : String(err));
      } finally {
        setSubindo((n) => n - 1);
      }
    }
  };

  const enviar = () => {
    const t = texto.trim();
    if ((!t && !anexos.length && !documentos.length) || subindo || !conectado) return;
    send({ type: "command", texto: t, escritorio: escritorioAtivo(), ...(anexos.length ? { imagens: anexos } : {}), ...(documentos.length ? { arquivos: documentos.map((d) => d.url) } : {}) });
    setTexto("");
    setAnexos([]);
    setDocumentos([]);
    setErroAnexo(null);
  };

  const recentes = historico ? [] : chat.slice(-2).filter((m) => agora - m.ts < 30_000);
  const pode = conectado && (!!texto.trim() || anexos.length > 0 || documentos.length > 0) && subindo === 0;

  return (
    <>
      <div className="pointer-events-none absolute bottom-4 left-1/2 z-[1300] flex w-[min(680px,calc(100%-2rem))] -translate-x-1/2 flex-col gap-2">
        <div className="pointer-events-auto">
          <AvisosVoz />
        </div>
        {!historico && (recentes.length > 0 || parcial) && (
          <div className="pointer-events-auto space-y-2">
            {recentes.map((m) => (
              <Bolha key={m.id} m={m} flutuante />
            ))}
            {parcial && agentById[parcial.de] && <Bolha m={{ id: "p", ts: Date.now(), de: parcial.de, texto: parcial.texto }} flutuante escrevendo />}
          </div>
        )}
        {(anexos.length > 0 || documentos.length > 0 || subindo > 0 || erroAnexo) && (
          <div className="painel pointer-events-auto flex flex-wrap items-center gap-2 p-2">
            {anexos.map((u) => (
              <div key={u} className="relative">
                <img src={u} alt="Anexo" className="size-14 rounded-ctl object-cover shadow-1" />
                <button type="button" onClick={() => setAnexos((a) => a.filter((x) => x !== u))} className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-ink text-on-ink" aria-label="Remover imagem">
                  <X className="size-3" />
                </button>
              </div>
            ))}
            {documentos.map((d) => (
              <span key={d.url} className="flex h-14 items-center gap-2 rounded-ctl bg-surface px-3 text-pequeno text-fg shadow-1">
                <FileText className="size-4 text-fg-3" />
                <span className="max-w-[160px] truncate">{d.nome}</span>
                <button type="button" onClick={() => setDocumentos((x) => x.filter((y) => y.url !== d.url))} className="grid size-5 place-items-center rounded-full text-fg-3 hover:bg-hover" aria-label="Remover arquivo"><X className="size-3" /></button>
              </span>
            ))}
            {subindo > 0 && <span className="flex items-center gap-1.5 text-pequeno text-fg-2"><Loader2 className="size-4 animate-spin" /> Enviando…</span>}
            {erroAnexo && <span className="text-pequeno text-danger-fg">{erroAnexo}</span>}
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            enviar();
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void anexar(arquivosDe(e.dataTransfer.files));
          }}
          className="painel pointer-events-auto flex items-end gap-1.5 p-1.5"
        >
          <BotoesVoz />
          <input ref={arquivoRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,.pdf,.docx,.doc,.rtf,.xlsx,.pptx,.csv,.txt,.md,.json" multiple hidden onChange={(e) => { void anexar(arquivosDe(e.target.files)); e.target.value = ""; }} />
          <BotaoIcone icone={Paperclip} rotulo="Anexar imagens ou documentos: PDF, Word, Excel, PowerPoint, CSV (ou cole com ⌘V, ou arraste)" onClick={() => arquivoRef.current?.click()} disabled={!conectado} />
          <textarea
            ref={campo}
            rows={1}
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                enviar();
              }
            }}
            onPaste={(e) => {
              const imgs = arquivosDe(e.clipboardData.items);
              if (imgs.length) {
                e.preventDefault();
                void anexar(imgs);
              }
            }}
            placeholder={conectado ? "Peça algo à empresa ou fale com alguém pelo nome…" : "Conectando ao servidor…"}
            disabled={!conectado}
            className="max-h-[140px] min-h-9 min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-corpo leading-5 text-fg outline-none placeholder:text-fg-3"
          />
          <BotaoIcone icone={History} rotulo="Histórico da conversa" ativo={historico} onClick={() => setHistorico(!historico)} />
          <button
            type="submit"
            disabled={!pode}
            aria-label="Enviar"
            className="grid size-9 shrink-0 place-items-center rounded-ctl bg-ink text-on-ink transition-opacity disabled:opacity-25"
          >
            <ArrowUp className="size-[18px]" strokeWidth={2} />
          </button>
        </form>
      </div>

      <Gaveta aberta={historico} fechar={() => setHistorico(false)} titulo="Conversa com a empresa" subtitulo="Helena e quem você chamar pelo nome" largura={440} semFundo>
        <div className="space-y-3 p-4 pb-40">
          {chat.length === 0 && <p className="py-10 text-center text-pequeno text-fg-2">Nenhuma mensagem ainda. Escreva abaixo ou segure o espaço para falar.</p>}
          {chat.map((m) => <Bolha key={m.id} m={m} />)}
          {parcial && agentById[parcial.de] && <Bolha m={{ id: "p", ts: Date.now(), de: parcial.de, texto: parcial.texto }} escrevendo />}
          <FimDaLista dep={chat.length + (parcial?.texto.length ?? 0)} />
        </div>
      </Gaveta>
    </>
  );
}

function FimDaLista({ dep }: { dep: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.scrollIntoView({ block: "end" }), [dep]);
  return <div ref={ref} />;
}

function Bolha({ m, flutuante, escrevendo }: { m: Pick<ChatMessage, "id" | "ts" | "de" | "texto" | "imagens" | "arquivos">; flutuante?: boolean; escrevendo?: boolean }) {
  const a = m.de === "voce" ? null : agentById[m.de];
  return (
    <div className={cx("flex gap-2.5", a ? "" : "flex-row-reverse")}>
      {a ? <Avatarzinho agent={a} tamanho={28} /> : <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ink text-[10px] font-bold text-on-ink">CEO</span>}
      <div
        className={cx(
          "max-w-[82%] rounded-2xl px-3.5 py-2 text-corpo",
          a ? (flutuante ? "painel text-fg" : "bg-sunken text-fg") : "bg-ink text-on-ink",
          flutuante && "anima-cima",
        )}
      >
        {a && (
          <div className="mb-0.5 text-legenda font-medium text-fg-3">
            {a.nome} · {escrevendo ? "escrevendo…" : hora(m.ts)}
          </div>
        )}
        <div className="whitespace-pre-wrap">{m.texto}</div>
        {m.arquivos && m.arquivos.length > 0 && <ListaArquivos arquivos={m.arquivos} escuro={!a} />}
        {m.imagens && m.imagens.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {m.imagens.map((u) => (
              <a key={u} href={u} target="_blank" rel="noreferrer">
                <img src={u} alt="Imagem enviada" className="h-20 max-w-[160px] rounded-ctl object-cover" />
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Arquivos como chips para baixar (PDF, Word, Excel…). */
export function ListaArquivos({ arquivos, escuro }: { arquivos: { url: string; nome: string }[]; escuro?: boolean }) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {arquivos.map((d) => (
        <a key={d.url} href={d.url} download className={cx("flex items-center gap-1.5 rounded-ctl px-2.5 py-1.5 text-pequeno", escuro ? "bg-white/15 text-on-ink hover:bg-white/25" : "bg-surface text-fg shadow-1 hover:shadow-2")}>
          <FileText className="size-4 shrink-0 opacity-70" />
          <span className="max-w-[220px] truncate">{d.nome}</span>
        </a>
      ))}
    </div>
  );
}
