import { useEffect, useState } from "react";
import {
  colunaDe, fluxos, niveis, prioridades, severidades, tiposCard, type Card, type CardEditavel, type Comentario, type Entrega,
} from "@empresa/shared";
import { agentById, agents, rooms } from "@empresa/org";
import { useStore } from "../../store.ts";
import { api } from "../../api.ts";
import { Markdown } from "../Markdown.tsx";
import { Avatarzinho, hora } from "../SidePanel.tsx";
import { Badge, tipoInfo } from "./CardItem.tsx";
import { FichaLead } from "./Prospeccao.tsx";
import { SecaoCodigo } from "./Codigo.tsx";
import { FichaPeca } from "./Marketing.tsx";

/** Gaveta com tudo de um card: campos, aprovação, bugs ligados e o debate. */
export function CardDetalhe() {
  const id = useStore((s) => s.cardAberto);
  const card = useStore((s) => (id === null ? undefined : s.cards[id]));
  const abrirCard = useStore((s) => s.abrirCard);
  const setComentarios = useStore((s) => s.setComentarios);
  const setEntregas = useStore((s) => s.setEntregas);

  useEffect(() => {
    if (id === null) return;
    api<Comentario[]>(`/api/cards/${id}/comentarios`).then(setComentarios).catch(() => setComentarios([]));
    api<Entrega[]>(`/api/cards/${id}/entregas`).then(setEntregas).catch(() => setEntregas([]));
  }, [id, setComentarios, setEntregas]);

  if (!card) return null;
  // key: ao trocar de card, todo o estado local (rascunhos, erros) recomeça.
  return <Detalhe key={card.id} card={card} fechar={() => abrirCard(null)} />;
}

function Detalhe({ card, fechar }: { card: Card; fechar: () => void }) {
  const cards = useStore((s) => s.cards);
  const projetos = useStore((s) => s.projetos);
  const comentarios = useStore((s) => s.comentarios);
  const entregas = useStore((s) => s.entregas);
  const trabalho = useStore((s) => s.motor.emAndamento.find((t) => t.cardId === card.id));
  const abrirCard = useStore((s) => s.abrirCard);
  const [erro, setErro] = useState<string | null>(null);
  const [titulo, setTitulo] = useState(card.titulo);

  const fluxo = fluxos[card.fluxo];
  const coluna = colunaDe(card.fluxo, card.coluna);
  const tipo = tipoInfo(card.tipo);
  const bugs = Object.values(cards).filter((c) => c.bugDe === card.id);
  const origem = card.bugDe ? cards[card.bugDe] : undefined;

  const acao = async (fn: () => Promise<unknown>) => {
    setErro(null);
    try {
      await fn();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  };
  const editar = (dados: CardEditavel) => acao(() => api(`/api/cards/${card.id}`, "PATCH", dados));

  return (
    <div className="pointer-events-auto absolute inset-0 z-30 flex justify-end bg-black/10" onClick={fechar}>
      <aside className="flex h-full w-[min(560px,100%)] flex-col bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center gap-2 border-b border-black/5 px-5 py-3">
          <span style={{ color: tipo.cor }}>{tipo.icone}</span>
          <span className="text-xs font-semibold text-black/50">
            {tipo.nome} · {card.chave}
          </span>
          {card.demo && <Badge cor="#94a3b8">demo</Badge>}
          <div className="flex-1" />
          <button
            onClick={() => acao(async () => {
              if (!confirm(`Excluir ${card.chave}? Isso não pode ser desfeito.`)) return;
              await api(`/api/cards/${card.id}`, "DELETE");
            })}
            className="rounded-lg px-2 py-1 text-[11px] text-rose-600 hover:bg-rose-50"
          >
            Excluir
          </button>
          <button onClick={fechar} className="grid h-8 w-8 place-items-center rounded-full text-black/50 hover:bg-black/5" aria-label="Fechar">
            ✕
          </button>
        </header>

        <div className="scroll-fino min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            onBlur={() => titulo.trim() && titulo !== card.titulo && editar({ titulo })}
            className="w-full rounded-lg px-1 py-1 text-lg font-bold outline-none hover:bg-black/[0.03] focus:bg-black/[0.03]"
          />
          {erro && <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{erro}</p>}

          {trabalho && (
            <p className="mt-2 flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
              <span className="pulsar h-2 w-2 rounded-full bg-blue-500" />
              {agentById[trabalho.agenteId]?.nome} está {trabalho.tipo === "validar" ? "validando" : "trabalhando"} neste card agora.
            </p>
          )}
          {card.bloqueado && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Pausado. Se um agente fez uma pergunta, responda em <b>Atividade</b> (abaixo): o seu comentário desbloqueia o card e
              ele volta a trabalhar.
            </p>
          )}

          {coluna?.tipo === "ceo" && <Aprovacao card={card} acao={acao} />}

          {/* Campos */}
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
            <Campo rotulo="Coluna">
              <select
                value={card.coluna}
                onChange={(e) => acao(async () => {
                  const destino = colunaDe(card.fluxo, e.target.value)!;
                  if ((destino.tipo === "feito" || destino.tipo === "perdido") && coluna?.tipo !== "ceo") {
                    if (!confirm(`Mover direto para "${destino.nome}" passa por cima da validação. Continuar?`)) return;
                  }
                  await api(`/api/cards/${card.id}/mover`, "POST", { coluna: destino.id });
                })}
                className="campo"
              >
                {fluxo.colunas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Tipo">
              <select value={card.tipo} onChange={(e) => editar({ tipo: e.target.value as Card["tipo"] })} className="campo">
                {tiposCard.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.icone} {t.nome}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Prioridade">
              <select value={card.prioridade} onChange={(e) => editar({ prioridade: e.target.value as Card["prioridade"] })} className="campo">
                {prioridades.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id} · {p.nome}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Autonomia">
              <select value={card.nivel} onChange={(e) => editar({ nivel: e.target.value as Card["nivel"] })} className="campo" title={niveis.find((n) => n.id === card.nivel)?.descricao}>
                {niveis.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.id} · {n.nome}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Área">
              <select value={card.sala} onChange={(e) => editar({ sala: e.target.value as Card["sala"] })} className="campo">
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nome}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Projeto">
              <select
                value={card.projetoId ?? ""}
                onChange={(e) => editar({ projetoId: e.target.value ? Number(e.target.value) : null })}
                className="campo"
              >
                <option value="">Nenhum</option>
                {projetos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Responsável">
              <SeletorAgente valor={card.dono} onChange={(dono) => editar({ dono })} />
            </Campo>
            <Campo rotulo="Validador">
              <SeletorAgente valor={card.validador} onChange={(validador) => editar({ validador })} />
            </Campo>
            {card.tipo === "bug" && (
              <Campo rotulo="Severidade">
                <select value={card.severidade ?? "S3"} onChange={(e) => editar({ severidade: e.target.value as Card["severidade"] })} className="campo">
                  {severidades.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.id} · {s.nome}
                    </option>
                  ))}
                </select>
              </Campo>
            )}
            <Campo rotulo="Prazo">
              <input
                type="date"
                value={card.prazo ? new Date(card.prazo).toISOString().slice(0, 10) : ""}
                onChange={(e) => editar({ prazo: e.target.value ? new Date(`${e.target.value}T18:00:00`).getTime() : null })}
                className="campo"
              />
            </Campo>
            <Campo rotulo="Etiquetas">
              <input
                defaultValue={card.etiquetas.join(", ")}
                onBlur={(e) => editar({ etiquetas: e.target.value.split(",") })}
                placeholder="separadas por vírgula"
                className="campo"
              />
            </Campo>
            <Campo rotulo="Bloqueado">
              <label className="flex h-8 items-center gap-2">
                <input type="checkbox" checked={card.bloqueado} onChange={(e) => editar({ bloqueado: e.target.checked })} />
                <span className="text-black/60">{card.bloqueado ? "Sim" : "Não"}</span>
              </label>
            </Campo>
          </div>

          <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-black/45">
            <span>Devolvido {card.devolucoes}×</span>
            <span>Custo {card.custoUsd.toLocaleString("pt-BR", { style: "currency", currency: "USD" })}</span>
            <span>Criado {new Date(card.criadoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
          </div>

          <TextoEditavel rotulo="Descrição" valor={card.descricao} onSalvar={(descricao) => editar({ descricao })} />
          <TextoEditavel rotulo="Critérios de aceite" valor={card.criterios} onSalvar={(criterios) => editar({ criterios })} />

          {card.tipo === "lead" && <FichaLead card={card} />}
          {card.fluxo === "software" && card.projetoId !== null && <SecaoCodigo card={card} />}
          {card.fluxo === "marketing" && <FichaPeca card={card} />}

          <Entregas entregas={entregas} />

          {origem && (
            <Secao titulo="Bug encontrado em">
              <LinkCard card={origem} abrir={() => abrirCard(origem.id)} />
            </Secao>
          )}
          {card.fluxo === "software" && card.tipo !== "bug" && (
            <Secao titulo={`Bugs ligados (${bugs.length})`}>
              {bugs.map((b) => (
                <LinkCard key={b.id} card={b} abrir={() => abrirCard(b.id)} />
              ))}
              <NovoBug card={card} acao={acao} />
            </Secao>
          )}

          <Atividade card={card} comentarios={comentarios} acao={acao} />
        </div>
      </aside>
    </div>
  );
}

/** O trabalho entregue pelos agentes, com todas as versões (cada devolução gera uma nova). */
function Entregas({ entregas }: { entregas: Entrega[] }) {
  const [escolhida, setEscolhida] = useState<number | null>(null);
  const [copiado, setCopiado] = useState(false);
  if (!entregas.length) return null;
  const e = entregas.find((x) => x.versao === escolhida) ?? entregas.at(-1)!;
  const autor = agentById[e.autor];
  return (
    <Secao
      titulo={`Entrega · versão ${e.versao}${entregas.length > 1 ? ` de ${entregas.length}` : ""}`}
      extra={
        <div className="flex items-center gap-2">
          {entregas.length > 1 && (
            <select value={e.versao} onChange={(ev) => setEscolhida(Number(ev.target.value))} className="rounded bg-black/5 px-1 text-[11px]">
              {entregas.map((x) => (
                <option key={x.versao} value={x.versao}>
                  v{x.versao}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={() => {
              void navigator.clipboard.writeText(e.conteudo);
              setCopiado(true);
              setTimeout(() => setCopiado(false), 1500);
            }}
            className="text-[11px] text-black/45 hover:text-black"
          >
            {copiado ? "copiado ✓" : "copiar"}
          </button>
        </div>
      }
    >
      <div className="rounded-xl bg-emerald-50/60 p-3 ring-1 ring-emerald-100">
        <div className="mb-2 flex items-center gap-2 text-[11px] text-black/55">
          {autor && <Avatarzinho agent={autor} />}
          <span>
            <b>{autor?.nome ?? e.autor}</b> · {e.resumo} · {hora(e.ts)}
          </span>
        </div>
        <Markdown texto={e.conteudo} className="text-[13px] leading-relaxed text-black/85" />
      </div>
    </Secao>
  );
}

function Aprovacao({ card, acao }: { card: Card; acao: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [comentario, setComentario] = useState("");
  const nivel = niveis.find((n) => n.id === card.nivel)!;
  return (
    <div className="mt-3 rounded-xl bg-rose-50 p-3 ring-1 ring-rose-200">
      <div className="text-xs font-semibold text-rose-800">Aguardando a sua aprovação · {nivel.id} {nivel.nome}</div>
      <div className="mt-0.5 text-[11px] text-rose-700/80">{nivel.descricao}</div>
      <textarea
        value={comentario}
        onChange={(e) => setComentario(e.target.value)}
        rows={2}
        placeholder="Comentário (obrigatório para devolver)"
        className="mt-2 w-full resize-none rounded-lg bg-white px-2.5 py-1.5 text-xs outline-none ring-1 ring-rose-200"
      />
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => acao(() => api(`/api/cards/${card.id}/aprovar`, "POST", { comentario }))}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
        >
          {card.nivel === "N3" ? "Já executei · Aprovar" : "Aprovar"}
        </button>
        <button
          onClick={() => acao(() => api(`/api/cards/${card.id}/devolver`, "POST", { comentario }))}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-300 hover:bg-rose-100"
        >
          Devolver com comentário
        </button>
      </div>
    </div>
  );
}

function NovoBug({ card, acao }: { card: Card; acao: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [aberto, setAberto] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [severidade, setSeveridade] = useState<Card["severidade"]>("S3");
  if (!aberto) {
    return (
      <button onClick={() => setAberto(true)} className="mt-1 text-[11px] font-semibold text-rose-600 hover:underline">
        + Abrir bug
      </button>
    );
  }
  return (
    <div className="mt-2 space-y-2 rounded-xl bg-black/[0.03] p-3">
      <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Título do bug" className="campo w-full" />
      <textarea
        value={descricao}
        onChange={(e) => setDescricao(e.target.value)}
        rows={3}
        placeholder={"Passos para reproduzir\nResultado esperado × obtido"}
        className="campo w-full resize-none py-1.5"
      />
      <div className="flex items-center gap-2">
        <select value={severidade ?? "S3"} onChange={(e) => setSeveridade(e.target.value as Card["severidade"])} className="campo w-auto">
          {severidades.map((s) => (
            <option key={s.id} value={s.id}>
              {s.id} · {s.nome}
            </option>
          ))}
        </select>
        <div className="flex-1" />
        <button onClick={() => setAberto(false)} className="px-2 text-[11px] text-black/50">
          Cancelar
        </button>
        <button
          disabled={!titulo.trim()}
          onClick={() => acao(async () => {
            await api(`/api/cards/${card.id}/bug`, "POST", { titulo, descricao, severidade });
            setAberto(false);
            setTitulo("");
            setDescricao("");
          })}
          className="rounded-lg bg-rose-600 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-30"
        >
          Abrir bug
        </button>
      </div>
    </div>
  );
}

function Atividade({ card, comentarios, acao }: { card: Card; comentarios: Comentario[]; acao: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [texto, setTexto] = useState("");
  const [soDebate, setSoDebate] = useState(false);
  const lista = soDebate ? comentarios.filter((c) => c.tipo !== "movimento") : comentarios;
  const estilo: Record<Comentario["tipo"], string> = {
    comentario: "bg-black/[0.04]",
    movimento: "text-black/45",
    aprovacao: "bg-emerald-50 text-emerald-900",
    devolucao: "bg-amber-50 text-amber-900",
    critica: "bg-violet-50 text-violet-950",
    autocritica: "bg-sky-50 text-sky-950",
  };
  return (
    <Secao
      titulo="Atividade"
      extra={
        <button onClick={() => setSoDebate(!soDebate)} className="text-[11px] text-black/45 hover:text-black">
          {soDebate ? "mostrar histórico" : "só o debate"}
        </button>
      }
    >
      <ul className="space-y-1.5">
        {lista.map((c) => {
          const a = c.autor === "voce" ? null : agentById[c.autor];
          return (
            <li key={c.id} className={`flex gap-2 rounded-lg px-2 py-1.5 text-xs ${estilo[c.tipo]}`}>
              {c.tipo !== "movimento" &&
                (a ? <Avatarzinho agent={a} /> : <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#1f2430] text-[9px] font-bold text-white">CEO</span>)}
              <div className="min-w-0 flex-1">
                <span className="font-semibold">{a ? a.nome : "Você"}</span>
                {c.tipo === "aprovacao" && <span className="ml-1 text-emerald-700">aprovou</span>}
                {c.tipo === "devolucao" && <span className="ml-1 text-amber-700">devolveu</span>}
                {c.tipo === "critica" && <span className="ml-1 text-violet-700">questionou (advogado do diabo)</span>}
                {c.tipo === "autocritica" && <span className="ml-1 text-sky-700">fez a autocrítica</span>}
                <span className="ml-1.5 text-[10px] text-black/35">{hora(c.ts)}</span>
                <div className={c.tipo === "movimento" ? "inline" : "mt-0.5"}>
                  {c.tipo === "movimento" ? <span> · {c.texto}</span> : <Markdown texto={c.texto} />}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-2 flex gap-2">
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && texto.trim() && acao(async () => {
            await api(`/api/cards/${card.id}/comentarios`, "POST", { texto });
            setTexto("");
          })}
          placeholder="Escreva um comentário e aperte Enter"
          className="campo flex-1"
        />
      </div>
    </Secao>
  );
}

function TextoEditavel({ rotulo, valor, onSalvar }: { rotulo: string; valor: string; onSalvar: (v: string) => void }) {
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState(valor);
  return (
    <Secao
      titulo={rotulo}
      extra={
        !editando && (
          <button onClick={() => { setRascunho(valor); setEditando(true); }} className="text-[11px] text-black/45 hover:text-black">
            editar
          </button>
        )
      }
    >
      {editando ? (
        <>
          <textarea value={rascunho} onChange={(e) => setRascunho(e.target.value)} rows={6} className="campo w-full resize-y py-2 font-mono" />
          <div className="mt-1.5 flex justify-end gap-2">
            <button onClick={() => setEditando(false)} className="px-2 text-[11px] text-black/50">
              Cancelar
            </button>
            <button
              onClick={() => { onSalvar(rascunho); setEditando(false); }}
              className="rounded-lg bg-[#1f2430] px-3 py-1 text-[11px] font-semibold text-white"
            >
              Salvar
            </button>
          </div>
        </>
      ) : valor ? (
        <Markdown texto={valor} className="text-[13px] text-black/80" />
      ) : (
        <p className="text-xs text-black/35">Vazio.</p>
      )}
    </Secao>
  );
}

function SeletorAgente({ valor, onChange }: { valor: string | null; onChange: (v: string | null) => void }) {
  return (
    <select value={valor ?? ""} onChange={(e) => onChange(e.target.value || null)} className="campo">
      <option value="">Ninguém</option>
      {rooms.map((r) => {
        const membros = agents.filter((a) => a.sala === r.id);
        return membros.length ? (
          <optgroup key={r.id} label={r.nome}>
            {membros.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome} · {a.cargo}
              </option>
            ))}
          </optgroup>
        ) : null;
      })}
    </select>
  );
}

function LinkCard({ card, abrir }: { card: Card; abrir: () => void }) {
  const t = tipoInfo(card.tipo);
  return (
    <button onClick={abrir} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-black/5">
      <span style={{ color: t.cor }}>{t.icone}</span>
      <span className="font-semibold text-black/50">{card.chave}</span>
      <span className="flex-1 truncate">{card.titulo}</span>
      <span className="text-[10px] text-black/40">{colunaDe(card.fluxo, card.coluna)?.nome}</span>
    </button>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-black/40">{rotulo}</span>
      {children}
    </label>
  );
}

function Secao({ titulo, extra, children }: { titulo: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <div className="mb-1.5 flex items-center">
        <h3 className="flex-1 text-[11px] font-bold uppercase tracking-wide text-black/50">{titulo}</h3>
        {extra}
      </div>
      {children}
    </section>
  );
}
