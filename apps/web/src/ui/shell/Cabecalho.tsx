import { useEffect, useRef } from "react";
import { Bell, Bot, ChevronRight, Pause, Play, Search } from "lucide-react";
import { fluxos, type FluxoId } from "@empresa/shared";
import { agentById } from "@empresa/org";
import { navegar, useNav, type Area } from "../../nav.ts";
import { useStore } from "../../store.ts";
import { api } from "../../api.ts";
import { Avatar, Botao, BotaoIcone, Kbd, Popover, Seletor, avisarErro, cx } from "../kit/index.ts";
import { usePendencias } from "./pendencias.ts";
import { abrirPaleta } from "./Paleta.tsx";
import { CampoOrcamento } from "../CampoOrcamento.tsx";

// Cabeçalho (56 px): título e trilha à esquerda, busca/comando ⌘K no centro, estado da equipe, custo e Caixa de entrada à direita.

export const NOMES_AREA: Record<Area, string> = {
  escritorio: "Escritório",
  entrada: "Caixa de entrada",
  trabalho: "Trabalho",
  clientes: "Clientes",
  equipe: "Equipe",
  empresa: "Empresa",
  operacao: "Operação",
  config: "Configurações",
  escritorios: "Escritórios",
};

const NOMES_SUB: Record<string, string> = {
  livro: "Livro da Empresa", conhecimento: "Conhecimento", metas: "Metas", indicadores: "Indicadores", rituais: "Rituais e atas", atas: "Rituais e atas", conquistas: "Conquistas",
  whatsapp: "WhatsApp", leads: "Leads", atendimentos: "Atendimentos", "nao-contatar": "Não contatar",
  agentes: "Agentes", "ao-vivo": "Ao vivo",
  hoje: "Hoje", piloto: "Piloto automático", chamadas: "Chamadas de IA", qualidade: "Qualidade", auditoria: "Auditoria", projetos: "Projetos", monitoramento: "Monitoramento", financas: "Finanças", backup: "Backup",
  geral: "Geral", integracoes: "Integrações", modelos: "Modelos de IA", voz: "Voz e sons", escritorio: "Escritório", permissoes: "Permissões dos agentes", conectores: "Conectores", sobre: "Sobre",
};

const usd = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "USD" });

export function Cabecalho() {
  const rota = useNav((s) => s.rota);
  const pendencias = usePendencias().length;
  const custo = useStore((s) => s.custoHojeUsd);
  const sub = rota.area === "trabalho" && rota.sub ? fluxos[rota.sub as FluxoId]?.nome : rota.sub ? NOMES_SUB[rota.sub] : null;
  const agente = rota.area === "equipe" && rota.id ? agentById[rota.id]?.nome : null;

  return (
    <header className="relative z-[1100] flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-4">
      <nav aria-label="Trilha" className="flex min-w-0 flex-1 items-center gap-1.5 text-corpo">
        <button type="button" onClick={() => navegar(rota.area)} className={cx("min-h-alvo truncate font-semibold", sub ? "text-fg-2 hover:text-fg" : "text-fg")}>
          {NOMES_AREA[rota.area]}
        </button>
        {sub && (
          <>
            <ChevronRight className="size-4 shrink-0 text-fg-3" />
            <span className={cx("truncate font-semibold", agente ? "text-fg-2" : "text-fg")}>{sub}</span>
          </>
        )}
        {agente && (
          <>
            <ChevronRight className="size-4 shrink-0 text-fg-3" />
            <span className="truncate font-semibold text-fg">{agente}</span>
          </>
        )}
      </nav>

      <button
        type="button"
        onClick={abrirPaleta}
        className="hidden h-9 w-[min(420px,32vw)] items-center gap-2 rounded-ctl bg-sunken px-3 text-corpo text-fg-3 transition-colors hover:text-fg-2 md:flex"
      >
        <Search className="size-4" strokeWidth={1.75} />
        <span className="flex-1 truncate text-left">Buscar ou pedir algo…</span>
        <Kbd>⌘</Kbd>
        <Kbd>K</Kbd>
      </button>
      <BotaoIcone icone={Search} rotulo="Buscar (⌘K)" onClick={abrirPaleta} className="md:hidden" />

      <div className="flex flex-1 items-center justify-end gap-1.5">
        <SeloPiloto />
        <EstadoEquipe />
        <span className="tabular hidden whitespace-nowrap px-2 text-pequeno text-fg-2 lg:inline" title="Gasto com IA hoje">
          {usd(custo)} <span className="text-fg-3">hoje</span>
        </span>
        <BotaoIcone icone={Bell} rotulo={`Caixa de entrada${pendencias ? ` (${pendencias})` : ""}`} selo={pendencias > 99 ? "99+" : pendencias} onClick={() => navegar("entrada")} />
      </div>
    </header>
  );
}

/** Estado da equipe e controles rápidos: pausar, orçamento, agentes ao mesmo tempo, quem está trabalhando. */
/** "Automático" no topo enquanto o piloto decide no seu lugar (clique abre Operação → Piloto automático). */
function SeloPiloto() {
  const piloto = useStore((s) => s.autonomia);
  useEffect(() => {
    if (!useStore.getState().autonomia) void api<NonNullable<typeof piloto>>("/api/autonomia").then((x) => useStore.setState({ autonomia: x })).catch(() => {});
  }, []);
  if (!piloto?.ativo) return null;
  return (
    <button type="button" onClick={() => navegar("operacao", "piloto")} className="flex h-9 items-center gap-1.5 rounded-ctl px-2.5 text-pequeno font-medium text-accent-fg hover:bg-hover" title="Piloto automático ligado">
      <Bot className="size-4" strokeWidth={1.75} /> <span className="hidden whitespace-nowrap sm:inline">Automático</span>
    </button>
  );
}

function EstadoEquipe() {
  const motor = useStore((s) => s.motor);
  const chave = useStore((s) => s.chaveConfigurada);
  const cards = useStore((s) => s.cards);
  const custo = useStore((s) => s.custoHojeUsd);
  const aberto = useStore((s) => s.equipeAberta);
  const setAberto = useStore((s) => s.setEquipeAberta);
  const ancora = useRef<HTMLButtonElement>(null);

  const configurar = (c: { pausado?: boolean; orcamentoDiarioUsd?: number; maxSimultaneos?: number }) => api("/api/motor", "PUT", c).catch(avisarErro);
  const trabalhando = motor.emAndamento.length;
  const estado = !chave ? { rotulo: "Sem chave da API", cor: "bg-warning" } : motor.pausado ? { rotulo: "Pausada", cor: "bg-warning" } : motor.semOrcamento ? { rotulo: "Sem orçamento", cor: "bg-danger" } : motor.esperandoApiAte ? { rotulo: "Esperando a API", cor: "pulsar bg-warning" } : trabalhando ? { rotulo: `${trabalhando} trabalhando`, cor: "pulsar bg-accent" } : { rotulo: "Livre", cor: "bg-success" };

  return (
    <>
      <button
        ref={ancora}
        type="button"
        onClick={() => setAberto(!aberto)}
        className={cx("flex h-9 items-center gap-2 rounded-ctl px-3 text-pequeno font-medium transition-colors", aberto ? "bg-press text-fg" : "text-fg-2 hover:bg-hover hover:text-fg")}
      >
        <span className={cx("size-2 rounded-full", estado.cor)} />
        <span className="whitespace-nowrap">{estado.rotulo}</span>
        {motor.naFila > 0 && <span className="tabular hidden rounded-full bg-sunken px-1.5 text-legenda text-fg-2 xl:inline">{motor.naFila} na fila</span>}
      </button>
      <Popover aberto={aberto} fechar={() => setAberto(false)} ancora={ancora} largura={380} alinhar="fim">
        <div className="space-y-3 p-2">
          <div className="flex items-center gap-2">
            <div className="flex-1 text-corpo font-semibold text-fg">Equipe agora</div>
            {chave ? (
              <Botao tamanho="p" variante={motor.pausado ? "sucesso" : "secundario"} icone={motor.pausado ? Play : Pause} onClick={() => void configurar({ pausado: !motor.pausado })}>
                {motor.pausado ? "Retomar" : "Pausar a empresa"}
              </Botao>
            ) : (
              <Botao tamanho="p" variante="principal" onClick={() => { setAberto(false); navegar("config", "geral"); }}>
                Configurar chave
              </Botao>
            )}
          </div>
          {motor.semOrcamento && <p className="rounded-ctl bg-danger-soft px-3 py-2 text-pequeno text-danger-fg">O gasto de hoje chegou ao orçamento. Aumente o limite para continuar.</p>}
          {trabalhando === 0 ? (
            <p className="rounded-ctl bg-sunken px-3 py-3 text-center text-pequeno text-fg-2">Ninguém trabalhando agora. Peça algo à Helena ou coloque um card em "A fazer".</p>
          ) : (
            <ul className="space-y-0.5">
              {motor.emAndamento.map((t) => {
                const card = cards[t.cardId];
                const a = agentById[t.agenteId];
                return (
                  <li key={t.cardId}>
                    <button type="button" onClick={() => { useStore.getState().abrirCard(t.cardId); setAberto(false); }} className="flex w-full items-center gap-2.5 rounded-ctl px-2 py-1.5 text-left hover:bg-hover">
                      {a && <Avatar nome={a.nome} cor={a.aparencia.camisa} tamanho={26} status="ativo" />}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-pequeno text-fg"><b className="font-semibold">{a?.nome}</b> {t.tipo === "validar" ? "validando" : "trabalhando em"} {card?.chave}</span>
                        <span className="block truncate text-legenda text-fg-3">{card?.titulo}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="grid grid-cols-2 gap-2 border-t border-line pt-3">
            <CampoOrcamento tamanho="p" />
            <Seletor rotulo="Ao mesmo tempo" tamanho="p" value={motor.maxSimultaneos} onChange={(e) => void configurar({ maxSimultaneos: Number(e.target.value) })}>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>{n} agente{n > 1 ? "s" : ""}</option>
              ))}
            </Seletor>
          </div>
          <p className="tabular text-legenda text-fg-3">Gasto hoje: {usd(custo)} de {usd(motor.orcamentoDiarioUsd)}. No limite, a equipe para sozinha até amanhã.</p>
        </div>
      </Popover>
    </>
  );
}
