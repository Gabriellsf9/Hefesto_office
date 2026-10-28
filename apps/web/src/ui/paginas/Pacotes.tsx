import { useEffect, useRef, useState } from "react";
import { Download, Upload, UserPlus, Users, X } from "lucide-react";
import { useStore } from "../../store.ts";
import { api } from "../../api.ts";
import { Botao, BotaoIcone, Campo, Seletor, avisar, avisarErro, confirmar } from "../kit/index.ts";

// Escritórios: exportar e importar (escritório inteiro, um agente ou um fluxo, em JSON) e as pessoas do time.

/** Baixa o pacote de um escritório (ou de um agente / fluxo dele) como arquivo .json. */
export async function baixarPacote(caminho: string, nome: string) {
  try {
    const pacote = await api<unknown>(caminho);
    const url = URL.createObjectURL(new Blob([JSON.stringify(pacote, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${nome.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "-").toLowerCase()}.hefesto.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    avisarErro(e);
  }
}

export function BotaoImportar() {
  const defs = useStore((s) => s.escritorios);
  const entrada = useRef<HTMLInputElement>(null);
  const [pendente, setPendente] = useState<{ pacote: { formato: string; agente?: { nome: string; sala: string }; fluxo?: { nome: string } }; nome: string } | null>(null);
  const [destino, setDestino] = useState({ escritorioId: "", sala: "" });

  const importar = async (pacote: unknown, d?: { escritorioId: string; sala?: string }) => {
    try {
      const r = await api<{ tipo: string; renomeados: Record<string, string> }>("/api/escritorios/importar", "POST", { pacote, ...d });
      const n = Object.keys(r.renomeados).length;
      avisar(`${r.tipo === "escritorio" ? "Escritório" : r.tipo === "agente" ? "Agente" : "Fluxo"} importado${n ? ` (${n} id(s) renomeado(s) por já existirem)` : ""}`);
      setPendente(null);
    } catch (e) {
      avisarErro(e);
    }
  };

  const ler = async (arquivo: File) => {
    try {
      const pacote = JSON.parse(await arquivo.text()) as { formato?: string; agente?: { nome: string; sala: string }; fluxo?: { nome: string }; escritorio?: { nome: string } };
      if (pacote.formato === "hefesto/escritorio") {
        if (await confirmar({ titulo: `Importar o escritório "${pacote.escritorio?.nome}"?`, texto: "Ele entra como um escritório novo, ao lado dos seus.", confirmar: "Importar" })) await importar(pacote);
      } else if (pacote.formato === "hefesto/agente" || pacote.formato === "hefesto/fluxo") {
        setDestino({ escritorioId: defs[0]?.id ?? "", sala: "" });
        setPendente({ pacote: pacote as never, nome: pacote.agente?.nome ?? pacote.fluxo?.nome ?? "" });
      } else avisarErro(new Error("Este arquivo não é um pacote do Hefesto."));
    } catch {
      avisarErro(new Error("Não consegui ler o arquivo (JSON inválido)."));
    }
  };

  const alvo = defs.find((d) => d.id === destino.escritorioId);
  return (
    <>
      <input ref={entrada} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void ler(f); }} />
      <Botao icone={Upload} onClick={() => entrada.current?.click()}>Importar</Botao>
      {pendente && (
        <div className="fixed inset-x-0 bottom-6 z-50 mx-auto flex w-[min(560px,calc(100%-32px))] flex-wrap items-end gap-2 rounded-panel bg-surface p-4 shadow-3">
          <p className="w-full text-pequeno text-fg">Importar {pendente.pacote.formato === "hefesto/agente" ? "o agente" : "o fluxo"} <b>{pendente.nome}</b> em:</p>
          <Seletor tamanho="p" aria-label="Escritório" value={destino.escritorioId} onChange={(e) => setDestino({ escritorioId: e.target.value, sala: "" })}>
            {defs.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
          </Seletor>
          {pendente.pacote.formato === "hefesto/agente" && (
            <Seletor tamanho="p" aria-label="Sala" value={destino.sala} onChange={(e) => setDestino({ ...destino, sala: e.target.value })}>
              <option value="">Sala…</option>
              {alvo?.salas.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </Seletor>
          )}
          <Botao tamanho="p" variante="principal" disabled={!destino.escritorioId || (pendente.pacote.formato === "hefesto/agente" && !destino.sala)} onClick={() => void importar(pendente.pacote, { escritorioId: destino.escritorioId, ...(destino.sala ? { sala: destino.sala } : {}) })}>Importar</Botao>
          <Botao tamanho="p" variante="discreto" onClick={() => setPendente(null)}>Cancelar</Botao>
        </div>
      )}
    </>
  );
}

export const BotaoExportar = ({ id, nome }: { id: string; nome: string }) => (
  <Botao tamanho="p" variante="discreto" icone={Download} onClick={() => void baixarPacote(`/api/escritorios/${id}/exportar`, nome)}>Exportar</Botao>
);

/* ---------- Pessoas do time ---------- */

interface Pessoa {
  id: string;
  nome: string;
  papel: string;
  telegram: string;
}

let cache: Pessoa[] | null = null;
const ouvintes = new Set<(p: Pessoa[]) => void>();
export function usePessoas(): Pessoa[] {
  const [p, setP] = useState<Pessoa[]>(cache ?? []);
  useEffect(() => {
    ouvintes.add(setP);
    if (!cache) void recarregarPessoas();
    return () => void ouvintes.delete(setP);
  }, []);
  return p;
}
async function recarregarPessoas() {
  cache = await api<Pessoa[]>("/api/pessoas").catch(() => []);
  ouvintes.forEach((f) => f(cache!));
}

export function PessoasDoTime() {
  const pessoas = usePessoas();
  const [f, setF] = useState({ nome: "", papel: "", telegram: "" });
  const adicionar = async () => {
    try {
      await api("/api/pessoas", "POST", f);
      setF({ nome: "", papel: "", telegram: "" });
      await recarregarPessoas();
    } catch (e) {
      avisarErro(e);
    }
  };
  return (
    <section className="mt-6 rounded-panel bg-surface p-5 shadow-1">
      <h3 className="flex items-center gap-2 text-destaque font-semibold text-fg"><Users className="size-5 text-fg-3" /> Pessoas do time</h3>
      <p className="mt-1 text-pequeno text-fg-2">Gente de verdade que pode ser dona de um card. Os agentes não mexem nos cards delas, e elas são avisadas pelo chat do Telegram pareado (pareie um grupo do time para todos verem, com a menção de cada um).</p>
      <ul className="mt-3 divide-y divide-line">
        {pessoas.map((p) => (
          <li key={p.id} className="flex items-center gap-2 py-2 text-pequeno">
            <span className="flex-1 text-fg">{p.nome}{p.papel && <span className="text-fg-3"> · {p.papel}</span>}{p.telegram && <span className="font-mono text-fg-3"> · @{p.telegram}</span>}</span>
            <BotaoIcone
              icone={X}
              rotulo={`Remover ${p.nome}`}
              tamanho="p"
              onClick={async () => {
                if (!(await confirmar({ titulo: `Remover ${p.nome}?`, texto: "Só dá se não for dona de cards abertos.", confirmar: "Remover", perigo: true }))) return;
                await api(`/api/pessoas/${encodeURIComponent(p.id)}`, "DELETE").then(recarregarPessoas).catch(avisarErro);
              }}
            />
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="w-44"><Campo tamanho="p" rotulo="Nome" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></div>
        <div className="w-40"><Campo tamanho="p" rotulo="Papel" value={f.papel} onChange={(e) => setF({ ...f, papel: e.target.value })} placeholder="Designer" /></div>
        <div className="w-40"><Campo tamanho="p" rotulo="Telegram" value={f.telegram} onChange={(e) => setF({ ...f, telegram: e.target.value })} placeholder="@usuario" /></div>
        <Botao tamanho="p" icone={UserPlus} disabled={!f.nome.trim()} onClick={() => void adicionar()}>Adicionar</Botao>
      </div>
    </section>
  );
}
