import { useEffect, useMemo, useState } from "react";
import { BookOpen, Check, CheckCheck, ChevronRight, Inbox, Lock, MessageCircle, Plug, RotateCcw, Terminal, X } from "lucide-react";
import { agentById, roomById } from "@empresa/org";
import type { MensagemWhatsapp } from "@empresa/shared";
import { useStore } from "../../store.ts";
import { api } from "../../api.ts";
import { navegar } from "../../nav.ts";
import { AreaTexto, Botao, CabecalhoPagina, Chip, Etiqueta, EstadoVazio, Janela, Pagina, avisar, avisarErro, cx } from "../kit/index.ts";
import { Avatarzinho, quando } from "../comum.tsx";
import { IconeTipo, SeloPrioridade } from "../trabalho/cartao.tsx";
import { usePendencias, type Pendencia } from "../shell/pendencias.ts";

// Caixa de entrada (DESIGN-INTERFACE.md §6.2): tudo que espera o CEO, com as ações ali mesmo.
// Teclado: J/K movem, A aprova, D devolve/recusa, Enter abre.

type Filtro = "tudo" | Pendencia["tipo"];
const ROTULO: Record<Pendencia["tipo"], string> = { aprovacao: "Aprovações", bloqueado: "Perguntas", acao: "Ações externas", whatsapp: "WhatsApp", conhecimento: "Conhecimento" };

export default function PaginaEntrada() {
  const todas = usePendencias();
  const [filtro, setFiltro] = useState<Filtro>("tudo");
  const [sel, setSel] = useState(0);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [devolvendo, setDevolvendo] = useState<Pendencia | null>(null);
  const lista = useMemo(() => (filtro === "tudo" ? todas : todas.filter((p) => p.tipo === filtro)), [todas, filtro]);
  const contagem = (t: Pendencia["tipo"]) => todas.filter((p) => p.tipo === t).length;
  const loteN1 = lista.filter((p) => p.tipo === "aprovacao" && p.card.nivel === "N1");
  const marcadosN1 = loteN1.filter((p) => marcados.has(p.chave));

  const aprovar = async (p: Pendencia) => {
    try {
      if (p.tipo === "aprovacao") await api(`/api/cards/${p.card.id}/aprovar`, "POST", {});
      else if (p.tipo === "acao") await api(`/api/mcp/pedidos/${p.pedido.id}/aprovar`, "POST");
      else if (p.tipo === "conhecimento") await api(`/api/conhecimento/${p.item.id}/aprovar`, "POST");
      else return abrir(p);
      avisar("Aprovado");
    } catch (e) {
      avisarErro(e);
    }
  };
  const abrir = (p: Pendencia) => {
    if (p.tipo === "aprovacao" || p.tipo === "bloqueado") useStore.getState().abrirCard(p.card.id);
    else if (p.tipo === "acao" && p.pedido.cardId) useStore.getState().abrirCard(p.pedido.cardId);
    else if (p.tipo === "whatsapp") navegar("clientes", "whatsapp", p.contato.telefone);
    else if (p.tipo === "conhecimento") navegar("empresa", "conhecimento");
  };

  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(alvo.tagName) || e.metaKey || e.ctrlKey || document.querySelector("[aria-modal=true]")) return;
      const p = lista[sel];
      if (e.key === "j") setSel((s) => Math.min(s + 1, lista.length - 1));
      else if (e.key === "k") setSel((s) => Math.max(s - 1, 0));
      else if (e.key === "Enter" && p) abrir(p);
      else if (e.key === "a" && p) void aprovar(p);
      else if (e.key === "d" && p && (p.tipo === "aprovacao" || p.tipo === "acao")) setDevolvendo(p);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  });
  useEffect(() => setSel((s) => Math.min(s, Math.max(0, lista.length - 1))), [lista.length]);

  return (
    <Pagina largura="media">
      <CabecalhoPagina
        icone={Inbox}
        titulo="Caixa de entrada"
        descricao="Tudo o que espera você: entregas para aprovar, perguntas dos agentes, ações externas, respostas do WhatsApp e propostas de conhecimento."
        acoes={
          loteN1.length > 1 && (
            <>
              <Botao variante="discreto" onClick={() => setMarcados(marcadosN1.length === loteN1.length ? new Set() : new Set(loteN1.map((p) => p.chave)))}>
                {marcadosN1.length === loteN1.length ? "Desmarcar" : `Marcar ${loteN1.length} de nível N1`}
              </Botao>
              <Botao
                variante="sucesso"
                icone={CheckCheck}
                motivo={marcadosN1.length ? undefined : "Marque os cards N1 que quer aprovar juntos"}
                disabled={!marcadosN1.length}
                onClick={async () => {
                  try {
                    await api("/api/cards/aprovar-lote", "POST", { ids: marcadosN1.map((p) => (p.tipo === "aprovacao" ? p.card.id : 0)) });
                    avisar(`${marcadosN1.length} aprovados`);
                    setMarcados(new Set());
                  } catch (e) {
                    avisarErro(e);
                  }
                }}
              >
                Aprovar {marcadosN1.length || ""}
              </Botao>
            </>
          )
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Chip ativo={filtro === "tudo"} onClick={() => setFiltro("tudo")} contador={todas.length}>Tudo</Chip>
        {(Object.keys(ROTULO) as Pendencia["tipo"][]).map((t) => contagem(t) > 0 && (
          <Chip key={t} ativo={filtro === t} onClick={() => setFiltro(t)} contador={contagem(t)}>{ROTULO[t]}</Chip>
        ))}
      </div>

      {lista.length === 0 ? (
        <div className="rounded-panel bg-surface shadow-1">
          <EstadoVazio icone={Inbox} titulo="Nada esperando você" texto="Quando uma entrega for validada, um agente fizer uma pergunta ou pedir para agir fora da empresa, aparece aqui." />
        </div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-panel bg-surface shadow-1">
          {lista.map((p, i) => (
            <li key={p.chave} onMouseEnter={() => setSel(i)} className={cx("relative", i === sel && "bg-surface-2")}>
              {i === sel && <span className="absolute inset-y-0 left-0 w-[3px] bg-accent" />}
              <ItemPendencia
                p={p}
                marcado={marcados.has(p.chave)}
                marcar={p.tipo === "aprovacao" && p.card.nivel === "N1" ? () => setMarcados((m) => { const n = new Set(m); if (n.has(p.chave)) n.delete(p.chave); else n.add(p.chave); return n; }) : undefined}
                aprovar={() => void aprovar(p)}
                devolver={() => setDevolvendo(p)}
                abrir={() => abrir(p)}
              />
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-legenda text-fg-3">Atalhos: J/K movem · A aprova · D devolve · Enter abre</p>

      <Devolver p={devolvendo} fechar={() => setDevolvendo(null)} />
    </Pagina>
  );
}

function ItemPendencia({ p, marcado, marcar, aprovar, devolver, abrir }: { p: Pendencia; marcado: boolean; marcar?: () => void; aprovar: () => void; devolver: () => void; abrir: () => void }) {
  if (p.tipo === "aprovacao" || p.tipo === "bloqueado") {
    const c = p.card;
    const autor = c.dono ? agentById[c.dono] : null;
    const validador = c.validador ? agentById[c.validador] : null;
    return (
      <div className="flex items-start gap-3 px-4 py-3.5">
        {marcar ? (
          <input type="checkbox" checked={marcado} onChange={marcar} aria-label={`Selecionar ${c.chave}`} className="mt-2.5 size-4 accent-[var(--accent)]" />
        ) : (
          <span className="w-4" />
        )}
        {autor ? <Avatarzinho agent={autor} tamanho={36} /> : <span className="size-9" />}
        <button type="button" onClick={abrir} className="min-w-0 flex-1 text-left">
          <div className="flex flex-wrap items-center gap-2">
            {p.tipo === "bloqueado" ? <Etiqueta tom="alerta" icone={Lock}>Pergunta para você</Etiqueta> : <Etiqueta tom="sucesso" icone={Check}>Pronto para aprovar</Etiqueta>}
            {c.nivel !== "N1" && <Etiqueta tom="info">{c.nivel}</Etiqueta>}
            {c.devolucoes > 0 && <Etiqueta tom="alerta" icone={RotateCcw}>devolvido {c.devolucoes}×</Etiqueta>}
          </div>
          <div className="mt-1 text-corpo font-medium text-fg">{c.titulo}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-legenda text-fg-3">
            <IconeTipo tipo={c.tipo} />
            <span className="tabular">{c.chave}</span>·<span>{roomById[c.sala].nome}</span>
            {autor && <>·<span>{autor.nome}{validador && p.tipo === "aprovacao" ? `, validado por ${validador.nome}` : ""}</span></>}
            ·<span>{quando(p.ts)}</span>
          </div>
        </button>
        <SeloPrioridade p={c.prioridade} />
        <div className="flex shrink-0 gap-1.5">
          {p.tipo === "aprovacao" ? (
            <>
              <Botao tamanho="p" variante="discreto" icone={RotateCcw} onClick={devolver}>Devolver</Botao>
              <Botao tamanho="p" variante="sucesso" icone={Check} onClick={aprovar}>Aprovar</Botao>
            </>
          ) : (
            <Botao tamanho="p" iconeDireita={ChevronRight} onClick={abrir}>Responder</Botao>
          )}
        </div>
      </div>
    );
  }
  if (p.tipo === "acao") {
    const x = p.pedido;
    const a = agentById[x.agenteId];
    const Icone = x.servidorId === -1 ? Terminal : Plug;
    const resumoArgs = x.servidorId === -1 ? String(x.args.comando ?? "") : x.servidorId === -2 ? `Sessão de ${x.args.minutos ?? 15} min` : JSON.stringify(x.args);
    return (
      <div className="flex items-start gap-3 px-4 py-3.5">
        <span className="w-4" />
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-warning-soft text-warning-fg"><Icone className="size-4" /></span>
        <button type="button" onClick={abrir} className="min-w-0 flex-1 text-left">
          <Etiqueta tom="alerta">Ação fora da empresa</Etiqueta>
          <div className="mt-1 text-corpo font-medium text-fg">{x.servidor} · {x.ferramenta}</div>
          {x.motivo && <div className="mt-0.5 text-pequeno text-fg-2">{x.motivo}</div>}
          <pre className="mt-1.5 max-h-24 overflow-auto whitespace-pre-wrap break-all rounded-ctl bg-sunken px-2.5 py-1.5 font-mono text-legenda text-fg">{resumoArgs}</pre>
          <div className="mt-1 text-legenda text-fg-3">Pedido por {a?.nome ?? x.agenteId} · {quando(p.ts)}</div>
        </button>
        <div className="flex shrink-0 gap-1.5">
          <Botao tamanho="p" variante="discreto" icone={X} onClick={devolver}>Recusar</Botao>
          <Botao tamanho="p" variante="sucesso" icone={Check} onClick={aprovar}>Executar</Botao>
        </div>
      </div>
    );
  }
  if (p.tipo === "whatsapp") return <ItemWhatsapp p={p} abrir={abrir} />;
  const it = p.item;
  return (
    <div className="flex items-start gap-3 px-4 py-3.5">
      <span className="w-4" />
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-info-soft text-info-fg"><BookOpen className="size-4" /></span>
      <button type="button" onClick={abrir} className="min-w-0 flex-1 text-left">
        <Etiqueta tom="info">Proposta de conhecimento · {roomById[it.sala]?.nome ?? it.sala}</Etiqueta>
        <div className="mt-1 text-corpo font-medium text-fg">{it.titulo}</div>
        <div className="mt-0.5 line-clamp-2 text-pequeno text-fg-2">{it.conteudo}</div>
      </button>
      <div className="flex shrink-0 gap-1.5">
        <Botao tamanho="p" variante="discreto" onClick={abrir}>Revisar</Botao>
        <Botao tamanho="p" variante="sucesso" icone={Check} onClick={aprovar}>Aprovar</Botao>
      </div>
    </div>
  );
}

/** Resposta da Lorena esperando o OK: dá para enviar dali mesmo. */
function ItemWhatsapp({ p, abrir }: { p: Extract<Pendencia, { tipo: "whatsapp" }>; abrir: () => void }) {
  const c = p.contato;
  const [pendentes, setPendentes] = useState<MensagemWhatsapp[] | null>(null);
  useEffect(() => {
    if (c.pendentes > 0) void api<MensagemWhatsapp[]>(`/api/whatsapp/contatos/${c.telefone}/mensagens`).then((m) => setPendentes(m.filter((x) => x.status === "pendente")));
  }, [c.telefone, c.pendentes]);
  return (
    <div className="flex items-start gap-3 px-4 py-3.5">
      <span className="w-4" />
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-success-soft text-whatsapp"><MessageCircle className="size-4" /></span>
      <div className="min-w-0 flex-1">
        <button type="button" onClick={abrir} className="text-left">
          <Etiqueta tom={c.humano ? "alerta" : "sucesso"}>{c.humano ? "Cliente esperando você" : `${c.pendentes} resposta${c.pendentes > 1 ? "s" : ""} da Lorena para aprovar`}</Etiqueta>
          <div className="mt-1 text-corpo font-medium text-fg">{c.nome || c.telefone}</div>
          {c.ultimaMensagem && <div className="mt-0.5 truncate text-pequeno text-fg-2">Cliente: {c.ultimaMensagem.direcao === "in" ? c.ultimaMensagem.texto : c.resumo}</div>}
        </button>
        {pendentes?.map((m) => (
          <div key={m.id} className="mt-2 flex items-start gap-2 rounded-card bg-success-soft px-3 py-2">
            <p className="min-w-0 flex-1 whitespace-pre-wrap text-pequeno text-fg">{m.texto}</p>
            <Botao tamanho="p" variante="discreto" onClick={() => void api(`/api/whatsapp/mensagens/${m.id}/descartar`, "POST").catch(avisarErro)}>Descartar</Botao>
            <Botao tamanho="p" variante="sucesso" onClick={() => void api(`/api/whatsapp/mensagens/${m.id}/aprovar`, "POST", {}).then(() => avisar("Enviada")).catch(avisarErro)}>Enviar</Botao>
          </div>
        ))}
      </div>
      <Botao tamanho="p" iconeDireita={ChevronRight} onClick={abrir}>Abrir conversa</Botao>
    </div>
  );
}

function Devolver({ p, fechar }: { p: Pendencia | null; fechar: () => void }) {
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  useEffect(() => setTexto(""), [p]);
  const acao = p?.tipo === "acao";
  const ok = async () => {
    if (!p) return;
    setEnviando(true);
    try {
      if (p.tipo === "aprovacao") await api(`/api/cards/${p.card.id}/devolver`, "POST", { comentario: texto });
      else if (p.tipo === "acao") await api(`/api/mcp/pedidos/${p.pedido.id}/recusar`, "POST", { motivo: texto });
      avisar(acao ? "Recusado" : "Devolvido com o seu comentário");
      fechar();
    } catch (e) {
      avisarErro(e);
    } finally {
      setEnviando(false);
    }
  };
  return (
    <Janela
      aberta={!!p}
      fechar={fechar}
      titulo={acao ? "Recusar ação" : "Devolver com comentário"}
      descricao={acao ? "O agente recebe o motivo e segue sem essa ação." : "O autor recebe o comentário e faz uma nova versão."}
      largura={520}
      rodape={
        <>
          <Botao variante="discreto" onClick={fechar}>Cancelar</Botao>
          <Botao variante="principal" carregando={enviando} disabled={!acao && !texto.trim()} motivo={!acao && !texto.trim() ? "Escreva o que precisa mudar" : undefined} onClick={() => void ok()}>
            {acao ? "Recusar" : "Devolver"}
          </Botao>
        </>
      }
    >
      <AreaTexto data-autofoco rotulo={acao ? "Motivo (opcional)" : "O que precisa mudar?"} value={texto} onChange={(e) => setTexto(e.target.value)} rows={5} placeholder={acao ? "Não envie nada para clientes ainda." : "O texto está bom, mas falta o preço do plano anual."} />
    </Janela>
  );
}
