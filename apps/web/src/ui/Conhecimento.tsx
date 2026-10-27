import { useState } from "react";
import { tiposConhecimento, type ItemConhecimento, type RoomId, type TipoConhecimento } from "@empresa/shared";
import { agentById, roomById, rooms } from "@empresa/org";
import { useStore } from "../store.ts";
import { api } from "../api.ts";
import { Markdown } from "./Markdown.tsx";

// Base de conhecimento da casa (Fase 2f): padrões, guias, modelos e lições de cada área.
// Propostas dos agentes e lições extraídas dos cards esperam a sua aprovação.

const salasComEquipe = rooms.filter((r) => r.id !== "reuniao");
const nomeTipo = (t: TipoConhecimento) => tiposConhecimento.find((x) => x.id === t)!.nome;

type Filtro = "propostas" | RoomId | "todas";

export function PainelConhecimento({ fechar, abas }: { fechar: () => void; abas: React.ReactNode }) {
  const itens = useStore((s) => s.conhecimento);
  const propostas = itens.filter((i) => !i.aprovado);
  const [filtro, setFiltro] = useState<Filtro>(propostas.length ? "propostas" : "todas");
  const [aberto, setAberto] = useState<number | "novo" | null>(null);

  const visiveis = itens.filter((i) => (filtro === "propostas" ? !i.aprovado : filtro === "todas" ? true : i.sala === filtro));
  const atual = typeof aberto === "number" ? itens.find((i) => i.id === aberto) : undefined;

  return (
    <>
      <nav className="scroll-fino flex w-60 shrink-0 flex-col overflow-y-auto border-r border-black/5 bg-black/[0.02] p-3">
        {abas}
        <div className="px-2 pb-3 text-[11px] text-black/50">
          {itens.filter((i) => i.aprovado).length} aprovados · {propostas.length} esperando você
        </div>
        <BotaoFiltro ativo={filtro === "propostas"} onClick={() => setFiltro("propostas")} rotulo="Esperando você" n={propostas.length} destaque />
        <BotaoFiltro ativo={filtro === "todas"} onClick={() => setFiltro("todas")} rotulo="Tudo" n={itens.length} />
        <div className="px-2 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide text-black/45">Por área</div>
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
        <header className="flex items-start gap-3 border-b border-black/5 p-5">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold">Conhecimento da casa</h2>
            <p className="text-xs text-black/55">
              Padrões, guias, modelos e lições de cada área. O que você aprova entra no trabalho dos agentes daquela área e no checklist de quem valida.
            </p>
          </div>
          <button
            onClick={() => setAberto("novo")}
            className="shrink-0 rounded-lg bg-[#1f2430] px-3 py-2 text-xs font-semibold text-white"
          >
            Novo
          </button>
          <button onClick={fechar} className="grid h-8 w-8 place-items-center rounded-full text-black/50 hover:bg-black/5" aria-label="Fechar">
            ✕
          </button>
        </header>

        {aberto === "novo" ? (
          <Editor key="novo" salaInicial={filtro !== "propostas" && filtro !== "todas" ? filtro : "desenvolvimento"} aoFechar={() => setAberto(null)} />
        ) : atual ? (
          <Detalhe key={atual.id} item={atual} aoFechar={() => setAberto(null)} />
        ) : (
          <div className="scroll-fino min-h-0 flex-1 space-y-2 overflow-y-auto p-5">
            {!visiveis.length && (
              <p className="rounded-xl border border-dashed border-black/10 py-10 text-center text-xs text-black/45">
                {filtro === "propostas"
                  ? "Nada esperando você. Lições aparecem aqui quando um card é concluído depois de devoluções ou dos seus comentários."
                  : "Nenhum item nesta área ainda. Use Novo para registrar um padrão da casa."}
              </p>
            )}
            {visiveis.map((i) => (
              <button key={i.id} onClick={() => setAberto(i.id)} className="block w-full rounded-xl p-3 text-left ring-1 ring-black/10 hover:bg-black/[0.02]">
                <div className="flex items-center gap-2 text-[11px] text-black/50">
                  <span className="h-2 w-2 rounded-full" style={{ background: roomById[i.sala].cor }} />
                  {roomById[i.sala].nome} · {nomeTipo(i.tipo)}
                  {!i.aprovado && <span className="rounded-full bg-amber-100 px-1.5 font-semibold text-amber-800">proposta</span>}
                </div>
                <div className="mt-0.5 text-sm font-semibold">{i.titulo}</div>
                <div className="line-clamp-2 text-xs text-black/55">{i.conteudo}</div>
              </button>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function BotaoFiltro({ ativo, onClick, rotulo, n, cor, destaque }: { ativo: boolean; onClick: () => void; rotulo: string; n: number; cor?: string; destaque?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`mb-0.5 flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs ${ativo ? "bg-[#1f2430] text-white" : "hover:bg-black/5"}`}
    >
      {cor && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: cor }} />}
      <span className="flex-1 truncate font-medium">{rotulo}</span>
      {n > 0 && (
        <span className={`rounded-full px-1.5 text-[10px] font-semibold ${destaque && !ativo ? "bg-amber-100 text-amber-800" : ativo ? "text-white/70" : "text-black/40"}`}>{n}</span>
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
        <button onClick={aoFechar} className="mb-3 text-xs text-black/50 hover:text-black">
          ← Voltar
        </button>
        <div className="flex items-center gap-2 text-[11px] text-black/50">
          <span className="h-2 w-2 rounded-full" style={{ background: roomById[item.sala].cor }} />
          {roomById[item.sala].nome} · {nomeTipo(item.tipo)} · por {autor}
          {origem && (
            <button onClick={() => useStore.getState().abrirCard(origem.id)} className="font-semibold text-[#1f2430] underline">
              {origem.chave}
            </button>
          )}
        </div>
        <h3 className="mb-2 mt-1 text-base font-bold">{item.titulo}</h3>
        <Markdown texto={item.conteudo} className="text-sm leading-relaxed text-black/80" />
      </div>
      <footer className="flex items-center gap-2 border-t border-black/5 p-4">
        {erro && <span className="text-xs text-rose-600">{erro}</span>}
        <div className="flex-1" />
        <button
          disabled={ocupado}
          onClick={() => acao(async () => {
            await api(`/api/conhecimento/${item.id}`, "DELETE");
            aoFechar();
          })}
          className="rounded-lg px-3 py-2 text-xs text-rose-700 hover:bg-rose-50"
        >
          {item.aprovado ? "Excluir" : "Recusar"}
        </button>
        <button onClick={() => setEditando(true)} className="rounded-lg px-3 py-2 text-xs font-medium text-black/70 ring-1 ring-black/10 hover:bg-black/5">
          Editar
        </button>
        {!item.aprovado && (
          <button
            disabled={ocupado}
            onClick={() => acao(() => api(`/api/conhecimento/${item.id}/aprovar`, "POST"))}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
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
          className="min-h-72 flex-1 resize-none rounded-xl bg-black/[0.03] p-3 font-mono text-[13px] leading-relaxed outline-none ring-1 ring-black/10 focus:ring-2 focus:ring-[#1f2430]/30"
        />
      </div>
      <footer className="flex items-center gap-2 border-t border-black/5 p-4">
        {erro && <span className="text-xs text-rose-600">{erro}</span>}
        <div className="flex-1" />
        <button onClick={aoFechar} className="rounded-lg px-3 py-2 text-xs text-black/60 hover:bg-black/5">
          Cancelar
        </button>
        <button
          disabled={ocupado || !titulo.trim() || !conteudo.trim()}
          onClick={salvar}
          className="rounded-lg bg-[#1f2430] px-4 py-2 text-xs font-semibold text-white disabled:opacity-30"
        >
          {item ? "Salvar" : "Criar (já aprovado)"}
        </button>
      </footer>
    </>
  );
}
