import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { baseDoFluxo, ehCardDeCodigo, colunaDeEntrada, fluxoDaSala, fluxos, niveis, prioridades, tiposCard, type Card, type FluxoId, type RoomId, fluxoPadrao } from "@empresa/shared";
import { agentById, agents, roomById, rooms, salaDe, fluxosDe, escritorioAtivo } from "@empresa/org";
import { useStore } from "../../store.ts";
import { api } from "../../api.ts";
import { AreaTexto, Botao, Campo, Interruptor, Janela, Seletor, avisar } from "../kit/index.ts";

// Novo card (DESIGN-INTERFACE.md §6.3): título em destaque, quadro/área/prioridade à mostra, o resto recolhido.

const salaPadrao: Partial<Record<FluxoId, RoomId>> = {
  software: "produto", marketing: "marketing", comercial: "comercial", operacoes: "infraestrutura", geral: "diretoria",
};
/** Sala onde um card novo deste fluxo nasce (a da sede, a da 1ª coluna com sala ou a 1ª sala do escritório). */
const salaPadraoDo = (f: FluxoId): RoomId => salaPadrao[f] ?? fluxos[f]?.colunas.find((c) => c.sala)?.sala ?? rooms[0]!.id;
const liderDe = (s: RoomId) => agents.find((a) => a.sala === s && a.lider)?.id ?? agents.find((a) => a.sala === s)?.id ?? "";

export function NovoCard() {
  const aberto = useStore((s) => s.novoCardAberto);
  const fechar = () => useStore.getState().setNovoCardAberto(false);
  return (
    <Janela aberta={aberto} fechar={fechar} titulo="Novo card" largura={620} rodape={null}>
      {aberto && <Formulario fechar={fechar} />}
    </Janela>
  );
}

function Formulario({ fechar }: { fechar: () => void }) {
  const fluxoInicial = useStore.getState().fluxoBoard;
  const projetos = useStore((s) => s.projetos);
  const projetoAtivo = useStore((s) => s.projetoAtivo);
  const [fluxo, setFluxo] = useState<FluxoId>(fluxoInicial);
  const [sala, setSala] = useState<RoomId>(salaPadraoDo(fluxoInicial));
  const [titulo, setTitulo] = useState("");
  const [tipo, setTipo] = useState<Card["tipo"]>(baseDoFluxo(fluxoInicial) === "software" ? "historia" : "tarefa");
  const [prioridade, setPrioridade] = useState<Card["prioridade"]>("P2");
  const [nivel, setNivel] = useState<Card["nivel"]>("N1");
  const [descricao, setDescricao] = useState("");
  const [criterios, setCriterios] = useState("");
  const [projetoId, setProjetoId] = useState<number | null>(baseDoFluxo(fluxoInicial) === "software" ? projetoAtivo : null);
  const [melhorDe3, setMelhorDe3] = useState(false);
  // Card que mexe no código (sala de código do fluxo de software, com projeto): pode usar o "melhor de 3".
  const codigo = !!projetoId && ehCardDeCodigo({ fluxo, sala, tipo });
  const [dono, setDono] = useState(liderDe(salaPadraoDo(fluxoInicial)));
  const [comecarAgora, setComecarAgora] = useState(true);
  const [mais, setMais] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const salasDoFluxo = rooms.filter((r) => fluxoPadrao(r.id) === fluxo || r.id === sala);
  const validador = salaDe(sala).validador ? agentById[salaDe(sala).validador!] : null;

  const criar = async () => {
    if (!titulo.trim()) return setErro("Dê um título ao card.");
    setErro(null);
    setCriando(true);
    try {
      // "Começar agora" coloca o card na fila da equipe (fora do Backlog) para o motor pegar.
      const coluna = comecarAgora ? colunaDeEntrada(fluxo) : undefined;
      const c = await api<Card>("/api/cards", "POST", { titulo, fluxo, sala, tipo, prioridade, nivel, descricao, criterios, projetoId, coluna, dono: dono || null, ...(melhorDe3 && codigo ? { etiquetas: ["melhor-de-3"] } : {}) });
      fechar();
      avisar(`${c.chave} criado`);
      useStore.getState().abrirCard(c.id);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCriando(false);
    }
  };

  return (
    <form
      className="space-y-4 pb-3"
      onSubmit={(e) => {
        e.preventDefault();
        void criar();
      }}
    >
      <Campo data-autofoco erro={erro} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Página de preços com plano anual" className="h-11 text-destaque" />
      <div className="grid grid-cols-3 gap-2">
        <Seletor
          rotulo="Quadro"
          tamanho="p"
          value={fluxo}
          onChange={(e) => {
            const f = e.target.value as FluxoId;
            setFluxo(f);
            setSala(salaPadraoDo(f));
            setDono(liderDe(salaPadraoDo(f)));
          }}
        >
          {fluxosDe(escritorioAtivo()).map((x) => x.id).map((f) => <option key={f} value={f}>{fluxos[f]!.nome}</option>)}
        </Seletor>
        <Seletor
          rotulo="Área"
          tamanho="p"
          value={sala}
          onChange={(e) => {
            setSala(e.target.value as RoomId);
            setDono(liderDe(e.target.value as RoomId));
          }}
        >
          {salasDoFluxo.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
        </Seletor>
        <Seletor rotulo="Prioridade" tamanho="p" value={prioridade} onChange={(e) => setPrioridade(e.target.value as Card["prioridade"])}>
          {prioridades.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.nome}</option>)}
        </Seletor>
      </div>
      <AreaTexto rotulo="Descrição" value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={4} placeholder="O que precisa ser feito e por quê. Aceita Markdown." />

      <button type="button" onClick={() => setMais(!mais)} className="flex items-center gap-1 text-pequeno font-medium text-fg-2 hover:text-fg">
        {mais ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />} Mais opções
      </button>
      {mais && (
        <div className="space-y-3 rounded-card bg-surface-2 p-3">
          <div className="grid grid-cols-3 gap-2">
            <Seletor rotulo="Tipo" tamanho="p" value={tipo} onChange={(e) => setTipo(e.target.value as Card["tipo"])}>
              {tiposCard.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </Seletor>
            <Seletor rotulo="Autonomia" tamanho="p" value={nivel} title={niveis.find((n) => n.id === nivel)?.descricao} onChange={(e) => setNivel(e.target.value as Card["nivel"])}>
              {niveis.map((n) => <option key={n.id} value={n.id}>{n.id} · {n.nome}</option>)}
            </Seletor>
            <Seletor rotulo="Projeto" tamanho="p" value={projetoId ?? ""} onChange={(e) => setProjetoId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Nenhum</option>
              {projetos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </Seletor>
          </div>
          <Seletor rotulo="Responsável" tamanho="p" value={dono} onChange={(e) => setDono(e.target.value)} ajuda={validador ? `Quem valida: ${validador.nome} (${validador.cargo}).` : undefined}>
            <option value="">Sem responsável</option>
            {agents.filter((a) => a.sala === sala).map((a) => <option key={a.id} value={a.id}>{a.nome} · {a.cargo}</option>)}
          </Seletor>
          {codigo && (
            <Interruptor
              ativo={melhorDe3}
              onChange={setMelhorDe3}
              rotulo="Melhor de 3"
              descricao="Para código crítico: 3 tentativas em paralelo, fica a que passa nas verificações (tipos, lint e testes) com o menor diff. Custa cerca de 3 vezes mais."
            />
          )}
          <AreaTexto rotulo="Critérios de aceite" value={criterios} onChange={(e) => setCriterios(e.target.value)} rows={3} placeholder={"- Dado um cliente no plano mensal, quando ele abre Preços, então vê o desconto do anual"} />
        </div>
      )}

      <Estimativa sala={sala} tipo={tipo} />
      <div className="flex items-center gap-3 border-t border-line pt-4">
        <div className="flex-1">
          <Interruptor ativo={comecarAgora} onChange={setComecarAgora} rotulo="A equipe começa agora" descricao={comecarAgora ? "O responsável pega o card sozinho." : "O card fica parado no Backlog."} />
        </div>
        <Botao variante="discreto" onClick={fechar}>Cancelar</Botao>
        <Botao variante="principal" type="submit" carregando={criando}>Criar card</Botao>
      </div>
    </form>
  );
}

/** Quanto cards parecidos (mesma área e tipo) costumam custar, pelo histórico. */
function Estimativa({ sala, tipo }: { sala: RoomId; tipo: Card["tipo"] }) {
  const [e, setE] = useState<{ min: number; tipico: number; max: number; amostras: number } | null>(null);
  useEffect(() => {
    void api<{ min: number; tipico: number; max: number; amostras: number } | { semHistorico: true }>(`/api/estimativa?sala=${encodeURIComponent(sala)}&tipo=${tipo}`)
      .then((r) => setE("semHistorico" in r ? null : r))
      .catch(() => setE(null));
  }, [sala, tipo]);
  if (!e) return null;
  const usd = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "USD" });
  return (
    <p className="text-legenda text-fg-3">
      Custo estimado: <b className="text-fg-2">{usd(e.tipico)}</b> (normalmente entre {usd(e.min)} e {usd(e.max)}, pelos últimos {e.amostras} cards parecidos).
    </p>
  );
}
