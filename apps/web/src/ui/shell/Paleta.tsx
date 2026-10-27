import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight, Brain, Building2, CornerDownLeft, FilePlus2, MessageCircle, Moon, Pause, Play, Search, Sparkles, Sun, Target, User, type LucideIcon,
} from "lucide-react";
import { create } from "zustand";
import { agents, roomById } from "@empresa/org";
import { fluxos, type FluxoId } from "@empresa/shared";
import { navegar, useNav, type Area } from "../../nav.ts";
import { useStore } from "../../store.ts";
import { send } from "../../ws.ts";
import { api } from "../../api.ts";
import { Kbd, avisar, avisarErro, cx, useCamada } from "../kit/index.ts";
import { ITENS_NAV } from "./BarraLateral.tsx";
import { definirTema } from "./tema.ts";

// Paleta ⌘K: busca e executa qualquer coisa (páginas, cards, agentes, leads, conversas, ações).
// Sem resultado, o texto vira um pedido para a Helena.

const usePaleta = create<{ aberta: boolean }>(() => ({ aberta: false }));
export const abrirPaleta = () => usePaleta.setState({ aberta: true });

interface Resultado {
  id: string;
  grupo: string;
  titulo: string;
  detalhe?: string;
  icone: LucideIcon;
  fazer: () => void;
}

const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const PAGINAS: { area: Area; sub?: string; nome: string; termos?: string }[] = [
  ...ITENS_NAV.map((i) => ({ area: i.area, nome: i.nome })),
  ...(Object.keys(fluxos) as FluxoId[]).map((f) => ({ area: "trabalho" as Area, sub: f, nome: `Board ${fluxos[f].nome}`, termos: "quadro kanban" })),
  { area: "trabalho", sub: "marketing", nome: "Calendário editorial", termos: "posts conteúdo" },
  { area: "clientes", sub: "whatsapp", nome: "Conversas do WhatsApp", termos: "mensagens clientes lorena" },
  { area: "clientes", sub: "leads", nome: "Leads e prospecção", termos: "comercial vendas" },
  { area: "clientes", sub: "atendimentos", nome: "Atendimentos", termos: "suporte tickets" },
  { area: "equipe", sub: "ao-vivo", nome: "Navegador e celulares ao vivo", termos: "telas agentes iphone android" },
  { area: "empresa", sub: "livro", nome: "Livro da Empresa" },
  { area: "empresa", sub: "conhecimento", nome: "Conhecimento da casa" },
  { area: "empresa", sub: "metas", nome: "Metas do trimestre" },
  { area: "empresa", sub: "indicadores", nome: "Indicadores" },
  { area: "empresa", sub: "rituais", nome: "Rituais e atas", termos: "daily semanal" },
  { area: "empresa", sub: "conquistas", nome: "Conquistas" },
  { area: "operacao", sub: "projetos", nome: "Projetos da sua máquina", termos: "pasta git banco" },
  { area: "operacao", sub: "monitoramento", nome: "Monitoramento de sites" },
  { area: "operacao", sub: "financas", nome: "Finanças e custos", termos: "simples nacional das custo ia" },
  { area: "operacao", sub: "backup", nome: "Backup dos dados" },
  { area: "config", sub: "geral", nome: "Configurações gerais", termos: "chave api orçamento" },
  { area: "config", sub: "voz", nome: "Voz e sons", termos: "música volume" },
  { area: "config", sub: "escritorio", nome: "Escritório e aparência", termos: "tema escuro claro noite iluminação demonstração" },
  { area: "config", sub: "permissoes", nome: "Permissões dos agentes", termos: "terminal máquina navegador celular" },
  { area: "config", sub: "conectores", nome: "Conectores", termos: "mcp gmail github stripe drive notion agenda" },
  { area: "config", sub: "whatsapp", nome: "Configurar WhatsApp", termos: "meta token" },
];

export function Paleta() {
  const aberta = usePaleta((s) => s.aberta);
  const fechar = () => usePaleta.setState({ aberta: false });
  const ref = useCamada<HTMLDivElement>(aberta, fechar);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const listaRef = useRef<HTMLDivElement>(null);
  const cards = useStore((s) => s.cards);
  const leads = useStore((s) => s.leads);
  const contatos = useStore((s) => s.contatosWa);
  const motor = useStore((s) => s.motor);
  // Memória da empresa (busca no servidor): cards antigos, entregas, debates, atas, conhecimento, Livro e chat.
  const [memoria, setMemoria] = useState<{ tipo: string; titulo: string; trecho: string; cardId: number | null; ref: string }[]>([]);
  useEffect(() => {
    const t = q.trim();
    if (t.length < 3) return setMemoria([]);
    const h = setTimeout(() => void api<typeof memoria>(`/api/memoria?q=${encodeURIComponent(t)}`).then(setMemoria).catch(() => setMemoria([])), 220);
    return () => clearTimeout(h);
  }, [q]);

  // ⌘K / Ctrl+K abre de qualquer lugar; ⌘1…7 vão para as áreas; ⌘, abre as configurações.
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key.toLowerCase() === "k") {
        e.preventDefault();
        usePaleta.setState((s) => ({ aberta: !s.aberta }));
      } else if (e.key === ",") {
        e.preventDefault();
        navegar("config");
      } else if (/^[1-7]$/.test(e.key)) {
        e.preventDefault();
        navegar(ITENS_NAV[Number(e.key) - 1]!.area);
      }
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, []);
  useEffect(() => {
    if (aberta) {
      setQ("");
      setSel(0);
    }
  }, [aberta]);
  // Trocar de página (voltar do navegador, link) fecha a paleta.
  const rota = useNav((s) => s.rota);
  useEffect(() => usePaleta.setState({ aberta: false }), [rota.area, rota.sub, rota.id]);

  const resultados = useMemo<Resultado[]>(() => {
    const t = sem(q.trim());
    const ok = (...campos: (string | undefined)[]) => !t || campos.some((c) => c && sem(c).includes(t));
    const r: Resultado[] = [];
    const acoes: Resultado[] = [
      { id: "a-card", grupo: "Ações", titulo: "Novo card", icone: FilePlus2, fazer: () => useStore.getState().setNovoCardAberto(true) },
      { id: "a-prosp", grupo: "Ações", titulo: "Nova prospecção de clientes", icone: Target, fazer: () => navegar("clientes", "leads") },
      { id: "a-wa", grupo: "Ações", titulo: "Abrir conversas do WhatsApp", icone: MessageCircle, fazer: () => navegar("clientes", "whatsapp") },
      motor.pausado
        ? { id: "a-ret", grupo: "Ações", titulo: "Retomar a empresa", icone: Play, fazer: () => void api("/api/motor", "PUT", { pausado: false }).then(() => avisar("Empresa retomada")).catch(avisarErro) }
        : { id: "a-pau", grupo: "Ações", titulo: "Pausar a empresa", icone: Pause, fazer: () => void api("/api/motor", "PUT", { pausado: true }).then(() => avisar("Empresa pausada")).catch(avisarErro) },
      { id: "a-escuro", grupo: "Ações", titulo: "Tema escuro", icone: Moon, fazer: () => definirTema("escuro") },
      { id: "a-claro", grupo: "Ações", titulo: "Tema claro", icone: Sun, fazer: () => definirTema("claro") },
      { id: "a-visao", grupo: "Ações", titulo: "Visão geral do escritório", icone: Building2, fazer: () => { navegar("escritorio"); useStore.getState().visaoGeral(); } },
    ];
    r.push(...acoes.filter((a) => ok(a.titulo)));
    r.push(...PAGINAS.filter((p) => ok(p.nome, p.termos)).map((p) => ({ id: `p-${p.area}-${p.sub ?? ""}-${p.nome}`, grupo: "Ir para", titulo: p.nome, icone: ArrowRight, fazer: () => navegar(p.area, p.sub ?? null) })));
    if (t) {
      r.push(
        ...Object.values(cards)
          .filter((c) => ok(c.chave, c.titulo))
          .slice(0, 8)
          .map((c) => ({ id: `c-${c.id}`, grupo: "Cards", titulo: `${c.chave} · ${c.titulo}`, detalhe: roomById[c.sala].nome, icone: FilePlus2, fazer: () => useStore.getState().abrirCard(c.id) })),
      );
      r.push(
        ...agents
          .filter((a) => ok(a.nome, a.cargo))
          .slice(0, 6)
          .map((a) => ({ id: `ag-${a.id}`, grupo: "Agentes", titulo: a.nome, detalhe: `${a.cargo} · ${roomById[a.sala].nome}`, icone: User, fazer: () => navegar("equipe", "agentes", a.id) })),
      );
      r.push(
        ...Object.values(leads)
          .filter((l) => ok(l.dados.nome?.valor, l.dados.cidade?.valor))
          .slice(0, 5)
          .map((l) => ({ id: `l-${l.cardId}`, grupo: "Leads", titulo: l.dados.nome?.valor ?? `Lead ${l.cardId}`, detalhe: l.dados.cidade?.valor, icone: Target, fazer: () => useStore.getState().abrirCard(l.cardId) })),
      );
      r.push(
        ...Object.values(contatos)
          .filter((c) => ok(c.nome, c.telefone))
          .slice(0, 5)
          .map((c) => ({ id: `w-${c.telefone}`, grupo: "Conversas", titulo: c.nome || c.telefone, detalhe: c.ultimaMensagem?.texto, icone: MessageCircle, fazer: () => navegar("clientes", "whatsapp", c.telefone) })),
      );
      r.push(
        ...memoria.slice(0, 6).map((m) => ({
          id: `m-${m.tipo}-${m.ref}`,
          grupo: "Na memória da empresa",
          titulo: m.titulo,
          detalhe: m.trecho.replace(/[«»]/g, ""),
          icone: Brain,
          fazer: () => {
            if (m.cardId) useStore.getState().abrirCard(m.cardId);
            else if (m.tipo === "livro") navegar("empresa", "livro");
            else if (m.tipo === "conhecimento") navegar("empresa", "conhecimento");
            else if (m.tipo === "ata") navegar("empresa", "rituais");
          },
        })),
      );
      r.push({ id: "helena", grupo: "Pedir", titulo: `Pedir à Helena: "${q.trim()}"`, icone: Sparkles, fazer: () => { send({ type: "command", texto: q.trim() }); avisar("Pedido enviado à Helena", "info"); } });
    }
    return r;
  }, [q, cards, leads, contatos, motor.pausado, memoria]);

  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    listaRef.current?.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  if (!aberta) return null;
  const executar = (r?: Resultado) => {
    if (!r) return;
    fechar();
    r.fazer();
  };
  let grupoAnterior = "";

  return createPortal(
    <div className="fixed inset-0 z-[3200] flex justify-center bg-overlay px-4 pt-[12vh]" onMouseDown={(e) => e.target === e.currentTarget && fechar()}>
      <div ref={ref} role="dialog" aria-label="Buscar ou pedir" className="anima-cima flex h-fit max-h-[70vh] w-full max-w-[640px] flex-col overflow-hidden rounded-panel bg-surface-3 shadow-3">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="size-5 shrink-0 text-fg-3" strokeWidth={1.75} />
          <input
            data-autofoco
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, resultados.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
              else if (e.key === "Enter") { e.preventDefault(); executar(resultados[sel]); }
            }}
            placeholder="Buscar cards, agentes, leads, páginas… ou pedir algo à Helena"
            className="h-14 min-w-0 flex-1 bg-transparent text-destaque text-fg outline-none placeholder:text-fg-3"
          />
          <Kbd>Esc</Kbd>
        </div>
        <div ref={listaRef} className="scroll-fino min-h-0 flex-1 overflow-y-auto p-2">
          {resultados.length === 0 && <p className="px-3 py-8 text-center text-corpo text-fg-2">Digite para buscar.</p>}
          {resultados.map((r, i) => {
            const cabecalho = r.grupo !== grupoAnterior ? r.grupo : null;
            grupoAnterior = r.grupo;
            const I = r.icone;
            return (
              <div key={r.id}>
                {cabecalho && <div className="px-3 pb-1 pt-3 text-legenda font-semibold text-fg-3">{cabecalho}</div>}
                <button
                  type="button"
                  data-i={i}
                  onMouseMove={() => setSel(i)}
                  onClick={() => executar(r)}
                  className={cx("flex w-full items-center gap-3 rounded-ctl px-3 py-2 text-left", i === sel ? "bg-press" : "")}
                >
                  <I className="size-4 shrink-0 text-fg-2" strokeWidth={1.75} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-corpo text-fg">{r.titulo}</span>
                    {r.detalhe && <span className="block truncate text-legenda text-fg-3">{r.detalhe}</span>}
                  </span>
                  {i === sel && <CornerDownLeft className="size-4 text-fg-3" />}
                </button>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-4 border-t border-line bg-surface-2 px-4 py-2 text-legenda text-fg-3">
          <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> navegar</span>
          <span className="flex items-center gap-1"><Kbd>↵</Kbd> abrir</span>
          <span className="flex items-center gap-1"><Kbd>⌘</Kbd><Kbd>1–7</Kbd> áreas</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
