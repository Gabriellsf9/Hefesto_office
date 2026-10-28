import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Info, TriangleAlert, X, XCircle } from "lucide-react";
import { create } from "zustand";
import { Botao, BotaoIcone, cx } from "./base.tsx";
import { useCamada } from "./camadas.ts";

// Janelas, gavetas, popovers e avisos. Todas entram na pilha de camadas (Esc fecha a de cima, foco preso).
// Renderizam num portal no <body>, acima de tudo (o z-index segue a tabela da seção 4.3).

const Portal = ({ children }: { children: ReactNode }) => createPortal(children, document.body);

export function Janela({
  aberta, fechar, titulo, descricao, children, rodape, largura = 560, semFechar,
}: { aberta: boolean; fechar: () => void; titulo: ReactNode; descricao?: ReactNode; children: ReactNode; rodape?: ReactNode; largura?: number; semFechar?: boolean }) {
  const ref = useCamada<HTMLDivElement>(aberta, fechar);
  if (!aberta) return null;
  return (
    <Portal>
      <div className="fixed inset-0 z-[3000] grid place-items-center bg-overlay p-4" onMouseDown={(e) => e.target === e.currentTarget && fechar()}>
        <div ref={ref} role="dialog" aria-modal="true" tabIndex={-1} className="anima-cima flex max-h-[min(860px,calc(100vh-32px))] w-full flex-col overflow-hidden rounded-panel bg-surface-3 shadow-3 outline-none" style={{ maxWidth: largura }}>
          <header className="flex items-start gap-3 px-6 pb-2 pt-5">
            <div className="min-w-0 flex-1">
              <h2 className="text-secao font-semibold text-fg">{titulo}</h2>
              {descricao && <p className="mt-1 text-pequeno text-fg-2">{descricao}</p>}
            </div>
            {!semFechar && <BotaoIcone icone={X} rotulo="Fechar (Esc)" tamanho="p" onClick={fechar} className="-mr-2 -mt-1" />}
          </header>
          <div className="scroll-fino min-h-0 flex-1 overflow-y-auto px-6 py-3">{children}</div>
          {rodape && <footer className="flex items-center justify-end gap-2 border-t border-line bg-surface-2 px-6 py-3">{rodape}</footer>}
        </div>
      </div>
    </Portal>
  );
}

/** Gaveta lateral (detalhe do card, perfil, editor). */
export function Gaveta({
  aberta, fechar, titulo, subtitulo, acoes, children, rodape, largura = 520, semFundo,
}: { aberta: boolean; fechar: () => void; titulo?: ReactNode; subtitulo?: ReactNode; acoes?: ReactNode; children: ReactNode; rodape?: ReactNode; largura?: number; semFundo?: boolean }) {
  const ref = useCamada<HTMLDivElement>(aberta, fechar, { prender: !semFundo, focarAoAbrir: !semFundo });
  if (!aberta) return null;
  const painel = (
    <div
      ref={ref}
      role="dialog"
      aria-modal={!semFundo}
      tabIndex={-1}
      className="anima-lado pointer-events-auto fixed bottom-2 right-2 top-2 z-[2500] flex w-[calc(100vw-16px)] flex-col overflow-hidden rounded-panel bg-surface-3 shadow-3 outline-none"
      style={{ maxWidth: largura }}
    >
      {(titulo || acoes) && (
        <header className="flex items-start gap-2 border-b border-line px-5 py-3.5">
          <div className="min-w-0 flex-1">
            {subtitulo && <div className="mb-0.5 text-legenda text-fg-3">{subtitulo}</div>}
            {titulo && <h2 className="text-destaque font-semibold leading-6 text-fg">{titulo}</h2>}
          </div>
          {acoes}
          <BotaoIcone icone={X} rotulo="Fechar (Esc)" tamanho="p" onClick={fechar} />
        </header>
      )}
      <div className="scroll-fino min-h-0 flex-1 overflow-y-auto">{children}</div>
      {rodape && <footer className="flex items-center gap-2 border-t border-line bg-surface-2 px-5 py-3">{rodape}</footer>}
    </div>
  );
  return (
    <Portal>
      {!semFundo && <div className="fixed inset-0 z-[2400] bg-overlay" onMouseDown={fechar} />}
      {painel}
    </Portal>
  );
}

/** Popover ancorado num botão (menus, seletores ricos). */
export function Popover({
  aberto, fechar, ancora, children, largura = 280, lado = "baixo", alinhar = "inicio",
}: { aberto: boolean; fechar: () => void; ancora: React.RefObject<HTMLElement | null>; children: ReactNode; largura?: number; lado?: "baixo" | "cima" | "direita"; alinhar?: "inicio" | "fim" }) {
  const ref = useCamada<HTMLDivElement>(aberto, fechar, { prender: false, focarAoAbrir: false });
  const [pos, setPos] = useState<{ top: number; left: number; maxH: number } | null>(null);
  useLayoutEffect(() => {
    if (!aberto || !ancora.current) return;
    const r = ancora.current.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    let top = lado === "cima" ? r.top - 8 : lado === "direita" ? r.top : r.bottom + 6;
    let left = lado === "direita" ? r.right + 8 : alinhar === "fim" ? r.right - largura : r.left;
    left = Math.max(8, Math.min(left, vw - largura - 8));
    const maxH = lado === "cima" ? r.top - 16 : vh - top - 12;
    if (lado === "cima") top = r.top - 8;
    setPos({ top, left, maxH });
  }, [aberto, ancora, largura, lado, alinhar]);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node) || ancora.current?.contains(e.target as Node)) return;
      fechar();
    };
    window.addEventListener("mousedown", fora);
    return () => window.removeEventListener("mousedown", fora);
  }, [aberto, fechar, ancora, ref]);
  if (!aberto || !pos) return null;
  return (
    <Portal>
      <div
        ref={ref}
        className="anima-cima scroll-fino fixed z-[2800] overflow-y-auto rounded-card bg-surface-3 p-1.5 shadow-3"
        style={{ top: lado === "cima" ? undefined : pos.top, bottom: lado === "cima" ? window.innerHeight - pos.top : undefined, left: pos.left, width: largura, maxHeight: pos.maxH }}
      >
        {children}
      </div>
    </Portal>
  );
}

export function ItemMenu({ icone: Icone, children, onClick, perigo, atalho, ativo, descricao }: { icone?: React.ComponentType<{ className?: string; strokeWidth?: number }>; children: ReactNode; onClick?: () => void; perigo?: boolean; atalho?: ReactNode; ativo?: boolean; descricao?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx("flex w-full items-center gap-2.5 rounded-ctl px-2.5 py-2 text-left text-corpo transition-colors", perigo ? "text-danger-fg hover:bg-danger-soft" : "text-fg hover:bg-hover", ativo && "bg-hover")}
    >
      {Icone && <Icone className="size-4 shrink-0 text-fg-2" strokeWidth={1.75} />}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{children}</span>
        {descricao && <span className="block truncate text-legenda text-fg-3">{descricao}</span>}
      </span>
      {atalho}
    </button>
  );
}

/* ---------- Confirmação ---------- */

interface PedidoConfirmacao {
  titulo: string;
  texto?: string;
  confirmar: string;
  perigo?: boolean;
  resolver: (ok: boolean) => void;
}
const useConfirmacao = create<{ pedido: PedidoConfirmacao | null }>(() => ({ pedido: null }));

/** const ok = await confirmar({ titulo: "Excluir card?", confirmar: "Excluir", perigo: true }) */
export function confirmar(p: Omit<PedidoConfirmacao, "resolver">): Promise<boolean> {
  return new Promise((resolver) => useConfirmacao.setState({ pedido: { ...p, resolver } }));
}

export function Confirmacoes() {
  const p = useConfirmacao((s) => s.pedido);
  const fim = (ok: boolean) => {
    p?.resolver(ok);
    useConfirmacao.setState({ pedido: null });
  };
  return (
    <Janela
      aberta={!!p}
      fechar={() => fim(false)}
      titulo={p?.titulo ?? ""}
      largura={420}
      rodape={
        <>
          <Botao variante="discreto" onClick={() => fim(false)}>Cancelar</Botao>
          <Botao variante={p?.perigo ? "perigo" : "principal"} onClick={() => fim(true)} data-autofoco>
            {p?.confirmar}
          </Botao>
        </>
      }
    >
      {p?.texto && <p className="pb-2 text-corpo text-fg-2">{p.texto}</p>}
    </Janela>
  );
}

/* ---------- Avisos (toasts) ---------- */

type TipoAviso = "sucesso" | "erro" | "info" | "alerta";
interface Aviso { id: number; tipo: TipoAviso; texto: string; acao?: { rotulo: string; fazer: () => void } }
const useAvisos = create<{ lista: Aviso[] }>(() => ({ lista: [] }));
let idAviso = 1;

export function avisar(texto: string, tipo: TipoAviso = "sucesso", acao?: Aviso["acao"]) {
  const id = idAviso++;
  useAvisos.setState((s) => ({ lista: [...s.lista.slice(-3), { id, tipo, texto, acao }] }));
  setTimeout(() => useAvisos.setState((s) => ({ lista: s.lista.filter((a) => a.id !== id) })), tipo === "erro" ? 7000 : 4000);
}
/** Para usar em catch: avisa o erro com a mensagem do servidor. */
export const avisarErro = (e: unknown) => avisar(e instanceof Error ? e.message : String(e), "erro");

const ICONE_AVISO = { sucesso: CheckCircle2, erro: XCircle, info: Info, alerta: TriangleAlert };
const COR_AVISO = { sucesso: "text-success", erro: "text-danger", info: "text-accent", alerta: "text-warning" };

export function Avisos() {
  const lista = useAvisos((s) => s.lista);
  const ref = useRef<HTMLDivElement>(null);
  return (
    <Portal>
      <div ref={ref} aria-live="polite" className="pointer-events-none fixed bottom-4 left-1/2 z-[3500] flex -translate-x-1/2 flex-col items-center gap-2">
        {lista.map((a) => {
          const I = ICONE_AVISO[a.tipo];
          return (
            <div key={a.id} className="anima-cima pointer-events-auto flex max-w-[520px] items-center gap-2.5 rounded-card bg-ink py-2.5 pl-3 pr-2 text-corpo text-on-ink shadow-3">
              <I className={cx("size-4 shrink-0", COR_AVISO[a.tipo])} />
              <span className="min-w-0 flex-1">{a.texto}</span>
              {a.acao && (
                <button type="button" onClick={a.acao.fazer} className="rounded-md px-2 py-1 text-pequeno font-semibold text-on-ink underline-offset-2 hover:underline">
                  {a.acao.rotulo}
                </button>
              )}
              <button type="button" aria-label="Dispensar" onClick={() => useAvisos.setState((s) => ({ lista: s.lista.filter((x) => x.id !== a.id) }))} className="grid size-alvo place-items-center rounded-md opacity-60 hover:opacity-100">
                <X className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </Portal>
  );
}
