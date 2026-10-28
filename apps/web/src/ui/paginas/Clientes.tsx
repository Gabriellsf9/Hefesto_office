import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp, Ban, Bot, Check, CheckCheck, Clock, Download, Headset, Hand, MessageCircle, MessageSquarePlus, Pencil, Plus, Search, Settings2, Target, Trash2, Undo2, UserRound, X,
} from "lucide-react";
import { colunaDe, type Card, type ContatoWhatsapp, type MensagemWhatsapp, type ModeloWhatsapp, type NaoContatar, type TipoNaoContatar } from "@empresa/shared";
import { useStore } from "../../store.ts";
import { api } from "../../api.ts";
import { navegar, useNav } from "../../nav.ts";
import {
  Abas, AreaTexto, Botao, BotaoIcone, CabecalhoPagina, Campo, Caixa, Chip, Etiqueta, EstadoVazio, Janela, Pagina, Segmentado, Seletor, avisar, avisarErro, confirmar, cx,
} from "../kit/index.ts";
import { hora, quando } from "../comum.tsx";
import { LinhaCard, SeloPrioridade } from "../trabalho/cartao.tsx";

// Clientes (DESIGN-INTERFACE.md §6.4): conversas do WhatsApp, leads e prospecção, atendimentos, não contatar.

type Sub = "whatsapp" | "leads" | "atendimentos" | "nao-contatar";

export default function PaginaClientes() {
  const rota = useNav((s) => s.rota);
  const sub = (["whatsapp", "leads", "atendimentos", "nao-contatar"].includes(rota.sub ?? "") ? rota.sub : "whatsapp") as Sub;
  const contatos = useStore((s) => s.contatosWa);
  const leads = useStore((s) => s.leads);
  const cards = useStore((s) => s.cards);
  const naoLidas = Object.values(contatos).reduce((t, c) => t + c.naoLidas, 0);
  const atendimentos = Object.values(cards).filter((c) => c.etiquetas.includes("atendimento") && colunaDe(c.fluxo, c.coluna)?.tipo !== "feito").length;

  const abas = (
    <Abas
      ativa={sub}
      onChange={(id) => navegar("clientes", id)}
      abas={[
        { id: "whatsapp", rotulo: "WhatsApp", icone: MessageCircle, contador: naoLidas },
        { id: "leads", rotulo: "Leads", icone: Target, contador: Object.keys(leads).length },
        { id: "atendimentos", rotulo: "Atendimentos", icone: Headset, contador: atendimentos },
        { id: "nao-contatar", rotulo: "Não contatar", icone: Ban },
      ]}
    />
  );

  if (sub === "whatsapp")
    return (
      <div className="flex h-full flex-col">
        <div className="shrink-0 px-6 pt-5 lg:px-8">
          <h1 className="mb-4 flex items-center gap-2.5 text-pagina font-semibold text-fg"><UserRound className="size-6 text-fg-3" strokeWidth={1.75} />Clientes</h1>
          {abas}
        </div>
        <Whatsapp telefone={rota.id} />
      </div>
    );
  return (
    <Pagina largura="media">
      <CabecalhoPagina icone={UserRound} titulo="Clientes" abas={abas} />
      {sub === "leads" && <Leads />}
      {sub === "atendimentos" && <Atendimentos />}
      {sub === "nao-contatar" && <ListaNaoContatar />}
    </Pagina>
  );
}

/* ================= WhatsApp ================= */

const ETAPAS: Record<ContatoWhatsapp["etapa"], { rotulo: string; tom: "neutro" | "info" | "acento" | "alerta" | "sucesso" | "perigo" }> = {
  novo: { rotulo: "Novo", tom: "neutro" },
  duvida: { rotulo: "Dúvida", tom: "info" },
  interessado: { rotulo: "Interessado", tom: "acento" },
  negociando: { rotulo: "Negociando", tom: "alerta" },
  cliente: { rotulo: "Cliente", tom: "sucesso" },
  perdido: { rotulo: "Perdido", tom: "neutro" },
  humano: { rotulo: "Com você", tom: "alerta" },
};
const janelaAberta = (c: ContatoWhatsapp) => !!c.ultimaEntrada && Date.now() - c.ultimaEntrada < 24 * 3600_000;
const iniciais = (n: string) => n.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "?";

function Whatsapp({ telefone }: { telefone: string | null }) {
  const estado = useStore((s) => s.whatsapp);
  const contatosMap = useStore((s) => s.contatosWa);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todas" | "nao-lidas" | "pendentes" | "comigo">("todas");
  const [novaAberta, setNovaAberta] = useState(false);
  const contatos = useMemo(
    () =>
      Object.values(contatosMap)
        .filter((c) => (filtro === "nao-lidas" ? c.naoLidas > 0 : filtro === "pendentes" ? c.pendentes > 0 : filtro === "comigo" ? c.humano : true))
        .filter((c) => !busca || `${c.nome} ${c.telefone}`.toLowerCase().includes(busca.toLowerCase()))
        .sort((a, b) => (b.ultimaMensagem?.ts ?? 0) - (a.ultimaMensagem?.ts ?? 0)),
    [contatosMap, filtro, busca],
  );
  const atual = telefone ? contatosMap[telefone] : undefined;
  const configurado = !!estado?.temToken;

  return (
    <div className="flex min-h-0 flex-1 gap-0 px-6 pb-28 pt-4 lg:px-8">
      <div className="flex min-h-0 w-full overflow-hidden rounded-panel bg-surface shadow-1">
        {/* Lista de conversas */}
        <div className={cx("flex min-h-0 w-full shrink-0 flex-col border-r border-line md:w-[340px]", atual && "hidden md:flex")}>
          <EstadoConexao />
          <div className="space-y-2 border-b border-line p-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-3" />
                <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome ou número" className="h-9 w-full rounded-ctl bg-sunken pl-8 pr-3 text-corpo text-fg outline-none placeholder:text-fg-3" />
              </div>
              <BotaoIcone icone={MessageSquarePlus} rotulo="Nova conversa por modelo" onClick={() => setNovaAberta(true)} />
            </div>
            <div className="flex gap-1.5 overflow-x-auto">
              {([["todas", "Todas"], ["nao-lidas", "Não lidas"], ["pendentes", "Para aprovar"], ["comigo", "Com você"]] as const).map(([id, r]) => (
                <Chip key={id} ativo={filtro === id} onClick={() => setFiltro(id)}>{r}</Chip>
              ))}
            </div>
          </div>
          <ul className="scroll-fino min-h-0 flex-1 overflow-y-auto p-1.5">
            {contatos.length === 0 && (
              <EstadoVazio
                compacto
                icone={MessageCircle}
                titulo={configurado ? "Nenhuma conversa" : "WhatsApp não conectado"}
                texto={configurado ? "Quando um cliente escrever para o número da empresa, a conversa aparece aqui e a Lorena responde." : "Conecte o número da empresa pela API oficial da Meta para a Lorena atender os clientes."}
                acao={!configurado && <Botao tamanho="p" variante="principal" icone={Settings2} onClick={() => navegar("config", "whatsapp")}>Configurar WhatsApp</Botao>}
              />
            )}
            {contatos.map((c) => (
              <li key={c.telefone}>
                <button
                  type="button"
                  onClick={() => navegar("clientes", "whatsapp", c.telefone)}
                  className={cx("flex w-full items-start gap-3 rounded-ctl px-2.5 py-2.5 text-left transition-colors", c.telefone === telefone ? "bg-press" : "hover:bg-hover")}
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-success-soft text-pequeno font-semibold text-success-fg">{iniciais(c.nome)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className={cx("min-w-0 flex-1 truncate text-corpo", c.naoLidas ? "font-semibold text-fg" : "font-medium text-fg")}>{c.nome || `+${c.telefone}`}</span>
                      {c.ultimaMensagem && <span className={cx("tabular shrink-0 text-legenda", c.naoLidas ? "font-semibold text-whatsapp" : "text-fg-3")}>{quando(c.ultimaMensagem.ts)}</span>}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5">
                      <span className="min-w-0 flex-1 truncate text-pequeno text-fg-2">
                        {c.ultimaMensagem?.direcao === "out" && <Check className="mr-0.5 inline size-3.5 text-fg-3" />}
                        {c.ultimaMensagem?.texto ?? "Sem mensagens"}
                      </span>
                      {c.pendentes > 0 && <Etiqueta tom="alerta">{c.pendentes} p/ aprovar</Etiqueta>}
                      {c.naoLidas > 0 && <span className="tabular grid h-5 min-w-5 place-items-center rounded-full bg-whatsapp px-1.5 text-legenda font-semibold text-white">{c.naoLidas}</span>}
                    </span>
                    <span className="mt-1 flex gap-1">
                      <Etiqueta tom={ETAPAS[c.etapa].tom}>{ETAPAS[c.etapa].rotulo}</Etiqueta>
                      {c.bloqueado && <Etiqueta tom="perigo" icone={Ban}>saiu</Etiqueta>}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        {/* Conversa */}
        <div className={cx("min-h-0 min-w-0 flex-1 flex-col", atual ? "flex" : "hidden md:flex")}>
          {atual ? <Conversa key={atual.telefone} contato={atual} /> : <EstadoVazio icone={MessageCircle} titulo="Escolha uma conversa" texto={`A Lorena responde no modo "${estado?.modo === "automatico" ? "automático" : "aprovar"}". Você pode assumir qualquer conversa.`} />}
        </div>
      </div>
      <NovaConversa aberta={novaAberta} fechar={() => setNovaAberta(false)} />
    </div>
  );
}

function EstadoConexao() {
  const e = useStore((s) => s.whatsapp);
  if (!e) return null;
  const cor = e.status === "conectado" && !e.erro ? "bg-success" : e.status === "conectando" ? "pulsar bg-warning" : e.status === "erro" ? "bg-danger" : "bg-fg-disabled";
  const texto = !e.temToken ? "Não configurado" : e.status === "conectado" ? (e.erro ? "Conectado, com aviso" : `Conectado${e.numero ? ` · ${e.numero}` : ""}`) : e.status === "conectando" ? "Conectando…" : e.status === "erro" ? "Erro na conexão" : "Desligado";
  return (
    <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-3 py-2 text-pequeno">
      <span className={cx("size-2 shrink-0 rounded-full", cor)} />
      <span className="min-w-0 flex-1 truncate text-fg-2" title={e.erro ?? undefined}>{texto}</span>
      {e.temToken && (
        <Segmentado
          tamanho="p"
          valor={e.modo}
          onChange={(modo) => void api("/api/whatsapp", "PUT", { modo }).then(() => avisar(modo === "automatico" ? "A Lorena responde sozinha" : "Respostas esperam o seu OK")).catch(avisarErro)}
          opcoes={[{ id: "aprovar", rotulo: "Aprovar" }, { id: "automatico", rotulo: "Automático" }]}
        />
      )}
      <BotaoIcone icone={Settings2} rotulo="Configurar WhatsApp" tamanho="p" onClick={() => navegar("config", "whatsapp")} />
    </div>
  );
}

function Conversa({ contato }: { contato: ContatoWhatsapp }) {
  const msgs = useStore((s) => s.mensagensWa[contato.telefone]);
  const setMensagens = useStore((s) => s.setMensagensWa);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const fim = useRef<HTMLDivElement>(null);
  const aberta = janelaAberta(contato);

  useEffect(() => {
    void api<MensagemWhatsapp[]>(`/api/whatsapp/contatos/${contato.telefone}/mensagens`).then((m) => setMensagens(contato.telefone, m)).catch(avisarErro);
  }, [contato.telefone, setMensagens]);
  useEffect(() => {
    if (contato.naoLidas > 0) void api(`/api/whatsapp/contatos/${contato.telefone}`, "PATCH", { lido: true }).catch(() => {});
  }, [contato.telefone, contato.naoLidas]);
  useEffect(() => void fim.current?.scrollIntoView({ block: "end" }), [msgs?.length]);

  const enviar = async () => {
    if (!texto.trim()) return;
    setEnviando(true);
    try {
      await api(`/api/whatsapp/contatos/${contato.telefone}/enviar`, "POST", { texto });
      setTexto("");
    } catch (e) {
      avisarErro(e);
    } finally {
      setEnviando(false);
    }
  };
  const assumir = (humano: boolean) => api(`/api/whatsapp/contatos/${contato.telefone}`, "PATCH", { humano }).then(() => avisar(humano ? "Você assumiu a conversa; a Lorena não responde mais aqui" : "A Lorena voltou a atender")).catch(avisarErro);

  return (
    <>
      <header className="flex items-center gap-3 border-b border-line px-4 py-2.5">
        <BotaoIcone icone={Undo2} rotulo="Voltar para a lista" tamanho="p" className="md:hidden" onClick={() => navegar("clientes", "whatsapp")} />
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-success-soft text-pequeno font-semibold text-success-fg">{iniciais(contato.nome)}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-corpo font-semibold text-fg">{contato.nome || `+${contato.telefone}`}</div>
          <div className="flex items-center gap-1.5 text-legenda text-fg-3">
            <span className="tabular">+{contato.telefone}</span>·
            {aberta ? <span className="text-success-fg">janela aberta</span> : <span>janela de 24 h fechada</span>}
            {contato.leadCardId && <>·<button type="button" className="text-accent-fg hover:underline" onClick={() => useStore.getState().abrirCard(contato.leadCardId!)}>ver lead</button></>}
          </div>
        </div>
        <Seletor
          tamanho="p"
          value={contato.etapa}
          onChange={(e) => void api(`/api/whatsapp/contatos/${contato.telefone}`, "PATCH", { etapa: e.target.value }).catch(avisarErro)}
          aria-label="Etapa do cliente"
        >
          {Object.entries(ETAPAS).map(([id, e]) => <option key={id} value={id}>{e.rotulo}</option>)}
        </Seletor>
        {contato.humano ? (
          <Botao tamanho="p" icone={Bot} onClick={() => void assumir(false)}>Devolver à Lorena</Botao>
        ) : (
          <Botao tamanho="p" icone={Hand} onClick={() => void assumir(true)}>Assumir conversa</Botao>
        )}
      </header>
      {contato.resumo && (
        <div className="border-b border-line bg-surface-2 px-4 py-2 text-pequeno text-fg-2">
          <b className="font-semibold text-fg">Resumo da Lorena:</b> {contato.resumo}
        </div>
      )}
      <div className="scroll-fino min-h-0 flex-1 space-y-2 overflow-y-auto bg-bg px-4 py-4">
        {!msgs && <p className="py-8 text-center text-pequeno text-fg-3">Carregando…</p>}
        {msgs?.filter((m) => m.status !== "descartada").map((m) => <BolhaWa key={m.id} m={m} />)}
        <div ref={fim} />
      </div>
      <div className="border-t border-line p-3">
        {contato.bloqueado ? (
          <p className="rounded-ctl bg-danger-soft px-3 py-2 text-pequeno text-danger-fg">Este cliente pediu para não receber mais mensagens. A empresa só responde se ele escrever de novo.</p>
        ) : aberta ? (
          <div className="flex items-end gap-2">
            <AreaTexto
              className="flex-1"
              rows={1}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void enviar();
                }
              }}
              placeholder={contato.humano ? "Escreva como você (Enter envia)" : "Escreva para responder você mesmo (a Lorena continua atendendo)"}
            />
            <button type="button" onClick={() => void enviar()} disabled={!texto.trim() || enviando} aria-label="Enviar" className="grid size-9 shrink-0 place-items-center rounded-ctl bg-whatsapp text-white disabled:opacity-30">
              <ArrowUp className="size-[18px]" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-ctl bg-sunken px-3 py-2 text-pequeno text-fg-2">
            <Clock className="size-4 shrink-0" />
            <span className="flex-1">Passaram 24 h desde a última mensagem do cliente: pela regra da Meta, só dá para retomar com um modelo aprovado.</span>
            <Botao tamanho="p" onClick={() => window.dispatchEvent(new CustomEvent("wa:modelo", { detail: contato }))}>Enviar modelo</Botao>
          </div>
        )}
      </div>
    </>
  );
}

function BolhaWa({ m }: { m: MensagemWhatsapp }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(m.texto);
  const de = m.direcao === "in";
  const pendente = m.status === "pendente";
  const autor = m.autor === "voce" ? "Você" : m.autor === "sistema" ? "Sistema" : m.autor === "cliente" ? null : "Lorena";
  const aprovar = (t?: string) => api(`/api/whatsapp/mensagens/${m.id}/aprovar`, "POST", t ? { texto: t } : {}).then(() => avisar("Enviada")).catch(avisarErro);
  return (
    <div className={cx("flex", de ? "justify-start" : "justify-end")}>
      <div
        className={cx(
          "max-w-[78%] rounded-2xl px-3.5 py-2 shadow-1",
          de ? "rounded-bl-md bg-surface text-fg" : pendente ? "rounded-br-md border border-dashed border-warning bg-warning-soft text-fg" : "rounded-br-md bg-success-soft text-fg",
        )}
      >
        {!de && autor && (
          <div className="mb-0.5 flex items-center gap-1 text-legenda font-medium text-fg-3">
            {autor === "Lorena" && <Bot className="size-3" />} {autor}{pendente && " · rascunho esperando o seu OK"}
          </div>
        )}
        {m.imagem && (
          <a href={m.imagem} target="_blank" rel="noreferrer">
            <img src={m.imagem} alt="Imagem do cliente" className="mb-1.5 max-h-60 rounded-ctl object-cover" />
          </a>
        )}
        {editando ? (
          <AreaTexto rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} className="min-w-[280px]" />
        ) : (
          m.texto && <div className="whitespace-pre-wrap text-corpo">{m.texto}</div>
        )}
        <div className="mt-1 flex items-center justify-end gap-1 text-legenda text-fg-3">
          {m.erro && <span className="text-danger-fg" title={m.erro}>não entregue</span>}
          <span className="tabular">{hora(m.ts)}</span>
          {!de && !pendente && (m.status === "lida" ? <CheckCheck className="size-3.5 text-accent" /> : m.status === "entregue" ? <CheckCheck className="size-3.5" /> : m.status === "enviada" ? <Check className="size-3.5" /> : m.status === "enviando" ? <Clock className="size-3" /> : null)}
        </div>
        {pendente && (
          <div className="mt-2 flex justify-end gap-1.5">
            {editando ? (
              <>
                <Botao tamanho="p" variante="discreto" onClick={() => { setEditando(false); setTexto(m.texto); }}>Cancelar</Botao>
                <Botao tamanho="p" variante="sucesso" icone={Check} onClick={() => void aprovar(texto)}>Enviar editada</Botao>
              </>
            ) : (
              <>
                <Botao tamanho="p" variante="discreto" icone={Trash2} onClick={() => void api(`/api/whatsapp/mensagens/${m.id}/descartar`, "POST").catch(avisarErro)}>Descartar</Botao>
                <Botao tamanho="p" variante="secundario" icone={Pencil} onClick={() => setEditando(true)}>Editar</Botao>
                <Botao tamanho="p" variante="sucesso" icone={Check} onClick={() => void aprovar()}>Enviar</Botao>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Primeira mensagem da empresa (ou depois de 24 h): só modelo aprovado e com opt-in confirmado. */
function NovaConversa({ aberta, fechar }: { aberta: boolean; fechar: () => void }) {
  const [modelos, setModelos] = useState<ModeloWhatsapp[] | null>(null);
  const [erroModelos, setErroModelos] = useState<string | null>(null);
  const [telefone, setTelefone] = useState("");
  const [nome, setNome] = useState("");
  const [modelo, setModelo] = useState("");
  const [params, setParams] = useState<string[]>([]);
  const [optin, setOptin] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [aberto2, setAberto2] = useState(false);
  // "Enviar modelo" de dentro de uma conversa fechada abre esta janela já com o número.
  useEffect(() => {
    const f = (e: Event) => {
      const c = (e as CustomEvent<ContatoWhatsapp>).detail;
      setTelefone(c.telefone);
      setNome(c.nome);
      setAberto2(true);
    };
    window.addEventListener("wa:modelo", f);
    return () => window.removeEventListener("wa:modelo", f);
  }, []);
  const visivel = aberta || aberto2;
  useEffect(() => {
    if (!visivel) return;
    setErroModelos(null);
    api<ModeloWhatsapp[]>("/api/whatsapp/modelos").then((m) => { setModelos(m); if (m[0]) setModelo(`${m[0].nome}|${m[0].idioma}`); }).catch((e) => { setModelos([]); setErroModelos(e instanceof Error ? e.message : String(e)); });
  }, [visivel]);
  const m = modelos?.find((x) => `${x.nome}|${x.idioma}` === modelo);
  useEffect(() => setParams(Array.from({ length: m?.variaveis ?? 0 }, (_, i) => (i === 0 ? nome : ""))), [m?.nome, m?.variaveis, nome]);
  const fecharTudo = () => { fechar(); setAberto2(false); setOptin(false); };
  const enviar = async () => {
    if (!m) return;
    setEnviando(true);
    try {
      const r = await api<MensagemWhatsapp>("/api/whatsapp/modelo", "POST", { telefone, contatoNome: nome, nome: m.nome, idioma: m.idioma, parametros: params, optin });
      avisar("Modelo enviado");
      fecharTudo();
      navegar("clientes", "whatsapp", r.telefone);
    } catch (e) {
      avisarErro(e);
    } finally {
      setEnviando(false);
    }
  };
  return (
    <Janela
      aberta={visivel}
      fechar={fecharTudo}
      titulo="Nova conversa por modelo"
      descricao="Para escrever primeiro (ou depois de 24 h sem resposta), a Meta exige um modelo aprovado e que a pessoa tenha autorizado receber mensagens."
      largura={560}
      rodape={
        <>
          <Botao variante="discreto" onClick={fecharTudo}>Cancelar</Botao>
          <Botao variante="principal" carregando={enviando} disabled={!m || !telefone.trim() || !optin} motivo={!optin ? "Confirme a autorização (opt-in)" : undefined} onClick={() => void enviar()}>Enviar modelo</Botao>
        </>
      }
    >
      <div className="space-y-3 pb-2">
        <div className="grid grid-cols-2 gap-2">
          <Campo data-autofoco rotulo="Telefone com DDD" value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="11 99999-8888" />
          <Campo rotulo="Nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ana" />
        </div>
        {erroModelos ? (
          <p className="rounded-ctl bg-danger-soft px-3 py-2 text-pequeno text-danger-fg">{erroModelos}</p>
        ) : modelos && modelos.length === 0 ? (
          <p className="rounded-ctl bg-sunken px-3 py-2 text-pequeno text-fg-2">Nenhum modelo aprovado. Crie um no WhatsApp Manager da Meta e espere a aprovação.</p>
        ) : (
          <Seletor rotulo="Modelo aprovado" value={modelo} onChange={(e) => setModelo(e.target.value)}>
            {modelos?.map((x) => <option key={`${x.nome}|${x.idioma}`} value={`${x.nome}|${x.idioma}`}>{x.nome} · {x.idioma} · {x.categoria.toLowerCase()}</option>)}
          </Seletor>
        )}
        {m && (
          <div className="rounded-card bg-success-soft p-3">
            <div className="whitespace-pre-wrap text-corpo text-fg">{m.texto.replace(/\{\{(\d+)\}\}/g, (_, n) => params[Number(n) - 1] || `{{${n}}}`)}</div>
          </div>
        )}
        {params.map((p, i) => (
          <Campo key={i} tamanho="p" rotulo={`Variável {{${i + 1}}}`} value={p} onChange={(e) => setParams((ps) => ps.map((x, j) => (j === i ? e.target.value : x)))} />
        ))}
        <Caixa marcada={optin} onChange={setOptin} rotulo="Esta pessoa autorizou receber mensagens da empresa no WhatsApp" descricao="Regra da Meta e da LGPD. Contatos frios de prospecção: use o link do WhatsApp no card do lead, enviado por você." />
      </div>
    </Janela>
  );
}

/* ================= Leads ================= */

function Leads() {
  const leads = useStore((s) => s.leads);
  const cards = useStore((s) => s.cards);
  const [busca, setBusca] = useState("");
  const [notaMin, setNotaMin] = useState(0);
  const [nova, setNova] = useState(false);
  const linhas = Object.values(leads)
    .map((l) => ({ l, c: cards[l.cardId] }))
    .filter((x): x is { l: typeof x.l; c: Card } => !!x.c)
    .filter(({ l }) => l.nota >= notaMin && (!busca || `${l.dados.nome?.valor ?? ""} ${l.dados.cidade?.valor ?? ""}`.toLowerCase().includes(busca.toLowerCase())))
    .sort((a, b) => b.l.nota - a.l.nota);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-3" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Empresa ou cidade" className="h-9 w-64 rounded-ctl bg-surface pl-8 pr-3 text-corpo shadow-[inset_0_0_0_1px_var(--line)] outline-none placeholder:text-fg-3" />
        </div>
        <Seletor tamanho="m" value={notaMin} onChange={(e) => setNotaMin(Number(e.target.value))} aria-label="Nota mínima">
          <option value={0}>Qualquer nota</option>
          <option value={50}>Nota ≥ 50</option>
          <option value={70}>Nota ≥ 70</option>
          <option value={85}>Nota ≥ 85</option>
        </Seletor>
        <div className="flex-1" />
        <a href="/api/leads.csv" className="inline-flex h-9 items-center gap-2 rounded-ctl bg-surface px-3.5 text-corpo font-medium text-fg shadow-[inset_0_0_0_1px_var(--line-strong)] hover:bg-surface-2"><Download className="size-4" />Exportar CSV</a>
        <Botao variante="principal" icone={Plus} onClick={() => setNova(true)}>Nova prospecção</Botao>
      </div>
      {linhas.length === 0 ? (
        <div className="rounded-panel bg-surface shadow-1">
          <EstadoVazio icone={Target} titulo="Nenhum lead ainda" texto="Comece uma prospecção: o Daniel pesquisa empresas com o seu perfil de cliente, a Tatiane escreve as mensagens e você aprova antes de qualquer contato." acao={<Botao variante="principal" icone={Plus} onClick={() => setNova(true)}>Nova prospecção</Botao>} />
        </div>
      ) : (
        <div className="overflow-hidden rounded-panel bg-surface shadow-1">
          <table className="w-full text-left text-pequeno">
            <thead className="bg-surface-2 text-legenda text-fg-3">
              <tr>
                <th className="px-4 py-2.5 font-medium">Empresa</th>
                <th className="px-3 py-2.5 font-medium">Cidade</th>
                <th className="px-3 py-2.5 font-medium">Nota</th>
                <th className="px-3 py-2.5 font-medium">Etapa</th>
                <th className="px-3 py-2.5 font-medium">Contato</th>
                <th className="px-3 py-2.5 font-medium">Atualizado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {linhas.map(({ l, c }) => (
                <tr key={l.cardId} onClick={() => useStore.getState().abrirCard(c.id)} className="cursor-pointer hover:bg-hover">
                  <td className="px-4 py-2.5 font-medium text-fg">{l.dados.nome?.valor ?? c.titulo}</td>
                  <td className="px-3 py-2.5 text-fg-2">{l.dados.cidade?.valor ?? "—"}</td>
                  <td className="px-3 py-2.5"><Etiqueta tom={l.nota >= 80 ? "sucesso" : l.nota >= 50 ? "alerta" : "neutro"}>{l.nota}</Etiqueta></td>
                  <td className="px-3 py-2.5 text-fg-2">{colunaDe(c.fluxo, c.coluna)?.nome ?? c.coluna}</td>
                  <td className="px-3 py-2.5 text-fg-2">{l.dados.whatsapp?.valor ?? l.dados.telefone?.valor ?? l.dados.email?.valor ?? "—"}</td>
                  <td className="px-3 py-2.5 text-fg-3">{quando(l.atualizadoEm)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <NovaProspeccao aberta={nova} fechar={() => setNova(false)} />
    </div>
  );
}

function NovaProspeccao({ aberta, fechar }: { aberta: boolean; fechar: () => void }) {
  const [produto, setProduto] = useState("");
  const [clienteIdeal, setClienteIdeal] = useState("");
  const [regiao, setRegiao] = useState("");
  const [quantidade, setQuantidade] = useState(10);
  const [enviando, setEnviando] = useState(false);
  const ok = produto.trim() && clienteIdeal.trim() && regiao.trim();
  return (
    <Janela
      aberta={aberta}
      fechar={fechar}
      titulo="Nova prospecção"
      descricao="O Daniel (SDR) pesquisa só dados públicos e profissionais, com a fonte de cada um. A Tatiane escreve as mensagens, a Aline valida e você aprova antes de qualquer contato."
      rodape={
        <>
          <Botao variante="discreto" onClick={fechar}>Cancelar</Botao>
          <Botao
            variante="principal"
            carregando={enviando}
            disabled={!ok}
            motivo={!ok ? "Preencha o que vender, o cliente ideal e a região" : undefined}
            onClick={async () => {
              setEnviando(true);
              try {
                await api("/api/prospeccao", "POST", { produto, clienteIdeal, regiao, quantidade });
                avisar("Prospecção começou: os leads aparecem aqui");
                fechar();
              } catch (e) {
                avisarErro(e);
              } finally {
                setEnviando(false);
              }
            }}
          >
            Começar
          </Botao>
        </>
      }
    >
      <div className="space-y-3 pb-2">
        <AreaTexto data-autofoco rotulo="O que vamos vender" rows={2} value={produto} onChange={(e) => setProduto(e.target.value)} placeholder="Software de agenda online para clínicas veterinárias, R$ 149/mês" />
        <AreaTexto rotulo="Cliente ideal" rows={2} value={clienteIdeal} onChange={(e) => setClienteIdeal(e.target.value)} placeholder="Clínicas com 2 a 10 veterinários que agendam pelo WhatsApp" />
        <div className="grid grid-cols-[1fr_120px] gap-2">
          <Campo rotulo="Região" value={regiao} onChange={(e) => setRegiao(e.target.value)} placeholder="Campinas – SP" />
          <Campo rotulo="Quantidade" type="number" min={1} max={40} value={quantidade} onChange={(e) => setQuantidade(Number(e.target.value))} />
        </div>
      </div>
    </Janela>
  );
}

/* ================= Atendimentos ================= */

function Atendimentos() {
  const cards = useStore((s) => s.cards);
  const [novo, setNovo] = useState(false);
  const [mostrar, setMostrar] = useState<"abertos" | "todos">("abertos");
  const lista = Object.values(cards)
    .filter((c) => c.etiquetas.includes("atendimento"))
    .filter((c) => mostrar === "todos" || colunaDe(c.fluxo, c.coluna)?.tipo !== "feito")
    .sort((a, b) => a.prioridade.localeCompare(b.prioridade) || a.criadoEm - b.criadoEm);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Segmentado valor={mostrar} onChange={setMostrar} opcoes={[{ id: "abertos", rotulo: "Abertos" }, { id: "todos", rotulo: "Todos" }]} />
        <div className="flex-1" />
        <Botao variante="principal" icone={Plus} onClick={() => setNovo(true)}>Novo atendimento</Botao>
      </div>
      <div className="rounded-panel bg-surface p-1.5 shadow-1">
        {lista.length === 0 ? (
          <EstadoVazio icone={Headset} titulo="Nenhum atendimento aberto" texto="Cole a mensagem de um cliente: o Mateus faz a triagem, abre bug se for defeito e escreve a resposta; a Vanessa valida e você envia." />
        ) : (
          lista.map((c) => <LinhaCard key={c.id} card={c} acao={<SeloPrioridade p={c.prioridade} />} />)
        )}
      </div>
      <NovoAtendimento aberta={novo} fechar={() => setNovo(false)} />
    </div>
  );
}

function NovoAtendimento({ aberta, fechar }: { aberta: boolean; fechar: () => void }) {
  const [cliente, setCliente] = useState("");
  const [canal, setCanal] = useState("WhatsApp");
  const [mensagem, setMensagem] = useState("");
  const [enviando, setEnviando] = useState(false);
  return (
    <Janela
      aberta={aberta}
      fechar={fechar}
      titulo="Novo atendimento"
      descricao="O Mateus faz a triagem (prioridade e prazo), abre bug para o QA se for defeito e escreve a resposta; a Vanessa valida e você envia."
      rodape={
        <>
          <Botao variante="discreto" onClick={fechar}>Cancelar</Botao>
          <Botao
            variante="principal"
            carregando={enviando}
            disabled={!mensagem.trim()}
            motivo={!mensagem.trim() ? "Cole a mensagem do cliente" : undefined}
            onClick={async () => {
              setEnviando(true);
              try {
                const c = await api<Card>("/api/atendimentos", "POST", { cliente, canal, mensagem });
                fechar();
                setMensagem("");
                useStore.getState().abrirCard(c.id);
              } catch (e) {
                avisarErro(e);
              } finally {
                setEnviando(false);
              }
            }}
          >
            Abrir atendimento
          </Botao>
        </>
      }
    >
      <div className="space-y-3 pb-2">
        <div className="grid grid-cols-[1fr_160px] gap-2">
          <Campo data-autofoco rotulo="Cliente" value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Clínica Pet Feliz" />
          <Seletor rotulo="Canal" value={canal} onChange={(e) => setCanal(e.target.value)}>
            {["WhatsApp", "E-mail", "Telefone", "Instagram", "Chat do site"].map((c) => <option key={c}>{c}</option>)}
          </Seletor>
        </div>
        <AreaTexto rotulo="Mensagem do cliente" rows={7} value={mensagem} onChange={(e) => setMensagem(e.target.value)} placeholder="Cole aqui o que o cliente escreveu" />
      </div>
    </Janela>
  );
}

/* ================= Não contatar ================= */

const TIPOS: { id: TipoNaoContatar; nome: string }[] = [
  { id: "email", nome: "E-mail" },
  { id: "telefone", nome: "Telefone" },
  { id: "dominio", nome: "Site/domínio" },
  { id: "cnpj", nome: "CNPJ" },
  { id: "nome", nome: "Nome da empresa" },
];

function ListaNaoContatar() {
  const [lista, setLista] = useState<NaoContatar[] | null>(null);
  const [tipo, setTipo] = useState<TipoNaoContatar>("email");
  const [valor, setValor] = useState("");
  const [busca, setBusca] = useState("");
  useEffect(() => void api<NaoContatar[]>("/api/nao-contatar").then(setLista).catch(() => setLista([])), []);
  const visiveis = (lista ?? []).filter((n) => !busca || n.valor.toLowerCase().includes(busca.toLowerCase()));
  return (
    <div className="space-y-4">
      <p className="text-corpo text-fg-2">A equipe consulta esta lista sempre: quem está aqui não vira lead e não recebe mensagem (LGPD). Quem responde "SAIR" no WhatsApp entra sozinho.</p>
      <form
        className="flex flex-wrap items-end gap-2 rounded-panel bg-surface p-4 shadow-1"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valor.trim()) return;
          try {
            setLista(await api<NaoContatar[]>("/api/nao-contatar", "POST", { tipo, valor, motivo: "Adicionado pelo CEO" }));
            setValor("");
            avisar("Adicionado à lista");
          } catch (err) {
            avisarErro(err);
          }
        }}
      >
        <Seletor rotulo="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoNaoContatar)} className="w-44">
          {TIPOS.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
        </Seletor>
        <div className="min-w-[220px] flex-1"><Campo rotulo="Valor" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="contato@empresa.com.br" /></div>
        <Botao type="submit" variante="principal" icone={Plus} disabled={!valor.trim()}>Adicionar</Botao>
      </form>
      <div className="rounded-panel bg-surface shadow-1">
        <div className="border-b border-line p-3">
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar na lista" className="h-9 w-full rounded-ctl bg-sunken px-3 text-corpo outline-none placeholder:text-fg-3" />
        </div>
        {lista && visiveis.length === 0 ? (
          <EstadoVazio compacto icone={Ban} titulo="Ninguém na lista" />
        ) : (
          <ul className="divide-y divide-line">
            {visiveis.map((n) => (
              <li key={n.id} className="flex items-center gap-3 px-4 py-2.5 text-pequeno">
                <Etiqueta>{TIPOS.find((t) => t.id === n.tipo)?.nome}</Etiqueta>
                <span className="min-w-0 flex-1 truncate font-medium text-fg">{n.valor}</span>
                <span className="hidden truncate text-legenda text-fg-3 sm:inline">{n.motivo}</span>
                <BotaoIcone
                  icone={X}
                  rotulo="Remover da lista"
                  tamanho="p"
                  onClick={async () => {
                    if (!(await confirmar({ titulo: `Remover ${n.valor} da lista?`, texto: "A equipe poderá voltar a contatar.", confirmar: "Remover", perigo: true }))) return;
                    setLista(await api<NaoContatar[]>(`/api/nao-contatar/${n.id}`, "DELETE"));
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
