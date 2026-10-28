import { useEffect, useMemo, useState } from "react";
import { Download,
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Building2, Check, Copy, LayoutGrid, LogIn, Pencil, Plus, Save, Trash2, Undo2, Users, Workflow, X,
} from "lucide-react";
import type { AgenteDef, Coluna, EscritorioDef, Fluxo, ModeloEscritorio, ModeloFluxo, SalaDef } from "@empresa/shared";
import { FERRAMENTAS_DE_AGENTE } from "@empresa/shared";
import { AGENTES_SEDE, SEDE } from "@empresa/org";
import { useStore } from "../../store.ts";
import { api } from "../../api.ts";
import { navegar, useNav } from "../../nav.ts";
import { escritorioAtivo, trocarEscritorio } from "../../escritorio.ts";
import { BotaoExportar, BotaoImportar, PessoasDoTime, baixarPacote } from "./Pacotes.tsx";
import {
  Abas, AreaTexto, Botao, BotaoIcone, CabecalhoPagina, Campo, Caixa, Etiqueta, EstadoVazio, Interruptor, Janela, Pagina, Seletor, avisar, avisarErro, confirmar, cx,
} from "../kit/index.ts";

// Escritórios (DESIGN-ESCRITORIOS.md): um por projeto, criados de modelos prontos e editados por completo.

export default function PaginaEscritorios() {
  const rota = useNav((s) => s.rota);
  if (rota.sub) return <Editor id={rota.sub} />;
  return <Lista />;
}

/* ================= Lista ================= */

function Lista() {
  const defs = useStore((s) => s.escritorios);
  const projetos = useStore((s) => s.projetos);
  const [novo, setNovo] = useState(false);
  const ativo = escritorioAtivo();
  const todos = defs.some((d) => d.id === SEDE) ? defs : [{ id: SEDE, nome: "Sede", descricao: "Software house completa (o escritório principal).", modelo: "software-house", projetoId: null, salas: [], agentes: [], fluxos: [] } as unknown as EscritorioDef, ...defs];
  return (
    <Pagina largura="media">
      <CabecalhoPagina
        icone={Building2}
        titulo="Escritórios"
        descricao="Um escritório para cada projeto, com as salas, a equipe e os fluxos de trabalho que você quiser. A sede guarda as funções da empresa (prospecção, WhatsApp, rituais)."
        acoes={<><BotaoImportar /><Botao variante="principal" icone={Plus} onClick={() => setNovo(true)}>Novo escritório</Botao></>}
      />
      <div className="grid gap-3 md:grid-cols-2">
        {todos.map((d) => {
          const projeto = projetos.find((p) => p.id === d.projetoId);
          const ehAtivo = d.id === ativo;
          return (
            <div key={d.id} className={cx("flex flex-col rounded-panel bg-surface p-5 shadow-1", ehAtivo && "shadow-[inset_0_0_0_1.5px_var(--accent)]")}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-destaque font-semibold text-fg">{d.nome}</span>
                    {ehAtivo && <Etiqueta tom="acento">aberto agora</Etiqueta>}
                    {d.id === SEDE && <Etiqueta>sede</Etiqueta>}
                  </div>
                  <p className="mt-1 line-clamp-2 text-pequeno text-fg-2">{d.descricao}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5 text-legenda">
                {d.salas.length > 0 && <Etiqueta>{d.salas.length} salas</Etiqueta>}
                {d.agentes.length > 0 && <Etiqueta>{d.agentes.length} agentes</Etiqueta>}
                {d.fluxos.length > 0 && <Etiqueta>{d.fluxos.map((f) => f.nome).join(", ")}</Etiqueta>}
                {projeto && <Etiqueta tom="info">projeto {projeto.nome}</Etiqueta>}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {!ehAtivo && <Botao tamanho="p" variante="principal" icone={LogIn} onClick={() => trocarEscritorio(d.id)}>Entrar</Botao>}
                <Botao tamanho="p" icone={Pencil} onClick={() => navegar("escritorios", d.id)}>Editar</Botao>
                <BotaoExportar id={d.id} nome={d.nome} />
                {d.id !== SEDE && (
                  <Botao
                    tamanho="p"
                    variante="discreto"
                    icone={Trash2}
                    onClick={async () => {
                      if (!(await confirmar({ titulo: `Excluir o escritório "${d.nome}"?`, texto: "Só é possível sem cards em aberto. A equipe e os fluxos dele somem.", confirmar: "Excluir", perigo: true }))) return;
                      await api(`/api/escritorios/${d.id}`, "DELETE").then(() => avisar("Escritório excluído")).catch(avisarErro);
                    }}
                  >
                    Excluir
                  </Botao>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <PessoasDoTime />
      <NovoEscritorio aberta={novo} fechar={() => setNovo(false)} />
    </Pagina>
  );
}

function NovoEscritorio({ aberta, fechar }: { aberta: boolean; fechar: () => void }) {
  const projetos = useStore((s) => s.projetos);
  const [modelos, setModelos] = useState<ModeloEscritorio[]>([]);
  const [modelo, setModelo] = useState("startup");
  const [nome, setNome] = useState("");
  const [projetoId, setProjetoId] = useState<number | null>(null);
  const [criando, setCriando] = useState(false);
  useEffect(() => {
    if (aberta) void api<{ escritorios: ModeloEscritorio[] }>("/api/escritorios/modelos").then((r) => setModelos(r.escritorios));
  }, [aberta]);
  return (
    <Janela
      aberta={aberta}
      fechar={fechar}
      titulo="Novo escritório"
      descricao="Comece de um modelo pronto e ajuste depois: salas, equipe, fluxos e planta são todos editáveis."
      largura={760}
      rodape={
        <>
          <Botao variante="discreto" onClick={fechar}>Cancelar</Botao>
          <Botao
            variante="principal"
            carregando={criando}
            disabled={!nome.trim()}
            motivo={!nome.trim() ? "Dê um nome ao escritório" : undefined}
            onClick={async () => {
              setCriando(true);
              try {
                const d = await api<EscritorioDef>("/api/escritorios", "POST", { modelo, nome, projetoId });
                avisar("Escritório criado");
                trocarEscritorio(d.id, `#/escritorios/${d.id}`);
              } catch (e) {
                avisarErro(e);
                setCriando(false);
              }
            }}
          >
            Criar e abrir
          </Botao>
        </>
      }
    >
      <div className="space-y-4 pb-2">
        <div className="grid grid-cols-[1fr_220px] gap-3">
          <Campo data-autofoco rotulo="Nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="App da clínica" />
          <Seletor rotulo="Projeto (opcional)" value={projetoId ?? ""} onChange={(e) => setProjetoId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Nenhum</option>
            {projetos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </Seletor>
        </div>
        <div>
          <div className="mb-2 text-pequeno font-medium text-fg">Modelo</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {modelos.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setModelo(m.id)}
                aria-pressed={modelo === m.id}
                className={cx("rounded-card p-3 text-left transition-shadow", modelo === m.id ? "bg-accent-soft shadow-[inset_0_0_0_1.5px_var(--accent)]" : "bg-surface shadow-1 hover:shadow-2")}
              >
                <div className="flex items-center gap-2 text-corpo font-semibold text-fg">{m.nome}{modelo === m.id && <Check className="size-4 text-accent" />}</div>
                <p className="mt-0.5 text-pequeno text-fg-2">{m.descricao}</p>
                <p className="mt-1.5 text-legenda text-fg-3">{m.agentes} agente{m.agentes > 1 ? "s" : ""} · {m.salas} sala{m.salas > 1 ? "s" : ""} · {m.fluxos.join(", ")}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </Janela>
  );
}

/* ================= Editor ================= */

type AbaEditor = "geral" | "salas" | "equipe" | "fluxos" | "planta";
const CORES = ["#f2c879", "#9ad0c2", "#f4a6b8", "#b8a6f4", "#8fb8f0", "#7fc8e8", "#e88f8f", "#a8d98a", "#f6b37a", "#8ad9cf", "#cdb4db", "#a3b1c6", "#f59ac4", "#e9d27a", "#9ec5f5", "#c9b8a6"];
const CAMISAS = ["#3d5a80", "#2a9d8f", "#e76f51", "#264653", "#457b9d", "#f4a261", "#d62828", "#4361ee", "#2b9348", "#6a4c93", "#bc6c25", "#e9c46a"];
const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "item";
const novoId = (prefixo: string, nome: string, usados: Set<string>) => {
  const base = prefixo === SEDE ? slug(nome) : `${prefixo}.${slug(nome)}`;
  let id = base;
  for (let i = 2; usados.has(id); i++) id = `${base}-${i}`;
  return id;
};

function Editor({ id }: { id: string }) {
  const defs = useStore((s) => s.escritorios);
  const original = defs.find((d) => d.id === id);
  const [d, setD] = useState<EscritorioDef | null>(null);
  const [aba, setAba] = useState<AbaEditor>("geral");
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    if (original && (!d || d.id !== original.id)) setD(structuredClone(original));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [original?.id, original?.atualizadoEm]);
  // A sede vem do código até a primeira edição: busca a definição completa.
  useEffect(() => {
    if (!original && id === SEDE) void api<EscritorioDef[]>("/api/escritorios").then((todos) => useStore.setState({ escritorios: todos }));
  }, [original, id]);
  const mudou = useMemo(() => !!d && !!original && JSON.stringify(d) !== JSON.stringify(original), [d, original]);
  if (!d) return <Pagina><EstadoVazio icone={Building2} titulo="Carregando o escritório…" /></Pagina>;
  const salvar = async () => {
    setSalvando(true);
    try {
      await api(`/api/escritorios/${d.id}`, "PUT", d);
      avisar("Escritório salvo");
    } catch (e) {
      avisarErro(e);
    } finally {
      setSalvando(false);
    }
  };
  const usados = new Set([...defs.flatMap((x) => [...x.salas.map((s) => s.id), ...x.agentes.map((a) => a.id), ...x.fluxos.map((f) => f.id)]), ...d.salas.map((s) => s.id), ...d.agentes.map((a) => a.id), ...d.fluxos.map((f) => f.id)]);
  const props: PropsAba = { d, setD: (f) => setD((x) => (x ? f(x) : x)), usados };
  return (
    <Pagina largura="media">
      <button type="button" onClick={() => navegar("escritorios")} className="mb-4 flex min-h-alvo items-center gap-1 text-pequeno text-fg-3 hover:text-fg"><ArrowLeft className="size-4" /> Escritórios</button>
      <CabecalhoPagina
        icone={Building2}
        titulo={d.nome || "Sem nome"}
        descricao={`${d.salas.length} salas · ${d.agentes.length} agentes · ${d.fluxos.length} fluxos`}
        acoes={
          <>
            {d.id === SEDE && (
              <Botao
                variante="discreto"
                icone={Undo2}
                onClick={async () => {
                  if (await confirmar({ titulo: "Voltar a sede para o padrão?", texto: "Desfaz as suas edições na sede (salas, equipe e fluxos voltam ao original).", confirmar: "Restaurar", perigo: true })) await api("/api/escritorios/sede/restaurar", "POST").catch(avisarErro);
                }}
              >
                Restaurar padrão
              </Botao>
            )}
            {mudou && <Botao variante="discreto" onClick={() => setD(structuredClone(original!))}>Descartar</Botao>}
            <Botao variante="principal" icone={Save} carregando={salvando} disabled={!mudou} motivo={mudou ? undefined : "Nada mudou ainda"} onClick={() => void salvar()}>Salvar</Botao>
          </>
        }
        abas={
          <Abas
            ativa={aba}
            onChange={setAba}
            abas={[
              { id: "geral", rotulo: "Geral", icone: Building2 },
              { id: "salas", rotulo: "Salas", icone: LayoutGrid, contador: d.salas.length },
              { id: "equipe", rotulo: "Equipe", icone: Users, contador: d.agentes.length },
              { id: "fluxos", rotulo: "Fluxos", icone: Workflow, contador: d.fluxos.length },
              { id: "planta", rotulo: "Planta", icone: LayoutGrid },
            ]}
          />
        }
      />
      {mudou && <p className="mb-4 rounded-card bg-warning-soft px-4 py-2 text-pequeno text-warning-fg">Alterações não salvas. Ao salvar, o sistema confere tudo (coordenador, validadores, colunas essenciais dos fluxos) e o escritório recarrega com a nova configuração.</p>}
      {aba === "geral" && <AbaGeral {...props} />}
      {aba === "salas" && <AbaSalas {...props} />}
      {aba === "equipe" && <AbaEquipe {...props} />}
      {aba === "fluxos" && <AbaFluxos {...props} />}
      {aba === "planta" && <AbaPlanta {...props} />}
    </Pagina>
  );
}

interface PropsAba {
  d: EscritorioDef;
  setD: (f: (d: EscritorioDef) => EscritorioDef) => void;
  usados: Set<string>;
}

const Cartao = ({ children, className }: { children: React.ReactNode; className?: string }) => <div className={cx("rounded-panel bg-surface p-5 shadow-1", className)}>{children}</div>;

function AbaGeral({ d, setD }: PropsAba) {
  const projetos = useStore((s) => s.projetos);
  const coord = d.agentes.find((a) => a.papel === "coordenador");
  return (
    <Cartao className="space-y-4">
      <Campo rotulo="Nome" value={d.nome} onChange={(e) => setD((x) => ({ ...x, nome: e.target.value }))} />
      <AreaTexto rotulo="Descrição" ajuda="O coordenador lê isto para entender o propósito do escritório." rows={3} value={d.descricao} onChange={(e) => setD((x) => ({ ...x, descricao: e.target.value }))} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Seletor rotulo="Projeto ligado" value={d.projetoId ?? ""} onChange={(e) => setD((x) => ({ ...x, projetoId: e.target.value ? Number(e.target.value) : null }))}>
          <option value="">Nenhum</option>
          {projetos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </Seletor>
        <Seletor
          rotulo="Coordenador"
          ajuda="Recebe os seus pedidos no chat deste escritório e distribui os cards."
          value={coord?.id ?? ""}
          onChange={(e) => setD((x) => ({ ...x, agentes: x.agentes.map((a) => ({ ...a, papel: a.id === e.target.value ? "coordenador" : undefined })) }))}
        >
          {!coord && <option value="">Escolha…</option>}
          {d.agentes.map((a) => <option key={a.id} value={a.id}>{a.nome} · {a.cargo}</option>)}
        </Seletor>
      </div>
    </Cartao>
  );
}

function AbaSalas({ d, setD, usados }: PropsAba) {
  const [aberta, setAberta] = useState<string | null>(null);
  const atualizar = (id: string, p: Partial<SalaDef>) => setD((x) => ({ ...x, salas: x.salas.map((s) => (s.id === id ? { ...s, ...p } : s)) }));
  return (
    <div className="space-y-3">
      {d.salas.map((s) => {
        const membros = d.agentes.filter((a) => a.sala === s.id);
        const validadores = d.agentes.filter((a) => a.sala !== s.id);
        return (
          <Cartao key={s.id} className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <input type="color" value={s.cor} onChange={(e) => atualizar(s.id, { cor: e.target.value })} aria-label="Cor da sala" className="h-9 w-11 cursor-pointer rounded-ctl border-0 bg-transparent" />
              <div className="min-w-[180px] flex-1"><Campo rotulo="Nome da sala" value={s.nome} onChange={(e) => atualizar(s.id, { nome: e.target.value })} /></div>
              <div className="w-56">
                <Seletor rotulo="Quem valida as entregas" value={s.validador ?? ""} onChange={(e) => atualizar(s.id, { validador: e.target.value || null })}>
                  <option value="">Só você (CEO)</option>
                  {validadores.map((a) => <option key={a.id} value={a.id}>{a.nome} · {a.cargo}</option>)}
                </Seletor>
              </div>
              <div className="w-48">
                <Seletor rotulo="Fluxo padrão" value={d.fluxoDaSala[s.id] ?? d.fluxos[0]?.id ?? ""} onChange={(e) => setD((x) => ({ ...x, fluxoDaSala: { ...x.fluxoDaSala, [s.id]: e.target.value } }))}>
                  {d.fluxos.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </Seletor>
              </div>
              <BotaoIcone
                icone={Trash2}
                rotulo="Excluir sala"
                onClick={async () => {
                  if (membros.length && !(await confirmar({ titulo: `Excluir "${s.nome}"?`, texto: `${membros.length} agente(s) desta sala também saem do escritório.`, confirmar: "Excluir", perigo: true }))) return;
                  setD((x) => ({
                    ...x,
                    salas: x.salas.filter((y) => y.id !== s.id),
                    agentes: x.agentes.filter((a) => a.sala !== s.id),
                    fluxoDaSala: Object.fromEntries(Object.entries(x.fluxoDaSala).filter(([k]) => k !== s.id)),
                    planta: { fileiras: x.planta.fileiras.map((f) => f.filter((y) => y !== s.id)) },
                    fluxos: x.fluxos.map((f) => ({ ...f, colunas: f.colunas.map((c) => (c.sala === s.id ? { ...c, sala: undefined } : c)) })),
                  }));
                }}
              />
            </div>
            <Campo rotulo="Descrição" value={s.descricao} onChange={(e) => atualizar(s.id, { descricao: e.target.value })} placeholder="O que esta sala faz" />
            <button type="button" onClick={() => setAberta(aberta === s.id ? null : s.id)} className="min-h-alvo self-start text-pequeno font-medium text-accent-fg hover:underline">
              {aberta === s.id ? "Esconder o padrão de trabalho" : s.playbook ? "Editar o padrão de trabalho" : "Escrever um padrão de trabalho (opcional)"}
            </button>
            {aberta === s.id && (
              <AreaTexto rows={8} value={s.playbook ?? ""} onChange={(e) => atualizar(s.id, { playbook: e.target.value })} ajuda="Como esta sala trabalha: checklist, critérios de qualidade, o que nunca fazer. Vira o playbook de quem trabalha e de quem valida aqui. Em branco, vale o padrão da área (se for uma área da sede) ou um padrão genérico." placeholder={"## Padrão de trabalho\n- …"} />
            )}
            <p className="text-legenda text-fg-3">{membros.length ? `${membros.length} agente(s): ${membros.map((a) => a.nome).join(", ")}` : "Ninguém nesta sala ainda (adicione na aba Equipe)."}</p>
          </Cartao>
        );
      })}
      <Botao
        icone={Plus}
        onClick={() => {
          const n = d.salas.length;
          const id = novoId(d.id, `sala-${n + 1}`, usados);
          setD((x) => ({ ...x, salas: [...x.salas, { id, nome: `Sala ${n + 1}`, descricao: "", cor: CORES[n % CORES.length]!, validador: null }], planta: { fileiras: x.planta.fileiras.length ? [...x.planta.fileiras.slice(0, -1), [...x.planta.fileiras.at(-1)!, id]] : [[id]] } }));
        }}
      >
        Nova sala
      </Botao>
    </div>
  );
}

function AbaEquipe({ d, setD, usados }: PropsAba) {
  const [modelo, setModelo] = useState("");
  const atualizar = (id: string, p: Partial<AgenteDef>) => setD((x) => ({ ...x, agentes: x.agentes.map((a) => (a.id === id ? { ...a, ...p } : a)) }));
  const adicionar = (base?: AgenteDef) => {
    const sala = d.salas[0]?.id;
    if (!sala) return avisar("Crie uma sala antes.", "alerta");
    const nome = base?.nome ?? "Novo agente";
    const id = novoId(d.id, nome, usados);
    setD((x) => ({
      ...x,
      agentes: [...x.agentes, { id, nome, cargo: base?.cargo ?? "Especialista", sala, persona: base?.persona ?? "", camisa: base?.camisa ?? CAMISAS[x.agentes.length % CAMISAS.length]!, ferramentas: base?.ferramentas ?? [], modelo: base?.modelo, lider: false }],
    }));
  };
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-2">
        <Botao variante="principal" icone={Plus} onClick={() => adicionar()}>Novo agente</Botao>
        <div className="w-80">
          <Seletor rotulo="Ou copiar um especialista da sede" value={modelo} onChange={(e) => { const a = AGENTES_SEDE.find((x) => x.id === e.target.value); if (a) adicionar(a); setModelo(""); }}>
            <option value="">Escolha um perfil…</option>
            {AGENTES_SEDE.map((a) => <option key={a.id} value={a.id}>{a.nome} · {a.cargo}</option>)}
          </Seletor>
        </div>
      </div>
      {d.salas.map((s) => {
        const membros = d.agentes.filter((a) => a.sala === s.id);
        if (!membros.length) return null;
        return (
          <section key={s.id}>
            <h3 className="mb-2 flex items-center gap-2 text-pequeno font-semibold text-fg-2"><span className="size-2.5 rounded-full" style={{ background: s.cor }} />{s.nome}</h3>
            <div className="space-y-2">
              {membros.map((a) => <EditorAgente key={a.id} a={a} d={d} atualizar={atualizar} remover={() => setD((x) => ({ ...x, agentes: x.agentes.filter((y) => y.id !== a.id), salas: x.salas.map((y) => (y.validador === a.id ? { ...y, validador: null } : y)) }))} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function EditorAgente({ a, d, atualizar, remover }: { a: AgenteDef; d: EscritorioDef; atualizar: (id: string, p: Partial<AgenteDef>) => void; remover: () => void }) {
  const [aberto, setAberto] = useState(!a.persona);
  return (
    <Cartao className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <input type="color" value={a.camisa} onChange={(e) => atualizar(a.id, { camisa: e.target.value })} aria-label="Cor da camisa" className="h-9 w-11 cursor-pointer rounded-ctl border-0 bg-transparent" />
        <div className="w-40"><Campo tamanho="p" value={a.nome} onChange={(e) => atualizar(a.id, { nome: e.target.value })} aria-label="Nome" /></div>
        <div className="min-w-[160px] flex-1"><Campo tamanho="p" value={a.cargo} onChange={(e) => atualizar(a.id, { cargo: e.target.value })} aria-label="Cargo" /></div>
        <Seletor tamanho="p" value={a.sala} onChange={(e) => atualizar(a.id, { sala: e.target.value })} aria-label="Sala">
          {d.salas.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
        </Seletor>
        {a.papel === "coordenador" && <Etiqueta tom="acento">coordenador</Etiqueta>}
        <BotaoIcone icone={Pencil} rotulo={aberto ? "Recolher" : "Editar perfil"} tamanho="p" ativo={aberto} onClick={() => setAberto(!aberto)} />
        <BotaoIcone icone={Download} rotulo="Exportar agente" tamanho="p" onClick={() => void baixarPacote(`/api/escritorios/${d.id}/agentes/${a.id}/exportar`, `agente-${a.nome}`)} />
        <BotaoIcone icone={Trash2} rotulo="Remover agente" tamanho="p" onClick={remover} />
      </div>
      {aberto && (
        <div className="space-y-3 border-t border-line pt-3">
          <AreaTexto rotulo="Persona (como ele trabalha)" rows={3} value={a.persona} onChange={(e) => atualizar(a.id, { persona: e.target.value })} placeholder="Especialista em… Cuida de… Nunca…" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Seletor rotulo="Modelo de IA" value={a.modelo ?? "claude-sonnet-5-5"} onChange={(e) => atualizar(a.id, { modelo: e.target.value as AgenteDef["modelo"] })} ajuda="Opus para decisões difíceis; Sonnet no dia a dia; Haiku para tarefas simples e baratas.">
              <option value="claude-opus-5-5">Opus 5.5 (mais forte)</option>
              <option value="claude-sonnet-5-5">Sonnet 5.5 (equilibrado)</option>
              <option value="claude-haiku-5-5">Haiku 5.5 (rápido e barato)</option>
            </Seletor>
            <div className="pt-6"><Interruptor ativo={!!a.lider} onChange={(v) => atualizar(a.id, { lider: v })} rotulo="Líder da sala" descricao="Pega os cards sem dono e faz o papel de advogado do diabo." /></div>
          </div>
          <div>
            <div className="mb-1.5 text-pequeno font-medium text-fg">Ferramentas</div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {FERRAMENTAS_DE_AGENTE.map((f) => (
                <Caixa key={f} marcada={(a.ferramentas ?? []).includes(f)} onChange={(v) => atualizar(a.id, { ferramentas: v ? [...(a.ferramentas ?? []), f] : (a.ferramentas ?? []).filter((x) => x !== f) })} rotulo={f} />
              ))}
            </div>
          </div>
        </div>
      )}
    </Cartao>
  );
}

const PAPEIS: { id: Coluna["tipo"]; rotulo: string }[] = [
  { id: "fila", rotulo: "Fila (espera)" },
  { id: "trabalho", rotulo: "Trabalho" },
  { id: "validacao", rotulo: "Validação" },
  { id: "bug", rotulo: "Bug" },
  { id: "ceo", rotulo: "Aguardando CEO" },
  { id: "feito", rotulo: "Concluído" },
  { id: "perdido", rotulo: "Perdido / cancelado" },
];

function AbaFluxos({ d, setD, usados }: PropsAba) {
  const [modelos, setModelos] = useState<ModeloFluxo[]>([]);
  const [novoModelo, setNovoModelo] = useState("");
  useEffect(() => void api<{ fluxos: ModeloFluxo[] }>("/api/escritorios/modelos").then((r) => setModelos(r.fluxos)), []);
  const atualizar = (id: string, p: (f: Fluxo) => Fluxo) => setD((x) => ({ ...x, fluxos: x.fluxos.map((f) => (f.id === id ? p(f) : f)) }));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-80">
          <Seletor
            rotulo="Adicionar um fluxo"
            value={novoModelo}
            onChange={(e) => {
              const m = modelos.find((x) => x.id === e.target.value);
              setNovoModelo("");
              if (!m) return;
              const id = novoId(d.id, m.id, usados);
              setD((x) => ({ ...x, fluxos: [...x.fluxos, { ...structuredClone(m.fluxo), id }] }));
            }}
          >
            <option value="">Escolha um fluxo pronto…</option>
            {modelos.map((m) => <option key={m.id} value={m.id}>{m.nome} · {m.descricao}</option>)}
          </Seletor>
        </div>
        <Botao
          icone={Plus}
          onClick={() => {
            const id = novoId(d.id, "fluxo", usados);
            setD((x) => ({ ...x, fluxos: [...x.fluxos, { id, nome: "Novo fluxo", base: "personalizado", devolverPara: "em-andamento", aprovarPara: "concluido", colunas: [
              { id: "a-fazer", nome: "A fazer", tipo: "fila" }, { id: "em-andamento", nome: "Em andamento", tipo: "trabalho" }, { id: "validacao", nome: "Validação", tipo: "validacao" },
              { id: "aguardando-ceo", nome: "Aguardando CEO", tipo: "ceo" }, { id: "concluido", nome: "Concluído", tipo: "feito" },
            ] }] }));
          }}
        >
          Fluxo em branco
        </Botao>
      </div>
      {d.fluxos.map((f) => (
        <Cartao key={f.id} className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[200px] flex-1"><Campo rotulo="Nome do fluxo" value={f.nome} onChange={(e) => atualizar(f.id, (x) => ({ ...x, nome: e.target.value }))} /></div>
            <Seletor rotulo="Quando você aprova, vai para" value={f.aprovarPara} onChange={(e) => atualizar(f.id, (x) => ({ ...x, aprovarPara: e.target.value }))}>
              {f.colunas.filter((c) => c.tipo !== "ceo").map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </Seletor>
            <Seletor rotulo="Quando você devolve, volta para" value={f.devolverPara} onChange={(e) => atualizar(f.id, (x) => ({ ...x, devolverPara: e.target.value }))}>
              {f.colunas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </Seletor>
            <BotaoIcone icone={Download} rotulo="Exportar fluxo" onClick={() => void baixarPacote(`/api/escritorios/${d.id}/fluxos/${f.id}/exportar`, `fluxo-${f.nome}`)} />
            <BotaoIcone icone={Trash2} rotulo="Excluir fluxo" onClick={() => setD((x) => ({ ...x, fluxos: x.fluxos.filter((y) => y.id !== f.id), fluxoDaSala: Object.fromEntries(Object.entries(x.fluxoDaSala).filter(([, v]) => v !== f.id)) }))} />
          </div>
          <div className="scroll-fino flex gap-2 overflow-x-auto pb-1">
            {f.colunas.map((c, i) => (
              <div key={c.id} className={cx("w-48 shrink-0 space-y-2 rounded-card p-2.5", c.tipo === "ceo" ? "bg-warning-soft" : c.tipo === "feito" ? "bg-success-soft" : "bg-sunken")}>
                <div className="flex items-center gap-1">
                  <BotaoIcone icone={ArrowLeft} rotulo="Mover para a esquerda" tamanho="p" disabled={i === 0} onClick={() => atualizar(f.id, (x) => { const cols = [...x.colunas]; [cols[i - 1], cols[i]] = [cols[i]!, cols[i - 1]!]; return { ...x, colunas: cols }; })} />
                  <BotaoIcone icone={ArrowRight} rotulo="Mover para a direita" tamanho="p" disabled={i === f.colunas.length - 1} onClick={() => atualizar(f.id, (x) => { const cols = [...x.colunas]; [cols[i + 1], cols[i]] = [cols[i]!, cols[i + 1]!]; return { ...x, colunas: cols }; })} />
                  <span className="flex-1" />
                  <BotaoIcone icone={X} rotulo="Remover coluna" tamanho="p" onClick={() => atualizar(f.id, (x) => ({ ...x, colunas: x.colunas.filter((y) => y.id !== c.id) }))} />
                </div>
                <Campo tamanho="p" value={c.nome} onChange={(e) => atualizar(f.id, (x) => ({ ...x, colunas: x.colunas.map((y) => (y.id === c.id ? { ...y, nome: e.target.value } : y)) }))} aria-label="Nome da coluna" />
                <Seletor tamanho="p" value={c.tipo} onChange={(e) => atualizar(f.id, (x) => ({ ...x, colunas: x.colunas.map((y) => (y.id === c.id ? { ...y, tipo: e.target.value as Coluna["tipo"] } : y)) }))} aria-label="Papel da coluna">
                  {PAPEIS.map((p) => <option key={p.id} value={p.id}>{p.rotulo}</option>)}
                </Seletor>
                <Seletor tamanho="p" value={c.sala ?? ""} onChange={(e) => atualizar(f.id, (x) => ({ ...x, colunas: x.colunas.map((y) => (y.id === c.id ? { ...y, sala: e.target.value || undefined } : y)) }))} aria-label="Sala que trabalha nesta coluna">
                  <option value="">Qualquer sala</option>
                  {d.salas.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
                </Seletor>
              </div>
            ))}
            <button
              type="button"
              onClick={() => atualizar(f.id, (x) => { let id = "coluna"; for (let n = 2; x.colunas.some((c) => c.id === id); n++) id = `coluna-${n}`; const ceo = x.colunas.findIndex((c) => c.tipo === "ceo"); const cols = [...x.colunas]; cols.splice(ceo >= 0 ? ceo : cols.length, 0, { id, nome: "Nova etapa", tipo: "trabalho" }); return { ...x, colunas: cols }; })}
              className="grid w-32 shrink-0 place-items-center rounded-card border border-dashed border-line-strong text-pequeno text-fg-3 hover:text-fg"
            >
              <span className="flex items-center gap-1"><Plus className="size-4" /> Coluna</span>
            </button>
          </div>
          <p className="text-legenda text-fg-3">Essenciais: uma fila, uma de trabalho, "Aguardando CEO" e uma de concluído. Colunas de trabalho e validação podem apontar para a sala que atua nelas.</p>
        </Cartao>
      ))}
    </div>
  );
}

function AbaPlanta({ d, setD }: PropsAba) {
  const fileiras = d.planta.fileiras.length ? d.planta.fileiras : [d.salas.map((s) => s.id)];
  const naPlanta = new Set(fileiras.flat());
  const fora = d.salas.filter((s) => !naPlanta.has(s.id)).map((s) => s.id);
  const todas = fora.length ? [...fileiras, fora] : fileiras;
  const salvarF = (f: string[][]) => setD((x) => ({ ...x, planta: { fileiras: f.filter((y) => y.length) } }));
  const mover = (fi: number, si: number, df: number, ds: number) => {
    const f = todas.map((x) => [...x]);
    const [s] = f[fi]!.splice(si, 1);
    if (df) {
      const alvo = fi + df;
      if (alvo < 0) f.unshift([s!]);
      else if (alvo >= f.length) f.push([s!]);
      else f[alvo]!.push(s!);
    } else f[fi]!.splice(Math.max(0, Math.min(f[fi]!.length, si + ds)), 0, s!);
    salvarF(f);
  };
  const membros = (id: string) => d.agentes.filter((a) => a.sala === id).length;
  return (
    <div className="space-y-4">
      <p className="text-corpo text-fg-2">Organize as salas em fileiras (de cima para baixo). A largura de cada sala acompanha o número de mesas; copa, átrio, lounge e recepção entram sozinhos na última fileira.</p>
      <Cartao className="space-y-3 bg-sunken">
        {todas.map((f, fi) => (
          <div key={fi} className="flex gap-2">
            {f.map((id, si) => {
              const s = d.salas.find((x) => x.id === id);
              if (!s) return null;
              return (
                <div key={id} className="min-w-0 rounded-card p-2.5 shadow-1" style={{ flex: `${Math.max(10, 7 + Math.ceil(membros(id) / 2) * 3.4)} 1 0`, background: `color-mix(in srgb, ${s.cor} 45%, var(--surface))` }}>
                  <div className="truncate text-pequeno font-semibold text-fg">{s.nome}</div>
                  <div className="text-legenda text-fg-2">{membros(id)} mesa{membros(id) === 1 ? "" : "s"}</div>
                  <div className="mt-1.5 flex gap-0.5">
                    <BotaoIcone icone={ArrowLeft} rotulo="Esquerda" tamanho="p" disabled={si === 0} onClick={() => mover(fi, si, 0, -1)} />
                    <BotaoIcone icone={ArrowRight} rotulo="Direita" tamanho="p" disabled={si === f.length - 1} onClick={() => mover(fi, si, 0, 1)} />
                    <BotaoIcone icone={ArrowUp} rotulo="Fileira de cima" tamanho="p" onClick={() => mover(fi, si, -1, 0)} />
                    <BotaoIcone icone={ArrowDown} rotulo="Fileira de baixo" tamanho="p" onClick={() => mover(fi, si, 1, 0)} />
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        <div className="flex gap-2 opacity-70">
          {["Copa", "Átrio", "Lounge", "Recepção"].map((a, i) => (
            <div key={a} className="rounded-card bg-surface p-2.5 text-pequeno text-fg-3 shadow-1" style={{ flex: `${[11, 14, 13, 20][i]} 1 0` }}>{a}</div>
          ))}
        </div>
      </Cartao>
      <Botao variante="discreto" icone={Copy} onClick={() => salvarF(todas)}>Fixar esta organização</Botao>
    </div>
  );
}
