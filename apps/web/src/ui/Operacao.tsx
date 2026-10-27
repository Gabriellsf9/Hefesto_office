import { useState } from "react";
import { useStore } from "../store.ts";
import { api } from "../api.ts";

// Rotina → Operação (Fase 6): monitoramento dos seus sites (o SRE avisa no chat e abre incidente)
// e a calculadora do Simples Nacional (a mesma que o Contador usa).

function useAcao() {
  const [erro, setErro] = useState<string | null>(null);
  const acao = async (fn: () => Promise<unknown>) => {
    setErro(null);
    try {
      await fn();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  };
  return { erro, acao };
}

export function AbaOperacao() {
  return (
    <div className="space-y-6">
      <Monitoramento />
      <CalculadoraSimples />
    </div>
  );
}

export function Monitoramento() {
  const monitores = useStore((s) => s.monitores);
  const [url, setUrl] = useState("");
  const { erro, acao } = useAcao();
  return (
    <section>
      <h3 className="text-corpo font-bold">Monitoramento dos seus sites</h3>
      <p className="mb-3 text-pequeno text-fg-2">
        A Priscila (SRE) checa a cada 5 minutos: se cair (2 falhas seguidas), avisa no chat e abre um incidente; avisa também quando o certificado TLS está a 15 dias de vencer.
      </p>
      <div className="mb-3 flex gap-2">
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://seusite.com.br" className="campo flex-1" />
        <button
          disabled={!url.trim()}
          onClick={() => acao(async () => {
            await api("/api/monitores", "POST", { url });
            setUrl("");
          })}
          className="rounded-lg bg-ink px-3 text-pequeno font-semibold text-on-ink disabled:opacity-30"
        >
          Monitorar
        </button>
        {monitores.length > 0 && (
          <button onClick={() => acao(() => api("/api/monitores/checar", "POST"))} className="rounded-lg px-3 text-pequeno ring-1 ring-line hover:bg-hover">
            Checar agora
          </button>
        )}
      </div>
      {erro && <p className="mb-2 text-pequeno text-danger-fg">{erro}</p>}
      {!monitores.length ? (
        <p className="rounded-xl border border-dashed border-line py-6 text-center text-pequeno text-fg-3">Nenhum site monitorado.</p>
      ) : (
        <ul className="space-y-1.5">
          {monitores.map((m) => (
            <li key={m.id} className="flex items-center gap-3 rounded-xl px-3 py-2 text-pequeno ring-1 ring-line">
              <span className={`h-2.5 w-2.5 rounded-full ${m.status === "fora" ? "bg-danger" : m.status === "ok" ? "bg-success" : "bg-fg-disabled"}`} />
              <span className="flex-1 truncate font-medium">{m.url}</span>
              <span className="text-fg-3">{m.codigoHttp ?? "—"}</span>
              <span className="w-16 text-right text-fg-3">{m.ms !== null ? `${m.ms} ms` : "—"}</span>
              <span className={`w-28 text-right ${m.diasCertificado !== null && m.diasCertificado <= 15 ? "font-semibold text-warning-fg" : "text-fg-3"}`}>
                {m.diasCertificado !== null ? `certificado: ${m.diasCertificado} d` : "—"}
              </span>
              <span className="w-24 text-right text-legenda text-fg-3">{m.verificadoEm ? new Date(m.verificadoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—"}</span>
              <button onClick={() => acao(() => api(`/api/monitores/${m.id}`, "DELETE"))} className="text-fg-disabled hover:text-danger-fg" aria-label="Parar de monitorar">
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

interface Simples {
  fatorR: number;
  anexo: "III" | "V";
  faixa: number;
  aliquotaEfetiva: number;
  dasMes: number;
  comparacao: { anexoIII: number; anexoV: number };
  avisos: string[];
}

export function CalculadoraSimples() {
  const [receita12m, setReceita12m] = useState("");
  const [folha12m, setFolha12m] = useState("");
  const [receitaMes, setReceitaMes] = useState("");
  const [r, setR] = useState<Simples | null>(null);
  const { erro, acao } = useAcao();
  const reais = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const pct = (n: number) => `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
  const num = (s: string) => s.replace(/\./g, "").replace(",", ".");
  return (
    <section>
      <h3 className="text-corpo font-bold">Simples Nacional (serviços de software)</h3>
      <p className="mb-3 text-pequeno text-fg-2">Fator R, anexo III ou V e DAS estimado do mês. Estimativa para planejar: o contador responsável confere.</p>
      <div className="grid grid-cols-3 gap-2 text-pequeno">
        <label>
          <span className="mb-1 block text-fg-2">Receita dos últimos 12 meses (R$)</span>
          <input value={receita12m} onChange={(e) => setReceita12m(e.target.value)} inputMode="decimal" className="campo" placeholder="360000" />
        </label>
        <label>
          <span className="mb-1 block text-fg-2">Folha + pró-labore 12 meses (R$)</span>
          <input value={folha12m} onChange={(e) => setFolha12m(e.target.value)} inputMode="decimal" className="campo" placeholder="60000" />
        </label>
        <label>
          <span className="mb-1 block text-fg-2">Receita do mês (R$)</span>
          <input value={receitaMes} onChange={(e) => setReceitaMes(e.target.value)} inputMode="decimal" className="campo" placeholder="30000" />
        </label>
      </div>
      <button
        disabled={!receita12m || !receitaMes}
        onClick={() => acao(async () => setR(await api<Simples>(`/api/financas/simples?receita12m=${num(receita12m)}&folha12m=${num(folha12m || "0")}&receitaMes=${num(receitaMes)}`)))}
        className="mt-2 rounded-lg bg-ink px-3 py-1.5 text-pequeno font-semibold text-on-ink disabled:opacity-30"
      >
        Calcular
      </button>
      {erro && <p className="mt-2 text-pequeno text-danger-fg">{erro}</p>}
      {r && (
        <div className="mt-3 rounded-xl bg-sunken p-3 text-pequeno">
          <div className="text-corpo">
            <b>DAS estimado: {reais(r.dasMes)}</b> · Anexo {r.anexo}, faixa {r.faixa}, alíquota efetiva {pct(r.aliquotaEfetiva)} · Fator R {pct(r.fatorR)}
          </div>
          <div className="mt-1 text-fg-2">
            No Anexo III seria {reais(r.comparacao.anexoIII)}; no Anexo V, {reais(r.comparacao.anexoV)}.
          </div>
          <ul className="mt-2 list-disc pl-4 text-fg-2">
            {r.avisos.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/* ---------- Conquistas (Fase 7) ---------- */

export function AbaConquistas() {
  const conquistas = useStore((s) => s.conquistas);
  const feitas = conquistas.filter((c) => c.em).length;
  return (
    <section>
      <h3 className="text-corpo font-bold">Conquistas da empresa</h3>
      <p className="mb-3 text-pequeno text-fg-2">
        {feitas} de {conquistas.length} desbloqueadas. Cada uma vem do que a empresa fez de verdade.
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        {conquistas.map((c) => (
          <div key={c.id} className={`rounded-xl p-3 ring-1 ${c.em ? "bg-warning-soft ring-warning" : "bg-sunken ring-line"}`}>
            <div className={`text-2xl ${c.em ? "" : "opacity-30 grayscale"}`}>{c.icone}</div>
            <div className={`mt-1 text-pequeno font-bold ${c.em ? "" : "text-fg-3"}`}>{c.nome}</div>
            <div className="text-legenda text-fg-2">{c.descricao}</div>
            {c.em && <div className="mt-1 text-legenda text-warning-fg">{new Date(c.em).toLocaleDateString("pt-BR")}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}
