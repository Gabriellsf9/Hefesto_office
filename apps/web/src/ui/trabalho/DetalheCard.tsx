import { useEffect, useState, type ReactNode } from "react";
import { Bug, Check, Copy, Lock, Pencil, RotateCcw, Send, ShieldQuestion, Trash2, Wallet } from "lucide-react";
import { baseDoFluxo, colunaDe, ehCardDeCodigo, fluxos, niveis, prioridades, severidades, tiposCard, type Card, type CardEditavel, type Comentario, type Entrega } from "@empresa/shared";
import { agentById, agents, rooms } from "@empresa/org";
import { useStore } from "../../store.ts";
import { api } from "../../api.ts";
import { Markdown } from "../Markdown.tsx";
import { AreaTexto, Botao, BotaoIcone, Campo, Etiqueta, Gaveta, Segmentado, Seletor, avisar, avisarErro, confirmar, cx } from "../kit/index.ts";
import { Avatarzinho, hora, quando, usd } from "../comum.tsx";
import { IconeTipo, LinhaCard, SeloPrioridade, tipoInfo } from "./cartao.tsx";
import { FichaLead } from "../board/Prospeccao.tsx";
import { SecaoCodigo } from "../board/Codigo.tsx";
import { FichaPeca } from "../board/Marketing.tsx";
import { arquivosCitados } from "../anexos.ts";
import { ListaArquivos } from "../shell/Dock.tsx";

// Detalhe do card (DESIGN-INTERFACE.md §6.3): gaveta larga; à esquerda o conteúdo (pendência, descrição,
// entrega, debate), à direita as propriedades num painel compacto. Abre por cima de qualquer página.

export function DetalheCard() {
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

  const t = card ? tipoInfo(card.tipo) : null;
  return (
    <Gaveta
      aberta={!!card}
      fechar={() => abrirCard(null)}
      largura={980}
      subtitulo={card && t ? <span className="flex items-center gap-1.5"><IconeTipo tipo={card.tipo} /> {t.nome} · <span className="tabular">{card.chave}</span>{card.demo && <Etiqueta>demo</Etiqueta>}</span> : null}
      titulo={card ? <TituloEditavel key={card.id} card={card} /> : null}
      acoes={card && (
        <BotaoIcone
          icone={Trash2}
          rotulo="Excluir card"
          tamanho="p"
          onClick={async () => {
            if (!(await confirmar({ titulo: `Excluir ${card.chave}?`, texto: "Isso não pode ser desfeito.", confirmar: "Excluir", perigo: true }))) return;
            await api(`/api/cards/${card.id}`, "DELETE").then(() => avisar(`${card.chave} excluído`)).catch(avisarErro);
          }}
        />
      )}
    >
      {card && <Corpo key={card.id} card={card} />}
    </Gaveta>
  );
}

function TituloEditavel({ card }: { card: Card }) {
  const [titulo, setTitulo] = useState(card.titulo);
  return (
    <input
      value={titulo}
      aria-label="Título do card"
      onChange={(e) => setTitulo(e.target.value)}
      onBlur={() => titulo.trim() && titulo !== card.titulo && void api(`/api/cards/${card.id}`, "PATCH", { titulo }).catch(avisarErro)}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      className="-mx-1 w-full rounded-ctl bg-transparent px-1 text-secao font-semibold text-fg outline-none hover:bg-hover focus:bg-sunken"
    />
  );
}

function Corpo({ card }: { card: Card }) {
  const cards = useStore((s) => s.cards);
  const comentarios = useStore((s) => s.comentarios);
  const entregas = useStore((s) => s.entregas);
  const trabalho = useStore((s) => s.motor.emAndamento.find((t) => t.cardId === card.id));
  const coluna = colunaDe(card.fluxo, card.coluna);
  const bugs = Object.values(cards).filter((c) => c.bugDe === card.id);
  const origem = card.bugDe ? cards[card.bugDe] : undefined;
  const editar = (dados: CardEditavel) => api(`/api/cards/${card.id}`, "PATCH", dados).catch(avisarErro);

  return (
    <div className="flex min-h-full flex-col lg:flex-row">
      <div className="min-w-0 flex-1 space-y-6 px-6 py-5">
        {trabalho && (
          <p className="flex items-center gap-2 rounded-card bg-accent-soft px-3.5 py-2.5 text-pequeno text-accent-fg">
            <span className="pulsar size-2 rounded-full bg-accent" />
            {agentById[trabalho.agenteId]?.nome} está {trabalho.tipo === "validar" ? "validando" : "trabalhando"} neste card agora.
          </p>
        )}
        {card.bloqueado && card.etiquetas.includes("limite-de-gasto") ? (
          <div className="flex items-center gap-3 rounded-card bg-warning-soft px-3.5 py-2.5 text-pequeno text-warning-fg">
            <Wallet className="size-4 shrink-0" />
            <span className="flex-1">Parou no limite de gasto (US$ {card.custoUsd.toFixed(2)}). Liberando, o agente continua exatamente de onde parou.</span>
            <Botao tamanho="p" variante="principal" onClick={() => void api(`/api/cards/${card.id}/liberar`, "POST").then(() => avisar("Liberado")).catch(avisarErro)}>Liberar mais</Botao>
          </div>
        ) : card.bloqueado && (
          <p className="flex items-start gap-2 rounded-card bg-warning-soft px-3.5 py-2.5 text-pequeno text-warning-fg">
            <Lock className="mt-0.5 size-4 shrink-0" />
            <span>Pausado. Se um agente fez uma pergunta, responda na atividade abaixo: o seu comentário desbloqueia o card e ele volta a trabalhar.</span>
          </p>
        )}
        <Dependencias card={card} />
        {coluna?.tipo === "ceo" && <Aprovacao card={card} />}

        <TextoEditavel rotulo="Descrição" valor={card.descricao} onSalvar={(descricao) => editar({ descricao })} />
        <TextoEditavel rotulo="Critérios de aceite" valor={card.criterios} onSalvar={(criterios) => editar({ criterios })} />

        {card.tipo === "lead" && <FichaLead card={card} />}
        {ehCardDeCodigo(card) && card.projetoId !== null && <SecaoCodigo card={card} />}
        {card.fluxo === "marketing" && <FichaPeca card={card} />}

        <Entregas entregas={entregas} />

        {origem && (
          <Bloco titulo="Bug encontrado em">
            <LinhaCard card={origem} />
          </Bloco>
        )}
        {baseDoFluxo(card.fluxo) === "software" && card.tipo !== "bug" && (
          <Bloco titulo={`Bugs ligados${bugs.length ? ` · ${bugs.length}` : ""}`}>
            {bugs.map((b) => <LinhaCard key={b.id} card={b} />)}
            <NovoBug card={card} />
          </Bloco>
        )}

        <Atividade card={card} comentarios={comentarios} />
      </div>

      <aside className="shrink-0 border-t border-line bg-surface-2 px-5 py-5 lg:w-[300px] lg:border-l lg:border-t-0">
        <Propriedades card={card} editar={editar} />
      </aside>
    </div>
  );
}

function Propriedades({ card, editar }: { card: Card; editar: (d: CardEditavel) => Promise<unknown> }) {
  const projetos = useStore((s) => s.projetos);
  const fluxo = fluxos[card.fluxo] ?? { colunas: [] };
  const coluna = colunaDe(card.fluxo, card.coluna);
  const mover = async (destinoId: string) => {
    const destino = colunaDe(card.fluxo, destinoId)!;
    if ((destino.tipo === "feito" || destino.tipo === "perdido") && coluna?.tipo !== "ceo") {
      if (!(await confirmar({ titulo: `Mover para "${destino.nome}"?`, texto: "Isso passa por cima da validação.", confirmar: "Mover", perigo: true }))) return;
    }
    await api(`/api/cards/${card.id}/mover`, "POST", { coluna: destino.id }).catch(avisarErro);
  };
  return (
    <div className="space-y-3.5">
      <Seletor rotulo="Coluna" tamanho="p" value={card.coluna} onChange={(e) => void mover(e.target.value)}>
        {fluxo.colunas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
      </Seletor>
      <div className="grid grid-cols-2 gap-2">
        <Seletor rotulo="Prioridade" tamanho="p" value={card.prioridade} onChange={(e) => void editar({ prioridade: e.target.value as Card["prioridade"] })}>
          {prioridades.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.nome}</option>)}
        </Seletor>
        <Seletor rotulo="Autonomia" tamanho="p" value={card.nivel} title={niveis.find((n) => n.id === card.nivel)?.descricao} onChange={(e) => void editar({ nivel: e.target.value as Card["nivel"] })}>
          {niveis.map((n) => <option key={n.id} value={n.id}>{n.id} · {n.nome}</option>)}
        </Seletor>
      </div>
      <SeletorAgente rotulo="Responsável" valor={card.dono} onChange={(dono) => void editar({ dono })} />
      <SeletorAgente rotulo="Validador" valor={card.validador} onChange={(validador) => void editar({ validador })} />
      <div className="grid grid-cols-2 gap-2">
        <Seletor rotulo="Tipo" tamanho="p" value={card.tipo} onChange={(e) => void editar({ tipo: e.target.value as Card["tipo"] })}>
          {tiposCard.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
        </Seletor>
        {card.tipo === "bug" ? (
          <Seletor rotulo="Severidade" tamanho="p" value={card.severidade ?? "S3"} onChange={(e) => void editar({ severidade: e.target.value as Card["severidade"] })}>
            {severidades.map((s) => <option key={s.id} value={s.id}>{s.id} · {s.nome}</option>)}
          </Seletor>
        ) : (
          <Campo rotulo="Prazo" tamanho="p" type="date" value={card.prazo ? new Date(card.prazo).toISOString().slice(0, 10) : ""} onChange={(e) => void editar({ prazo: e.target.value ? new Date(`${e.target.value}T18:00:00`).getTime() : null })} />
        )}
      </div>
      <Seletor rotulo="Área" tamanho="p" value={card.sala} onChange={(e) => void editar({ sala: e.target.value as Card["sala"] })}>
        {rooms.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
      </Seletor>
      <Seletor rotulo="Projeto" tamanho="p" value={card.projetoId ?? ""} onChange={(e) => void editar({ projetoId: e.target.value ? Number(e.target.value) : null })}>
        <option value="">Nenhum</option>
        {projetos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
      </Seletor>
      <Campo rotulo="Etiquetas" tamanho="p" defaultValue={card.etiquetas.join(", ")} placeholder="separadas por vírgula" onBlur={(e) => void editar({ etiquetas: e.target.value.split(",") })} />
      <label className="flex items-center gap-2 text-pequeno text-fg">
        <input type="checkbox" checked={card.bloqueado} onChange={(e) => void editar({ bloqueado: e.target.checked })} className="size-4 accent-[var(--accent)]" />
        Bloqueado
      </label>
      <dl className="tabular space-y-1 border-t border-line pt-3 text-legenda text-fg-3">
        <div className="flex justify-between"><dt>Devolvido</dt><dd className="text-fg-2">{card.devolucoes}×</dd></div>
        <div className="flex justify-between"><dt>Custo de IA</dt><dd className="text-fg-2">{usd(card.custoUsd)}</dd></div>
        <div className="flex justify-between"><dt>Criado</dt><dd className="text-fg-2">{new Date(card.criadoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</dd></div>
        <div className="flex justify-between"><dt>Atualizado</dt><dd className="text-fg-2">{quando(card.atualizadoEm)}</dd></div>
      </dl>
    </div>
  );
}

function SeletorAgente({ rotulo, valor, onChange }: { rotulo: string; valor: string | null; onChange: (v: string | null) => void }) {
  return (
    <Seletor rotulo={rotulo} tamanho="p" value={valor ?? ""} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">Ninguém</option>
      {rooms.map((r) => {
        const membros = agents.filter((a) => a.sala === r.id);
        return membros.length ? (
          <optgroup key={r.id} label={r.nome}>
            {membros.map((a) => <option key={a.id} value={a.id}>{a.nome} · {a.cargo}</option>)}
          </optgroup>
        ) : null;
      })}
    </Seletor>
  );
}

function Bloco({ titulo, extra, children }: { titulo: ReactNode; extra?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <h3 className="flex-1 text-pequeno font-semibold text-fg">{titulo}</h3>
        {extra}
      </div>
      {children}
    </section>
  );
}

function Aprovacao({ card }: { card: Card }) {
  const [comentario, setComentario] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const nivel = niveis.find((n) => n.id === card.nivel)!;
  const validador = card.validador ? agentById[card.validador] : null;
  const fazer = async (caminho: "aprovar" | "devolver") => {
    setOcupado(true);
    try {
      await api(`/api/cards/${card.id}/${caminho}`, "POST", { comentario });
      avisar(caminho === "aprovar" ? `${card.chave} aprovado` : "Devolvido com o seu comentário");
    } catch (e) {
      avisarErro(e);
    } finally {
      setOcupado(false);
    }
  };
  return (
    <div className="rounded-card bg-surface p-4 shadow-[inset_0_0_0_1.5px_var(--warning)]">
      <div className="flex items-center gap-2">
        <ShieldQuestion className="size-5 text-warning" />
        <div className="flex-1">
          <div className="text-corpo font-semibold text-fg">Esperando a sua aprovação</div>
          <div className="text-legenda text-fg-2">{nivel.id} · {nivel.nome}. {validador ? `Validado por ${validador.nome}.` : ""} {nivel.descricao}</div>
        </div>
      </div>
      <AreaTexto className="mt-3" rows={2} value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Comentário (obrigatório para devolver)" />
      <div className="mt-2.5 flex justify-end gap-2">
        <Botao variante="secundario" icone={RotateCcw} disabled={!comentario.trim() || ocupado} motivo={!comentario.trim() ? "Escreva o que precisa mudar" : undefined} onClick={() => void fazer("devolver")}>
          Devolver
        </Botao>
        <Botao variante="sucesso" icone={Check} carregando={ocupado} onClick={() => void fazer("aprovar")}>
          {card.nivel === "N3" ? "Já executei, aprovar" : "Aprovar"}
        </Botao>
      </div>
    </div>
  );
}

/** O trabalho entregue, com todas as versões (cada devolução gera uma nova). */
function Entregas({ entregas }: { entregas: Entrega[] }) {
  const [escolhida, setEscolhida] = useState<number | null>(null);
  if (!entregas.length) return null;
  const e = entregas.find((x) => x.versao === escolhida) ?? entregas.at(-1)!;
  const autor = agentById[e.autor];
  return (
    <Bloco
      titulo="Entrega"
      extra={
        <div className="flex items-center gap-2">
          {entregas.length > 1 && (
            <Segmentado tamanho="p" valor={String(e.versao)} onChange={(v) => setEscolhida(Number(v))} opcoes={entregas.map((x) => ({ id: String(x.versao), rotulo: `v${x.versao}` }))} />
          )}
          <Botao tamanho="p" variante="discreto" icone={Copy} onClick={() => void navigator.clipboard.writeText(e.conteudo).then(() => avisar("Entrega copiada"))}>Copiar</Botao>
        </div>
      }
    >
      <div className="rounded-card bg-surface shadow-1">
        <div className="flex items-center gap-2 border-b border-line px-4 py-2.5 text-pequeno text-fg-2">
          {autor && <Avatarzinho agent={autor} tamanho={24} />}
          <span className="min-w-0 flex-1 truncate"><b className="font-semibold text-fg">{autor?.nome ?? e.autor}</b> · {e.resumo}</span>
          <span className="text-legenda text-fg-3">v{e.versao} · {hora(e.ts)}</span>
        </div>
        {arquivosCitados(e.conteudo).length > 0 && (
          <div className="border-b border-line px-4 py-2.5">
            <div className="text-legenda font-medium text-fg-3">Arquivos da entrega</div>
            <ListaArquivos arquivos={arquivosCitados(e.conteudo)} />
          </div>
        )}
        <div className="px-4 py-3">
          <Markdown texto={e.conteudo} className="text-corpo leading-relaxed text-fg" />
        </div>
      </div>
    </Bloco>
  );
}

function NovoBug({ card }: { card: Card }) {
  const [aberto, setAberto] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [severidade, setSeveridade] = useState<Card["severidade"]>("S3");
  if (!aberto) return <Botao tamanho="p" variante="discreto" icone={Bug} onClick={() => setAberto(true)}>Abrir bug</Botao>;
  return (
    <div className="mt-2 space-y-2 rounded-card bg-sunken p-3">
      <Campo data-autofoco value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="O botão de pagar não responde no Safari" />
      <AreaTexto value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} placeholder={"Passos para reproduzir\nResultado esperado × obtido"} />
      <div className="flex items-center gap-2">
        <Seletor tamanho="p" value={severidade ?? "S3"} onChange={(e) => setSeveridade(e.target.value as Card["severidade"])}>
          {severidades.map((s) => <option key={s.id} value={s.id}>{s.id} · {s.nome}</option>)}
        </Seletor>
        <div className="flex-1" />
        <Botao tamanho="p" variante="discreto" onClick={() => setAberto(false)}>Cancelar</Botao>
        <Botao
          tamanho="p"
          variante="principal"
          disabled={!titulo.trim()}
          onClick={async () => {
            try {
              await api(`/api/cards/${card.id}/bug`, "POST", { titulo, descricao, severidade });
              avisar("Bug aberto para o QA");
              setAberto(false);
              setTitulo("");
              setDescricao("");
            } catch (e) {
              avisarErro(e);
            }
          }}
        >
          Abrir bug
        </Botao>
      </div>
    </div>
  );
}

const ESTILO: Record<Comentario["tipo"], { caixa: string; verbo?: string }> = {
  comentario: { caixa: "bg-surface shadow-1" },
  movimento: { caixa: "" },
  aprovacao: { caixa: "bg-success-soft", verbo: "aprovou" },
  devolucao: { caixa: "bg-warning-soft", verbo: "devolveu" },
  critica: { caixa: "bg-info-soft", verbo: "questionou (advogado do diabo)" },
  autocritica: { caixa: "bg-info-soft", verbo: "fez a autocrítica" },
};

function Atividade({ card, comentarios }: { card: Card; comentarios: Comentario[] }) {
  const [texto, setTexto] = useState("");
  const [soDebate, setSoDebate] = useState(false);
  const lista = soDebate ? comentarios.filter((c) => c.tipo !== "movimento") : comentarios;
  const enviar = async () => {
    if (!texto.trim()) return;
    try {
      await api(`/api/cards/${card.id}/comentarios`, "POST", { texto });
      setTexto("");
    } catch (e) {
      avisarErro(e);
    }
  };
  return (
    <Bloco titulo="Atividade" extra={<Segmentado tamanho="p" valor={soDebate ? "debate" : "tudo"} onChange={(v) => setSoDebate(v === "debate")} opcoes={[{ id: "tudo", rotulo: "Tudo" }, { id: "debate", rotulo: "Só o debate" }]} />}>
      <ul className="space-y-2">
        {lista.map((c) => {
          const a = c.autor === "voce" ? null : agentById[c.autor];
          const e = ESTILO[c.tipo];
          if (c.tipo === "movimento")
            return (
              <li key={c.id} className="flex items-center gap-2 pl-1 text-legenda text-fg-3">
                <span className="size-1.5 rounded-full bg-line-strong" />
                <span className="font-medium text-fg-2">{a ? a.nome : "Você"}</span> {c.texto} · {hora(c.ts)}
              </li>
            );
          return (
            <li key={c.id} className={cx("flex gap-2.5 rounded-card px-3 py-2.5", e.caixa)}>
              {a ? <Avatarzinho agent={a} tamanho={28} /> : <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ink text-[10px] font-bold text-on-ink">CEO</span>}
              <div className="min-w-0 flex-1">
                <div className="text-pequeno">
                  <span className="font-semibold text-fg">{a ? a.nome : "Você"}</span>
                  {e.verbo && <span className="ml-1 text-fg-2">{e.verbo}</span>}
                  <span className="ml-1.5 text-legenda text-fg-3">{hora(c.ts)}</span>
                </div>
                <Markdown texto={c.texto} className="mt-0.5 text-pequeno text-fg" />
              </div>
            </li>
          );
        })}
        {lista.length === 0 && <li className="py-4 text-center text-pequeno text-fg-3">Sem atividade ainda.</li>}
      </ul>
      <div className="mt-3 flex items-end gap-2">
        <AreaTexto
          className="flex-1"
          rows={2}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void enviar();
            }
          }}
          placeholder={card.bloqueado ? "Responda à pergunta do agente para desbloquear…" : "Escreva um comentário (Enter envia, Shift+Enter quebra linha)"}
        />
        <BotaoIcone icone={Send} rotulo="Enviar comentário" onClick={() => void enviar()} disabled={!texto.trim()} />
      </div>
    </Bloco>
  );
}

function TextoEditavel({ rotulo, valor, onSalvar }: { rotulo: string; valor: string; onSalvar: (v: string) => void }) {
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState(valor);
  return (
    <Bloco titulo={rotulo} extra={!editando && <Botao tamanho="p" variante="discreto" icone={Pencil} onClick={() => { setRascunho(valor); setEditando(true); }}>Editar</Botao>}>
      {editando ? (
        <>
          <AreaTexto value={rascunho} onChange={(e) => setRascunho(e.target.value)} rows={8} className="font-mono text-pequeno" />
          <div className="mt-2 flex justify-end gap-2">
            <Botao tamanho="p" variante="discreto" onClick={() => setEditando(false)}>Cancelar</Botao>
            <Botao tamanho="p" variante="principal" onClick={() => { onSalvar(rascunho); setEditando(false); }}>Salvar</Botao>
          </div>
        </>
      ) : valor ? (
        <Markdown texto={valor} className="text-corpo leading-relaxed text-fg" />
      ) : (
        <button type="button" onClick={() => { setRascunho(""); setEditando(true); }} className="w-full rounded-card border border-dashed border-line-strong px-3 py-3 text-left text-pequeno text-fg-3 hover:text-fg-2">
          Adicionar {rotulo.toLowerCase()}…
        </button>
      )}
    </Bloco>
  );
}


/** De quem este card depende (um ou vários): só começa quando todos terminarem. */
function Dependencias({ card }: { card: Card }) {
  const cards = useStore((s) => s.cards);
  const ids = [...(card.dependeDe ? [card.dependeDe] : []), ...(card.dependencias ?? [])];
  if (!ids.length) return null;
  return (
    <p className="flex flex-wrap items-center gap-1.5 text-pequeno text-fg-2">
      <span className="font-medium">Espera:</span>
      {ids.map((id) => {
        const d = cards[id];
        if (!d) return null;
        const feito = colunaDe(d.fluxo, d.coluna)?.tipo === "feito";
        return (
          <button key={id} type="button" onClick={() => useStore.getState().abrirCard(id)} className="rounded-full bg-sunken px-2 py-0.5 text-legenda hover:bg-hover">
            {feito ? "✓" : "…"} {d.chave} · {d.titulo.slice(0, 40)}
          </button>
        );
      })}
    </p>
  );
}
