import { useEffect, useRef, useState } from "react";
import { agentById } from "@empresa/org";
import { useStore } from "../store.ts";
import { send } from "../ws.ts";
import { Avatarzinho } from "./SidePanel.tsx";
import { AvisosVoz, BotoesVoz } from "./Voz.tsx";
import { usePaineis } from "../paineis.ts";
import { BotaoMinimizar } from "./Minimizavel.tsx";
import { enviarImagem, imagensDe } from "./anexos.ts";

/** Onde você fala com a empresa. Voz chega na Fase 4. */
export function CommandBar() {
  const chat = useStore((s) => s.chat);
  const conectado = useStore((s) => s.conectado);
  const parcial = useStore((s) => s.chatParcial);
  const [texto, setTexto] = useState("");
  const [historico, setHistorico] = useState(false);
  const minimizado = usePaineis((s) => s.minimizados.chat);
  const alternar = usePaineis((s) => s.alternar);
  const fim = useRef<HTMLDivElement>(null);

  // Fora do histórico, as mensagens somem sozinhas depois de alguns segundos para liberar a visão do escritório.
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const visiveis = historico ? chat.slice(-30) : chat.slice(-2).filter((m) => agora - m.ts < 40_000);

  useEffect(() => {
    fim.current?.scrollIntoView({ block: "end" });
  }, [chat.length, historico, parcial?.texto]);

  // Imagens anexadas (📎, ⌘V ou arrastar): sobem para o servidor local e vão junto com a mensagem.
  const [anexos, setAnexos] = useState<string[]>([]);
  const [subindo, setSubindo] = useState(0);
  const [erroAnexo, setErroAnexo] = useState<string | null>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);
  const anexar = async (arquivos: File[]) => {
    if (!arquivos.length) return;
    setErroAnexo(null);
    const vagas = Math.max(0, 6 - anexos.length);
    if (arquivos.length > vagas) setErroAnexo("Até 6 imagens por mensagem.");
    for (const f of arquivos.slice(0, vagas)) {
      setSubindo((n) => n + 1);
      try {
        const url = await enviarImagem(f);
        setAnexos((a) => [...a, url]);
      } catch (err) {
        setErroAnexo(err instanceof Error ? err.message : String(err));
      } finally {
        setSubindo((n) => n - 1);
      }
    }
  };

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    const t = texto.trim();
    if ((!t && !anexos.length) || subindo) return;
    send({ type: "command", texto: t, ...(anexos.length ? { imagens: anexos } : {}) });
    setTexto("");
    setAnexos([]);
    setErroAnexo(null);
  };

  // Minimizado: a legenda da voz continua aparecendo e o espaço segue funcionando para falar.
  if (minimizado) {
    return (
      <div className="pointer-events-auto absolute bottom-4 left-1/2 flex w-[min(640px,calc(100%-2rem))] -translate-x-1/2 flex-col items-center">
        <div className="w-full">
          <AvisosVoz />
        </div>
        <div className="painel flex items-center gap-1 p-1.5">
          <BotoesVoz />
          <button onClick={() => alternar("chat")} className="flex items-center gap-2 px-2 text-xs font-semibold text-black/70 hover:text-black" title="Expandir">
            Falar com a empresa
            {parcial && <span className="pulsar h-2 w-2 rounded-full bg-blue-500" />}
            <span className="text-[10px] text-black/40">▸</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-auto absolute bottom-4 left-1/2 w-[min(640px,calc(100%-2rem))] -translate-x-1/2">
      <AvisosVoz />
      {(visiveis.length > 0 || parcial) && (
        <div className={`painel scroll-fino mb-2 space-y-2 overflow-y-auto p-3 ${historico ? "max-h-80" : ""}`}>
          {visiveis.map((m) => {
            const a = m.de === "voce" ? null : agentById[m.de];
            return (
              <div key={m.id} className={`flex gap-2 text-xs ${a ? "" : "flex-row-reverse"}`}>
                {a ? (
                  <Avatarzinho agent={a} />
                ) : (
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#1f2430] text-[10px] font-bold text-white">CEO</span>
                )}
                <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${a ? "bg-black/5" : "bg-[#1f2430] text-white"}`}>
                  {a && <div className="mb-0.5 text-[10px] font-semibold text-black/50">{a.nome} · {a.cargo}</div>}
                  {m.texto}
                  {m.imagens && m.imagens.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {m.imagens.map((u) => (
                        <a key={u} href={u} target="_blank" rel="noreferrer">
                          <img src={u} alt="Imagem enviada" className="h-20 max-w-[160px] rounded-lg object-cover ring-1 ring-black/10" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {parcial && agentById[parcial.de] && (
            <div className="flex gap-2 text-xs">
              <Avatarzinho agent={agentById[parcial.de]!} />
              <div className="max-w-[80%] rounded-2xl bg-black/5 px-3 py-2">
                <div className="mb-0.5 text-[10px] font-semibold text-black/50">{agentById[parcial.de]!.nome} está escrevendo…</div>
                {parcial.texto}
              </div>
            </div>
          )}
          <div ref={fim} />
        </div>
      )}

      {(anexos.length > 0 || subindo > 0 || erroAnexo) && (
        <div className="painel mb-2 flex flex-wrap items-center gap-2 p-2">
          {anexos.map((u) => (
            <div key={u} className="relative">
              <img src={u} alt="Anexo" className="h-14 w-14 rounded-lg object-cover ring-1 ring-black/10" />
              <button
                type="button"
                onClick={() => setAnexos((a) => a.filter((x) => x !== u))}
                className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-[#1f2430] text-[10px] text-white"
                aria-label="Remover imagem"
              >
                ✕
              </button>
            </div>
          ))}
          {subindo > 0 && <span className="text-[11px] text-black/50">Enviando imagem…</span>}
          {erroAnexo && <span className="text-[11px] text-rose-600">{erroAnexo}</span>}
        </div>
      )}
      <form
        onSubmit={enviar}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void anexar(imagensDe(e.dataTransfer.files));
        }}
        className="painel flex items-center gap-2 p-2"
      >
        <BotoesVoz />
        <input ref={arquivoRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden onChange={(e) => { void anexar(imagensDe(e.target.files)); e.target.value = ""; }} />
        <button
          type="button"
          onClick={() => arquivoRef.current?.click()}
          disabled={!conectado}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-black/55 ring-1 ring-black/10 hover:bg-black/5 disabled:opacity-30"
          title="Anexar imagens (ou cole com ⌘V, ou arraste para cá)"
          aria-label="Anexar imagens"
        >
          <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.5 9.5 9 15a3.5 3.5 0 0 1-5-5l6-6a2.3 2.3 0 0 1 3.3 3.3L7.5 13.1a1.2 1.2 0 0 1-1.7-1.7L11 6.2" />
          </svg>
        </button>
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onPaste={(e) => {
            const imgs = imagensDe(e.clipboardData.items);
            if (imgs.length) {
              e.preventDefault();
              void anexar(imgs);
            }
          }}
          placeholder={conectado ? "Escreva ou segure espaço para falar… ex.: Rafael, como está o login?" : "Conectando ao servidor…"}
          disabled={!conectado}
          className="h-10 min-w-0 flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-black/35"
        />
        {chat.length > 0 && (
          <button type="button" onClick={() => setHistorico(!historico)} className="px-2 text-[11px] text-black/50 hover:text-black">
            {historico ? "Recolher" : "Histórico"}
          </button>
        )}
        <button
          type="submit"
          disabled={!conectado || (!texto.trim() && !anexos.length) || subindo > 0}
          className="h-10 rounded-xl bg-[#1f2430] px-4 text-sm font-semibold text-white disabled:opacity-30"
        >
          Enviar
        </button>
        <BotaoMinimizar id="chat" />
      </form>
    </div>
  );
}
