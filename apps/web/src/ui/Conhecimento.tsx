import { useState } from "react";
import { tiposConhecimento, type ItemConhecimento, type RoomId, type TipoConhecimento } from "@empresa/shared";
import { agentById, roomById, rooms, nomeDaSala, salaDe } from "@empresa/org";
import { useStore } from "../store.ts";
import { api } from "../api.ts";
import { Markdown } from "./Markdown.tsx";

// Base de conhecimento da casa (Fase 2f): padrões, guias, modelos e lições de cada área.
// Propostas dos agentes e lições extraídas dos cards esperam a sua aprovação.

const salasComEquipe = rooms.filter((r) => r.id !== "reuniao");
const nomeTipo = (t: TipoConhecimento) => tiposConhecimento.find((x) => x.id === t)!.nome;

type Filtro = "propostas" | RoomId | "todas";

/** Conhecimento da casa (Empresa → Conhecimento). */
export function PainelConhecimento() {
  const itens = useStore((s) => s.conhecimento);
  const propostas = itens.filter((i) => !i.aprovado);
  const [filtro, setFiltro] = useState<Filtro>(propostas.length ? "propostas" : "todas");
  const [aberto, setAberto] = useState<number | "novo" | null>(null);

  const visiveis = itens.filter((i) => (filtro === "propostas" ? !i.aprovado : filtro === "todas" ? true : i.sala === filtro));
  const atual = typeof aberto === "number" ? itens.find((i) => i.id === aberto) : undefined;

  return (
    <div className="flex min-h-[620px] overflow-hidden rounded-panel bg-surface shadow-1">
      <nav className="scroll-fino flex w-60 shrink-0 flex-col overflow-y-auto border-r border-line bg-surface-2 p-3">
        <div className="px-2 pb-3 text-legenda text-fg-3">
          {itens.filter((i) => i.aprovado).length} aprovados · {propostas.length} esperando você
        </div>
        <BotaoFiltro ativo={filtro === "propostas"} onClick={() => setFiltro("propostas")} rotulo="Esperando você" n={propostas.length} destaque />
        <BotaoFiltro ativo={filtro === "todas"} onClick={() => setFiltro("todas")} rotulo="Tudo" n={itens.length} />
        <div className="px-2 pb-1 pt-3 text-legenda font-semibold uppercase tracking-wide text-fg-3">Por área</div>
        {salasComEquipe.map((r) => (
          <BotaoFiltro
            key={r.id}
            ativo={filtro === r.id}
            onClick={() => setFiltro(r.id)}
            rotulo={r.nome}
            cor={r.cor}
            n={itens.filter((i) => i.sala === r.id).length}
          />
        ))}
      </nav>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-start gap-3 border-b border-line p-5">
          <div className="min-w-0 flex-1">
            <h2 className="text-secao font-bold">Conhecimento da casa</h2>
            <p className="text-pequeno text-fg-2">
              Padrões, guias, modelos e lições de cada área. O que você aprova entra no trabalho dos agentes daquela área e no checklist de quem valida.
            </p>
          </div>
          <button
            onClick={() => setAberto("novo")}
            className="shrink-0 rounded-lg bg-ink px-3 py-2 text-pequeno font-semibold text-on-ink"
          >
            Novo
          </button>
        </header>

        {aberto === "novo" ? (
          <Editor key="novo" salaInicial={filtro !== "propostas" && filtro !== "todas" ? filtro : "desenvolvimento"} aoFechar={() => setAberto(null)} />
        ) : atual ? (
          <Detalhe key={atual.id} item={atual} aoFechar={() => setAberto(null)} />
        ) : (
          <div className="scroll-fino min-h-0 flex-1 space-y-2 overflow-y-auto p-5">
            {!visiveis.length && (
              <p className="rounded-xl border border-dashed border-line py-10 text-center text-pequeno text-fg-3">
                {filtro === "propostas"
                  ? "Nada esperando você. Lições aparecem aqui quando um card é concluído depois de devoluções ou dos seus comentários."
                  : "Nenhum item nesta área ainda. Use Novo para registrar um padrão da casa."}
              </p>
            )}
            {visiveis.map((i) => (
              <button key={i.id} onClick={() => setAberto(i.id)} className="block w-full rounded-xl p-3 text-left ring-1 ring-line hover:bg-hover">
                <div className="flex items-center gap-2 text-legenda text-fg-3">
                  <span className="h-2 w-2 rounded-full" style={{ background: salaDe(i.sala).cor }} />
                  {nomeDaSala(i.sala)} · {nomeTipo(i.tipo)}
                  {!i.aprovado && <span className="rounded-full bg-warning-soft px-1.5 font-semibold text-warning-fg">proposta</span>}
                </div>
                <div className="mt-0.5 text-corpo font-semibold">{i.titulo}</div>
                <div className="line-clamp-2 text-pequeno text-fg-2">{i.conteudo}</div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function BotaoFiltro({ ativo, onClick, rotulo, n, cor, destaque }: { ativo: boolean; onClick: () => void; rotulo: string; n: number; cor?: string; destaque?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`mb-0.5 flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-pequeno ${ativo ? "bg-ink text-on-ink" : "hover:bg-hover"}`}
    >
      {cor && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: cor }} />}
      <span className="flex-1 truncate font-medium">{rotulo}</span>
      {n > 0 && (
        <span className={`rounded-full px-1.5 text-legenda font-semibold ${destaque && !ativo ? "bg-warning-soft text-warning-fg" : ativo ? "text-on-ink/70" : "text-fg-3"}`}>{n}</span>
      )}
    </button>
  );
}

function useAcao() {
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const acao = async (fn: () => Promise<unknown>) => {
    setErro(null);
    setOcupado(true);
    try {
      await fn();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  };
  return { erro, ocupado, acao };
}

function Detalhe({ item, aoFechar }: { item: ItemConhecimento; aoFechar: () => void }) {
  const [editando, setEditando] = useState(false);
  const { erro, ocupado, acao } = useAcao();
  const autor = item.autor === "voce" ? "Você" : (agentById[item.autor]?.nome ?? item.autor);
  const origem = item.origemCardId ? useStore.getState().cards[item.origemCardId] : undefined;

  if (editando) return <Editor item={item} aoFechar={() => setEditando(false)} />;
  return (
    <>
      <div className="scroll-fino min-h-0 flex-1 overflow-y-auto p-5">
        <button onClick={aoFechar} className="mb-3 text-pequeno text-fg-3 hover:text-fg">
          ← Voltar
        </button>
        <div className="flex items-center gap-2 text-legenda text-fg-3">
          <span className="h-2 w-2 rounded-full" style={{ background: salaDe(item.sala).cor }} />
          {nomeDaSala(item.sala)} · {nomeTipo(item.tipo)} · por {autor}
          {origem && (
            <button onClick={() => useStore.getState().abrirCard(origem.id)} className="font-semibold text-fg underline">
              {origem.chave}
            </button>
          )}
        </div>
        <h3 className="mb-2 mt-1 text-destaque font-bold">{item.titulo}</h3>
        <Markdown texto={item.conteudo} className="text-corpo leading-relaxed text-fg" />
      </div>
      <footer className="flex items-center gap-2 border-t border-line p-4">
        {erro && <span className="text-pequeno text-danger-fg">{erro}</span>}
        <div className="flex-1" />
        <button
          disabled={ocupado}
          onClick={() => acao(async () => {
            await api(`/api/conhecimento/${item.id}`, "DELETE");
            aoFechar();
          })}
          className="rounded-lg px-3 py-2 text-pequeno text-danger-fg hover:bg-danger-soft"
        >
          {item.aprovado ? "Excluir" : "Recusar"}
        </button>
        <button onClick={() => setEditando(true)} className="rounded-lg px-3 py-2 text-pequeno font-medium text-fg ring-1 ring-line hover:bg-hover">
          Editar
        </button>
        {!item.aprovado && (
          <button
            disabled={ocupado}
            onClick={() => acao(() => api(`/api/conhecimento/${item.id}/aprovar`, "POST"))}
            className="rounded-lg bg-success px-4 py-2 text-pequeno font-semibold text-white hover:bg-success"
          >
            Aprovar
          </button>
        )}
      </footer>
    </>
  );
}

function Editor({ item, salaInicial, aoFechar }: { item?: ItemConhecimento; salaInicial?: RoomId; aoFechar: () => void }) {
  const [sala, setSala] = useState<RoomId>(item?.sala ?? salaInicial ?? "desenvolvimento");
  const [tipo, setTipo] = useState<TipoConhecimento>(item?.tipo ?? "padrao");
  const [titulo, setTitulo] = useState(item?.titulo ?? "");
  const [conteudo, setConteudo] = useState(item?.conteudo ?? "");
  const { erro, ocupado, acao } = useAcao();
  const salvar = () =>
    acao(async () => {
      const corpo = { sala, tipo, titulo, conteudo };
      if (item) await api(`/api/conhecimento/${item.id}`, "PUT", corpo);
      else await api("/api/conhecimento", "POST", corpo);
      aoFechar();
    });

  return (
    <>
      <div className="scroll-fino flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-5">
        <div className="flex gap-2">
          <select value={sala} onChange={(e) => setSala(e.target.value as RoomId)} className="campo flex-1">
            {salasComEquipe.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nome}
              </option>
            ))}
          </select>
          <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoConhecimento)} className="campo w-44">
            {tiposConhecimento.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
        </div>
        <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Título (ex.: Toda tela de listagem tem busca e paginação)" className="campo" />
        <textarea
          value={conteudo}
          onChange={(e) => setConteudo(e.target.value)}
          placeholder="O padrão, guia, modelo ou lição, em tópicos. Aceita Markdown."
          className="min-h-72 flex-1 resize-none rounded-xl bg-sunken p-3 font-mono text-pequeno leading-relaxed outline-none ring-1 ring-line focus:ring-2 focus:ring-ink/30"
        />
      </div>
      <footer className="flex items-center gap-2 border-t border-line p-4">
        {erro && <span className="text-pequeno text-danger-fg">{erro}</span>}
        <div className="flex-1" />
        <button onClick={aoFechar} className="rounded-lg px-3 py-2 text-pequeno text-fg-2 hover:bg-hover">
          Cancelar
        </button>
        <button
          disabled={ocupado || !titulo.trim() || !conteudo.trim()}
          onClick={salvar}
          className="rounded-lg bg-ink px-4 py-2 text-pequeno font-semibold text-on-ink disabled:opacity-30"
        >
          {item ? "Salvar" : "Criar (já aprovado)"}
        </button>
      </footer>
    </>
  );
}
