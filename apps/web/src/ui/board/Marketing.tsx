import { useMemo, useState } from "react";
import { canaisPeca, type Card, type Peca } from "@empresa/shared";
import { useStore } from "../../store.ts";
import { api } from "../../api.ts";

// Marketing (Fase 5): a peça pronta dentro do card e o calendário editorial do mês.
// Publicar é seu: copiar o texto ou abrir o LinkedIn já com ele; depois marcar como publicado.

const canal = (id: Peca["canal"]) => canaisPeca.find((c) => c.id === id)!;
const dataInput = (ms: number | null) => (ms ? new Date(ms - new Date(ms).getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : "");

export function FichaPeca({ card }: { card: Card }) {
  const peca = useStore((s) => s.pecas[card.id]);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [link, setLink] = useState("");
  if (!peca) return null;
  const c = canal(peca.canal);
  const texto = `${peca.texto}${peca.hashtags.length ? `\n\n${peca.hashtags.join(" ")}` : ""}`;
  const acao = async (fn: () => Promise<unknown>, msg: string) => {
    setErro(null);
    setOk(null);
    try {
      await fn();
      setOk(msg);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  };
  const aprovada = card.coluna === "agendado";
  const publicada = card.coluna === "publicado";

  return (
    <section className="mt-5 rounded-xl bg-sunken p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="flex-1 text-legenda font-bold uppercase tracking-wide text-fg-3">Peça</h3>
        <span className="rounded-full px-2 py-0.5 text-legenda font-semibold text-white" style={{ background: c.cor }}>
          {c.nome} · {peca.formato}
        </span>
        <input
          type="datetime-local"
          value={dataInput(peca.dataPublicacao)}
          onChange={(e) => acao(() => api(`/api/pecas/${card.id}`, "PUT", { dataPublicacao: e.target.value || null }), "Data alterada.")}
          className="h-7 rounded-lg bg-surface px-1.5 text-legenda ring-1 ring-line"
          title="Quando publicar"
        />
      </div>
      <div className="rounded-lg bg-surface p-2.5 ring-1 ring-line">
        <p className="whitespace-pre-wrap text-pequeno leading-relaxed text-fg">{texto}</p>
        {peca.cta && <p className="mt-2 text-legenda text-fg-2">CTA: {peca.cta}</p>}
      </div>
      {peca.roteiroVisual && (
        <details className="mt-2 text-pequeno">
          <summary className="cursor-pointer font-semibold text-fg-2">Roteiro visual</summary>
          <p className="mt-1 whitespace-pre-wrap text-fg">{peca.roteiroVisual}</p>
        </details>
      )}
      {peca.variacoes.length > 0 && (
        <details className="mt-1 text-pequeno">
          <summary className="cursor-pointer font-semibold text-fg-2">Variações para teste A/B ({peca.variacoes.length})</summary>
          <ul className="mt-1 list-disc pl-4 text-fg">
            {peca.variacoes.map((v, i) => (
              <li key={i}>{v}</li>
            ))}
          </ul>
        </details>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button onClick={() => acao(() => navigator.clipboard.writeText(texto), "Texto copiado.")} className="rounded-lg px-2.5 py-1 text-legenda font-semibold ring-1 ring-line hover:bg-surface">
          Copiar texto
        </button>
        {peca.canal === "linkedin" && aprovada && (
          <a
            href={`https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(texto)}`}
            target="_blank"
            rel="noreferrer noopener"
            className="rounded-lg bg-[#0a66c2] px-2.5 py-1 text-legenda font-semibold text-white"
          >
            Abrir no LinkedIn
          </a>
        )}
        {!aprovada && !publicada && <span className="text-legenda text-fg-3">Publicar libera depois da sua aprovação.</span>}
      </div>

      {aprovada && (
        <div className="mt-3 flex items-center gap-1.5">
          <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Link do post publicado (opcional)" className="h-7 min-w-0 flex-1 rounded-lg bg-surface px-2 text-legenda ring-1 ring-line" />
          <button
            onClick={() => acao(() => api(`/api/pecas/${card.id}/publicado`, "POST", { link }), "Marcado como publicado.")}
            className="h-7 rounded-lg bg-ink px-2.5 text-legenda font-semibold text-on-ink"
          >
            Já publiquei
          </button>
        </div>
      )}

      {publicada && <Resultados peca={peca} />}
      {peca.link && (
        <a href={peca.link} target="_blank" rel="noreferrer noopener" className="mt-2 block text-legenda text-accent-fg underline">
          Ver o post publicado
        </a>
      )}
      {erro && <p className="mt-2 text-legenda text-danger-fg">{erro}</p>}
      {ok && <p className="mt-2 text-legenda text-success-fg">{ok}</p>}
    </section>
  );
}

function Resultados({ peca }: { peca: Peca }) {
  const campos: [keyof Peca["resultados"], string][] = [["impressoes", "Impressões"], ["cliques", "Cliques"], ["comentarios", "Comentários"], ["conversoes", "Conversões"]];
  return (
    <div className="mt-3 grid grid-cols-4 gap-1.5">
      {campos.map(([k, rotulo]) => (
        <label key={k} className="text-legenda text-fg-3">
          {rotulo}
          <input
            type="number"
            min={0}
            defaultValue={peca.resultados[k] ?? ""}
            onBlur={(e) => e.target.value !== "" && void api(`/api/pecas/${peca.cardId}`, "PUT", { resultados: { [k]: Number(e.target.value) } })}
            className="mt-0.5 h-7 w-full rounded-lg bg-surface px-1.5 text-pequeno text-fg ring-1 ring-line"
          />
        </label>
      ))}
    </div>
  );
}

/* ---------- Calendário editorial ---------- */

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export function CalendarioEditorial({ cards }: { cards: Card[] }) {
  const pecas = useStore((s) => s.pecas);
  const abrirCard = useStore((s) => s.abrirCard);
  const [mes, setMes] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const porDia = useMemo(() => {
    const m = new Map<string, { card: Card; peca?: Peca }[]>();
    for (const card of cards) {
      const p = pecas[card.id];
      const quando = p?.dataPublicacao ?? card.prazo;
      if (!quando) continue;
      const d = new Date(quando);
      const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      m.set(k, [...(m.get(k) ?? []), { card, peca: p }]);
    }
    return m;
  }, [cards, pecas]);
  const semData = cards.filter((c) => !(pecas[c.id]?.dataPublicacao ?? c.prazo));

  const inicio = new Date(mes);
  inicio.setDate(1 - inicio.getDay());
  const dias = Array.from({ length: 42 }, (_, i) => new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i));
  const hoje = new Date();
  const mudar = (n: number) => setMes(new Date(mes.getFullYear(), mes.getMonth() + n, 1));

  return (
    <div className="scroll-fino min-h-0 flex-1 overflow-y-auto p-3">
      <div className="mb-2 flex items-center gap-2">
        <button onClick={() => mudar(-1)} className="grid h-7 w-7 place-items-center rounded-lg ring-1 ring-line hover:bg-hover">
          ‹
        </button>
        <span className="w-40 text-center text-corpo font-bold capitalize">{mes.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</span>
        <button onClick={() => mudar(1)} className="grid h-7 w-7 place-items-center rounded-lg ring-1 ring-line hover:bg-hover">
          ›
        </button>
        <div className="flex-1" />
        {canaisPeca.slice(0, 6).map((c) => (
          <span key={c.id} className="flex items-center gap-1 text-legenda text-fg-2">
            <span className="h-2 w-2 rounded-full" style={{ background: c.cor }} />
            {c.nome}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {DIAS.map((d) => (
          <div key={d} className="px-1 text-legenda font-semibold uppercase text-fg-3">
            {d}
          </div>
        ))}
        {dias.map((d) => {
          const doMes = d.getMonth() === mes.getMonth();
          const ehHoje = d.toDateString() === hoje.toDateString();
          const itens = porDia.get(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`) ?? [];
          return (
            <div key={d.toISOString()} className={`min-h-24 rounded-lg p-1 ${doMes ? "bg-surface" : "bg-sunken"} ${ehHoje ? "ring-2 ring-ink" : "ring-1 ring-line"}`}>
              <div className={`mb-0.5 text-legenda ${doMes ? "text-fg-2" : "text-fg-disabled"}`}>{d.getDate()}</div>
              <div className="space-y-0.5">
                {itens.map(({ card, peca }) => (
                  <button
                    key={card.id}
                    onClick={() => abrirCard(card.id)}
                    className="block w-full truncate rounded px-1 py-0.5 text-left text-legenda font-medium text-white"
                    style={{ background: peca ? canal(peca.canal).cor : "#94a3b8", opacity: card.coluna === "publicado" ? 0.55 : 1 }}
                    title={`${card.chave} · ${card.titulo}`}
                  >
                    {card.coluna === "publicado" ? "✓ " : ""}
                    {peca?.dataPublicacao ? new Date(peca.dataPublicacao).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) + " " : ""}
                    {card.titulo}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {semData.length > 0 && (
        <p className="mt-2 text-legenda text-fg-3">
          Sem data: {semData.map((c) => c.chave).join(", ")} (abra o card para definir quando publicar).
        </p>
      )}
    </div>
  );
}
