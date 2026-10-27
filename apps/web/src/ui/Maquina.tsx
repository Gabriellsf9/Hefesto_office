import { useEffect, useMemo, useState } from "react";
import type { RoomId } from "@empresa/shared";
import { agentById, rooms } from "@empresa/org";
import { useStore } from "../store.ts";
import { api } from "../api.ts";

// Máquina do CEO: configuração do terminal e do controle do Mac (menu ⋯) e a faixa de
// sessão ativa, com a tela ao vivo e o botão PARAR (sempre visível enquanto houver controle).

interface Config {
  terminal: boolean;
  controle: boolean;
  salas: RoomId[];
  liberados: string[];
}

export function ConfigMaquina() {
  const [c, setC] = useState<Config | null>(null);
  const [liberados, setLiberados] = useState("");
  const [salvo, setSalvo] = useState(false);
  useEffect(() => {
    void api<Config>("/api/maquina/config").then((x) => {
      setC(x);
      setLiberados(x.liberados.join("\n"));
    });
  }, []);
  if (!c) return null;
  const salvar = async (d: Partial<Config>) => setC(await api<Config>("/api/maquina/config", "PUT", d));
  return (
    <div className="space-y-1.5 rounded-xl bg-black/[0.03] p-2.5 text-[11px] text-black/65">
      <div className="font-semibold text-black/80">Máquina (terminal e controle do Mac)</div>
      <label className="flex items-start gap-2">
        <input type="checkbox" checked={c.terminal} onChange={(e) => void salvar({ terminal: e.target.checked })} className="mt-0.5" />
        <span>Terminal: comandos com a sua aprovação (os liberados abaixo rodam direto)</span>
      </label>
      <label className="flex items-start gap-2">
        <input type="checkbox" checked={c.controle} onChange={(e) => void salvar({ controle: e.target.checked })} className="mt-0.5" />
        <span>Controle do Mac: tela, mouse e teclado em sessões que você libera, com botão PARAR</span>
      </label>
      <div>Salas com acesso:</div>
      <div className="flex flex-wrap gap-1">
        {rooms
          .filter((r) => r.id !== "reuniao")
          .map((r) => {
            const on = c.salas.includes(r.id);
            return (
              <button
                key={r.id}
                onClick={() => void salvar({ salas: on ? c.salas.filter((s) => s !== r.id) : [...c.salas, r.id] })}
                className={`rounded-full px-1.5 py-0.5 text-[10px] ring-1 ${on ? "bg-[#1f2430] text-white ring-[#1f2430]" : "ring-black/10"}`}
              >
                {r.nome}
              </button>
            );
          })}
      </div>
      <div>Comandos liberados sem pedir (só comandos simples; um por linha):</div>
      <textarea
        value={liberados}
        onChange={(e) => {
          setLiberados(e.target.value);
          setSalvo(false);
        }}
        rows={3}
        className="w-full rounded-lg bg-white p-1.5 font-mono text-[10px] ring-1 ring-black/10"
      />
      <button
        onClick={async () => {
          await salvar({ liberados: liberados.split("\n").filter((l) => l.trim()) });
          setSalvo(true);
        }}
        className="rounded-md px-2 py-0.5 font-semibold ring-1 ring-black/10 hover:bg-white"
      >
        {salvo ? "Salvo ✓" : "Salvar liberados"}
      </button>
      <p className="text-[10px] text-black/45">
        O macOS vai pedir Gravação de Tela e Acessibilidade para o programa que roda o Hefesto. Comandos que citam chaves, senhas ou tokens sempre pedem aprovação.
      </p>
    </div>
  );
}

/** Faixa vermelha no topo enquanto algum agente controla o Mac, com a tela ao vivo e PARAR. */
export function FaixaControle() {
  const porCard = useStore((s) => s.controle);
  const ativas = useMemo(() => Object.values(porCard).filter((s) => s.ativa), [porCard]);
  const [agora, setAgora] = useState(Date.now());
  const [ver, setVer] = useState(false);
  useEffect(() => {
    if (!ativas.length) return;
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [ativas.length]);
  if (!ativas.length) return null;
  const s = ativas[0]!;
  const a = agentById[s.agenteId];
  const resta = Math.max(0, s.ate - agora);
  const mmss = `${Math.floor(resta / 60_000)}:${String(Math.floor((resta % 60_000) / 1000)).padStart(2, "0")}`;
  return (
    <div className="pointer-events-auto absolute left-1/2 top-2 z-[60] w-[min(760px,calc(100%-2rem))] -translate-x-1/2">
      <div className="flex items-center gap-2 rounded-2xl bg-rose-600 px-3 py-2 text-xs text-white shadow-xl ring-2 ring-rose-300">
        <span className="pulsar h-2.5 w-2.5 rounded-full bg-white" />
        <span className="flex-1">
          <b>{a?.nome ?? s.agenteId}</b> está controlando o seu Mac (EMP-{s.cardId}) · resta {mmss}
          {ativas.length > 1 && ` · +${ativas.length - 1} sessão(ões)`}
        </span>
        <button onClick={() => setVer(!ver)} className="rounded-lg bg-white/15 px-2.5 py-1 font-semibold hover:bg-white/25">
          {ver ? "Esconder" : "Ver tela"}
        </button>
        <button onClick={() => api("/api/maquina/parar", "POST")} className="rounded-lg bg-white px-3 py-1 font-bold text-rose-700">
          PARAR
        </button>
      </div>
      {ver && (
        <div className="mt-2 flex gap-2 rounded-2xl bg-white p-2 shadow-xl ring-1 ring-black/10">
          {s.imagem ? <img src={s.imagem} alt="Tela do Mac" className="max-h-80 min-w-0 flex-1 rounded-lg object-contain ring-1 ring-black/10" /> : <span className="flex-1 p-6 text-center text-xs text-black/45">Sem print ainda.</span>}
          <ol className="scroll-fino max-h-80 w-56 shrink-0 space-y-1 overflow-y-auto text-[11px]">
            {[...s.acoes].reverse().map((x, i) => (
              <li key={i} className={`rounded-lg px-2 py-1 ${x.ok ? "bg-black/[0.03]" : "bg-rose-50 text-rose-800"}`}>
                <b>{x.acao}</b> <span className="text-black/40">{new Date(x.ts).toLocaleTimeString("pt-BR")}</span>
                <div className="break-all text-black/60">{x.detalhe}</div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
