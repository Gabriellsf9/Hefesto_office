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
          ouvindo === "ptt" ? "scale-110 bg-danger text-white ring-danger" : "text-fg-2 ring-line hover:bg-hover"
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
        className={`grid ${tamanho} shrink-0 place-items-center rounded-xl text-legenda font-bold ring-1 transition ${
          ouvindo === "conversa" ? "pulsar bg-success text-white ring-success" : "text-fg-2 ring-line hover:bg-hover"
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
        <div className="painel flex items-start gap-2 p-2.5 text-legenda text-fg">
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
            className="font-semibold text-fg underline"
          >
            Entendi
          </button>
        </div>
      )}
      {voz.ouvindo !== "nao" && (
        <div className="painel flex items-center gap-2 px-3 py-2 text-corpo">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${voz.ouvindo === "ptt" ? "bg-danger" : "bg-success"} pulsar`} />
          <span className="text-legenda font-semibold text-fg-3">{voz.ouvindo === "ptt" ? "Ouvindo…" : "Modo conversa"}</span>
          <span className="min-w-0 flex-1 truncate">{voz.legenda || <span className="text-fg-disabled">fale agora</span>}</span>
        </div>
      )}
      {quem && (
        <div className="painel flex items-center gap-2 px-3 py-1.5 text-pequeno">
          <span>🔊</span>
          <span className="flex-1">
            <b>{quem.nome}</b> está falando
          </span>
          <button onClick={pararDeFalar} className="rounded-lg px-2 py-0.5 text-legenda font-semibold ring-1 ring-line hover:bg-hover">
            Parar
          </button>
        </div>
      )}
      {voz.erro && (
        <div className="flex items-center gap-2 rounded-xl bg-danger-soft px-3 py-2 text-pequeno text-danger-fg ring-1 ring-danger">
          <span className="flex-1">{voz.erro}</span>
          <button onClick={() => setVoz({ erro: null })} className="font-semibold">
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
