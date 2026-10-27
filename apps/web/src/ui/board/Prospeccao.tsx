import { useEffect, useState } from "react";
import { camposLead, rotulosCampoLead, type Card, type Lead, type NaoContatar, type TipoNaoContatar } from "@empresa/shared";
import { useStore } from "../../store.ts";
import { api } from "../../api.ts";

// Prospecção (Fase 3): ficha do lead dentro do card, nova campanha, filtros do
// Comercial, exportação e lista de não contatar. O envio é sempre seu: o botão do
// WhatsApp abre a conversa com a mensagem pronta e o e-mail abre no seu programa de e-mail.

const soDigitos = (s: string) => s.replace(/\D/g, "");

/** Link do WhatsApp com a mensagem já escrita (número brasileiro com DDI 55). */
function linkWhatsapp(numero: string, mensagem: string) {
  let d = soDigitos(numero);
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  return `https://wa.me/${d}?text=${encodeURIComponent(mensagem)}`;
}

function useAcao() {
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const acao = async (fn: () => Promise<unknown>, msgOk?: string) => {
    setErro(null);
    setOk(null);
    try {
      await fn();
      if (msgOk) setOk(msgOk);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  };
  return { erro, ok, acao };
}

function Selo({ ok, sim, nao }: { ok: boolean | undefined; sim: string; nao: string }) {
  if (ok === undefined) return null;
  return <span className={`rounded-full px-1.5 py-0.5 text-legenda font-semibold ${ok ? "bg-success-soft text-success-fg" : "bg-danger-soft text-danger-fg"}`}>{ok ? sim : nao}</span>;
}

/* ---------- Ficha do lead (no detalhe do card) ---------- */

export function FichaLead({ card }: { card: Card }) {
  const lead = useStore((s) => s.leads[card.id]);
  const { erro, ok, acao } = useAcao();
  if (!lead) return null;
  const d = lead.dados;
  const c = lead.conferencia;
  const m = lead.mensagens;
  const numero = d.whatsapp?.valor ?? d.telefone?.valor;
  const posAprovacao = ["pronto-contato", "contatado", "respondeu", "reuniao", "proposta"].includes(card.coluna);
  const copiar = (t: string) => acao(() => navigator.clipboard.writeText(t), "Copiado.");

  return (
    <section className="mt-5 rounded-xl bg-sunken p-3">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="flex-1 text-legenda font-bold uppercase tracking-wide text-fg-3">Ficha do lead</h3>
        <span className={`rounded-full px-2 py-0.5 text-legenda font-bold ${lead.nota >= 80 ? "bg-success text-white" : lead.nota >= 50 ? "bg-warning text-white" : "bg-press"}`}>
          {lead.nota}/100
        </span>
      </div>
      {lead.motivoNota && <p className="mb-2 text-pequeno text-fg-2">{lead.motivoNota}</p>}

      <table className="w-full text-pequeno">
        <tbody>
          {camposLead
            .filter((k) => d[k])
            .map((k) => (
              <tr key={k} className="border-t border-line">
                <td className="w-32 py-1 pr-2 align-top text-fg-3">{rotulosCampoLead[k]}</td>
                <td className="py-1">
                  <span className="font-medium">{d[k]!.valor}</span>
                  <span className={`ml-1.5 rounded px-1 text-legenda ${d[k]!.confianca === "confirmado" ? "bg-success-soft text-success-fg" : "bg-warning-soft text-warning-fg"}`}>
                    {d[k]!.confianca}
                  </span>
                  {d[k]!.fonte && /^https?:\/\//.test(d[k]!.fonte) && (
                    <a href={d[k]!.fonte} target="_blank" rel="noreferrer noopener" className="ml-1.5 text-legenda text-fg-3 underline">
                      fonte
                    </a>
                  )}
                </td>
              </tr>
            ))}
        </tbody>
      </table>

      <div className="mt-2 flex flex-wrap gap-1">
        <Selo ok={c.emailValido} sim="e-mail válido" nao="e-mail inválido" />
        {c.emailValido && <Selo ok={c.emailDominioRecebe} sim="domínio recebe e-mail" nao="domínio não recebe e-mail" />}
        <Selo ok={c.telefoneValido} sim="telefone válido" nao="telefone inválido" />
        <Selo ok={c.siteNoAr} sim="site no ar" nao="site fora do ar" />
      </div>

      {lead.sinais.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-legenda font-semibold text-fg-3">Sinais de compra</div>
          <ul className="list-disc space-y-0.5 pl-4 text-pequeno text-fg">
            {lead.sinais.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3 space-y-2">
        <div className="text-legenda font-semibold text-fg-3">Mensagens {posAprovacao ? "" : "(o envio libera depois da sua aprovação)"}</div>
        {!m.whatsapp && !m.emailCorpo && !m.instagram && <p className="text-pequeno text-fg-3">A Copywriter ainda não escreveu as mensagens.</p>}
        {m.whatsapp && (
          <Mensagem titulo="WhatsApp" texto={m.whatsapp}>
            {numero && posAprovacao && (
              <a href={linkWhatsapp(numero, m.whatsapp)} target="_blank" rel="noreferrer noopener" className="rounded-lg bg-success px-2.5 py-1 text-legenda font-semibold text-white">
                Abrir no WhatsApp
              </a>
            )}
            <button onClick={() => copiar(m.whatsapp!)} className="rounded-lg px-2 py-1 text-legenda ring-1 ring-line hover:bg-surface">
              Copiar
            </button>
          </Mensagem>
        )}
        {m.emailCorpo && (
          <Mensagem titulo={`E-mail · ${m.emailAssunto ?? ""}`} texto={m.emailCorpo}>
            {d.email && posAprovacao && (
              <a
                href={`mailto:${d.email.valor}?subject=${encodeURIComponent(m.emailAssunto ?? "")}&body=${encodeURIComponent(m.emailCorpo)}`}
                className="rounded-lg bg-ink px-2.5 py-1 text-legenda font-semibold text-on-ink"
              >
                Abrir no e-mail
              </a>
            )}
            <button onClick={() => copiar(`${m.emailAssunto ?? ""}\n\n${m.emailCorpo}`)} className="rounded-lg px-2 py-1 text-legenda ring-1 ring-line hover:bg-surface">
              Copiar
            </button>
          </Mensagem>
        )}
        {m.instagram && (
          <Mensagem titulo="Direct do Instagram" texto={m.instagram}>
            <button onClick={() => copiar(m.instagram!)} className="rounded-lg px-2 py-1 text-legenda ring-1 ring-line hover:bg-surface">
              Copiar
            </button>
          </Mensagem>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {posAprovacao && card.coluna === "pronto-contato" && (
          <button
            onClick={() => acao(() => api(`/api/leads/${card.id}/contatado`, "POST", { canal: numero ? "WhatsApp" : "e-mail" }), "Movido para Contatado.")}
            className="rounded-lg bg-ink px-3 py-1.5 text-legenda font-semibold text-on-ink"
          >
            Já entrei em contato
          </button>
        )}
        <button
          onClick={() => {
            const motivo = prompt("Motivo (ex.: pediu para não receber mais mensagens):", "Pediu para não ser contatado");
            if (motivo !== null) void acao(() => api(`/api/leads/${card.id}/nao-contatar`, "POST", { motivo }), "Na lista de não contatar.");
          }}
          className="rounded-lg px-3 py-1.5 text-legenda font-semibold text-danger-fg ring-1 ring-danger hover:bg-danger-soft"
        >
          Não contatar mais
        </button>
        {erro && <span className="text-legenda text-danger-fg">{erro}</span>}
        {ok && <span className="text-legenda text-success-fg">{ok}</span>}
      </div>
    </section>
  );
}

function Mensagem({ titulo, texto, children }: { titulo: string; texto: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-surface p-2.5 ring-1 ring-line">
      <div className="mb-1 flex items-center gap-1.5">
        <span className="flex-1 truncate text-legenda font-semibold text-fg-2">{titulo}</span>
        {children}
      </div>
      <p className="whitespace-pre-wrap text-pequeno leading-relaxed text-fg">{texto}</p>
    </div>
  );
}
