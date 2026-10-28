import { useState } from "react";
import { api } from "../../api.ts";
import { avisarErro } from "../kit/index.ts";

// O diff do card com comentário por linha: o comentário vai para o card com arquivo:linha e o trecho do código.
// Se o autor está trabalhando agora, ele recebe na próxima rodada; senão, vê na próxima versão.

interface Linha {
  texto: string;
  arquivo: string | null;
  linha: number | null;
}

/** Arquivo e linha (na versão nova) de cada linha do diff: "+" e contexto têm linha; "-" e cabeçalhos, não. */
export function linhasDoDiff(patch: string): Linha[] {
  let arquivo: string | null = null;
  let nova = 0;
  return patch.split("\n").map((texto) => {
    if (texto.startsWith("+++ ")) {
      arquivo = texto.slice(4).replace(/^b\//, "");
      return { texto, arquivo: null, linha: null };
    }
    const h = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(texto);
    if (h) {
      nova = Number(h[1]);
      return { texto, arquivo: null, linha: null };
    }
    if (!arquivo || (!texto.startsWith("+") && !texto.startsWith(" "))) return { texto, arquivo: null, linha: null };
    return { texto, arquivo, linha: nova++ };
  });
}

const cor = (l: string) =>
  l.startsWith("+") && !l.startsWith("+++")
    ? "text-emerald-300"
    : l.startsWith("-") && !l.startsWith("---")
      ? "text-rose-300"
      : l.startsWith("@@")
        ? "text-sky-300"
        : "text-on-ink/70";

export function DiffComentavel({ cardId, patch }: { cardId: number; patch: string }) {
  const [aberta, setAberta] = useState<number | null>(null);
  const [texto, setTexto] = useState("");
  const [enviado, setEnviado] = useState<string | null>(null);
  const linhas = linhasDoDiff(patch);

  const enviar = async (l: Linha) => {
    if (!texto.trim() || !l.arquivo) return;
    const cerca = "```";
    try {
      const r = await api<{ entregueAoAgente?: boolean }>(`/api/cards/${cardId}/comentarios`, "POST", {
        texto: `📌 \`${l.arquivo}:${l.linha}\`\n${cerca}\n${l.texto.slice(1)}\n${cerca}\n${texto.trim()}`,
      });
      setEnviado(r.entregueAoAgente ? "Comentário entregue ao agente (ele está trabalhando agora)." : "Comentário registrado no card: o agente vê na próxima versão.");
      setTexto("");
      setAberta(null);
    } catch (e) {
      avisarErro(e);
    }
  };

  return (
    <>
      <pre className="scroll-fino mt-2 max-h-96 overflow-auto rounded-lg bg-codigo p-3 text-legenda leading-relaxed text-codigo-fg ring-1 ring-line">
        {linhas.map((l, i) => (
          <div key={i}>
            <div
              onClick={() => l.arquivo && setAberta(aberta === i ? null : i)}
              title={l.arquivo ? `Comentar ${l.arquivo}:${l.linha}` : undefined}
              className={`${l.arquivo ? "cursor-pointer hover:bg-white/5" : ""} ${cor(l.texto)}`}
            >
              {l.texto || " "}
            </div>
            {aberta === i && (
              <div className="my-1 flex gap-2 whitespace-normal font-sans">
                <input
                  autoFocus
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void enviar(l)}
                  placeholder={`Comentário sobre ${l.arquivo}:${l.linha} (Enter envia)`}
                  className="campo flex-1 text-pequeno"
                />
                <button onClick={() => void enviar(l)} disabled={!texto.trim()} className="rounded-lg bg-ink px-3 text-pequeno font-semibold text-on-ink disabled:opacity-30">
                  Comentar
                </button>
              </div>
            )}
          </div>
        ))}
      </pre>
      {enviado && <p className="mt-1 text-legenda text-success-fg">{enviado}</p>}
    </>
  );
}
