import { useEffect, useMemo, useState } from "react";
import { agentById } from "@empresa/org";
import { useStore } from "../store.ts";
import { api } from "../api.ts";
import { Avatarzinho } from "./SidePanel.tsx";

// Navegador dos agentes: assista ao vivo o que cada agente está fazendo no Chrome do sistema
// (um print por ação, o endereço e o histórico). Feche uma sessão quando quiser.
// Celulares de teste (iPhone no Simulador, Android no emulador) aparecem aqui também, com 📱.

/** Card real da sessão (no celular, cardId é negativo para não colidir com o navegador do mesmo card). */
const cardDa = (s: { cardId: number; dispositivo?: { cardId: number } }) => s.dispositivo?.cardId ?? s.cardId;

export function BotaoNavegador() {
  const ativas = useStore((s) => Object.values(s.navegador).filter((n) => n.ativa).length);
  return (
    <button
      onClick={() => useStore.setState({ navegadorAberto: true })}
      className={`relative grid h-8 w-8 shrink-0 place-items-center rounded-lg ring-1 ${ativas ? "bg-sky-50 text-sky-700 ring-sky-200" : "text-black/60 ring-black/10 hover:bg-black/5"}`}
      title={ativas ? `${ativas} sessão(ões) do navegador dos agentes ao vivo` : "Navegador dos agentes"}
      aria-label="Navegador dos agentes"
    >
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="10" cy="10" r="7.5" />
        <path d="M2.5 10h15M10 2.5c2.2 2.4 2.2 12.6 0 15M10 2.5c-2.2 2.4-2.2 12.6 0 15" />
      </svg>
      {ativas > 0 && <span className="pulsar absolute -right-1 -top-1 rounded-full bg-sky-600 px-1 text-[9px] font-bold text-white">{ativas}</span>}
    </button>
  );
}

export function PainelNavegador() {
  const aberto = useStore((s) => s.navegadorAberto);
  const porCard = useStore((s) => s.navegador);
  const sessoes = useMemo(() => Object.values(porCard).sort((a, b) => Number(b.ativa) - Number(a.ativa) || b.atualizadoEm - a.atualizadoEm), [porCard]);
  const cards = useStore((s) => s.cards);
  const [foco, setFoco] = useState<number | null>(null);
  useEffect(() => {
    if (aberto && foco === null && sessoes[0]) setFoco(sessoes[0].cardId);
  }, [aberto, foco, sessoes]);
  useEffect(() => {
    if (!aberto) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && useStore.setState({ navegadorAberto: false });
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [aberto]);
  if (!aberto) return null;
  const atual = sessoes.find((s) => s.cardId === foco) ?? sessoes[0];
  const fechar = () => useStore.setState({ navegadorAberto: false });

  return (
    <div className="pointer-events-auto absolute inset-0 z-40 grid place-items-center bg-[#1f2430]/35 p-4 backdrop-blur-sm" onClick={fechar}>
      <div className="flex h-[min(780px,100%)] w-[min(1180px,100%)] overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5" onClick={(e) => e.stopPropagation()}>
        <nav className="scroll-fino w-64 shrink-0 overflow-y-auto border-r border-black/5 bg-black/[0.02] p-3">
          <div className="px-1 pb-2 text-sm font-bold">Navegador dos agentes</div>
          {!sessoes.length && <p className="px-1 text-xs text-black/45">Quando um agente abrir um site ou ligar um celular de teste, a tela aparece aqui ao vivo.</p>}
          {sessoes.map((s) => {
            const a = agentById[s.agenteId];
            return (
              <button
                key={s.cardId}
                onClick={() => setFoco(s.cardId)}
                className={`mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs ${atual?.cardId === s.cardId ? "bg-[#1f2430] text-white" : "hover:bg-black/5"}`}
              >
                {a && <Avatarzinho agent={a} />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">
                    {s.dispositivo ? "📱 " : ""}
                    {a?.nome ?? s.agenteId} · {cards[cardDa(s)]?.chave ?? `EMP-${cardDa(s)}`}
                  </span>
                  <span className={`block truncate text-[10px] ${atual?.cardId === s.cardId ? "text-white/60" : "text-black/45"}`}>{s.url}</span>
                </span>
                <span className={`h-2 w-2 shrink-0 rounded-full ${s.ativa ? "pulsar bg-emerald-500" : "bg-black/20"}`} />
              </button>
            );
          })}
        </nav>
        <section className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center gap-2 border-b border-black/5 px-4 py-2.5">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-black/[0.04] px-3 py-1.5 text-xs">
              {atual?.dispositivo && (
                <span className="rounded bg-violet-100 px-1.5 text-[10px] font-semibold text-violet-800">{atual.dispositivo.plataforma === "ios" ? "iPhone" : "Android"}</span>
              )}
              {atual?.modo && (
                <span className={`rounded px-1.5 text-[10px] font-semibold ${atual.modo === "teste" ? "bg-emerald-100 text-emerald-800" : "bg-sky-100 text-sky-800"}`}>
                  {atual.modo === "teste" ? "teste" : "internet"}
                </span>
              )}
              <span className="truncate font-mono text-black/70">{atual?.url ?? "—"}</span>
            </div>
            {atual && (
              <button onClick={() => useStore.getState().abrirCard(cardDa(atual))} className="rounded-lg px-2.5 py-1.5 text-[11px] ring-1 ring-black/10 hover:bg-black/5">
                Abrir card
              </button>
            )}
            {atual?.ativa && (
              <button
                onClick={() => api(atual.dispositivo ? `/api/celular/${cardDa(atual)}/desligar` : `/api/navegador/${atual.cardId}/fechar`, "POST")}
                className="rounded-lg px-2.5 py-1.5 text-[11px] text-rose-700 ring-1 ring-rose-200 hover:bg-rose-50"
              >
                {atual.dispositivo ? "Desligar aparelho" : "Fechar sessão"}
              </button>
            )}
            <button onClick={fechar} className="grid h-8 w-8 place-items-center rounded-full text-black/50 hover:bg-black/5" aria-label="Fechar">
              ✕
            </button>
          </header>
          <div className="flex min-h-0 flex-1">
            <div className="grid min-w-0 flex-1 place-items-center overflow-auto bg-[#eef0f3] p-3">
              {atual?.imagem ? (
                <img src={atual.imagem} alt={`Tela de ${atual.titulo}`} className="max-h-full max-w-full rounded-lg shadow-md ring-1 ring-black/10" />
              ) : (
                <span className="text-xs text-black/40">Sem tela ainda.</span>
              )}
            </div>
            <ol className="scroll-fino w-64 shrink-0 space-y-1 overflow-y-auto border-l border-black/5 p-3 text-[11px]">
              {[...(atual?.acoes ?? [])].reverse().map((a, i) => (
                <li key={i} className={`rounded-lg px-2 py-1 ${a.ok ? "bg-black/[0.03]" : "bg-rose-50 text-rose-800"}`}>
                  <span className="font-semibold">{a.acao}</span>
                  <span className="ml-1 text-black/40">{new Date(a.ts).toLocaleTimeString("pt-BR")}</span>
                  <div className="break-all text-black/60">{a.detalhe}</div>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </div>
    </div>
  );
}

/** Menu ⋯: liberdade na internet e sites de teste (interação completa). */
export function ConfigNavegador() {
  const [externoLivre, setExternoLivre] = useState(true);
  const [sites, setSites] = useState("");
  const [ok, setOk] = useState(false);
  useEffect(() => {
    void api<{ sites: string[]; externoLivre: boolean }>("/api/navegador/config").then((c) => {
      setExternoLivre(c.externoLivre);
      setSites(c.sites.join("\n"));
    });
  }, []);
  return (
    <div className="space-y-1.5 rounded-xl bg-black/[0.03] p-2.5 text-[11px] text-black/65">
      <div className="font-semibold text-black/80">Navegador dos agentes</div>
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={externoLivre}
          onChange={(e) => {
            setExternoLivre(e.target.checked);
            void api("/api/navegador/config", "PUT", { externoLivre: e.target.checked });
          }}
          className="mt-0.5"
        />
        <span>Liberdade total na internet (clicar, preencher, enviar). Desligado: só ler e seguir links.</span>
      </label>
      <div>Sites de teste (um por linha):</div>
      <textarea
        value={sites}
        onChange={(e) => {
          setSites(e.target.value);
          setOk(false);
        }}
        rows={2}
        placeholder="staging.minhaempresa.com.br"
        className="w-full rounded-lg bg-white p-1.5 font-mono text-[10px] ring-1 ring-black/10"
      />
      <button
        onClick={async () => {
          await api("/api/navegador/sites", "PUT", { sites: sites.split("\n").map((s) => s.trim()).filter(Boolean) });
          setOk(true);
        }}
        className="rounded-md px-2 py-0.5 font-semibold ring-1 ring-black/10 hover:bg-white"
      >
        {ok ? "Salvo ✓" : "Salvar sites"}
      </button>
      <p className="text-[10px] text-black/45">Sempre: Chrome limpo (sem seus logins), sem downloads, sem rede interna nem arquivos do Mac.</p>
    </div>
  );
}
