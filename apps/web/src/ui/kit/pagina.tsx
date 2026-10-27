import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cx } from "./base.tsx";

// Estrutura de página: cabeçalho (título, descrição, ações, abas) e corpo com largura controlada.

export function Pagina({ children, largura = "total", className }: { children: ReactNode; largura?: "texto" | "media" | "total"; className?: string }) {
  return (
    <div className="scroll-fino h-full overflow-y-auto">
      <div className={cx("mx-auto px-6 pb-28 pt-6 lg:px-8", largura === "texto" ? "max-w-[820px]" : largura === "media" ? "max-w-[1160px]" : "max-w-none", className)}>{children}</div>
    </div>
  );
}

export function CabecalhoPagina({ titulo, descricao, acoes, abas, icone: Icone }: { titulo: ReactNode; descricao?: ReactNode; acoes?: ReactNode; abas?: ReactNode; icone?: LucideIcon }) {
  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2.5 text-pagina font-semibold tracking-[-0.01em] text-fg">
            {Icone && <Icone className="size-6 text-fg-3" strokeWidth={1.75} />}
            {titulo}
          </h1>
          {descricao && <p className="mt-1 max-w-3xl text-corpo text-fg-2">{descricao}</p>}
        </div>
        {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
      </div>
      {abas && <div className="mt-5">{abas}</div>}
    </div>
  );
}

export interface Aba<T extends string> {
  id: T;
  rotulo: ReactNode;
  icone?: LucideIcon;
  contador?: number;
  alerta?: boolean;
}

/** Abas com sublinhado (navegação dentro da página). */
export function Abas<T extends string>({ abas, ativa, onChange, className }: { abas: Aba<T>[]; ativa: T; onChange: (id: T) => void; className?: string }) {
  return (
    <div role="tablist" className={cx("scroll-fino flex gap-1 overflow-x-auto border-b border-line", className)}>
      {abas.map((a) => {
        const on = a.id === ativa;
        const I = a.icone;
        return (
          <button
            key={a.id}
            role="tab"
            type="button"
            aria-selected={on}
            onClick={() => onChange(a.id)}
            className={cx(
              "-mb-px inline-flex h-10 shrink-0 items-center gap-2 border-b-2 px-3 text-corpo font-medium transition-colors",
              on ? "border-ink text-fg" : "border-transparent text-fg-2 hover:text-fg",
            )}
          >
            {I && <I className="size-4" strokeWidth={1.75} />}
            {a.rotulo}
            {a.contador != null && a.contador > 0 && (
              <span className={cx("tabular rounded-full px-1.5 text-legenda font-semibold", a.alerta ? "bg-danger text-white" : "bg-sunken text-fg-2")}>{a.contador}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Menu lateral interno (Configurações, Livro): lista de seções à esquerda, conteúdo à direita. */
export function MenuSecoes<T extends string>({ itens, ativo, onChange, titulo }: { itens: { id: T; rotulo: ReactNode; icone?: LucideIcon; extra?: ReactNode }[]; ativo: T; onChange: (id: T) => void; titulo?: ReactNode }) {
  return (
    <nav className="space-y-0.5">
      {titulo && <div className="px-2.5 pb-2 text-legenda font-semibold uppercase tracking-wide text-fg-3">{titulo}</div>}
      {itens.map((i) => {
        const I = i.icone;
        const on = i.id === ativo;
        return (
          <button
            key={i.id}
            type="button"
            onClick={() => onChange(i.id)}
            aria-current={on ? "page" : undefined}
            className={cx("flex w-full items-center gap-2.5 rounded-ctl px-2.5 py-2 text-left text-corpo transition-colors", on ? "bg-press font-medium text-fg" : "text-fg-2 hover:bg-hover hover:text-fg")}
          >
            {I && <I className="size-4 shrink-0" strokeWidth={1.75} />}
            <span className="min-w-0 flex-1 truncate">{i.rotulo}</span>
            {i.extra}
          </button>
        );
      })}
    </nav>
  );
}
