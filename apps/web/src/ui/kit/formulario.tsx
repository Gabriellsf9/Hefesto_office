import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { ChevronDown, Eye, EyeOff } from "lucide-react";
import { cx } from "./base.tsx";

// Formulários do kit. Rótulo sempre visível, ajuda abaixo, erro em vermelho com o que fazer.

const BASE_CAMPO =
  "w-full rounded-ctl bg-surface text-corpo text-fg shadow-[inset_0_0_0_1px_var(--line-strong)] outline-none transition-shadow placeholder:text-fg-3 hover:shadow-[inset_0_0_0_1px_var(--fg-3)] focus:shadow-[inset_0_0_0_1px_var(--accent),0_0_0_3px_var(--accent-soft)] disabled:cursor-not-allowed disabled:opacity-60";

export function Grupo({ rotulo, ajuda, erro, children, htmlFor, extra }: { rotulo?: ReactNode; ajuda?: ReactNode; erro?: string | null; children: ReactNode; htmlFor?: string; extra?: ReactNode }) {
  return (
    <div className="space-y-1.5">
      {(rotulo || extra) && (
        <div className="flex items-baseline gap-2">
          {rotulo && (
            <label htmlFor={htmlFor} className="text-pequeno font-medium text-fg">
              {rotulo}
            </label>
          )}
          <span className="flex-1" />
          {extra}
        </div>
      )}
      {children}
      {erro ? <p className="text-legenda text-danger-fg">{erro}</p> : ajuda ? <p className="text-legenda text-fg-3">{ajuda}</p> : null}
    </div>
  );
}

export const Campo = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { rotulo?: ReactNode; ajuda?: ReactNode; erro?: string | null; tamanho?: "p" | "m" }>(function Campo(
  { rotulo, ajuda, erro, tamanho = "m", className, id, ...r },
  ref,
) {
  const auto = useId();
  const el = <input ref={ref} id={id ?? auto} className={cx(BASE_CAMPO, tamanho === "p" ? "h-8 px-2.5 text-pequeno" : "h-9 px-3", erro && "shadow-[inset_0_0_0_1px_var(--danger)]", className)} {...r} />;
  return rotulo || ajuda || erro ? <Grupo rotulo={rotulo} ajuda={ajuda} erro={erro} htmlFor={id ?? auto}>{el}</Grupo> : el;
});

export const AreaTexto = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { rotulo?: ReactNode; ajuda?: ReactNode; erro?: string | null }>(function AreaTexto(
  { rotulo, ajuda, erro, className, id, rows = 4, ...r },
  ref,
) {
  const auto = useId();
  const el = <textarea ref={ref} id={id ?? auto} rows={rows} className={cx(BASE_CAMPO, "resize-y px-3 py-2 leading-5", className)} {...r} />;
  return rotulo || ajuda || erro ? <Grupo rotulo={rotulo} ajuda={ajuda} erro={erro} htmlFor={id ?? auto}>{el}</Grupo> : el;
});

export const Seletor = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { rotulo?: ReactNode; ajuda?: ReactNode; tamanho?: "p" | "m" }>(function Seletor(
  { rotulo, ajuda, tamanho = "m", className, children, id, ...r },
  ref,
) {
  const auto = useId();
  const el = (
    <div className={cx("relative", className)}>
      <select ref={ref} id={id ?? auto} className={cx(BASE_CAMPO, "appearance-none pr-8", tamanho === "p" ? "h-8 pl-2.5 text-pequeno" : "h-9 pl-3")} {...r}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-3" strokeWidth={1.75} />
    </div>
  );
  return rotulo || ajuda ? <Grupo rotulo={rotulo} ajuda={ajuda} htmlFor={id ?? auto}>{el}</Grupo> : el;
});

/** Segredo (token, chave): nunca mostra o valor salvo; só "configurado" e um campo para trocar. */
export function CampoSegredo({ rotulo, ajuda, configurado, valor, onChange, placeholder }: { rotulo: ReactNode; ajuda?: ReactNode; configurado: boolean; valor: string; onChange: (v: string) => void; placeholder?: string }) {
  const [ver, setVer] = useState(false);
  const id = useId();
  return (
    <Grupo rotulo={rotulo} ajuda={ajuda} htmlFor={id} extra={configurado ? <span className="text-legenda font-medium text-success-fg">Configurado</span> : null}>
      <div className="relative">
        <input
          id={id}
          type={ver ? "text" : "password"}
          autoComplete="off"
          spellCheck={false}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          placeholder={configurado ? "•••••••• (deixe em branco para manter)" : placeholder}
          className={cx(BASE_CAMPO, "h-9 px-3 pr-9 font-mono text-pequeno")}
        />
        <button type="button" onClick={() => setVer(!ver)} aria-label={ver ? "Ocultar" : "Mostrar"} className="absolute right-1.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-fg-3 hover:bg-hover hover:text-fg">
          {ver ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </Grupo>
  );
}

export function Interruptor({ ativo, onChange, rotulo, descricao, desabilitado }: { ativo: boolean; onChange: (v: boolean) => void; rotulo?: ReactNode; descricao?: ReactNode; desabilitado?: boolean }) {
  const botao = (
    <button
      type="button"
      role="switch"
      aria-checked={ativo}
      disabled={desabilitado}
      onClick={() => onChange(!ativo)}
      className={cx("relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50", ativo ? "bg-accent" : "bg-line-strong")}
    >
      <span className={cx("inline-block size-4 rounded-full bg-white shadow transition-transform", ativo ? "translate-x-[18px]" : "translate-x-0.5")} />
    </button>
  );
  if (!rotulo) return botao;
  return (
    <label className="flex cursor-pointer items-start gap-3 py-1">
      <span className="min-w-0 flex-1">
        <span className="block text-corpo font-medium text-fg">{rotulo}</span>
        {descricao && <span className="mt-0.5 block text-pequeno text-fg-2">{descricao}</span>}
      </span>
      <span className="pt-0.5">{botao}</span>
    </label>
  );
}

export function Caixa({ marcada, onChange, rotulo, descricao }: { marcada: boolean; onChange: (v: boolean) => void; rotulo: ReactNode; descricao?: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 py-0.5">
      <input type="checkbox" checked={marcada} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]" />
      <span className="min-w-0">
        <span className="block text-corpo text-fg">{rotulo}</span>
        {descricao && <span className="block text-pequeno text-fg-2">{descricao}</span>}
      </span>
    </label>
  );
}

export function Segmentado<T extends string>({ valor, opcoes, onChange, tamanho = "m" }: { valor: T; opcoes: { id: T; rotulo: ReactNode }[]; onChange: (v: T) => void; tamanho?: "p" | "m" }) {
  return (
    <div role="radiogroup" className="inline-flex rounded-ctl bg-sunken p-0.5">
      {opcoes.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={valor === o.id}
          onClick={() => onChange(o.id)}
          className={cx(
            "inline-flex items-center gap-1.5 rounded-[6px] font-medium transition-colors",
            tamanho === "p" ? "h-7 px-2.5 text-pequeno" : "h-8 px-3 text-pequeno",
            valor === o.id ? "bg-surface text-fg shadow-1" : "text-fg-2 hover:text-fg",
          )}
        >
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}

/** Seleção múltipla em pílulas (ex.: salas com acesso). */
export function Pilulas<T extends string>({ valores, opcoes, onChange }: { valores: T[]; opcoes: { id: T; rotulo: string; cor?: string }[]; onChange: (v: T[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {opcoes.map((o) => {
        const on = valores.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? valores.filter((v) => v !== o.id) : [...valores, o.id])}
            className={cx(
              "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-pequeno transition-colors",
              on ? "bg-accent-soft font-medium text-accent-fg shadow-[inset_0_0_0_1px_var(--accent)]" : "bg-surface text-fg-2 shadow-[inset_0_0_0_1px_var(--line)] hover:text-fg",
            )}
          >
            {o.cor && <span className="size-2 rounded-full" style={{ background: o.cor }} />}
            {o.rotulo}
          </button>
        );
      })}
    </div>
  );
}
