import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { colunaDeEntrada, fluxoDaSala, fluxos, niveis, prioridades, tiposCard, type Card, type FluxoId, type RoomId } from "@empresa/shared";
import { agentById, agents, roomById, rooms } from "@empresa/org";
import { useStore } from "../../store.ts";
import { api } from "../../api.ts";
import { AreaTexto, Botao, Campo, Interruptor, Janela, Seletor, avisar } from "../kit/index.ts";

// Novo card (DESIGN-INTERFACE.md §6.3): título em destaque, quadro/área/prioridade à mostra, o resto recolhido.

const salaPadrao: Record<FluxoId, RoomId> = {
  software: "produto", marketing: "marketing", comercial: "comercial", operacoes: "infraestrutura", geral: "diretoria",
};
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
  const [sala, setSala] = useState<RoomId>(salaPadrao[fluxoInicial]);
  const [titulo, setTitulo] = useState("");
  const [tipo, setTipo] = useState<Card["tipo"]>(fluxoInicial === "software" ? "historia" : "tarefa");
  const [prioridade, setPrioridade] = useState<Card["prioridade"]>("P2");
  const [nivel, setNivel] = useState<Card["nivel"]>("N1");
  const [descricao, setDescricao] = useState("");
  const [criterios, setCriterios] = useState("");
  const [projetoId, setProjetoId] = useState<number | null>(fluxoInicial === "software" ? projetoAtivo : null);
  const [dono, setDono] = useState(liderDe(salaPadrao[fluxoInicial]));
  const [comecarAgora, setComecarAgora] = useState(true);
  const [mais, setMais] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const salasDoFluxo = rooms.filter((r) => fluxoDaSala[r.id] === fluxo || r.id === sala);
  const validador = roomById[sala].validador ? agentById[roomById[sala].validador!] : null;

  const criar = async () => {
    if (!titulo.trim()) return setErro("Dê um título ao card.");
    setErro(null);
    setCriando(true);
    try {
      // "Começar agora" coloca o card na fila da equipe (fora do Backlog) para o motor pegar.
      const coluna = comecarAgora ? colunaDeEntrada(fluxo) : undefined;
      const c = await api<Card>("/api/cards", "POST", { titulo, fluxo, sala, tipo, prioridade, nivel, descricao, criterios, projetoId, coluna, dono: dono || null });
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
            setSala(salaPadrao[f]);
            setDono(liderDe(salaPadrao[f]));
          }}
        >
          {(Object.keys(fluxos) as FluxoId[]).map((f) => <option key={f} value={f}>{fluxos[f].nome}</option>)}
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
          <AreaTexto rotulo="Critérios de aceite" value={criterios} onChange={(e) => setCriterios(e.target.value)} rows={3} placeholder={"- Dado um cliente no plano mensal, quando ele abre Preços, então vê o desconto do anual"} />
        </div>
      )}

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
