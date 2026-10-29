import { useEffect, useState } from "react";
import { ArrowUpRight, Bot, CircleCheck, CornerUpLeft, GitMerge, Hand, MessageSquare, Undo2, Wallet, Zap } from "lucide-react";
import { agentById } from "@empresa/org";
import { useStore } from "../../store.ts";
import { api } from "../../api.ts";
import { Botao, EstadoVazio, Etiqueta, Interruptor, Seletor, avisar, avisarErro, confirmar, cx } from "../kit/index.ts";

// Operação → Piloto automático: com o modo ligado, o CTO (técnico) e a Helena (o resto) decidem no seu lugar o que é
// interno; o que é irreversível ou arriscado continua com você. Cada decisão aparece aqui, no card e na auditoria.

type Config = NonNullable<ReturnType<typeof useStore.getState>["autonomia"]>;
interface Decisao {
  id: number;
  ts: number;
  cardId: number | null;
  chave: string | null;
  tipo: "aprovar" | "devolver" | "responder" | "liberar" | "merge" | "acao" | "escalar";
  decisor: string;
  motivo: string;
  desfeita: boolean;
}

const TIPO: Record<Decisao["tipo"], { rotulo: string; icone: typeof Bot; tom: "sucesso" | "alerta" | "info" | "neutro" | "acento" }> = {
  aprovar: { rotulo: "aprovou", icone: CircleCheck, tom: "sucesso" },
  devolver: { rotulo: "devolveu", icone: CornerUpLeft, tom: "alerta" },
  responder: { rotulo: "respondeu", icone: MessageSquare, tom: "info" },
  liberar: { rotulo: "liberou gasto", icone: Wallet, tom: "neutro" },
  merge: { rotulo: "fez o merge", icone: GitMerge, tom: "acento" },
  acao: { rotulo: "aprovou ação", icone: Zap, tom: "neutro" },
  escalar: { rotulo: "deixou para você", icone: Hand, tom: "alerta" },
};

const SEMPRE_COM_VOCE = [
  "Cards P0 e N3, e os marcados com a etiqueta so-ceo",
  "Dados pessoais (LGPD) e aviso de licença no código",
  "Orçamento do dia e do projeto (só você muda)",
  "Push, pull request, prévia na Vercel e produção",
  "WhatsApp, contato com leads e publicação",
  "Conector que envia, publica, paga ou apaga; controle do Mac; comandos sensíveis",
];

export function PilotoAutomatico() {
  const c = useStore((s) => s.autonomia);
  const [decisoes, setDecisoes] = useState<Decisao[] | null>(null);
  const carregar = () => void api<Decisao[]>("/api/autonomia/decisoes").then(setDecisoes).catch(avisarErro);
  useEffect(() => {
    void api<Config>("/api/autonomia").then((x) => useStore.setState({ autonomia: x })).catch(avisarErro);
    carregar();
    const t = setInterval(carregar, 15_000);
    return () => clearInterval(t);
  }, []);
  if (!c) return null;

  const salvar = (d: Partial<Config>) => void api<Config>("/api/autonomia", "PUT", d).then((x) => useStore.setState({ autonomia: x })).catch(avisarErro);
  const ligar = async (v: boolean) => {
    if (v && !(await confirmar({ titulo: "Ligar o piloto automático?", texto: "O CTO e a Helena passam a aprovar entregas, responder os agentes, liberar gasto de IA e fazer o merge local no seu lugar. O que é irreversível ou arriscado continua com você.", confirmar: "Ligar" }))) return;
    salvar({ ativo: v });
    avisar(v ? "Piloto automático ligado" : "Piloto automático desligado");
  };
  const semRevisao = async (v: boolean) => {
    if (v && !(await confirmar({ titulo: "Aprovar e liberar tudo sem revisão?", texto: "Tudo o que chegar para você será aprovado na hora, e os cards parados no limite de gasto voltam a gastar (o orçamento do dia continua valendo). Você pode reabrir qualquer aprovação por 24 h.", confirmar: "Ligar" }))) return;
    salvar({ aprovarSemRevisao: v });
  };
  const reabrir = async (d: Decisao) => {
    try {
      await api(`/api/autonomia/decisoes/${d.id}/desfazer`, "POST");
      avisar(`${d.chave} voltou para a sua aprovação`);
      carregar();
    } catch (e) {
      avisarErro(e);
    }
  };
  const hoje = (decisoes ?? []).filter((d) => Date.now() - d.ts < 24 * 3600_000 && !d.desfeita);
  const conta = (t: Decisao["tipo"]) => hoje.filter((d) => d.tipo === t).length;

  return (
    <div className="space-y-6">
      <section className={cx("rounded-panel p-5 shadow-1", c.ativo ? "bg-accent-soft" : "bg-surface")}>
        <div className="flex items-start gap-3">
          <Bot className={cx("mt-0.5 size-6 shrink-0", c.ativo ? "text-accent-fg" : "text-fg-3")} strokeWidth={1.75} />
          <div className="min-w-0 flex-1">
            <h3 className="text-destaque font-semibold text-fg">Piloto automático</h3>
            <p className="mt-1 text-pequeno text-fg-2">
              O CTO decide o que é técnico e a Helena, o resto. Ninguém decide sobre o próprio trabalho. Cada decisão fica no card e na auditoria, e às 20h chega um resumo no Telegram. O que ele não puder decidir chega para você como "deixou para você".
            </p>
          </div>
          <Interruptor ativo={c.ativo} onChange={(v) => void ligar(v)} rotulo={<span className="sr-only">Piloto automático</span>} />
        </div>
        {c.ativo && (
          <div className="mt-4 flex flex-wrap gap-2 text-pequeno">
            <Etiqueta tom="sucesso">{conta("aprovar")} aprovado(s)</Etiqueta>
            <Etiqueta tom="alerta">{conta("devolver")} devolvido(s)</Etiqueta>
            <Etiqueta tom="info">{conta("responder")} resposta(s)</Etiqueta>
            <Etiqueta>{conta("liberar")} liberação(ões)</Etiqueta>
            <Etiqueta tom="acento">{conta("merge")} merge(s)</Etiqueta>
            <Etiqueta tom="alerta">{conta("escalar")} com você</Etiqueta>
            <span className="text-legenda text-fg-3">nas últimas 24 h</span>
          </div>
        )}
      </section>

      <section className={cx("rounded-panel p-5 shadow-1", c.aprovarSemRevisao ? "bg-warning-soft" : "bg-surface")}>
        <Interruptor
          ativo={c.aprovarSemRevisao}
          onChange={(v) => void semRevisao(v)}
          rotulo="Aprovar e liberar sem revisão"
          descricao="Regra sua, sem IA: aprova tudo o que chega para você e libera todo card parado no limite de gasto. Só os cards marcados so-ceo ficam com você. Não faz merge na sua pasta. Cada decisão aparece abaixo, com Reabrir para mim por 24 h."
        />
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-panel bg-surface p-5 shadow-1">
          <h3 className="text-corpo font-semibold text-fg">O que ele também faz</h3>
          <div className="mt-3 space-y-3">
            <Interruptor ativo={c.mergeLocal} onChange={(v) => salvar({ mergeLocal: v })} rotulo="Merge na pasta local" descricao="Dos cards de código que ele aprovou, com os testes verdes. Reversível com git revert." />
            <Interruptor ativo={c.conectores} onChange={(v) => salvar({ conectores: v })} rotulo="Ações de conectores" descricao="Criar e atualizar (issue, página, tarefa). Enviar, publicar, pagar e apagar continuam com você." />
            <Interruptor ativo={c.terminal} onChange={(v) => salvar({ terminal: v })} rotulo="Comandos de teste no terminal" descricao="Testes, build, lint e git só de leitura, sem encadear. Só no Mac (no Docker não há terminal)." />
            <label className="flex items-center gap-3 text-pequeno text-fg">
              <span className="flex-1">Liberar gasto de IA por card</span>
              <Seletor tamanho="p" aria-label="Liberar gasto de IA por card" value={String(c.liberarAteLimites)} onChange={(e) => salvar({ liberarAteLimites: Number(e.target.value) })}>
                <option value="0">Sem limite por card</option>
                <option value="1">Até 1 limite a mais</option>
                <option value="2">Até 2 limites a mais</option>
                <option value="3">Até 3 limites a mais</option>
              </Seletor>
            </label>
          </div>
        </section>
        <section className="rounded-panel bg-surface p-5 shadow-1">
          <h3 className="text-corpo font-semibold text-fg">Sempre com você</h3>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-pequeno text-fg-2">
            {SEMPRE_COM_VOCE.map((t) => <li key={t}>{t}</li>)}
          </ul>
        </section>
      </div>

      <section className="rounded-panel bg-surface shadow-1">
        <h3 className="px-5 pt-4 text-corpo font-semibold text-fg">Decisões</h3>
        {!decisoes?.length ? (
          <div className="p-5"><EstadoVazio icone={Bot} titulo="Nenhuma decisão ainda" texto={c.ativo ? "As próximas aprovações, perguntas e limites aparecem aqui." : "Ligue o piloto para ele começar a decidir."} /></div>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {decisoes.map((d) => {
              const t = TIPO[d.tipo];
              const podeReabrir = d.tipo === "aprovar" && !d.desfeita && Date.now() - d.ts < 24 * 3600_000;
              return (
                <li key={d.id} className={cx("flex items-start gap-3 px-5 py-3", d.desfeita && "opacity-60")}>
                  <t.icone className="mt-0.5 size-4 shrink-0 text-fg-3" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-pequeno">
                      <span className="font-medium text-fg">{agentById[d.decisor]?.nome ?? (d.decisor === "regra-do-ceo" ? "Sua regra" : d.decisor)}</span>
                      <Etiqueta tom={t.tom}>{t.rotulo}</Etiqueta>
                      {d.chave && d.cardId !== null && (
                        <button type="button" className="inline-flex min-h-alvo items-center gap-0.5 font-mono text-accent-fg hover:underline" onClick={() => useStore.getState().abrirCard(d.cardId!)}>
                          {d.chave} <ArrowUpRight className="size-3" />
                        </button>
                      )}
                      {d.desfeita && <Etiqueta>reaberto</Etiqueta>}
                      <span className="text-legenda text-fg-3">{new Date(d.ts).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
                    </div>
                    <p className="mt-0.5 text-pequeno text-fg-2">{d.motivo}</p>
                  </div>
                  {podeReabrir && <Botao tamanho="p" variante="discreto" icone={Undo2} onClick={() => void reabrir(d)}>Reabrir para mim</Botao>}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
