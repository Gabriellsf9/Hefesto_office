import { useEffect, useState } from "react";
import { colunaDe, prioridades, type Card, type Projeto } from "@empresa/shared";
import { agentById, agents, roomById } from "@empresa/org";
import { useStore } from "../store.ts";
import { send } from "../ws.ts";
import { api } from "../api.ts";
import { tipoInfo } from "./board/CardItem.tsx";
import { useFecharFora } from "./useFora.ts";
import { algumAberto, alternarTudo, usePaineis } from "../paineis.ts";
import { useCeu, type ModoLuz } from "../scene/ceu.ts";
import { useSons } from "../sons.ts";
import { BotaoNavegador, ConfigNavegador } from "./NavegadorAgentes.tsx";
import { PedidosDeAcao } from "./Conectores.tsx";
import { ConfigMaquina } from "./Maquina.tsx";
import { ConfigBackup } from "./Backup.tsx";
import { falar, pararDeFalar, vozesDisponiveis } from "../voz/falar.ts";

export function TopBar() {
  const conectado = useStore((s) => s.conectado);
  const estados = useStore((s) => s.estados);
  const demo = useStore((s) => s.demo);
  const seguir = useStore((s) => s.seguirAtividade);
  const setSeguir = useStore((s) => s.setSeguir);
  const visaoGeral = useStore((s) => s.visaoGeral);
  const setConfigAberta = useStore((s) => s.setConfigAberta);
  const custo = useStore((s) => s.custoHojeUsd);
  const setLivroAberto = useStore((s) => s.setLivroAberto);
  const secoesLivro = useStore((s) => s.livro.length);
  const propostas = useStore((s) => s.conhecimento.filter((i) => !i.aprovado).length);
  const modoBoard = useStore((s) => s.modoBoard);
  const ouvirRespostas = useStore((s) => s.voz.ouvirRespostas);
  const setModoBoard = useStore((s) => s.setModoBoard);

  const minimizados = usePaineis((s) => s.minimizados);
  const alternarPainel = usePaineis((s) => s.alternar);

  const ativos = agents.filter((a) => (estados[a.id]?.status ?? "ocioso") !== "ocioso").length;

  // Minimizada: só o logo, a board e os botões para expandir de volta.
  if (minimizados.topo) {
    return (
      <header className="painel pointer-events-auto absolute left-4 top-4 z-20 flex items-center gap-1.5 p-1.5">
        <button onClick={visaoGeral} className="relative h-8 w-8" title="Visão geral do escritório">
          <img src="/hefesto.svg" alt="Hefesto" className="h-8 w-8" />
          <span className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${conectado ? "bg-emerald-500" : "pulsar bg-amber-500"}`} />
        </button>
        <button
          onClick={() => setModoBoard(modoBoard === "fechada" ? "cheia" : "fechada")}
          className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ring-1 ${modoBoard !== "fechada" ? "bg-[#1f2430] text-white ring-[#1f2430]" : "text-black/70 ring-black/10 hover:bg-black/5"}`}
        >
          Board
        </button>
        <button onClick={() => alternarPainel("topo")} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-black/70 ring-1 ring-black/10 hover:bg-black/5" title="Mostrar a barra completa">
          Menu ▸
        </button>
        <button onClick={() => usePaineis.getState().expandirTudo()} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-black/70 ring-1 ring-black/10 hover:bg-black/5" title="Expandir todos os painéis (M)">
          Expandir tudo
        </button>
      </header>
    );
  }

  return (
    <header className="painel pointer-events-auto absolute left-4 right-4 top-4 z-20 flex items-center gap-2 px-3 py-2.5 lg:gap-3 lg:px-4">
      <button
        onClick={visaoGeral}
        className="flex shrink-0 items-center gap-2.5"
        title={`Visão geral do escritório · servidor ${conectado ? "conectado" : "reconectando…"}`}
      >
        <span className="relative h-8 w-8">
          <img src="/hefesto.svg" alt="" className="h-8 w-8" />
          <span
            className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${conectado ? "bg-emerald-500" : "pulsar bg-amber-500"}`}
          />
        </span>
        <span className="hidden text-left leading-tight xl:block">
          <span className="block text-sm font-bold">Hefesto</span>
          <span className="block text-[11px] text-black/50">Escritório de agentes de IA</span>
        </span>
      </button>

      <div className="h-8 w-px shrink-0 bg-black/10" />

      <div className="hidden lg:block">
        <Indicador rotulo="Ativos" valor={`${ativos}/${agents.length}`} cor={ativos ? "#3b82f6" : "#9ca3af"} />
      </div>
      <Indicador
        rotulo="Custo hoje"
        valor={custo.toLocaleString("pt-BR", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        cor={custo > 0 ? "#f59e0b" : "#9ca3af"}
      />

      <div className="flex-1" />

      <Equipe />
      <Projetos />

      <button
        onClick={() => setModoBoard(modoBoard === "fechada" ? "cheia" : "fechada")}
        className={`rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 ${
          modoBoard !== "fechada" ? "bg-[#1f2430] text-white ring-[#1f2430]" : "text-black/70 ring-black/10 hover:bg-black/5"
        }`}
      >
        Board
      </button>

      <button
        onClick={() => setLivroAberto(true, propostas > 0 ? "conhecimento" : undefined)}
        className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold text-black/70 ring-1 ring-black/10 hover:bg-black/5"
        title={propostas > 0 ? `${propostas} propostas de conhecimento esperando você` : "Livro da Empresa e conhecimento da casa"}
      >
        Livro
        {propostas > 0 ? (
          <span className="rounded-full bg-amber-500 px-1.5 text-[10px] text-white">{propostas}</span>
        ) : (
          <span className="hidden rounded-full bg-black/10 px-1.5 text-[10px] lg:inline">{secoesLivro}/7</span>
        )}
      </button>

      <button
        onClick={() => useStore.getState().setRotinaAberta(true)}
        className="rounded-lg px-3 py-1.5 text-xs font-semibold text-black/70 ring-1 ring-black/10 hover:bg-black/5"
        title="Metas, indicadores, rituais e atas"
      >
        Rotina
      </button>

      <Aprovacoes />
      <BotaoNavegador />

      <button
        onClick={alternarTudo}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-black/60 ring-1 ring-black/10 hover:bg-black/5"
        title={algumAberto(minimizados) ? "Minimizar todos os painéis (M)" : "Expandir todos os painéis (M)"}
        aria-label="Minimizar ou expandir os painéis"
      >
        <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <path d="M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4" />
        </svg>
      </button>

      <Mais>
        <Toggle
          rotulo="Ouvir as respostas em voz alta"
          titulo=""
          ativo={ouvirRespostas}
          onChange={(v) => {
            if (!v) pararDeFalar();
            useStore.getState().setVoz({ ouvirRespostas: v });
          }}
        />
        <SecaoVoz />
        <Iluminacao />
        <Sons />
        <ConfigNavegador />
        <ConfigMaquina />
        <ConfigBackup />
        <button
          onClick={() => useStore.setState({ conectoresAberto: true })}
          className="w-full rounded-lg px-3 py-1.5 text-left text-xs font-medium text-black/70 ring-1 ring-black/10 hover:bg-black/5"
        >
          Conectores (Gmail, Agenda, GitHub, Stripe…)
        </button>
        <Toggle rotulo="Câmera segue a equipe que começou a trabalhar" titulo="" ativo={seguir} onChange={setSeguir} />
        <Toggle rotulo="Modo demonstração (sem chamar a IA)" titulo="" ativo={demo} onChange={(v) => send({ type: "demo", ativo: v })} />
        <button
          onClick={() => setConfigAberta(true)}
          className="w-full rounded-lg px-3 py-1.5 text-left text-xs font-medium text-black/70 ring-1 ring-black/10 hover:bg-black/5"
        >
          Chave da API da Anthropic
        </button>
      </Mais>
    </header>
  );
}

/** Efeitos sonoros, música lo-fi e volume (tudo gerado no navegador; desligado por padrão). */
function Sons() {
  const { efeitos, musica, volume, configurar } = useSons();
  return (
    <div className="space-y-1.5 rounded-xl bg-black/[0.03] p-2.5 text-[11px] text-black/65">
      <div className="font-semibold text-black/80">Sons do escritório</div>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={efeitos} onChange={(e) => configurar({ efeitos: e.target.checked })} />
        Efeitos (digitação, cafeteira, portas, aviso de aprovação)
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={musica} onChange={(e) => configurar({ musica: e.target.checked })} />
        Música lo-fi (também no rádio da copa)
      </label>
      <label className="flex items-center gap-2">
        Volume
        <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => configurar({ volume: Number(e.target.value) })} className="flex-1" />
      </label>
    </div>
  );
}

/** Dia e noite: pelo relógio do Mac ou fixo. */
function Iluminacao() {
  const modo = useCeu((s) => s.modo);
  const setModo = useCeu((s) => s.setModo);
  const opcoes: { id: ModoLuz; nome: string }[] = [
    { id: "relogio", nome: "Pelo relógio" },
    { id: "dia", nome: "Sempre dia" },
    { id: "noite", nome: "Sempre noite" },
  ];
  return (
    <div className="rounded-xl bg-black/[0.03] p-2.5 text-[11px] text-black/65">
      <div className="mb-1.5 font-semibold text-black/80">Iluminação do escritório</div>
      <div className="flex rounded-lg bg-black/[0.05] p-0.5">
        {opcoes.map((o) => (
          <button
            key={o.id}
            onClick={() => setModo(o.id)}
            className={`flex-1 rounded-md px-2 py-1 font-semibold ${modo === o.id ? "bg-white text-black shadow-sm" : "text-black/55 hover:text-black"}`}
          >
            {o.nome}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Quais vozes do Mac estão em uso e como deixar a fala mais humana. */
function SecaoVoz() {
  const vozes = vozesDisponiveis();
  const temBoa = vozes.some((v) => /premium|aprimorad|enhanced/i.test(v));
  return (
    <div className="rounded-xl bg-black/[0.03] p-2.5 text-[11px] leading-relaxed text-black/65">
      <div className="mb-1 flex items-center">
        <span className="flex-1 font-semibold text-black/80">Vozes</span>
        <button
          onClick={() => {
            pararDeFalar();
            falar("Oi! Eu sou a Helena. É assim que a equipe vai falar com você.", "chief-of-staff");
          }}
          className="rounded-md px-2 py-0.5 font-semibold ring-1 ring-black/10 hover:bg-white"
        >
          Ouvir amostra
        </button>
      </div>
      <div>Em uso: {vozes.length ? vozes.join(", ") : "voz padrão do navegador"}</div>
      {!temBoa && (
        <div className="mt-1.5">
          Para uma voz mais natural, baixe as versões <b>Premium</b> ou <b>Aprimoradas</b>: Ajustes do Sistema → Acessibilidade → Conteúdo
          Falado → Voz do Sistema → Gerenciar Vozes → Português (Brasil) → Luciana e Felipe. Depois recarregue esta página.
        </div>
      )}
    </div>
  );
}

function Mais({ children }: { children: React.ReactNode }) {
  const [aberto, setAberto] = useState(false);
  const ref = useFecharFora<HTMLDivElement>(aberto, () => setAberto(false));
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setAberto(!aberto)}
        className="grid h-8 w-8 place-items-center rounded-lg text-sm font-bold text-black/60 ring-1 ring-black/10 hover:bg-black/5"
        aria-label="Mais opções"
      >
        ⋯
      </button>
      {aberto && (
        <div className="scroll-fino absolute right-0 top-11 z-20 max-h-[calc(100vh-5rem)] w-72 space-y-3 overflow-y-auto overscroll-contain rounded-2xl bg-white p-3 shadow-[0_8px_30px_rgba(31,36,48,0.18)] ring-1 ring-black/5">
          {children}
        </div>
      )}
    </div>
  );
}

function Indicador({ rotulo, valor, cor }: { rotulo: string; valor: string; cor: string }) {
  return (
    <div className="shrink-0 leading-tight">
      <div className="text-[10px] uppercase tracking-wide text-black/45">{rotulo}</div>
      <div className="flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold">
        <span className="h-2 w-2 rounded-full" style={{ background: cor }} />
        {valor}
      </div>
    </div>
  );
}

function Toggle({ rotulo, titulo, ativo, onChange }: { rotulo: string; titulo: string; ativo: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!ativo)} title={titulo} className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-black/70">
      <span className={`relative h-5 w-9 rounded-full transition ${ativo ? "bg-[#1f2430]" : "bg-black/15"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${ativo ? "left-[18px]" : "left-0.5"}`} />
      </span>
      {rotulo}
    </button>
  );
}

/** Controle do motor: quem está trabalhando, pausar a empresa, orçamento do dia. */
function Equipe() {
  const motor = useStore((s) => s.motor);
  const chave = useStore((s) => s.chaveConfigurada);
  const cards = useStore((s) => s.cards);
  const abrirCard = useStore((s) => s.abrirCard);
  const custo = useStore((s) => s.custoHojeUsd);
  // Aberto pelo botão ou pelo painel da Equipe na Diretoria (3D).
  const aberto = useStore((s) => s.equipeAberta);
  const setAberto = useStore((s) => s.setEquipeAberta);
  const ref = useFecharFora<HTMLDivElement>(aberto, () => setAberto(false));
  const [orcamento, setOrcamento] = useState(String(motor.orcamentoDiarioUsd));
  const [erro, setErro] = useState<string | null>(null);

  const configurar = async (c: { pausado?: boolean; orcamentoDiarioUsd?: number; maxSimultaneos?: number }) => {
    setErro(null);
    try {
      await api("/api/motor", "PUT", c);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  };

  const parado = !chave || motor.pausado || motor.semOrcamento;
  const rotulo = !chave
    ? "sem chave"
    : motor.pausado
      ? "pausada"
      : motor.semOrcamento
        ? "sem orçamento"
        : motor.emAndamento.length
          ? `${motor.emAndamento.length} trabalhando`
          : "livre";
  const usd = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "USD" });

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setAberto(!aberto)}
        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 ${
          parado ? "text-amber-700 ring-amber-300 hover:bg-amber-50" : "text-black/70 ring-black/10 hover:bg-black/5"
        }`}
        title="Motor de agentes"
      >
        <span className={`h-2 w-2 rounded-full ${parado ? "bg-amber-500" : motor.emAndamento.length ? "pulsar bg-blue-500" : "bg-emerald-500"}`} />
        Equipe <span className="font-normal text-black/50">{rotulo}</span>
        {motor.naFila > 0 && <span className="rounded-full bg-black/10 px-1.5 text-[10px]">{motor.naFila} na fila</span>}
      </button>
      {aberto && (
        <div className="absolute right-0 top-11 z-20 w-[24rem] rounded-2xl bg-white p-3 shadow-[0_8px_30px_rgba(31,36,48,0.18)] ring-1 ring-black/5">
          <div className="mb-2 flex items-center">
            <div className="flex-1 text-xs font-semibold">Equipe trabalhando agora</div>
            <button
              disabled={!chave}
              onClick={() => configurar({ pausado: !motor.pausado })}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold disabled:opacity-30 ${
                motor.pausado ? "bg-emerald-600 text-white" : "bg-amber-100 text-amber-800 hover:bg-amber-200"
              }`}
            >
              {motor.pausado ? "Retomar a empresa" : "Pausar a empresa"}
            </button>
          </div>
          {!chave && <p className="mb-2 text-[11px] text-amber-700">Configure a chave da API para a equipe trabalhar.</p>}
          {motor.semOrcamento && (
            <p className="mb-2 text-[11px] text-amber-700">O gasto de hoje chegou ao orçamento. Aumente o limite para continuar.</p>
          )}
          {motor.emAndamento.length === 0 ? (
            <p className="py-2 text-center text-[11px] text-black/45">
              Ninguém trabalhando. Peça algo à Helena no chat ou coloque um card em "A fazer".
            </p>
          ) : (
            <ul className="space-y-1">
              {motor.emAndamento.map((t) => {
                const card = cards[t.cardId];
                const a = agentById[t.agenteId];
                return (
                  <li key={t.cardId}>
                    <button
                      onClick={() => {
                        abrirCard(t.cardId);
                        setAberto(false);
                      }}
                      className="w-full rounded-lg px-2 py-1.5 text-left text-xs hover:bg-black/5"
                    >
                      <b>{a?.nome}</b> {t.tipo === "validar" ? "validando" : "trabalhando em"} <b>{card?.chave}</b>
                      <div className="truncate text-[11px] text-black/50">{card?.titulo}</div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-black/5 pt-3 text-[11px]">
            <label>
              <span className="mb-0.5 block text-black/50">Orçamento por dia (US$)</span>
              <input
                type="number"
                min={0}
                step={1}
                value={orcamento}
                onChange={(e) => setOrcamento(e.target.value)}
                onBlur={() => configurar({ orcamentoDiarioUsd: Number(orcamento) })}
                className="campo"
              />
            </label>
            <label>
              <span className="mb-0.5 block text-black/50">Agentes ao mesmo tempo</span>
              <select value={motor.maxSimultaneos} onChange={(e) => configurar({ maxSimultaneos: Number(e.target.value) })} className="campo">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="mt-2 text-[10px] text-black/40">
            Gasto hoje: {usd(custo)} de {usd(motor.orcamentoDiarioUsd)}. Ao chegar no limite, a equipe para sozinha até amanhã ou até você
            aumentar o orçamento.
          </p>
          {erro && <p className="mt-1 text-[11px] text-rose-600">{erro}</p>}
        </div>
      )}
    </div>
  );
}

/** Seletor do projeto ativo: pastas da sua máquina em que a empresa trabalha. */
function Projetos() {
  const projetos = useStore((s) => s.projetos);
  const ativoId = useStore((s) => s.projetoAtivo);
  const [aberto, setAberto] = useState(false);
  const ref = useFecharFora<HTMLDivElement>(aberto, () => setAberto(false));
  const [caminho, setCaminho] = useState("");
  const [aguardando, setAguardando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const ativo = projetos.find((p) => p.id === ativoId);

  const acao = async (fn: () => Promise<unknown>) => {
    setErro(null);
    try {
      await fn();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setAberto(!aberto)}
        className="flex max-w-48 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-black/70 ring-1 ring-black/10 hover:bg-black/5"
        title={ativo?.caminho ?? "Nenhum projeto selecionado"}
      >
        <span className="text-black/40">Projeto</span>
        <span className="truncate">{ativo?.nome ?? "nenhum"}</span>
        <span className="text-black/40">▾</span>
      </button>
      {aberto && (
        <div className="absolute right-0 top-11 z-20 w-[26rem] rounded-2xl bg-white p-3 shadow-[0_8px_30px_rgba(31,36,48,0.18)] ring-1 ring-black/5">
          <div className="mb-2 text-xs font-semibold">Projetos da sua máquina</div>
          <ul className="space-y-1">
            {projetos.map((p) => (
              <ItemProjeto key={p.id} p={p} ativo={p.id === ativoId} acao={acao} />
            ))}
            {projetos.length === 0 && <li className="py-2 text-center text-[11px] text-black/45">Nenhum projeto ainda.</li>}
          </ul>
          {ativoId !== null && (
            <button onClick={() => acao(() => api("/api/projetos/ativo", "PUT", { id: null }))} className="mt-1 text-[11px] text-black/45 underline">
              Trabalhar sem projeto ativo
            </button>
          )}
          <div className="mt-3 border-t border-black/5 pt-3">
            <button
              disabled={aguardando}
              onClick={() => acao(async () => {
                setAguardando(true);
                try {
                  await api("/api/projetos/escolher", "POST");
                } finally {
                  setAguardando(false);
                }
              })}
              className="w-full rounded-lg bg-[#1f2430] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {aguardando ? "Escolha a pasta na janela que abriu no seu Mac…" : "Escolher pasta…"}
            </button>
            <div className="mt-2 flex gap-1.5">
              <input
                value={caminho}
                onChange={(e) => setCaminho(e.target.value)}
                placeholder="ou cole o caminho: /Users/voce/projetos/app"
                className="campo flex-1 font-mono"
              />
              <button
                disabled={!caminho.trim()}
                onClick={() => acao(async () => {
                  await api("/api/projetos", "POST", { caminho });
                  setCaminho("");
                })}
                className="rounded-lg px-3 text-xs font-semibold ring-1 ring-black/10 hover:bg-black/5 disabled:opacity-30"
              >
                Adicionar
              </button>
            </div>
            {erro && <p className="mt-2 text-[11px] text-rose-600">{erro}</p>}
            <p className="mt-2 text-[10px] leading-relaxed text-black/40">
              A empresa nunca mexe direto na sua pasta: cada trabalho acontece numa cópia isolada (git worktree) e só entra
              no seu projeto pelo merge que você aprovar.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/** Banco do projeto para consultas só de leitura do time de Dados (a URL fica cifrada no servidor). */
function BancoDoProjeto({ p, acao }: { p: Projeto; acao: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [atual, setAtual] = useState<{ tipo: string; resumo: string } | null | undefined>(undefined);
  const [editando, setEditando] = useState(false);
  const [tipo, setTipo] = useState<"sqlite" | "postgres">("postgres");
  const [valor, setValor] = useState("");
  useEffect(() => {
    void api<{ tipo: string; resumo: string } | { semBanco: true }>(`/api/projetos/${p.id}/banco`).then((r) => setAtual("semBanco" in r ? null : r)).catch(() => setAtual(null));
  }, [p.id]);
  if (atual === undefined) return null;
  if (!editando)
    return (
      <div className="mt-1 text-[10px] text-black/50" onClick={(e) => e.stopPropagation()}>
        Banco para o time de Dados: {atual ? <b className="text-black/70">{atual.resumo}</b> : "nenhum"}{" "}
        <span role="button" onClick={() => setEditando(true)} className="font-semibold text-blue-700">
          {atual ? "trocar" : "configurar"}
        </span>
        {atual && (
          <span role="button" onClick={() => acao(async () => { await api(`/api/projetos/${p.id}/banco`, "DELETE"); setAtual(null); })} className="ml-1.5 text-black/40 hover:text-rose-600">
            remover
          </span>
        )}
      </div>
    );
  return (
    <div className="mt-1.5 space-y-1" onClick={(e) => e.stopPropagation()}>
      <div className="flex gap-1">
        <select value={tipo} onChange={(e) => setTipo(e.target.value as "sqlite" | "postgres")} className="h-6 rounded bg-black/5 px-1 text-[10px]">
          <option value="postgres">Postgres</option>
          <option value="sqlite">SQLite</option>
        </select>
        <input
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          type={tipo === "postgres" ? "password" : "text"}
          placeholder={tipo === "postgres" ? "postgres://usuario:senha@host:5432/banco" : "caminho no projeto: dados/app.db"}
          className="h-6 min-w-0 flex-1 rounded bg-black/5 px-1.5 font-mono text-[10px] outline-none"
        />
        <span
          role="button"
          onClick={() => acao(async () => {
            setAtual(await api(`/api/projetos/${p.id}/banco`, "PUT", tipo === "postgres" ? { tipo, url: valor } : { tipo, caminho: valor }));
            setEditando(false);
            setValor("");
          })}
          className="self-center text-[10px] font-semibold text-blue-700"
        >
          salvar
        </span>
      </div>
      <p className="text-[9px] leading-snug text-black/45">
        Só leitura (SELECT), com dados pessoais mascarados. Os resultados vão para a IA: prefira um banco de homologação ou um usuário só de leitura.
      </p>
    </div>
  );
}

/** Onde o app roda na sua máquina: o Treinamento e o QA usam para tirar prints das telas. */
function EnderecoLocal({ p, acao }: { p: Projeto; acao: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [url, setUrl] = useState(p.urlLocal ?? "");
  return (
    <div className="mt-1.5 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="App rodando em (ex.: http://localhost:3000)"
        className="h-6 min-w-0 flex-1 rounded bg-black/5 px-1.5 font-mono text-[10px] outline-none"
        title="Endereço local do app, para os prints do treinamento e do QA"
      />
      {url !== (p.urlLocal ?? "") && (
        <span role="button" onClick={() => acao(() => api(`/api/projetos/${p.id}/url-local`, "PUT", { urlLocal: url || null }))} className="text-[10px] font-semibold text-blue-700">
          salvar
        </span>
      )}
    </div>
  );
}

function ItemProjeto({ p, ativo, acao }: { p: Projeto; ativo: boolean; acao: (fn: () => Promise<unknown>) => Promise<void> }) {
  return (
    <li className={`group flex items-start gap-2 rounded-lg px-2 py-1.5 ${ativo ? "bg-[#1f2430]/5 ring-1 ring-[#1f2430]/15" : "hover:bg-black/5"}`}>
      <button onClick={() => acao(() => api("/api/projetos/ativo", "PUT", { id: p.id }))} className="min-w-0 flex-1 text-left">
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          {ativo && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
          {p.nome}
          <span className="font-normal text-black/40">{p.git ? `git · ${p.branch ?? "sem branch"}` : "sem git"}</span>
        </div>
        <div className="truncate font-mono text-[10px] text-black/45">{p.caminho}</div>
        <div className="mt-1 text-[10px]">
          {p.ficha ? (
            <span className="font-semibold text-emerald-700">✓ Ficha do Projeto pronta</span>
          ) : (
            <span
              role="button"
              onClick={(e) => {
                e.stopPropagation();
                void acao(async () => {
                  const card = await api<Card>(`/api/projetos/${p.id}/raio-x`, "POST");
                  useStore.getState().abrirCard(card.id);
                });
              }}
              className="font-semibold text-blue-700 hover:underline"
            >
              Fazer raio-x do projeto →
            </span>
          )}
        </div>
        {ativo && <EnderecoLocal p={p} acao={acao} />}
        {ativo && <BancoDoProjeto p={p} acao={acao} />}
        {p.sinais.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {p.sinais.map((s) => (
              <span key={s} className="rounded bg-black/5 px-1 text-[9px] text-black/55">
                {s}
              </span>
            ))}
          </div>
        )}
      </button>
      <button
        onClick={() => acao(async () => {
          if (confirm(`Remover "${p.nome}" da lista? A pasta no seu Mac não é apagada.`)) await api(`/api/projetos/${p.id}`, "DELETE");
        })}
        className="text-[11px] text-black/30 opacity-0 hover:text-rose-600 group-hover:opacity-100"
        title="Remover da lista"
      >
        ✕
      </button>
    </li>
  );
}

const pesoPrioridade = (c: Card) => prioridades.findIndex((p) => p.id === c.prioridade);

/** Caixa única de aprovações: cards que já passaram pelo validador e esperam você. */
function Aprovacoes() {
  const cards = useStore((s) => s.cards);
  const abrirCard = useStore((s) => s.abrirCard);
  const [aberto, setAberto] = useState(false);
  const ref = useFecharFora<HTMLDivElement>(aberto, () => setAberto(false));
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [erro, setErro] = useState<string | null>(null);

  const pendentes = Object.values(cards)
    .filter((c) => colunaDe(c.fluxo, c.coluna)?.tipo === "ceo")
    .sort((a, b) => pesoPrioridade(a) - pesoPrioridade(b) || a.atualizadoEm - b.atualizadoEm);
  const acoes = useStore((s) => s.pedidosMcp.filter((p) => p.status === "pendente").length);
  const total = pendentes.length + acoes;
  const n1 = pendentes.filter((c) => c.nivel === "N1");
  const marcados = n1.filter((c) => selecionados.has(c.id));

  const alternar = (id: number) => {
    const s = new Set(selecionados);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setSelecionados(s);
  };

  const aprovarLote = async () => {
    setErro(null);
    try {
      await api("/api/cards/aprovar-lote", "POST", { ids: marcados.map((c) => c.id) });
      setSelecionados(new Set());
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setAberto(!aberto)}
        className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 ${
          total ? "bg-rose-600 text-white ring-rose-700" : "text-black/70 ring-black/10 hover:bg-black/5"
        }`}
      >
        Aprovações
        <span className={`rounded-full px-1.5 text-[10px] ${total ? "bg-white text-rose-600" : "bg-black/10"}`}>{total}</span>
      </button>
      {aberto && (
        <div className="absolute right-0 top-11 z-20 w-[28rem] rounded-2xl bg-white p-3 shadow-[0_8px_30px_rgba(31,36,48,0.18)] ring-1 ring-black/5">
          <PedidosDeAcao />
          <div className="mb-2 flex items-center">
            <div className="flex-1 text-xs font-semibold">Aguardando a sua aprovação</div>
            {n1.length > 1 && (
              <button
                onClick={() => setSelecionados(marcados.length === n1.length ? new Set() : new Set(n1.map((c) => c.id)))}
                className="text-[11px] text-black/50 underline"
              >
                {marcados.length === n1.length ? "desmarcar N1" : "marcar todos N1"}
              </button>
            )}
          </div>
          {pendentes.length === 0 ? (
            <p className="py-4 text-center text-xs text-black/45">Nada pendente. Quando um card for validado por outro agente, ele aparece aqui.</p>
          ) : (
            <ul className="scroll-fino max-h-96 space-y-1 overflow-y-auto">
              {pendentes.map((c) => {
                const t = tipoInfo(c.tipo);
                return (
                  <li key={c.id} className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-black/5">
                    <input
                      type="checkbox"
                      disabled={c.nivel !== "N1"}
                      checked={selecionados.has(c.id)}
                      onChange={() => alternar(c.id)}
                      title={c.nivel === "N1" ? "Selecionar para aprovar em lote" : `${c.nivel}: aprove abrindo o card`}
                      className="mt-1"
                    />
                    <button
                      onClick={() => {
                        abrirCard(c.id);
                        setAberto(false);
                      }}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="truncate text-xs font-semibold">
                        <span style={{ color: t.cor }}>{t.icone}</span> {c.titulo}
                      </div>
                      <div className="text-[11px] text-black/50">
                        {c.chave} · {roomById[c.sala].nome} · {c.prioridade} · <b className={c.nivel === "N1" ? "" : "text-rose-600"}>{c.nivel}</b>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {erro && <p className="mt-2 text-[11px] text-rose-600">{erro}</p>}
          <div className="mt-2 flex items-center gap-2 border-t border-black/5 pt-2">
            <p className="flex-1 text-[10px] text-black/40">N1 pode ser aprovado em lote. N2 e N3, abrindo o card um por um.</p>
            <button
              disabled={!marcados.length}
              onClick={aprovarLote}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-30"
            >
              Aprovar {marcados.length || ""} selecionado{marcados.length === 1 ? "" : "s"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
