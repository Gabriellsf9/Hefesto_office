import { useEffect, useRef, useState } from "react";
import { secoesLivro } from "@empresa/shared";
import { agentById } from "@empresa/org";
import { useStore } from "../store.ts";
import { send } from "../ws.ts";
import { Markdown } from "./Markdown.tsx";
import { Avatarzinho } from "./SidePanel.tsx";
import { AvisosVoz, BotoesVoz } from "./Voz.tsx";

const helena = agentById["chief-of-staff"]!;

/** Convite flutuante enquanto a entrevista não termina. */
export function ConviteEntrevista() {
  const chave = useStore((s) => s.chaveConfigurada);
  const status = useStore((s) => s.onboarding.status);
  const aberta = useStore((s) => s.entrevistaAberta);
  const abrir = useStore((s) => s.setEntrevistaAberta);
  if (!chave || status === "concluido" || aberta) return null;

  const comecar = () => {
    abrir(true);
    if (status === "nao-iniciado") send({ type: "onboarding.iniciar" });
  };

  return (
    <div className="painel pointer-events-auto absolute left-1/2 top-24 flex w-[min(520px,calc(100%-2rem))] -translate-x-1/2 items-center gap-3 p-3">
      <Avatarzinho agent={helena} grande />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">A Helena quer conhecer a sua empresa</div>
        <div className="text-xs text-black/55">
          {status === "nao-iniciado"
            ? "Uma conversa de poucos minutos para montar o Livro da Empresa, que todos os agentes vão ler."
            : "A entrevista está pausada. Continue de onde parou."}
        </div>
      </div>
      <button onClick={comecar} className="shrink-0 rounded-xl bg-[#1f2430] px-4 py-2 text-sm font-semibold text-white">
        {status === "nao-iniciado" ? "Começar entrevista" : "Continuar"}
      </button>
    </div>
  );
}

/** Painel lateral da conversa com a Helena. */
export function PainelEntrevista() {
  const aberta = useStore((s) => s.entrevistaAberta);
  const fechar = () => useStore.getState().setEntrevistaAberta(false);
  const { status, mensagens, ocupado } = useStore((s) => s.onboarding);
  const parcial = useStore((s) => s.helenaParcial);
  const erro = useStore((s) => s.erroOnboarding);
  const livro = useStore((s) => s.livro);
  const setLivroAberto = useStore((s) => s.setLivroAberto);
  const [texto, setTexto] = useState("");
  const fim = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fim.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [mensagens.length, parcial, aberta]);

  if (!aberta) return null;
  const feitas = new Set(livro.map((s) => s.id));

  const enviar = () => {
    const t = texto.trim();
    if (!t || ocupado) return;
    send({ type: "onboarding.responder", texto: t });
    setTexto("");
  };

  return (
    <aside className="painel pointer-events-auto absolute bottom-4 right-4 top-24 flex w-[440px] flex-col overflow-hidden">
      <div className="flex items-center gap-3 border-b border-black/5 p-4">
        <Avatarzinho agent={helena} grande />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold">Entrevista com a Helena</div>
          <div className="text-xs text-black/55">
            {status === "concluido" ? "Concluída. O Livro está pronto para revisão." : "Chief of Staff · montando o Livro da Empresa"}
          </div>
        </div>
        <button onClick={fechar} className="rounded-lg px-2.5 py-1 text-xs text-black/60 ring-1 ring-black/10 hover:bg-black/5">
          {status === "concluido" ? "Fechar" : "Pausar"}
        </button>
      </div>

      {/* Progresso: um ponto por bloco da entrevista */}
      <div className="flex flex-wrap gap-1.5 border-b border-black/5 px-4 py-2.5">
        {secoesLivro.map((s) => (
          <span
            key={s.id}
            title={s.objetivo}
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
              feitas.has(s.id) ? "bg-emerald-100 text-emerald-800" : "bg-black/5 text-black/45"
            }`}
          >
            {feitas.has(s.id) ? "✓ " : ""}
            {s.titulo}
          </span>
        ))}
      </div>

      <div className="scroll-fino min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {mensagens.map((m) =>
          m.de === "helena" ? (
            <div key={m.id} className="flex gap-2">
              <Avatarzinho agent={helena} />
              <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-black/5 px-3 py-2 text-[13px] leading-relaxed">
                <Markdown texto={m.texto} />
              </div>
            </div>
          ) : (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-[#1f2430] px-3 py-2 text-[13px] leading-relaxed text-white">
                {m.texto}
              </div>
            </div>
          ),
        )}
        {ocupado && (
          <div className="flex gap-2">
            <Avatarzinho agent={helena} />
            <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-black/5 px-3 py-2 text-[13px] leading-relaxed">
              {parcial ? <Markdown texto={parcial} /> : <span className="pulsar text-black/50">Helena está pensando…</span>}
            </div>
          </div>
        )}
        {erro && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{erro}</p>}
        {status === "concluido" && !ocupado && (
          <button
            onClick={() => setLivroAberto(true)}
            className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Revisar o Livro da Empresa
          </button>
        )}
        <div ref={fim} />
      </div>

      <div className="border-t border-black/5 p-3">
        <AvisosVoz />
        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-1.5">
            <BotoesVoz compacto />
          </div>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                enviar();
              }
            }}
            rows={2}
            placeholder={ocupado ? "A Helena está respondendo…" : "Responda à Helena… (Enter envia, Shift+Enter quebra linha)"}
            className="scroll-fino max-h-40 min-h-10 flex-1 resize-none rounded-xl bg-black/5 px-3 py-2 text-sm outline-none placeholder:text-black/35 focus:ring-2 focus:ring-[#1f2430]/20"
          />
          <button
            onClick={enviar}
            disabled={ocupado || !texto.trim()}
            className="h-10 rounded-xl bg-[#1f2430] px-4 text-sm font-semibold text-white disabled:opacity-30"
          >
            Enviar
          </button>
        </div>
        <p className="mt-1.5 text-[10px] text-black/40">
          Dica: responda por voz com o microfone ou o modo conversa, e mande o link do seu site que a Helena lê sozinha.
        </p>
      </div>
    </aside>
  );
}
