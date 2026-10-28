import { useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Check, FolderOpen, KeyRound, MessagesSquare } from "lucide-react";
import type { StatusResponse } from "@empresa/shared";
import { agentById, agents } from "@empresa/org";
import { useStore } from "../store.ts";
import { api } from "../api.ts";
import { send } from "../ws.ts";
import { navegar } from "../nav.ts";
import { Botao, CampoSegredo, avisarErro, cx, useCamada } from "./kit/index.ts";
import { Avatarzinho } from "./comum.tsx";
import { BotaoEscolherPasta } from "./SeletorDePastas.tsx";

// Boas-vindas da primeira vez (DESIGN-INTERFACE.md §6.10): chave da API, o seu negócio (entrevista com a Helena)
// e o projeto. Cada passo pode ser pulado; a escolha fica salva neste navegador.

const CHAVE_PULOU = "boas-vindas-concluidas";
const pulou = () => {
  try {
    return localStorage.getItem(CHAVE_PULOU) === "1";
  } catch {
    return false;
  }
};

export function Onboarding() {
  const chaveConfigurada = useStore((s) => s.chaveConfigurada);
  const [concluido, setConcluido] = useState(pulou);
  const [passo, setPasso] = useState(0);
  // Abre na primeira vez (sem chave) e continua aberto nos passos seguintes, mesmo depois da chave salva.
  const aberto = !concluido && (chaveConfigurada === false || passo > 0);
  const terminar = () => {
    try {
      localStorage.setItem(CHAVE_PULOU, "1");
    } catch {}
    setConcluido(true);
  };
  const ref = useCamada<HTMLDivElement>(aberto, terminar);
  if (!aberto) return null;

  const passos = [
    { icone: KeyRound, titulo: "Chave da API" },
    { icone: MessagesSquare, titulo: "O seu negócio" },
    { icone: FolderOpen, titulo: "O seu projeto" },
  ];

  return createPortal(
    <div className="fixed inset-0 z-[3100] grid place-items-center bg-overlay p-4">
      <div ref={ref} role="dialog" aria-modal="true" aria-label="Boas-vindas" tabIndex={-1} className="anima-cima w-full max-w-[640px] overflow-hidden rounded-panel bg-surface-3 shadow-3 outline-none">
        <div className="flex items-center gap-3 border-b border-line px-7 pb-5 pt-6">
          <img src="/hefesto.svg" alt="" className="size-11" />
          <div>
            <h1 className="text-pagina font-semibold text-fg">Bem-vindo à sua empresa</h1>
            <p className="text-corpo text-fg-2">{agents.length} agentes sêniores esperando o primeiro pedido do CEO.</p>
          </div>
        </div>
        <ol className="flex gap-2 px-7 pt-5">
          {passos.map((p, i) => (
            <li key={p.titulo} className={cx("flex flex-1 items-center gap-2 rounded-ctl px-3 py-2 text-pequeno", i === passo ? "bg-accent-soft font-medium text-accent-fg" : i < passo ? "text-success-fg" : "text-fg-3")}>
              {i < passo ? <Check className="size-4" /> : <p.icone className="size-4" />}
              {p.titulo}
            </li>
          ))}
        </ol>
        <div className="px-7 pb-7 pt-5">
          {passo === 0 && <PassoChave proximo={() => setPasso(1)} pular={terminar} />}
          {passo === 1 && <PassoNegocio proximo={() => setPasso(2)} />}
          {passo === 2 && <PassoProjeto terminar={terminar} />}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function PassoChave({ proximo, pular }: { proximo: () => void; pular: () => void }) {
  const [chave, setChave] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const salvar = async () => {
    setSalvando(true);
    setErro(null);
    try {
      const res = await fetch("/api/key", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ apiKey: chave }) });
      const body = (await res.json()) as StatusResponse & { erro?: string };
      if (!res.ok) throw new Error(body.erro ?? "Não foi possível salvar a chave.");
      useStore.getState().setChaveConfigurada(true);
      proximo();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  };
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (chave.trim()) void salvar();
      }}
    >
      <p className="text-corpo text-fg-2">Os agentes usam o Claude pela sua chave da API da Anthropic. Ela fica só neste Mac, cifrada, e nunca volta para o navegador.</p>
      <CampoSegredo rotulo="Chave da API" configurado={false} valor={chave} onChange={setChave} placeholder="sk-ant-…" ajuda="Crie uma em console.anthropic.com → API Keys." />
      {erro && <p className="rounded-ctl bg-danger-soft px-3 py-2 text-pequeno text-danger-fg">{erro}</p>}
      <div className="flex items-center justify-between gap-2 pt-1">
        <Botao variante="discreto" onClick={pular}>Agora não, só explorar</Botao>
        <Botao type="submit" variante="principal" carregando={salvando} disabled={!chave.trim()} iconeDireita={ArrowRight}>Validar e continuar</Botao>
      </div>
    </form>
  );
}

function PassoNegocio({ proximo }: { proximo: () => void }) {
  const helena = agentById["chief-of-staff"]!;
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-card bg-surface-2 p-4">
        <Avatarzinho agent={helena} tamanho={40} />
        <p className="text-corpo text-fg">
          Oi, eu sou a Helena, Chief of Staff. Numa conversa de poucos minutos eu monto o <b className="font-semibold">Livro da Empresa</b>: o que vocês vendem, para quem, tom de voz, metas e limites. Todos os agentes leem o Livro antes de trabalhar.
        </p>
      </div>
      <div className="flex items-center justify-between gap-2">
        <Botao variante="discreto" onClick={proximo}>Depois</Botao>
        <Botao
          variante="principal"
          iconeDireita={ArrowRight}
          onClick={() => {
            send({ type: "onboarding.iniciar" });
            useStore.getState().setEntrevistaAberta(true);
            proximo();
          }}
        >
          Começar a entrevista
        </Botao>
      </div>
    </div>
  );
}

function PassoProjeto({ terminar }: { terminar: () => void }) {
  return (
    <div className="space-y-4">
      <p className="text-corpo text-fg-2">Se você tem um app ou site, escolha a pasta dele: o Arquiteto faz um raio-x e a equipe passa a trabalhar numa cópia isolada. Nada entra no seu projeto sem o seu merge.</p>
      <div className="flex items-center justify-between gap-2">
        <Botao variante="discreto" onClick={terminar}>Pular por agora</Botao>
        <BotaoEscolherPasta
          aoEscolher={() => {
            terminar();
            navegar("operacao", "projetos");
          }}
        />
      </div>
    </div>
  );
}
