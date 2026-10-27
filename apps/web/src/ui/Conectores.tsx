import { useEffect, useState } from "react";
import type { PoliticaMcp, PresetMcp, RoomId, ServidorMcp } from "@empresa/shared";
import { agentById, rooms } from "@empresa/org";
import { useStore } from "../store.ts";
import { api } from "../api.ts";

// Conectores MCP: catálogo (GitHub, Stripe, Google, Notion, personalizado), salas liberadas,
// política de cada ferramenta e os pedidos de ação esperando você.

const salasComEquipe = rooms.filter((r) => r.id !== "reuniao");

function useAcao() {
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const acao = async (fn: () => Promise<unknown>) => {
    setErro(null);
    setOcupado(true);
    try {
      await fn();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  };
  return { erro, ocupado, acao };
}

const corStatus: Record<ServidorMcp["status"], string> = { conectado: "bg-emerald-500", autorizar: "bg-amber-500", erro: "bg-rose-500", desconectado: "bg-black/25" };
const rotuloStatus: Record<ServidorMcp["status"], string> = { conectado: "conectado", autorizar: "precisa autorizar", erro: "erro", desconectado: "desconectado" };

export function PainelConectores() {
  const aberto = useStore((s) => s.conectoresAberto);
  const servidores = useStore((s) => s.mcp);
  const [presets, setPresets] = useState<PresetMcp[]>([]);
  const [redirect, setRedirect] = useState("");
  const [sel, setSel] = useState<number | "novo">("novo");
  useEffect(() => {
    if (!aberto) return;
    void api<{ presets: PresetMcp[]; redirectOauth: string }>("/api/mcp").then((r) => {
      setPresets(r.presets);
      setRedirect(r.redirectOauth);
    });
  }, [aberto]);
  if (!aberto) return null;
  const fechar = () => useStore.setState({ conectoresAberto: false });
  const atual = typeof sel === "number" ? servidores.find((s) => s.id === sel) : undefined;

  return (
    <div className="pointer-events-auto absolute inset-0 z-40 grid place-items-center bg-[#1f2430]/35 p-4 backdrop-blur-sm" onClick={fechar}>
      <div className="flex h-[min(760px,100%)] w-[min(1080px,100%)] overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5" onClick={(e) => e.stopPropagation()}>
        <nav className="scroll-fino w-60 shrink-0 overflow-y-auto border-r border-black/5 bg-black/[0.02] p-3">
          <div className="px-1 pb-1 text-sm font-bold">Conectores</div>
          <p className="px-1 pb-3 text-[11px] text-black/50">Ferramentas externas (MCP) que os agentes podem usar.</p>
          <button onClick={() => setSel("novo")} className={`mb-2 w-full rounded-lg px-2 py-1.5 text-left text-xs font-semibold ${sel === "novo" ? "bg-[#1f2430] text-white" : "ring-1 ring-black/10 hover:bg-black/5"}`}>
            + Adicionar conector
          </button>
          {servidores.map((s) => (
            <button key={s.id} onClick={() => setSel(s.id)} className={`mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs ${sel === s.id ? "bg-[#1f2430] text-white" : "hover:bg-black/5"}`}>
              <span className={`h-2 w-2 shrink-0 rounded-full ${corStatus[s.status]}`} />
              <span className="flex-1 truncate font-medium">{s.nome}</span>
              <span className={`text-[10px] ${sel === s.id ? "text-white/60" : "text-black/40"}`}>{s.ferramentas.length}</span>
            </button>
          ))}
        </nav>
        <section className="scroll-fino min-w-0 flex-1 overflow-y-auto p-5">
          <div className="mb-3 flex justify-end">
            <button onClick={fechar} className="grid h-8 w-8 place-items-center rounded-full text-black/50 hover:bg-black/5" aria-label="Fechar">
              ✕
            </button>
          </div>
          {atual ? <DetalheServidor s={atual} onRemovido={() => setSel("novo")} /> : <NovoConector presets={presets} redirect={redirect} onCriado={(id) => setSel(id)} />}
        </section>
      </div>
    </div>
  );
}

function Salas({ valor, onChange }: { valor: RoomId[]; onChange: (s: RoomId[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {salasComEquipe.map((r) => {
        const on = valor.includes(r.id);
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => onChange(on ? valor.filter((x) => x !== r.id) : [...valor, r.id])}
            className={`rounded-full px-2 py-0.5 text-[11px] ring-1 ${on ? "bg-[#1f2430] text-white ring-[#1f2430]" : "text-black/60 ring-black/10 hover:bg-black/5"}`}
          >
            {r.nome}
          </button>
        );
      })}
    </div>
  );
}

function NovoConector({ presets, redirect, onCriado }: { presets: PresetMcp[]; redirect: string; onCriado: (id: number) => void }) {
  const [p, setP] = useState<PresetMcp | null>(null);
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [salas, setSalas] = useState<RoomId[]>([]);
  const [tipo, setTipo] = useState<"stdio" | "http">("stdio");
  const [nome, setNome] = useState("");
  const [comando, setComando] = useState("");
  const [args, setArgs] = useState("");
  const [url, setUrl] = useState("");
  const [envTexto, setEnvTexto] = useState("");
  const [auth, setAuth] = useState<"nenhuma" | "token" | "oauth">("nenhuma");
  const { erro, ocupado, acao } = useAcao();

  if (!p) {
    return (
      <div>
        <h2 className="mb-1 text-lg font-bold">Adicionar conector</h2>
        <p className="mb-4 text-xs text-black/55">
          Leituras rodam direto; ações (enviar, criar, alterar, cobrar) viram pedidos em Aprovações, e só executam com o seu OK. Tokens e senhas ficam cifrados neste Mac.
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          {presets.map((x) => (
            <button
              key={x.id}
              onClick={() => {
                setP(x);
                setSalas(x.salasSugeridas);
                setTipo(x.tipo);
              }}
              className="rounded-xl p-3 text-left ring-1 ring-black/10 hover:bg-black/[0.02]"
            >
              <div className="text-sm font-bold">{x.nome}</div>
              <div className="text-[11px] text-black/55">{x.descricao}</div>
              <div className="mt-1 text-[10px] text-black/40">{x.autenticacao === "oauth" ? "login na conta" : x.autenticacao === "token" ? "token" : "local"}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const personalizado = p.id === "personalizado";
  const env = Object.fromEntries(
    envTexto
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.includes("="))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
  );
  return (
    <div className="space-y-3 text-xs">
      <button onClick={() => setP(null)} className="text-black/50 hover:text-black">
        ← Catálogo
      </button>
      <h2 className="text-lg font-bold">{p.nome}</h2>
      <p className="text-black/60">{p.ajuda}</p>
      {p.autenticacao === "oauth" && (
        <p className="rounded-lg bg-amber-50 p-2 text-amber-900">
          Endereço de retorno do OAuth: <code className="select-all">{redirect}</code>
        </p>
      )}
      {personalizado && (
        <>
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome (ex.: Meu CRM)" className="campo" />
          <div className="flex gap-2">
            {(["stdio", "http"] as const).map((t) => (
              <button key={t} onClick={() => setTipo(t)} className={`rounded-lg px-3 py-1.5 font-semibold ring-1 ${tipo === t ? "bg-[#1f2430] text-white ring-[#1f2430]" : "ring-black/10"}`}>
                {t === "stdio" ? "Comando no Mac (stdio)" : "Endereço (HTTP)"}
              </button>
            ))}
          </div>
          {tipo === "stdio" ? (
            <>
              <input value={comando} onChange={(e) => setComando(e.target.value)} placeholder="Comando (ex.: npx)" className="campo font-mono" />
              <input value={args} onChange={(e) => setArgs(e.target.value)} placeholder="Argumentos (ex.: -y @empresa/mcp-servidor)" className="campo font-mono" />
              <textarea value={envTexto} onChange={(e) => setEnvTexto(e.target.value)} rows={3} placeholder={"Variáveis (uma por linha, ficam cifradas)\nAPI_KEY=..."} className="campo font-mono" />
            </>
          ) : (
            <>
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://servidor.exemplo.com/mcp" className="campo font-mono" />
              <select value={auth} onChange={(e) => setAuth(e.target.value as typeof auth)} className="campo">
                <option value="nenhuma">Sem autenticação</option>
                <option value="token">Token (Bearer)</option>
                <option value="oauth">Login na conta (OAuth)</option>
              </select>
              {auth === "token" && <input type="password" value={campos.token ?? ""} onChange={(e) => setCampos({ ...campos, token: e.target.value })} placeholder="Token" className="campo" />}
            </>
          )}
        </>
      )}
      {p.campos.map((c) => (
        <label key={c.id} className="block">
          <span className="mb-1 block font-semibold text-black/60">{c.rotulo}</span>
          <input type={c.secreto ? "password" : "text"} value={campos[c.id] ?? ""} onChange={(e) => setCampos({ ...campos, [c.id]: e.target.value })} className="campo" />
          {c.ajuda && <span className="mt-0.5 block text-[11px] text-black/45">{c.ajuda}</span>}
        </label>
      ))}
      <div>
        <div className="mb-1 font-semibold text-black/60">Salas que podem usar</div>
        <Salas valor={salas} onChange={setSalas} />
      </div>
      {erro && <p className="text-rose-600">{erro}</p>}
      <button
        disabled={ocupado}
        onClick={() => acao(async () => {
          const s = await api<ServidorMcp>("/api/mcp", "POST", {
            preset: p.id, nome: nome || undefined, tipo, comando, args: args.split(" ").filter(Boolean), url, env, campos, salas, autenticacao: auth,
          });
          onCriado(s.id);
          if (s.autorizarUrl) window.open(s.autorizarUrl, "_blank", "noopener");
        })}
        className="rounded-lg bg-[#1f2430] px-4 py-2 font-semibold text-white disabled:opacity-40"
      >
        {ocupado ? "Conectando…" : "Conectar"}
      </button>
    </div>
  );
}

function DetalheServidor({ s, onRemovido }: { s: ServidorMcp; onRemovido: () => void }) {
  const { erro, ocupado, acao } = useAcao();
  const atualizar = (corpo: Record<string, unknown>) => acao(() => api(`/api/mcp/${s.id}`, "PUT", corpo));
  return (
    <div className="space-y-4 text-xs">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-lg font-bold">{s.nome}</h2>
        <span className="flex items-center gap-1.5 text-black/60">
          <span className={`h-2 w-2 rounded-full ${corStatus[s.status]}`} />
          {rotuloStatus[s.status]}
        </span>
      </div>
      <p className="font-mono text-[11px] text-black/50">{s.tipo === "http" ? s.url : `${s.comando} ${s.args.join(" ")}`}</p>
      {s.erro && <p className="rounded-lg bg-rose-50 p-2 text-rose-800">{s.erro}</p>}
      <div className="flex flex-wrap gap-2">
        {s.status === "autorizar" && s.autorizarUrl && (
          <a href={s.autorizarUrl} target="_blank" rel="noreferrer noopener" className="rounded-lg bg-amber-500 px-3 py-1.5 font-semibold text-white">
            Autorizar (entrar na conta)
          </a>
        )}
        <button disabled={ocupado} onClick={() => acao(() => api(`/api/mcp/${s.id}/conectar`, "POST"))} className="rounded-lg px-3 py-1.5 ring-1 ring-black/10 hover:bg-black/5">
          Reconectar
        </button>
        <button
          disabled={ocupado}
          onClick={() => {
            if (confirm(`Remover o conector ${s.nome}? Os segredos guardados dele são apagados.`)) void acao(async () => { await api(`/api/mcp/${s.id}`, "DELETE"); onRemovido(); });
          }}
          className="rounded-lg px-3 py-1.5 text-rose-700 ring-1 ring-rose-200 hover:bg-rose-50"
        >
          Remover
        </button>
      </div>
      <div>
        <div className="mb-1 font-semibold text-black/60">Salas que podem usar</div>
        <Salas valor={s.salas} onChange={(salas) => void atualizar({ salas })} />
      </div>
      <div>
        <div className="mb-1 font-semibold text-black/60">Ferramentas ({s.ferramentas.length})</div>
        <ul className="divide-y divide-black/5 rounded-xl ring-1 ring-black/10">
          {s.ferramentas.map((f) => (
            <li key={f.nome} className="flex items-start gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="font-mono font-semibold">
                  {f.nome}
                  {f.leitura && <span className="ml-1.5 rounded bg-emerald-50 px-1 font-sans text-[10px] text-emerald-700">leitura</span>}
                </div>
                <div className="text-[11px] text-black/55">{f.descricao}</div>
              </div>
              <select value={f.politica} onChange={(e) => void atualizar({ politicas: { [f.nome]: e.target.value as PoliticaMcp } })} className="h-7 rounded-lg bg-black/5 px-1.5 text-[11px]">
                <option value="auto">Automática</option>
                <option value="aprovar">Pedir aprovação</option>
                <option value="bloqueada">Bloqueada</option>
              </select>
            </li>
          ))}
          {!s.ferramentas.length && <li className="px-3 py-4 text-center text-black/45">Nenhuma ferramenta (conecte ou autorize primeiro).</li>}
        </ul>
      </div>
      {erro && <p className="text-rose-600">{erro}</p>}
    </div>
  );
}

/* ---------- Pedidos de ação (dentro de Aprovações) ---------- */

export function PedidosDeAcao() {
  const pedidos = useStore((s) => s.pedidosMcp);
  const { erro, ocupado, acao } = useAcao();
  const pendentes = pedidos.filter((p) => p.status === "pendente");
  if (!pendentes.length) return null;
  return (
    <div className="mb-3">
      <div className="mb-1.5 text-xs font-semibold">Ações esperando você ({pendentes.length})</div>
      <ul className="scroll-fino max-h-72 space-y-1.5 overflow-y-auto">
        {pendentes.map((p) => (
          <li key={p.id} className="rounded-xl bg-amber-50 p-2.5 text-xs ring-1 ring-amber-200">
            <div className="font-semibold">
              {p.servidor} · <span className="font-mono">{p.ferramenta}</span>
            </div>
            <div className="text-[11px] text-black/55">
              {agentById[p.agenteId]?.nome ?? p.agenteId}
              {p.cardId ? ` · EMP-${p.cardId}` : ""} {p.motivo && `— ${p.motivo}`}
            </div>
            <pre className="scroll-fino mt-1 max-h-32 overflow-auto rounded-lg bg-white p-2 text-[10px] ring-1 ring-black/5">{JSON.stringify(p.args, null, 2)}</pre>
            <div className="mt-1.5 flex gap-1.5">
              <button disabled={ocupado} onClick={() => acao(() => api(`/api/mcp/pedidos/${p.id}/aprovar`, "POST"))} className="rounded-lg bg-emerald-600 px-3 py-1 text-[11px] font-semibold text-white">
                Aprovar e executar
              </button>
              <button
                disabled={ocupado}
                onClick={() => {
                  const motivo = prompt("Motivo (opcional):") ?? "";
                  void acao(() => api(`/api/mcp/pedidos/${p.id}/recusar`, "POST", { motivo }));
                }}
                className="rounded-lg px-3 py-1 text-[11px] font-semibold text-rose-700 ring-1 ring-rose-200"
              >
                Recusar
              </button>
            </div>
          </li>
        ))}
      </ul>
      {erro && <p className="mt-1 text-[11px] text-rose-600">{erro}</p>}
    </div>
  );
}
