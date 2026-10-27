import { useState } from "react";
import { agentById } from "@empresa/org";
import { useStore } from "../store.ts";
import { alternarConversa, comecarPtt, soltarPtt } from "../voz/controle.ts";
import { pararDeFalar } from "../voz/falar.ts";
import { reconhecimentoSuportado } from "../voz/ouvir.ts";

/** Botões de voz: segurar para falar e modo conversa. */
export function BotoesVoz({ compacto = false }: { compacto?: boolean }) {
  const ouvindo = useStore((s) => s.voz.ouvindo);
  const tamanho = compacto ? "h-9 w-9" : "h-10 w-10";
  const titulo = reconhecimentoSuportado
    ? "Segure para falar (ou segure a barra de espaço)"
    : "Voz indisponível neste navegador: abra no Chrome ou no Safari";

  return (
    <>
      <button
        type="button"
        title={titulo}
        aria-label="Segure para falar"
        onPointerDown={(e) => {
          e.preventDefault();
          comecarPtt();
        }}
        onPointerUp={soltarPtt}
        onPointerLeave={() => ouvindo === "ptt" && soltarPtt()}
        className={`grid ${tamanho} shrink-0 select-none place-items-center rounded-xl ring-1 transition ${
          ouvindo === "ptt" ? "scale-110 bg-rose-600 text-white ring-rose-700" : "text-black/60 ring-black/10 hover:bg-black/5"
        }`}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
        </svg>
      </button>
      <button
        type="button"
        onClick={alternarConversa}
        title="Modo conversa: escuta contínua, envia sozinho quando você para de falar"
        aria-label="Modo conversa"
        className={`grid ${tamanho} shrink-0 place-items-center rounded-xl text-[11px] font-bold ring-1 transition ${
          ouvindo === "conversa" ? "pulsar bg-emerald-600 text-white ring-emerald-700" : "text-black/60 ring-black/10 hover:bg-black/5"
        }`}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 12h2M8 8v8M12 5v14M16 8v8M20 12h-2" />
        </svg>
      </button>
    </>
  );
}

/** Legenda ao vivo, quem está falando, erros e o aviso de privacidade. */
export function AvisosVoz() {
  const voz = useStore((s) => s.voz);
  const setVoz = useStore((s) => s.setVoz);
  const [avisoLido, setAvisoLido] = useState(() => {
    try {
      return localStorage.getItem("empresa-aviso-voz") === "1";
    } catch {
      return false;
    }
  });
  const quem = voz.falando ? agentById[voz.falando] : null;

  return (
    <div className="mb-2 space-y-2">
      {voz.ouvindo !== "nao" && !avisoLido && (
        <div className="painel flex items-start gap-2 p-2.5 text-[11px] text-black/70">
          <span className="flex-1">
            O reconhecimento de voz é feito pelo navegador e o áudio pode ir para o fabricante dele (Google no Chrome, Apple no Safari).
          </span>
          <button
            onClick={() => {
              setAvisoLido(true);
              try {
                localStorage.setItem("empresa-aviso-voz", "1");
              } catch {
                /* sem armazenamento: o aviso volta na próxima vez */
              }
            }}
            className="font-semibold text-[#1f2430] underline"
          >
            Entendi
          </button>
        </div>
      )}
      {voz.ouvindo !== "nao" && (
        <div className="painel flex items-center gap-2 px-3 py-2 text-sm">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${voz.ouvindo === "ptt" ? "bg-rose-600" : "bg-emerald-600"} pulsar`} />
          <span className="text-[11px] font-semibold text-black/45">{voz.ouvindo === "ptt" ? "Ouvindo…" : "Modo conversa"}</span>
          <span className="min-w-0 flex-1 truncate">{voz.legenda || <span className="text-black/35">fale agora</span>}</span>
        </div>
      )}
      {quem && (
        <div className="painel flex items-center gap-2 px-3 py-1.5 text-xs">
          <span>🔊</span>
          <span className="flex-1">
            <b>{quem.nome}</b> está falando
          </span>
          <button onClick={pararDeFalar} className="rounded-lg px-2 py-0.5 text-[11px] font-semibold ring-1 ring-black/10 hover:bg-black/5">
            Parar
          </button>
        </div>
      )}
      {voz.erro && (
        <div className="flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-200">
          <span className="flex-1">{voz.erro}</span>
          <button onClick={() => setVoz({ erro: null })} className="font-semibold">
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
