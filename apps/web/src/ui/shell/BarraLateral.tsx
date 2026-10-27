import { useEffect, useState } from "react";
import { BookOpen, Building2, Inbox, KanbanSquare, LineChart, MessagesSquare, PanelLeftClose, PanelLeftOpen, Settings, Users, type LucideIcon } from "lucide-react";
import { navegar, useNav, type Area } from "../../nav.ts";
import { useStore } from "../../store.ts";
import { cx } from "../kit/index.ts";
import { usePendencias } from "./pendencias.ts";

// Barra lateral fixa (DESIGN-INTERFACE.md §3): 64 px só ícones, 232 px com nomes; lembra a escolha.

interface Item {
  area: Area;
  nome: string;
  icone: LucideIcon;
  atalho: string;
}
export const ITENS_NAV: Item[] = [
  { area: "escritorio", nome: "Escritório", icone: Building2, atalho: "1" },
  { area: "entrada", nome: "Caixa de entrada", icone: Inbox, atalho: "2" },
  { area: "trabalho", nome: "Trabalho", icone: KanbanSquare, atalho: "3" },
  { area: "clientes", nome: "Clientes", icone: MessagesSquare, atalho: "4" },
  { area: "equipe", nome: "Equipe", icone: Users, atalho: "5" },
  { area: "empresa", nome: "Empresa", icone: BookOpen, atalho: "6" },
  { area: "operacao", nome: "Operação", icone: LineChart, atalho: "7" },
];

const CHAVE = "barra-lateral-expandida";
const lerExpandida = () => {
  try {
    const v = localStorage.getItem(CHAVE);
    return v === null ? window.innerWidth >= 1440 : v === "1";
  } catch {
    return window.innerWidth >= 1440;
  }
};

export function BarraLateral() {
  const area = useNav((s) => s.rota.area);
  const [expandida, setExpandida] = useState(lerExpandida);
  const conectado = useStore((s) => s.conectado);
  const pendencias = usePendencias().length;
  const naoLidasWa = useStore((s) => Object.values(s.contatosWa).reduce((t, c) => t + c.naoLidas, 0));

  useEffect(() => {
    try {
      localStorage.setItem(CHAVE, expandida ? "1" : "0");
    } catch {}
  }, [expandida]);
  // Em telas estreitas, recolhe sozinha.
  useEffect(() => {
    const f = () => window.innerWidth < 1280 && setExpandida(false);
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);

  const contador = (a: Area) => (a === "entrada" ? pendencias : a === "clientes" ? naoLidasWa : 0);

  return (
    <nav aria-label="Navegação principal" className={cx("relative z-[1200] flex h-full shrink-0 flex-col border-r border-line bg-surface-2 transition-[width] duration-200", expandida ? "w-[232px]" : "w-16")}>
      <button
        type="button"
        onClick={() => navegar("escritorio")}
        className={cx("flex h-14 shrink-0 items-center gap-2.5 border-b border-line", expandida ? "px-4" : "justify-center")}
        title={`Hefesto · ${conectado ? "conectado" : "reconectando ao servidor…"}`}
      >
        <span className="relative size-8 shrink-0">
          <img src="/hefesto.svg" alt="" className="size-8" />
          <span className={cx("absolute -right-0.5 -top-0.5 size-2.5 rounded-full ring-2 ring-surface-2", conectado ? "bg-success" : "pulsar bg-warning")} />
        </span>
        {expandida && (
          <span className="min-w-0 text-left leading-tight">
            <span className="block text-corpo font-semibold text-fg">Hefesto</span>
            <span className="block truncate text-legenda text-fg-3">Escritório de agentes</span>
          </span>
        )}
      </button>

      <ul className="scroll-fino flex-1 space-y-0.5 overflow-y-auto p-2">
        {ITENS_NAV.map((i) => (
          <li key={i.area}>
            <ItemNav item={i} ativo={area === i.area} expandida={expandida} contador={contador(i.area)} />
          </li>
        ))}
      </ul>

      <div className="space-y-0.5 border-t border-line p-2">
        <ItemNav item={{ area: "config", nome: "Configurações", icone: Settings, atalho: "," }} ativo={area === "config"} expandida={expandida} contador={0} />
        <button
          type="button"
          onClick={() => setExpandida(!expandida)}
          className={cx("flex h-9 w-full items-center gap-3 rounded-ctl text-pequeno text-fg-3 transition-colors hover:bg-hover hover:text-fg", expandida ? "px-2.5" : "justify-center")}
          title={expandida ? "Recolher barra lateral" : "Expandir barra lateral"}
        >
          {expandida ? <PanelLeftClose className="size-[18px]" strokeWidth={1.75} /> : <PanelLeftOpen className="size-[18px]" strokeWidth={1.75} />}
          {expandida && "Recolher"}
        </button>
      </div>
    </nav>
  );
}

function ItemNav({ item, ativo, expandida, contador }: { item: Item; ativo: boolean; expandida: boolean; contador: number }) {
  const I = item.icone;
  return (
    <button
      type="button"
      onClick={() => navegar(item.area)}
      aria-current={ativo ? "page" : undefined}
      title={expandida ? undefined : `${item.nome}${contador ? ` (${contador})` : ""} · ⌘${item.atalho}`}
      className={cx(
        "group relative flex h-10 w-full items-center gap-3 rounded-ctl text-corpo transition-colors",
        expandida ? "px-2.5" : "justify-center",
        ativo ? "bg-press font-medium text-fg" : "text-fg-2 hover:bg-hover hover:text-fg",
      )}
    >
      {ativo && <span className="absolute -left-2 top-2 h-6 w-[3px] rounded-r-full bg-ink" />}
      <I className="size-[18px] shrink-0" strokeWidth={ativo ? 2 : 1.75} />
      {expandida && <span className="min-w-0 flex-1 truncate text-left">{item.nome}</span>}
      {contador > 0 &&
        (expandida ? (
          <span className={cx("tabular rounded-full px-1.5 text-legenda font-semibold", item.area === "entrada" ? "bg-danger text-white" : "bg-whatsapp text-white")}>{contador}</span>
        ) : (
          <span className={cx("tabular absolute right-1.5 top-1 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10.5px] font-semibold text-white", item.area === "entrada" ? "bg-danger" : "bg-whatsapp")}>{contador > 99 ? "99+" : contador}</span>
        ))}
    </button>
  );
}
