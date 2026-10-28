import { useEffect, useMemo, useState } from "react";
import { Activity, CheckCircle2, ShieldCheck, Database, DatabaseBackup, FolderGit2, Globe, LineChart, Plus, ScanSearch, Wallet, X, Sun, Cpu, FileText, FlaskConical } from "lucide-react";
import type { Card, Projeto } from "@empresa/shared";
import { agentById } from "@empresa/org";
import { useStore } from "../../store.ts";
import { api } from "../../api.ts";
import { navegar, useNav } from "../../nav.ts";
import { Abas, Botao, BotaoIcone, CabecalhoPagina, Campo, Etiqueta, EstadoVazio, Indicador, Pagina, Seletor, avisar, avisarErro, confirmar, cx } from "../kit/index.ts";
import { CalculadoraSimples, Monitoramento } from "../Operacao.tsx";
import { ChamadasIA, PainelHoje } from "./Hoje.tsx";
import { Qualidade } from "./Qualidade.tsx";
import { Auditoria } from "./Auditoria.tsx";
import { BotaoEscolherPasta } from "../SeletorDePastas.tsx";
import { Backup } from "./Configuracoes.tsx";
import { Avatarzinho, usd } from "../comum.tsx";

// Operação (DESIGN-INTERFACE.md §6.7): projetos e banco, monitoramento, finanças e backup.

type Sub = "hoje" | "projetos" | "chamadas" | "qualidade" | "auditoria" | "monitoramento" | "financas" | "backup";

export default function PaginaOperacao() {
  const rota = useNav((s) => s.rota);
  const sub = (["hoje", "projetos", "chamadas", "qualidade", "auditoria", "monitoramento", "financas", "backup"].includes(rota.sub ?? "") ? rota.sub : "hoje") as Sub;
  const monitores = useStore((s) => s.monitores);
  const fora = monitores.filter((m) => m.status === "fora").length;
  return (
    <Pagina largura="media">
      <CabecalhoPagina
        icone={LineChart}
        titulo="Operação"
        descricao="O dia da empresa, os projetos da sua máquina, cada chamada de IA, sites monitorados, custos e backup."
        abas={
          <Abas
            ativa={sub}
            onChange={(id) => navegar("operacao", id)}
            abas={[
              { id: "hoje", rotulo: "Hoje", icone: Sun },
              { id: "projetos", rotulo: "Projetos", icone: FolderGit2 },
              { id: "chamadas", rotulo: "Chamadas de IA", icone: Cpu },
              { id: "qualidade", rotulo: "Qualidade", icone: FlaskConical },
              { id: "auditoria", rotulo: "Auditoria", icone: ShieldCheck },
              { id: "monitoramento", rotulo: "Monitoramento", icone: Activity, contador: fora, alerta: true },
              { id: "financas", rotulo: "Finanças", icone: Wallet },
              { id: "backup", rotulo: "Backup", icone: DatabaseBackup },
            ]}
          />
        }
      />
      {sub === "hoje" && <PainelHoje />}
      {sub === "projetos" && <Projetos />}
      {sub === "chamadas" && <ChamadasIA />}
      {sub === "qualidade" && <Qualidade />}
      {sub === "auditoria" && <Auditoria />}
      {sub === "monitoramento" && <div className="rounded-panel bg-surface p-5 shadow-1"><Monitoramento /></div>}
      {sub === "financas" && <Financas />}
      {sub === "backup" && <Backup />}
    </Pagina>
  );
}

/* ---------- Projetos ---------- */

function Projetos() {
  const projetos = useStore((s) => s.projetos);
  const ativoId = useStore((s) => s.projetoAtivo);
  const [caminho, setCaminho] = useState("");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2 rounded-panel bg-surface p-4 shadow-1">
        <BotaoEscolherPasta />
        <span className="pb-2 text-pequeno text-fg-3">ou</span>
        <div className="min-w-[260px] flex-1">
          <Campo value={caminho} onChange={(e) => setCaminho(e.target.value)} placeholder="/Users/voce/projetos/meu-app" className="font-mono text-pequeno" />
        </div>
        <Botao
          icone={Plus}
          disabled={!caminho.trim()}
          onClick={async () => {
            try {
              await api("/api/projetos", "POST", { caminho });
              setCaminho("");
              avisar("Projeto adicionado");
            } catch (e) {
              avisarErro(e);
            }
          }}
        >
          Adicionar
        </Botao>
        <p className="w-full text-legenda text-fg-3">A empresa nunca mexe direto na sua pasta: cada trabalho acontece numa cópia isolada (git worktree) e só entra no projeto pelo merge que você aprovar.</p>
      </div>
      {projetos.length === 0 ? (
        <div className="rounded-panel bg-surface shadow-1">
          <EstadoVazio icone={FolderGit2} titulo="Nenhum projeto ainda" texto="Escolha a pasta de um app seu: o Arquiteto faz o raio-x e a equipe passa a trabalhar nele." />
        </div>
      ) : (
        projetos.map((p) => <ItemProjeto key={p.id} p={p} ativo={p.id === ativoId} />)
      )}
    </div>
  );
}

function ItemProjeto({ p, ativo }: { p: Projeto; ativo: boolean }) {
  const [url, setUrl] = useState(p.urlLocal ?? "");
  return (
    <div className={cx("rounded-panel bg-surface p-5 shadow-1", ativo && "shadow-[inset_0_0_0_1.5px_var(--accent)]")}>
      <div className="flex items-start gap-3">
        <FolderGit2 className="mt-0.5 size-5 shrink-0 text-fg-3" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-destaque font-semibold text-fg">{p.nome}</span>
            {ativo && <Etiqueta tom="acento">ativo</Etiqueta>}
            <Etiqueta>{p.git ? `git · ${p.branch ?? "sem branch"}` : "sem git"}</Etiqueta>
            {p.sinais.map((s) => <Etiqueta key={s}>{s}</Etiqueta>)}
          </div>
          <div className="mt-0.5 truncate font-mono text-legenda text-fg-3">{p.caminho}</div>
        </div>
        {!ativo && <Botao tamanho="p" onClick={() => void api("/api/projetos/ativo", "PUT", { id: p.id }).catch(avisarErro)}>Tornar ativo</Botao>}
        {ativo && <Botao tamanho="p" variante="discreto" onClick={() => void api("/api/projetos/ativo", "PUT", { id: null }).catch(avisarErro)}>Desativar</Botao>}
        <BotaoIcone
          icone={X}
          rotulo="Remover da lista"
          tamanho="p"
          onClick={async () => {
            if (await confirmar({ titulo: `Remover "${p.nome}" da lista?`, texto: "A pasta no seu Mac não é apagada.", confirmar: "Remover", perigo: true })) await api(`/api/projetos/${p.id}`, "DELETE").catch(avisarErro);
          }}
        />
      </div>
      <div className="mt-4 grid gap-4 border-t border-line pt-4 md:grid-cols-2">
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-pequeno font-medium text-fg"><ScanSearch className="size-4 text-fg-3" /> Ficha do Projeto</div>
          {p.ficha ? (
            <p className="flex items-center gap-1.5 text-pequeno text-success-fg"><CheckCircle2 className="size-4" /> Pronta e aprovada</p>
          ) : (
            <Botao
              tamanho="p"
              onClick={async () => {
                try {
                  const card = await api<Card>(`/api/projetos/${p.id}/raio-x`, "POST");
                  useStore.getState().abrirCard(card.id);
                } catch (e) {
                  avisarErro(e);
                }
              }}
            >
              Fazer raio-x do projeto
            </Botao>
          )}
          <Botao
            tamanho="p"
            variante="discreto"
            icone={FileText}
            className="mt-2"
            onClick={() =>
              void api<{ url: string }>(`/api/projetos/${p.id}/relatorio-cliente`, "POST", {})
                .then((r) => {
                  window.open(r.url, "_blank");
                  avisar("Relatório gerado (PDF)");
                })
                .catch(avisarErro)
            }
          >
            Relatório para cliente (PDF)
          </Botao>
        </div>
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-pequeno font-medium text-fg"><Globe className="size-4 text-fg-3" /> Onde o app roda</div>
          <div className="flex gap-2">
            <Campo tamanho="p" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://localhost:3000" className="font-mono" />
            {url !== (p.urlLocal ?? "") && <Botao tamanho="p" onClick={() => void api(`/api/projetos/${p.id}/url-local`, "PUT", { urlLocal: url || null }).then(() => avisar("Endereço salvo")).catch(avisarErro)}>Salvar</Botao>}
          </div>
          <p className="mt-1 text-legenda text-fg-3">Para os prints do Treinamento e os testes de tela do QA.</p>
        </div>
        <div className="md:col-span-2">
          <BancoDoProjeto p={p} />
        </div>
      </div>
    </div>
  );
}

function BancoDoProjeto({ p }: { p: Projeto }) {
  const [atual, setAtual] = useState<{ tipo: string; resumo: string } | null | undefined>(undefined);
  const [editando, setEditando] = useState(false);
  const [tipo, setTipo] = useState<"sqlite" | "postgres">("postgres");
  const [valor, setValor] = useState("");
  useEffect(() => {
    void api<{ tipo: string; resumo: string } | { semBanco: true }>(`/api/projetos/${p.id}/banco`).then((r) => setAtual("semBanco" in r ? null : r)).catch(() => setAtual(null));
  }, [p.id]);
  if (atual === undefined) return null;
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5 text-pequeno font-medium text-fg"><Database className="size-4 text-fg-3" /> Banco para o time de Dados</div>
      {!editando ? (
        <div className="flex items-center gap-2 text-pequeno text-fg-2">
          <span className="flex-1">{atual ? <span className="font-mono">{atual.resumo}</span> : "Nenhum banco configurado."}</span>
          <Botao tamanho="p" onClick={() => setEditando(true)}>{atual ? "Trocar" : "Configurar"}</Botao>
          {atual && <Botao tamanho="p" variante="discreto" onClick={async () => { await api(`/api/projetos/${p.id}/banco`, "DELETE").catch(avisarErro); setAtual(null); }}>Remover</Botao>}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <Seletor tamanho="p" value={tipo} onChange={(e) => setTipo(e.target.value as "sqlite" | "postgres")}>
              <option value="postgres">Postgres</option>
              <option value="sqlite">SQLite</option>
            </Seletor>
            <Campo tamanho="p" type={tipo === "postgres" ? "password" : "text"} value={valor} onChange={(e) => setValor(e.target.value)} placeholder={tipo === "postgres" ? "postgres://usuario:senha@host:5432/banco" : "dados/app.db (dentro do projeto)"} className="font-mono" />
            <Botao
              tamanho="p"
              variante="principal"
              disabled={!valor.trim()}
              onClick={async () => {
                try {
                  setAtual(await api(`/api/projetos/${p.id}/banco`, "PUT", tipo === "postgres" ? { tipo, url: valor } : { tipo, caminho: valor }));
                  setEditando(false);
                  setValor("");
                } catch (e) {
                  avisarErro(e);
                }
              }}
            >
              Salvar
            </Botao>
            <Botao tamanho="p" variante="discreto" onClick={() => setEditando(false)}>Cancelar</Botao>
          </div>
          <p className="text-legenda text-fg-3">Só leitura (SELECT), com dados pessoais mascarados. Os resultados vão para a IA: prefira um banco de homologação ou um usuário só de leitura. A URL fica cifrada.</p>
        </div>
      )}
    </div>
  );
}

/* ---------- Finanças ---------- */

interface Indicadores { custoHojeUsd: number; custo7dUsd: number; custoMesUsd: number }

function Financas() {
  const cards = useStore((s) => s.cards);
  const [ind, setInd] = useState<Indicadores | null>(null);
  useEffect(() => void api<Indicadores>("/api/indicadores").then(setInd).catch(() => setInd(null)), []);
  const reais = useMemo(() => Object.values(cards).filter((c) => !c.demo && c.custoUsd > 0), [cards]);
  const porAgente = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of reais) if (c.dono) m.set(c.dono, (m.get(c.dono) ?? 0) + c.custoUsd);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [reais]);
  const caros = [...reais].sort((a, b) => b.custoUsd - a.custoUsd).slice(0, 8);
  const max = porAgente[0]?.[1] ?? 1;
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Indicador rotulo="Custo de IA hoje" valor={ind ? usd(ind.custoHojeUsd) : "—"} />
        <Indicador rotulo="Últimos 7 dias" valor={ind ? usd(ind.custo7dUsd) : "—"} />
        <Indicador rotulo="Este mês" valor={ind ? usd(ind.custoMesUsd) : "—"} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-panel bg-surface p-5 shadow-1">
          <h3 className="mb-3 text-destaque font-semibold text-fg">Quem mais gastou</h3>
          {porAgente.length === 0 ? (
            <p className="text-pequeno text-fg-3">Sem gastos ainda.</p>
          ) : (
            <ul className="space-y-2.5">
              {porAgente.map(([id, v]) => {
                const a = agentById[id];
                return (
                  <li key={id} className="flex items-center gap-3 text-pequeno">
                    {a && <Avatarzinho agent={a} tamanho={24} />}
                    <span className="w-24 shrink-0 truncate text-fg">{a?.nome ?? id}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-sunken"><span className="block h-full rounded-full bg-accent" style={{ width: `${Math.max(4, (v / max) * 100)}%` }} /></span>
                    <span className="tabular w-16 text-right text-fg-2">{usd(v)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <section className="rounded-panel bg-surface p-5 shadow-1">
          <h3 className="mb-3 text-destaque font-semibold text-fg">Cards mais caros</h3>
          {caros.length === 0 ? (
            <p className="text-pequeno text-fg-3">Sem gastos ainda.</p>
          ) : (
            <ul className="divide-y divide-line">
              {caros.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => useStore.getState().abrirCard(c.id)} className="flex w-full items-center gap-3 py-2 text-left text-pequeno hover:text-accent-fg">
                    <span className="tabular w-16 shrink-0 text-fg-3">{c.chave}</span>
                    <span className="min-w-0 flex-1 truncate text-fg">{c.titulo}</span>
                    <span className="tabular text-fg-2">{usd(c.custoUsd)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <section className="rounded-panel bg-surface p-5 shadow-1">
        <CalculadoraSimples />
      </section>
    </div>
  );
}
