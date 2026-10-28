import { useEffect, useState } from "react";
import { GraduationCap, Sparkles, X } from "lucide-react";
import type { EstadoProvedores } from "@empresa/shared";
import { agentesDe, escritorioAtivo } from "@empresa/org";
import { api } from "../../api.ts";
import { AreaTexto, Botao, BotaoIcone, Etiqueta, Indicador, Interruptor, Seletor, avisar, avisarErro, confirmar } from "../kit/index.ts";

// Qualidade → Aprendizado: a equipe melhora sozinha a partir do que você aprova e devolve.
// A/B de instruções (metade dos cards com as novas), escada de modelos por dificuldade e testes sombra
// (um modelo mais barato refaz cards já aprovados, sem mexer em nada, para sugerir economia).

interface Variante {
  id: number;
  agente: string;
  nome: string;
  texto: string;
  status: "base" | "testando" | "descartada";
  criadaEm: number;
  cards: number;
  dePrimeira: number;
  devolucoes: number;
}

interface Estado {
  localPrimeiro: string | null;
  sombraPct: number;
  abAutomatico: boolean;
  amostraAB: number;
  variantes: Variante[];
  sombras: Record<string, number>;
  ultimasSombras: { id: number; ts: number; card_id: number; nome: string; modelo_real: string; modelo_barato: string; resultado: string; justificativa: string }[];
  sugestoes: { agente: string; nome: string; modeloAtual: string; modeloBarato: string; amostras: number; empateOuMelhor: number }[];
}

const curto = (m: string) => m.replace("claude-", "").replace(/^ollama:/, "");
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
const STATUS: Record<Variante["status"], { rotulo: string; tom: "sucesso" | "alerta" | "neutro" }> = {
  base: { rotulo: "Em uso", tom: "sucesso" },
  testando: { rotulo: "Em teste", tom: "alerta" },
  descartada: { rotulo: "Descartada", tom: "neutro" },
};

export function Aprendizado() {
  const [e, setE] = useState<Estado | null>(null);
  const [locais, setLocais] = useState<{ id: string; nome: string }[]>([]);
  const [agente, setAgente] = useState("");
  const [texto, setTexto] = useState("");
  const [propondo, setPropondo] = useState(false);
  const agentes = agentesDe(escritorioAtivo());
  const carregar = () => void api<Estado>("/api/aprendizado").then(setE).catch(avisarErro);
  useEffect(() => {
    carregar();
    void api<EstadoProvedores>("/api/provedores")
      .then((p) => setLocais(p.ollama.modelos.map((m) => ({ id: m.id, nome: m.nome }))))
      .catch(() => setLocais([]));
  }, []);

  const salvar = async (corpo: Partial<Pick<Estado, "localPrimeiro" | "sombraPct" | "abAutomatico">>) => {
    try {
      setE(await api<Estado>("/api/aprendizado", "PUT", corpo));
    } catch (err) {
      avisarErro(err);
    }
  };

  const propor = async () => {
    if (!agente) return;
    setPropondo(true);
    try {
      await api(`/api/aprendizado/ab/${agente}`, "POST", texto.trim() ? { texto } : {});
      avisar(texto.trim() ? "A/B começou com as suas instruções" : "Instruções escritas a partir das devoluções; o A/B começou");
      setTexto("");
      carregar();
    } catch (err) {
      avisarErro(err);
    } finally {
      setPropondo(false);
    }
  };

  const encerrar = async (v: Variante) => {
    if (!(await confirmar({ titulo: `Encerrar o A/B de ${v.nome}?`, texto: "As instruções em teste são descartadas e ficam as de antes.", confirmar: "Encerrar", perigo: true }))) return;
    try {
      setE(await api<Estado>(`/api/aprendizado/ab/${v.agente}`, "DELETE"));
    } catch (err) {
      avisarErro(err);
    }
  };

  const aplicar = async (s: Estado["sugestoes"][number]) => {
    const ok = await confirmar({
      titulo: `${s.nome} passa a usar ${curto(s.modeloBarato)}?`,
      texto: `Nos testes sombra, ${curto(s.modeloBarato)} empatou ou ganhou em ${s.empateOuMelhor} de ${s.amostras} cards. Dá para voltar em Configurações → Modelos de IA.`,
      confirmar: "Trocar",
    });
    if (!ok) return;
    try {
      setE(await api<Estado>("/api/aprendizado/sugestao", "POST", { agente: s.agente, modelo: s.modeloBarato }));
      avisar("Modelo trocado");
    } catch (err) {
      avisarErro(err);
    }
  };

  if (!e) return null;
  const totalSombras = Object.values(e.sombras).reduce((s, n) => s + n, 0);
  return (
    <section className="space-y-4 rounded-panel bg-surface p-4 shadow-1">
      <div className="flex items-center gap-2">
        <GraduationCap className="size-4 text-fg-3" />
        <h3 className="text-corpo font-semibold text-fg">Aprendizado</h3>
      </div>
      <p className="text-pequeno text-fg-3">
        A equipe aprende com as suas devoluções: instruções novas entram em teste A/B ({e.amostraAB} cards de cada lado) e só ficam se forem aprovadas de primeira mais vezes.
      </p>

      <div className="grid gap-3 md:grid-cols-3">
        <Interruptor ativo={e.abAutomatico} onChange={(v) => void salvar({ abAutomatico: v })} rotulo="A/B automático" descricao="Uma vez por dia, para quem recebeu 5+ devoluções em 14 dias." />
        <Seletor
          rotulo="Modelo local primeiro"
          ajuda="Cards de código com testes começam no modelo local; sobem para Claude se falharem."
          tamanho="p"
          value={e.localPrimeiro ?? ""}
          onChange={(ev) => void salvar({ localPrimeiro: ev.target.value || null })}
        >
          <option value="">Desligado</option>
          {locais.map((m) => (
            <option key={m.id} value={m.id}>{m.nome}</option>
          ))}
          {e.localPrimeiro && !locais.some((m) => m.id === e.localPrimeiro) && <option value={e.localPrimeiro}>{curto(e.localPrimeiro)} (não encontrado)</option>}
        </Seletor>
        <Seletor
          rotulo="Testes sombra"
          ajuda="Parte dos cards aprovados (sem código) é refeita por um modelo mais barato, só para comparar."
          tamanho="p"
          value={String(e.sombraPct)}
          onChange={(ev) => void salvar({ sombraPct: Number(ev.target.value) })}
        >
          {[0, 5, 10, 20, 50].map((n) => (
            <option key={n} value={n}>{n === 0 ? "Desligado" : `${n}% dos cards`}</option>
          ))}
        </Seletor>
      </div>

      {e.sugestoes.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-pequeno font-semibold text-fg-2">Sugestões de economia</h4>
          {e.sugestoes.map((s) => (
            <div key={s.agente} className="flex flex-wrap items-center gap-2 rounded-control border border-line p-2">
              <Sparkles className="size-4 text-accent" />
              <span className="flex-1 text-pequeno text-fg">
                {s.nome}: {curto(s.modeloBarato)} empatou ou ganhou de {curto(s.modeloAtual)} em {s.empateOuMelhor}/{s.amostras} cards
              </span>
              <Botao tamanho="p" onClick={() => void aplicar(s)}>Aplicar</Botao>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Indicador rotulo="Testes sombra" valor={totalSombras} />
        <Indicador rotulo="Barato empatou ou ganhou" valor={pct((e.sombras.empate ?? 0) + (e.sombras.melhor ?? 0), totalSombras)} />
        <Indicador rotulo="A/B no ar" valor={e.variantes.filter((v) => v.status === "testando").length} />
      </div>

      {e.variantes.length > 0 && (
        <table className="w-full text-pequeno">
          <thead>
            <tr className="text-left text-legenda text-fg-3">
              <th className="py-1 font-medium">Agente</th>
              <th className="font-medium">Instruções</th>
              <th className="text-right font-medium">Cards</th>
              <th className="text-right font-medium">De primeira</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {e.variantes.map((v) => (
              <tr key={v.id} className="border-t border-line align-top">
                <td className="py-1.5 pr-2 text-fg">{v.nome}</td>
                <td className="pr-2">
                  <Etiqueta tom={STATUS[v.status].tom}>{STATUS[v.status].rotulo}</Etiqueta>
                  <p className="mt-1 line-clamp-3 whitespace-pre-line text-legenda text-fg-3" title={v.texto}>{v.texto || "(sem instruções extras)"}</p>
                </td>
                <td className="tabular text-right text-fg-2">{v.cards}</td>
                <td className="tabular text-right font-semibold text-fg">{pct(v.dePrimeira, v.cards)}</td>
                <td className="pl-1 text-right">
                  {v.status === "testando" && <BotaoIcone icone={X} rotulo="Encerrar o A/B" tamanho="p" onClick={() => void encerrar(v)} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="space-y-2 rounded-control border border-line p-3">
        <h4 className="text-pequeno font-semibold text-fg-2">Começar um A/B</h4>
        <Seletor tamanho="p" value={agente} onChange={(ev) => setAgente(ev.target.value)} aria-label="Agente">
          <option value="">Escolha o agente…</option>
          {agentes.map((a) => (
            <option key={a.id} value={a.id}>{a.nome} · {a.cargo}</option>
          ))}
        </Seletor>
        <AreaTexto rows={3} value={texto} onChange={(ev) => setTexto(ev.target.value)} placeholder="Deixe em branco para um modelo escrever as instruções a partir das devoluções que o agente recebeu." aria-label="Instruções candidatas" />
        <Botao tamanho="p" variante="principal" disabled={!agente} carregando={propondo} onClick={() => void propor()}>
          Começar A/B
        </Botao>
      </div>

      {e.ultimasSombras.length > 0 && (
        <details>
          <summary className="cursor-pointer text-pequeno text-fg-2">Últimos testes sombra</summary>
          <ul className="mt-2 space-y-1">
            {e.ultimasSombras.map((s) => (
              <li key={s.id} className="text-legenda text-fg-3">
                <Etiqueta tom={s.resultado === "pior" ? "perigo" : "sucesso"}>{s.resultado}</Etiqueta> {s.nome}: {curto(s.modelo_barato)} vs. {curto(s.modelo_real)} — {s.justificativa}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
