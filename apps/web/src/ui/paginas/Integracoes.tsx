import { useEffect, useState } from "react";
import { ArrowRight, CircleCheck, CircleDashed, CircleAlert, RefreshCw } from "lucide-react";
import { api } from "../../api.ts";
import { navegar, type Area } from "../../nav.ts";
import { Botao, CampoSegredo, Etiqueta, avisar, avisarErro, cx } from "../kit/index.ts";

// Configurações → Integrações: tudo o que se liga por fora num lugar só (o que está ligado, o que falta,
// o que cada uma destrava e onde configurar). O token do GitHub, que não tinha lugar fixo, fica aqui.

interface Integracao {
  id: string;
  nome: string;
  estado: "ok" | "atencao" | "desligado";
  detalhe: string;
  para: string;
  onde: { area: Area; sub?: string };
  essencial?: boolean;
}

const ICONE = { ok: CircleCheck, atencao: CircleAlert, desligado: CircleDashed };
const COR = { ok: "text-success-fg", atencao: "text-warning-fg", desligado: "text-fg-3" };

export function Integracoes() {
  const [lista, setLista] = useState<Integracao[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [token, setToken] = useState("");
  const carregar = async () => {
    setCarregando(true);
    try {
      setLista(await api<Integracao[]>("/api/integracoes"));
    } catch (e) {
      avisarErro(e);
    } finally {
      setCarregando(false);
    }
  };
  useEffect(() => void carregar(), []);
  if (!lista) return <p className="text-pequeno text-fg-3">Carregando…</p>;

  const ligadas = lista.filter((i) => i.estado === "ok").length;
  const github = lista.find((i) => i.id === "github");
  const salvarGithub = async (t: string | null) => {
    try {
      await api("/api/github", "PUT", { token: t });
      setToken("");
      avisar(t ? "GitHub conectado" : "Token do GitHub removido");
      await carregar();
    } catch (e) {
      avisarErro(e);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <p className="flex-1 text-pequeno text-fg-2">{ligadas} de {lista.length} ligadas. Só a chave do Claude é obrigatória; o resto destrava recursos a mais. Os tokens ficam cifrados neste Mac.</p>
        <Botao tamanho="p" variante="discreto" icone={RefreshCw} disabled={carregando} onClick={() => void carregar()}>Atualizar</Botao>
      </div>
      <ul className="divide-y divide-line rounded-panel bg-surface shadow-1">
        {lista.map((i) => {
          const Icone = ICONE[i.estado];
          return (
            <li key={i.id} className="flex items-start gap-3 px-4 py-3">
              <Icone className={cx("mt-0.5 size-5 shrink-0", COR[i.estado])} strokeWidth={1.75} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-corpo font-medium text-fg">{i.nome}</span>
                  {i.essencial && <Etiqueta tom="acento">obrigatória</Etiqueta>}
                  <Etiqueta tom={i.estado === "ok" ? "sucesso" : i.estado === "atencao" ? "alerta" : "neutro"}>{i.estado === "ok" ? "ligada" : i.estado === "atencao" ? "atenção" : "desligada"}</Etiqueta>
                </div>
                <p className="mt-0.5 text-pequeno text-fg-2">{i.detalhe}</p>
                <p className="text-legenda text-fg-3">{i.para}</p>
              </div>
              {!(i.onde.area === "config" && i.onde.sub === "integracoes") && (
                <Botao tamanho="p" variante="discreto" onClick={() => navegar(i.onde.area, i.onde.sub ?? null)}>
                  Configurar <ArrowRight className="size-3.5" />
                </Botao>
              )}
            </li>
          );
        })}
      </ul>
      {github && (
        <section className="rounded-panel bg-surface p-5 shadow-1">
          <h3 className="text-destaque font-semibold text-fg">GitHub</h3>
          <div className="mt-3 max-w-md space-y-2">
            <div>
              <CampoSegredo
                rotulo="Token do GitHub"
                ajuda="Fine-grained, só no repositório do projeto, com Contents e Pull requests (leitura e escrita). Nada é publicado sem o seu clique."
                configurado={github.estado === "ok"}
                valor={token}
                onChange={setToken}
                placeholder="github_pat_…"
              />
            </div>
            <div className="flex gap-2">
              <Botao tamanho="p" variante="principal" disabled={!token.trim()} onClick={() => void salvarGithub(token.trim())}>Salvar</Botao>
              {github.estado === "ok" && <Botao tamanho="p" variante="discreto" onClick={() => void salvarGithub(null)}>Remover</Botao>}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
