import { useState } from "react";
import { colunaDeEntrada, fluxoDaSala, fluxos, niveis, prioridades, tiposCard, type Card, type FluxoId, type RoomId } from "@empresa/shared";
import { agents, roomById, rooms } from "@empresa/org";
import { useStore } from "../../store.ts";
import { api } from "../../api.ts";

const salaPadrao: Record<FluxoId, RoomId> = {
  software: "produto", marketing: "marketing", comercial: "comercial", operacoes: "infraestrutura", geral: "diretoria",
};

/** Criação de card pelo CEO. Entra na primeira coluna do fluxo. */
export function NovoCard() {
  const aberto = useStore((s) => s.novoCardAberto);
  const fechar = () => useStore.getState().setNovoCardAberto(false);
  const fluxoAtual = useStore((s) => s.fluxoBoard);
  const projetos = useStore((s) => s.projetos);
  const projetoAtivo = useStore((s) => s.projetoAtivo);
  const abrirCard = useStore((s) => s.abrirCard);
  if (!aberto) return null;
  return (
    <Formulario
      fluxoInicial={fluxoAtual}
      projetos={projetos.map((p) => [p.id, p.nome])}
      projetoInicial={projetoAtivo}
      fechar={fechar}
      criado={(c) => {
        fechar();
        abrirCard(c.id);
      }}
    />
  );
}

function Formulario({ fluxoInicial, projetos, projetoInicial, fechar, criado }: {
  fluxoInicial: FluxoId;
  projetos: [number, string][];
  projetoInicial: number | null;
  fechar: () => void;
  criado: (c: Card) => void;
}) {
  const [fluxo, setFluxo] = useState<FluxoId>(fluxoInicial);
  const [sala, setSala] = useState<RoomId>(salaPadrao[fluxoInicial]);
  const [titulo, setTitulo] = useState("");
  const [tipo, setTipo] = useState<Card["tipo"]>(fluxoInicial === "software" ? "historia" : "tarefa");
  const [prioridade, setPrioridade] = useState<Card["prioridade"]>("P2");
  const [nivel, setNivel] = useState<Card["nivel"]>("N1");
  const [descricao, setDescricao] = useState("");
  const [criterios, setCriterios] = useState("");
  const [projetoId, setProjetoId] = useState<number | null>(fluxoInicial === "software" ? projetoInicial : null);
  const liderDe = (s: RoomId) => agents.find((a) => a.sala === s && a.lider)?.id ?? agents.find((a) => a.sala === s)?.id ?? "";
  const [dono, setDono] = useState(liderDe(salaPadrao[fluxoInicial]));
  const [comecarAgora, setComecarAgora] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const salasDoFluxo = rooms.filter((r) => fluxoDaSala[r.id] === fluxo || r.id === sala);

  const criar = async () => {
    setErro(null);
    try {
      // "Começar agora" coloca o card na fila da equipe (fora do Backlog) para o motor pegar.
      const coluna = comecarAgora ? colunaDeEntrada(fluxo) : undefined;
      criado(
        await api<Card>("/api/cards", "POST", {
          titulo, fluxo, sala, tipo, prioridade, nivel, descricao, criterios, projetoId, coluna, dono: dono || null,
        }),
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="pointer-events-auto absolute inset-0 z-40 grid place-items-center bg-[#1f2430]/35 p-4 backdrop-blur-sm" onClick={fechar}>
      <div className="w-[min(560px,100%)] rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-bold">Criar card</h2>
        <p className="text-xs text-black/50">
          O validador padrão é o da área ({roomById[sala].validador ? agents.find((a) => a.id === roomById[sala].validador)?.nome : "nenhum"}). Com "a equipe começa agora", o responsável pega o card
          sozinho; sem isso, ele fica no Backlog.
        </p>
        <input
          autoFocus
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Título"
          className="campo mt-4 w-full text-sm"
        />
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <select
            value={fluxo}
            onChange={(e) => {
              const f = e.target.value as FluxoId;
              setFluxo(f);
              setSala(salaPadrao[f]);
              setDono(liderDe(salaPadrao[f]));
            }}
            className="campo"
          >
            {(Object.keys(fluxos) as FluxoId[]).map((f) => (
              <option key={f} value={f}>
                Board {fluxos[f].nome}
              </option>
            ))}
          </select>
          <select
            value={sala}
            onChange={(e) => {
              setSala(e.target.value as RoomId);
              setDono(liderDe(e.target.value as RoomId));
            }}
            className="campo"
          >
            {salasDoFluxo.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nome}
              </option>
            ))}
          </select>
          <select value={tipo} onChange={(e) => setTipo(e.target.value as Card["tipo"])} className="campo">
            {tiposCard.map((t) => (
              <option key={t.id} value={t.id}>
                {t.icone} {t.nome}
              </option>
            ))}
          </select>
          <select value={prioridade} onChange={(e) => setPrioridade(e.target.value as Card["prioridade"])} className="campo">
            {prioridades.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id} · {p.nome}
              </option>
            ))}
          </select>
          <select value={nivel} onChange={(e) => setNivel(e.target.value as Card["nivel"])} className="campo" title={niveis.find((n) => n.id === nivel)?.descricao}>
            {niveis.map((n) => (
              <option key={n.id} value={n.id}>
                {n.id} · {n.nome}
              </option>
            ))}
          </select>
          <select value={projetoId ?? ""} onChange={(e) => setProjetoId(e.target.value ? Number(e.target.value) : null)} className="campo">
            <option value="">Sem projeto</option>
            {projetos.map(([id, nome]) => (
              <option key={id} value={id}>
                {nome}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-2 flex items-center gap-2 text-xs">
          <select value={dono} onChange={(e) => setDono(e.target.value)} className="campo flex-1">
            <option value="">Sem responsável</option>
            {agents
              .filter((a) => a.sala === sala)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome} · {a.cargo}
                </option>
              ))}
          </select>
          <label className="flex shrink-0 items-center gap-1.5 text-black/70" title="Sem isso, o card fica parado no Backlog">
            <input type="checkbox" checked={comecarAgora} onChange={(e) => setComecarAgora(e.target.checked)} />
            A equipe começa agora
          </label>
        </div>
        <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} placeholder="Descrição (Markdown)" className="campo mt-2 w-full resize-none py-2" />
        <textarea value={criterios} onChange={(e) => setCriterios(e.target.value)} rows={3} placeholder={"Critérios de aceite\n- Dado… quando… então…"} className="campo mt-2 w-full resize-none py-2" />
        {erro && <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{erro}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={fechar} className="rounded-lg px-3 py-2 text-xs text-black/60 hover:bg-black/5">
            Cancelar
          </button>
          <button onClick={criar} disabled={!titulo.trim()} className="rounded-lg bg-[#1f2430] px-4 py-2 text-xs font-semibold text-white disabled:opacity-30">
            Criar card
          </button>
        </div>
      </div>
    </div>
  );
}
