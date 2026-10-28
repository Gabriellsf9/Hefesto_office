import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2, type LucideIcon } from "lucide-react";

// Componentes básicos do kit (DESIGN-INTERFACE.md §4.5). Nada de cor ou tamanho escrito à mão nas telas:
// tudo passa por aqui ou pelos tokens (bg-surface, text-fg-2, border-line…).

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Variante = "principal" | "secundario" | "discreto" | "perigo" | "sucesso";
type Tamanho = "p" | "m";

const VAR: Record<Variante, string> = {
  principal: "bg-ink text-on-ink hover:bg-ink-hover shadow-1",
  secundario: "bg-surface text-fg shadow-[inset_0_0_0_1px_var(--line-strong)] hover:bg-surface-2",
  discreto: "text-fg-2 hover:bg-hover hover:text-fg",
  perigo: "bg-surface text-danger-fg shadow-[inset_0_0_0_1px_var(--line-strong)] hover:bg-danger-soft",
  sucesso: "bg-success text-white hover:brightness-95 shadow-1",
};
const TAM: Record<Tamanho, string> = { p: "h-8 px-3 text-pequeno gap-1.5", m: "h-9 px-3.5 text-corpo gap-2" };

export interface BotaoProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  tamanho?: Tamanho;
  icone?: LucideIcon;
  iconeDireita?: LucideIcon;
  carregando?: boolean;
  /** Mostra por que a ação não está disponível (em vez de só desabilitar). */
  motivo?: string;
}

export const Botao = forwardRef<HTMLButtonElement, BotaoProps>(function Botao(
  { variante = "secundario", tamanho = "m", icone: Icone, iconeDireita: IconeD, carregando, motivo, className, children, disabled, title, ...r },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || carregando}
      title={motivo ?? title}
      className={cx(
        "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-ctl font-medium transition-colors duration-100 disabled:cursor-not-allowed disabled:opacity-50",
        VAR[variante],
        TAM[tamanho],
        className,
      )}
      {...r}
    >
      {carregando ? <Loader2 className="size-4 animate-spin" /> : Icone && <Icone className="size-4" strokeWidth={1.75} />}
      {children}
      {IconeD && <IconeD className="size-4" strokeWidth={1.75} />}
    </button>
  );
});

export const BotaoIcone = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { icone: LucideIcon; rotulo: string; tamanho?: Tamanho; ativo?: boolean; selo?: number | string | null }>(
  function BotaoIcone({ icone: Icone, rotulo, tamanho = "m", ativo, selo, className, ...r }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        aria-label={rotulo}
        title={rotulo}
        className={cx(
          "relative inline-grid shrink-0 place-items-center rounded-ctl transition-colors duration-100",
          tamanho === "p" ? "size-8" : "size-9",
          ativo ? "bg-press text-fg" : "text-fg-2 hover:bg-hover hover:text-fg",
          className,
        )}
        {...r}
      >
        <Icone className={tamanho === "p" ? "size-4" : "size-[18px]"} strokeWidth={1.75} />
        {selo != null && selo !== 0 && (
          <span className="tabular absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-danger px-1 text-[11.5px] font-semibold leading-none text-white">{selo}</span>
        )}
      </button>
    );
  },
);

type Tom = "neutro" | "acento" | "sucesso" | "alerta" | "perigo" | "info";
const TOM: Record<Tom, string> = {
  neutro: "bg-sunken text-fg-2",
  acento: "bg-accent-soft text-accent-fg",
  sucesso: "bg-success-soft text-success-fg",
  alerta: "bg-warning-soft text-warning-fg",
  perigo: "bg-danger-soft text-danger-fg",
  info: "bg-info-soft text-info-fg",
};

export function Etiqueta({ tom = "neutro", icone: Icone, children, className, ponto }: { tom?: Tom; icone?: LucideIcon; children: ReactNode; className?: string; ponto?: string }) {
  return (
    <span className={cx("inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 text-legenda font-medium", TOM[tom], className)}>
      {ponto && <span className="size-1.5 rounded-full" style={{ background: ponto }} />}
      {Icone && <Icone className="size-3" strokeWidth={2} />}
      {children}
    </span>
  );
}

export function Chip({ ativo, onClick, children, icone: Icone, contador }: { ativo?: boolean; onClick?: () => void; children: ReactNode; icone?: LucideIcon; contador?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={!!ativo}
      className={cx(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-pequeno font-medium transition-colors",
        ativo ? "bg-ink text-on-ink" : "bg-surface text-fg-2 shadow-[inset_0_0_0_1px_var(--line)] hover:text-fg hover:shadow-[inset_0_0_0_1px_var(--line-strong)]",
      )}
    >
      {Icone && <Icone className="size-3.5" strokeWidth={2} />}
      {children}
      {contador != null && contador > 0 && <span className={cx("tabular text-legenda", ativo ? "text-on-ink/70" : "text-fg-3")}>{contador}</span>}
    </button>
  );
}

/** Avatar de agente: iniciais na cor da camisa. */
export function Avatar({ nome, cor, tamanho = 28, status }: { nome: string; cor?: string; tamanho?: number; status?: "ativo" | "ocioso" | "alerta" | null }) {
  const ini = nome.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <span className="relative inline-grid shrink-0 place-items-center rounded-full font-semibold text-white" style={{ width: tamanho, height: tamanho, background: cor ?? "var(--fg-3)", fontSize: Math.max(12, tamanho * 0.38) }}>
      {ini}
      {status && (
        <span
          className={cx("absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-surface", status === "ativo" ? "bg-success" : status === "alerta" ? "bg-warning" : "bg-fg-disabled")}
        />
      )}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-grid h-5 min-w-5 place-items-center rounded border border-line bg-surface-2 px-1 font-sans text-legenda font-medium text-fg-3">{children}</kbd>;
}

export function Cartao({ children, className, onClick, interativo }: { children: ReactNode; className?: string; onClick?: () => void; interativo?: boolean }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cx("block rounded-card bg-surface text-left shadow-1", (interativo || onClick) && "transition-shadow hover:shadow-2", className)}
    >
      {children}
    </Tag>
  );
}

export function Secao({ titulo, descricao, acao, children, className }: { titulo: ReactNode; descricao?: ReactNode; acao?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("space-y-3", className)}>
      <div className="flex items-end gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-destaque font-semibold text-fg">{titulo}</h3>
          {descricao && <p className="mt-0.5 text-pequeno text-fg-2">{descricao}</p>}
        </div>
        {acao}
      </div>
      {children}
    </section>
  );
}

export function EstadoVazio({ icone: Icone, titulo, texto, acao, compacto }: { icone: LucideIcon; titulo: string; texto?: ReactNode; acao?: ReactNode; compacto?: boolean }) {
  return (
    <div className={cx("flex flex-col items-center justify-center text-center", compacto ? "gap-1.5 px-4 py-6" : "gap-2 px-6 py-14")}>
      <span className={cx("grid place-items-center rounded-full bg-sunken text-fg-3", compacto ? "size-9" : "size-12")}>
        <Icone className={compacto ? "size-4" : "size-5"} strokeWidth={1.75} />
      </span>
      <p className={cx("font-semibold text-fg", compacto ? "text-pequeno" : "text-corpo")}>{titulo}</p>
      {texto && <p className="max-w-sm text-pequeno text-fg-2">{texto}</p>}
      {acao && <div className="mt-2">{acao}</div>}
    </div>
  );
}

export function Esqueleto({ className }: { className?: string }) {
  return <div className={cx("pulsar rounded-ctl bg-sunken", className)} />;
}

export function Indicador({ rotulo, valor, detalhe, tom }: { rotulo: string; valor: ReactNode; detalhe?: ReactNode; tom?: "sucesso" | "alerta" | "perigo" }) {
  return (
    <div className="rounded-card bg-surface p-4 shadow-1">
      <div className="text-legenda font-medium text-fg-3">{rotulo}</div>
      <div className={cx("tabular mt-1 text-numero font-semibold", tom === "sucesso" ? "text-success-fg" : tom === "alerta" ? "text-warning-fg" : tom === "perigo" ? "text-danger-fg" : "text-fg")}>{valor}</div>
      {detalhe && <div className="mt-1 text-legenda text-fg-3">{detalhe}</div>}
    </div>
  );
}

export function ChaveValor({ itens }: { itens: [ReactNode, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[minmax(96px,auto)_1fr] gap-x-4 gap-y-2 text-pequeno">
      {itens.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-fg-3">{k}</dt>
          <dd className="min-w-0 text-fg">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Divisor({ className }: { className?: string }) {
  return <hr className={cx("border-0 border-t border-line", className)} />;
}
