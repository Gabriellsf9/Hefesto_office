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
  return <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{ok ? sim : nao}</span>;
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
    <section className="mt-5 rounded-xl bg-black/[0.03] p-3">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="flex-1 text-[11px] font-bold uppercase tracking-wide text-black/50">Ficha do lead</h3>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${lead.nota >= 80 ? "bg-emerald-600 text-white" : lead.nota >= 50 ? "bg-amber-500 text-white" : "bg-black/10"}`}>
          {lead.nota}/100
        </span>
      </div>
      {lead.motivoNota && <p className="mb-2 text-xs text-black/60">{lead.motivoNota}</p>}

      <table className="w-full text-xs">
        <tbody>
          {camposLead
            .filter((k) => d[k])
            .map((k) => (
              <tr key={k} className="border-t border-black/5">
                <td className="w-32 py-1 pr-2 align-top text-black/45">{rotulosCampoLead[k]}</td>
                <td className="py-1">
                  <span className="font-medium">{d[k]!.valor}</span>
                  <span className={`ml-1.5 rounded px-1 text-[10px] ${d[k]!.confianca === "confirmado" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                    {d[k]!.confianca}
                  </span>
                  {d[k]!.fonte && /^https?:\/\//.test(d[k]!.fonte) && (
                    <a href={d[k]!.fonte} target="_blank" rel="noreferrer noopener" className="ml-1.5 text-[10px] text-black/40 underline">
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
          <div className="mb-1 text-[11px] font-semibold text-black/50">Sinais de compra</div>
          <ul className="list-disc space-y-0.5 pl-4 text-xs text-black/75">
            {lead.sinais.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3 space-y-2">
        <div className="text-[11px] font-semibold text-black/50">Mensagens {posAprovacao ? "" : "(o envio libera depois da sua aprovação)"}</div>
        {!m.whatsapp && !m.emailCorpo && !m.instagram && <p className="text-xs text-black/45">A Copywriter ainda não escreveu as mensagens.</p>}
        {m.whatsapp && (
          <Mensagem titulo="WhatsApp" texto={m.whatsapp}>
            {numero && posAprovacao && (
              <a href={linkWhatsapp(numero, m.whatsapp)} target="_blank" rel="noreferrer noopener" className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white">
                Abrir no WhatsApp
              </a>
            )}
            <button onClick={() => copiar(m.whatsapp!)} className="rounded-lg px-2 py-1 text-[11px] ring-1 ring-black/10 hover:bg-white">
              Copiar
            </button>
          </Mensagem>
        )}
        {m.emailCorpo && (
          <Mensagem titulo={`E-mail · ${m.emailAssunto ?? ""}`} texto={m.emailCorpo}>
            {d.email && posAprovacao && (
              <a
                href={`mailto:${d.email.valor}?subject=${encodeURIComponent(m.emailAssunto ?? "")}&body=${encodeURIComponent(m.emailCorpo)}`}
                className="rounded-lg bg-[#1f2430] px-2.5 py-1 text-[11px] font-semibold text-white"
              >
                Abrir no e-mail
              </a>
            )}
            <button onClick={() => copiar(`${m.emailAssunto ?? ""}\n\n${m.emailCorpo}`)} className="rounded-lg px-2 py-1 text-[11px] ring-1 ring-black/10 hover:bg-white">
              Copiar
            </button>
          </Mensagem>
        )}
        {m.instagram && (
          <Mensagem titulo="Direct do Instagram" texto={m.instagram}>
            <button onClick={() => copiar(m.instagram!)} className="rounded-lg px-2 py-1 text-[11px] ring-1 ring-black/10 hover:bg-white">
              Copiar
            </button>
          </Mensagem>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {posAprovacao && card.coluna === "pronto-contato" && (
          <button
            onClick={() => acao(() => api(`/api/leads/${card.id}/contatado`, "POST", { canal: numero ? "WhatsApp" : "e-mail" }), "Movido para Contatado.")}
            className="rounded-lg bg-[#1f2430] px-3 py-1.5 text-[11px] font-semibold text-white"
          >
            Já entrei em contato
          </button>
        )}
        <button
          onClick={() => {
            const motivo = prompt("Motivo (ex.: pediu para não receber mais mensagens):", "Pediu para não ser contatado");
            if (motivo !== null) void acao(() => api(`/api/leads/${card.id}/nao-contatar`, "POST", { motivo }), "Na lista de não contatar.");
          }}
          className="rounded-lg px-3 py-1.5 text-[11px] font-semibold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-50"
        >
          Não contatar mais
        </button>
        {erro && <span className="text-[11px] text-rose-600">{erro}</span>}
        {ok && <span className="text-[11px] text-emerald-700">{ok}</span>}
      </div>
    </section>
  );
}

function Mensagem({ titulo, texto, children }: { titulo: string; texto: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-white p-2.5 ring-1 ring-black/5">
      <div className="mb-1 flex items-center gap-1.5">
        <span className="flex-1 truncate text-[11px] font-semibold text-black/60">{titulo}</span>
        {children}
      </div>
      <p className="whitespace-pre-wrap text-xs leading-relaxed text-black/80">{texto}</p>
    </div>
  );
}

/* ---------- Barra do Comercial no board ---------- */

export interface FiltroLeads {
  cidade: string;
  notaMin: number;
}

export function filtrarLead(card: Card, lead: Lead | undefined, f: FiltroLeads) {
  if (card.tipo !== "lead" || !lead) return !f.cidade && !f.notaMin;
  if (f.notaMin && lead.nota < f.notaMin) return false;
  if (f.cidade && !(lead.dados.cidade?.valor ?? "").toLowerCase().includes(f.cidade.toLowerCase())) return false;
  return true;
}

export function BarraComercial({ filtro, setFiltro }: { filtro: FiltroLeads; setFiltro: (f: FiltroLeads) => void }) {
  const [novaAberta, setNovaAberta] = useState(false);
  const [listaAberta, setListaAberta] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-black/5 bg-amber-50/40 px-4 py-2 text-[11px]">
      <span className="font-semibold text-black/55">Prospecção</span>
      <button onClick={() => setNovaAberta(true)} className="h-7 rounded-lg bg-[#1f2430] px-2.5 font-semibold text-white">
        + Nova prospecção
      </button>
      <input
        value={filtro.cidade}
        onChange={(e) => setFiltro({ ...filtro, cidade: e.target.value })}
        placeholder="Cidade…"
        className="h-7 w-28 rounded-lg bg-black/5 px-2 outline-none"
      />
      <select value={filtro.notaMin} onChange={(e) => setFiltro({ ...filtro, notaMin: Number(e.target.value) })} className="h-7 rounded-lg bg-black/5 px-1.5 outline-none">
        <option value={0}>Qualquer nota</option>
        <option value={50}>Nota ≥ 50</option>
        <option value={70}>Nota ≥ 70</option>
        <option value={85}>Nota ≥ 85</option>
      </select>
      <a href="/api/leads.csv" className="h-7 rounded-lg bg-black/5 px-2.5 leading-7 text-black/70 hover:bg-black/10">
        Exportar CSV
      </a>
      <button onClick={() => setListaAberta(true)} className="h-7 rounded-lg bg-black/5 px-2.5 text-black/70 hover:bg-black/10">
        Lista de não contatar
      </button>
      {novaAberta && <NovaProspeccao fechar={() => setNovaAberta(false)} />}
      {listaAberta && <ListaNaoContatar fechar={() => setListaAberta(false)} />}
    </div>
  );
}

export function Modal({ titulo, fechar, children }: { titulo: string; fechar: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[1100] grid place-items-center bg-[#1f2430]/35 p-4" onClick={fechar}>
      <div className="w-[min(560px,100%)] rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center">
          <h3 className="flex-1 text-base font-bold">{titulo}</h3>
          <button onClick={fechar} className="grid h-7 w-7 place-items-center rounded-full text-black/50 hover:bg-black/5" aria-label="Fechar">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function NovaProspeccao({ fechar }: { fechar: () => void }) {
  const [produto, setProduto] = useState("");
  const [clienteIdeal, setClienteIdeal] = useState("");
  const [regiao, setRegiao] = useState("");
  const [quantidade, setQuantidade] = useState(10);
  const { erro, acao } = useAcao();
  return (
    <Modal titulo="Nova prospecção" fechar={fechar}>
      <div className="space-y-2.5 text-xs">
        <label className="block">
          <span className="mb-1 block font-semibold text-black/60">O que vamos vender</span>
          <textarea value={produto} onChange={(e) => setProduto(e.target.value)} rows={2} className="campo" placeholder="Ex.: software de agenda online para clínicas veterinárias, R$ 149/mês" />
        </label>
        <label className="block">
          <span className="mb-1 block font-semibold text-black/60">Cliente ideal</span>
          <textarea value={clienteIdeal} onChange={(e) => setClienteIdeal(e.target.value)} rows={2} className="campo" placeholder="Ex.: clínicas com 2 a 10 veterinários, agendam pelo WhatsApp, sem agendamento online no site" />
        </label>
        <div className="flex gap-2">
          <label className="block flex-1">
            <span className="mb-1 block font-semibold text-black/60">Região</span>
            <input value={regiao} onChange={(e) => setRegiao(e.target.value)} className="campo" placeholder="Ex.: Campinas – SP" />
          </label>
          <label className="block w-28">
            <span className="mb-1 block font-semibold text-black/60">Quantidade</span>
            <input type="number" min={1} max={40} value={quantidade} onChange={(e) => setQuantidade(Number(e.target.value))} className="campo" />
          </label>
        </div>
        <p className="text-[11px] leading-relaxed text-black/50">
          O Daniel (SDR) pesquisa só dados públicos e profissionais, com a fonte de cada um. A Tatiane escreve as mensagens, a Aline valida e você aprova antes de qualquer contato. Ninguém da equipe envia nada sozinho.
        </p>
        {erro && <p className="text-rose-600">{erro}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={fechar} className="rounded-lg px-3 py-2 text-black/60 hover:bg-black/5">
            Cancelar
          </button>
          <button
            disabled={!produto.trim() || !clienteIdeal.trim() || !regiao.trim()}
            onClick={() => acao(async () => {
              await api("/api/prospeccao", "POST", { produto, clienteIdeal, regiao, quantidade });
              fechar();
            })}
            className="rounded-lg bg-[#1f2430] px-4 py-2 font-semibold text-white disabled:opacity-30"
          >
            Começar
          </button>
        </div>
      </div>
    </Modal>
  );
}

const tiposBloqueio: { id: TipoNaoContatar; nome: string }[] = [
  { id: "email", nome: "E-mail" },
  { id: "telefone", nome: "Telefone" },
  { id: "dominio", nome: "Site/domínio" },
  { id: "cnpj", nome: "CNPJ" },
  { id: "nome", nome: "Nome da empresa" },
];

function ListaNaoContatar({ fechar }: { fechar: () => void }) {
  const [lista, setLista] = useState<NaoContatar[]>([]);
  const [tipo, setTipo] = useState<TipoNaoContatar>("email");
  const [valor, setValor] = useState("");
  const { erro, acao } = useAcao();
  useEffect(() => void api<NaoContatar[]>("/api/nao-contatar").then(setLista).catch(() => setLista([])), []);
  return (
    <Modal titulo="Lista de não contatar" fechar={fechar}>
      <p className="mb-3 text-[11px] text-black/55">A equipe consulta esta lista sempre: quem está aqui não vira lead e não recebe mensagem (LGPD).</p>
      <div className="mb-3 flex gap-2 text-xs">
        <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoNaoContatar)} className="campo w-36">
          {tiposBloqueio.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nome}
            </option>
          ))}
        </select>
        <input value={valor} onChange={(e) => setValor(e.target.value)} className="campo flex-1" placeholder="Valor" />
        <button
          disabled={!valor.trim()}
          onClick={() => acao(async () => {
            setLista(await api<NaoContatar[]>("/api/nao-contatar", "POST", { tipo, valor, motivo: "Adicionado pelo CEO" }));
            setValor("");
          })}
          className="rounded-lg bg-[#1f2430] px-3 font-semibold text-white disabled:opacity-30"
        >
          Adicionar
        </button>
      </div>
      {erro && <p className="mb-2 text-xs text-rose-600">{erro}</p>}
      <ul className="scroll-fino max-h-72 space-y-1 overflow-y-auto text-xs">
        {!lista.length && <li className="py-6 text-center text-black/40">Ninguém na lista.</li>}
        {lista.map((n) => (
          <li key={n.id} className="flex items-center gap-2 rounded-lg bg-black/[0.03] px-2 py-1.5">
            <span className="w-24 text-black/45">{tiposBloqueio.find((t) => t.id === n.tipo)?.nome}</span>
            <span className="flex-1 font-medium">{n.valor}</span>
            <span className="text-[10px] text-black/40">{n.motivo}</span>
            <button onClick={() => acao(async () => setLista(await api<NaoContatar[]>(`/api/nao-contatar/${n.id}`, "DELETE")))} className="text-black/40 hover:text-rose-600" aria-label="Remover">
              ✕
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
