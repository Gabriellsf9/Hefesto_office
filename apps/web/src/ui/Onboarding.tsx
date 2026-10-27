import { useEffect, useState } from "react";
import type { StatusResponse } from "@empresa/shared";
import { agents } from "@empresa/org";
import { useStore } from "../store.ts";

/**
 * Pede a chave da API da Anthropic. Ela vai direto para o servidor local, que valida,
 * cifra e guarda; o navegador nunca recebe a chave de volta, só uma dica (sk-ant-…a1b2).
 */
export function Onboarding() {
  const chaveConfigurada = useStore((s) => s.chaveConfigurada);
  const configAberta = useStore((s) => s.configAberta);
  const setConfigAberta = useStore((s) => s.setConfigAberta);
  const setChaveConfigurada = useStore((s) => s.setChaveConfigurada);

  const [pulou, setPulou] = useState(false);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [chave, setChave] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const aberto = configAberta || (chaveConfigurada === false && !pulou);

  useEffect(() => {
    if (!aberto) return;
    fetch("/api/status")
      .then((r) => r.json() as Promise<StatusResponse>)
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [aberto, chaveConfigurada]);

  if (!aberto) return null;

  const fechar = () => {
    setConfigAberta(false);
    setPulou(true);
    setErro(null);
    setChave("");
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      const res = await fetch("/api/key", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey: chave }),
      });
      const body = (await res.json()) as StatusResponse & { erro?: string };
      if (!res.ok) throw new Error(body.erro ?? "Não foi possível salvar a chave.");
      setChaveConfigurada(true);
      fechar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
    } finally {
      setSalvando(false);
    }
  };

  const remover = async () => {
    await fetch("/api/key", { method: "DELETE" });
    setChaveConfigurada(false);
    setStatus({ chaveConfigurada: false, dicaChave: null });
  };

  return (
    <div className="pointer-events-auto absolute inset-0 z-50 grid place-items-center bg-ink/35 p-4 backdrop-blur-sm">
      <form onSubmit={salvar} className="painel w-full max-w-md bg-surface p-6">
        <div className="mb-4 flex items-center gap-3">
          <img src="/hefesto.svg" alt="Hefesto" className="h-10 w-10" />
          <div>
            <h1 className="text-secao font-bold">Bem-vindo à sua empresa</h1>
            <p className="text-pequeno text-fg-2">{agents.length} agentes de IA esperando o primeiro pedido do CEO.</p>
          </div>
        </div>

        {status?.chaveConfigurada && (
          <div className="mb-4 flex items-center justify-between rounded-lg bg-success-soft px-3 py-2 text-pequeno text-success-fg">
            <span>
              Chave salva: <code className="font-mono">{status.dicaChave}</code>
            </span>
            <button type="button" onClick={remover} className="font-semibold text-danger-fg hover:underline">
              Remover
            </button>
          </div>
        )}

        <label className="mb-1 block text-pequeno font-semibold">
          {status?.chaveConfigurada ? "Trocar a chave da API da Anthropic" : "Chave da API da Anthropic"}
        </label>
        <input
          type="password"
          value={chave}
          onChange={(e) => setChave(e.target.value)}
          placeholder="sk-ant-…"
          autoComplete="off"
          className="h-10 w-full rounded-lg px-3 font-mono text-corpo ring-1 ring-line-strong outline-none focus:ring-2 focus:ring-ink"
        />
        <p className="mt-2 text-legenda leading-relaxed text-fg-3">
          A chave fica só no seu computador, cifrada, e nunca volta para o navegador. Os agentes só passam a usá-la na
          Fase 2. Crie uma em console.anthropic.com.
        </p>
        {erro && <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-pequeno text-danger-fg">{erro}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={fechar} className="rounded-lg px-4 py-2 text-corpo text-fg-2 hover:bg-hover">
            {status?.chaveConfigurada ? "Fechar" : "Agora não"}
          </button>
          <button
            type="submit"
            disabled={salvando || !chave.trim()}
            className="rounded-lg bg-ink px-4 py-2 text-corpo font-semibold text-on-ink disabled:opacity-30"
          >
            {salvando ? "Validando…" : "Salvar chave"}
          </button>
        </div>
      </form>
    </div>
  );
}
