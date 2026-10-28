import { useEffect, useState } from "react";
import { Rocket } from "lucide-react";
import { api } from "../../api.ts";
import { Botao, Campo, CampoSegredo, avisar, avisarErro } from "../kit/index.ts";

// Operação → Projetos → Produção: liga o projeto à Vercel (prévia publicada por card) e ao Sentry (erros
// novos depois do merge viram bugs). Os tokens valem para todos os projetos e ficam cifrados no seu Mac.

interface Estado {
  vercel: { configurado: boolean; time: string | null };
  sentry: { configurado: boolean };
}
interface Vinculo {
  vercel: string | null;
  sentry: string | null;
}

export function ProducaoProjeto({ projetoId }: { projetoId: number }) {
  const [e, setE] = useState<Estado | null>(null);
  const [v, setV] = useState<Vinculo>({ vercel: null, sentry: null });
  const [tokens, setTokens] = useState({ vercel: "", sentry: "", time: "" });
  const [aberto, setAberto] = useState(false);
  useEffect(() => {
    void api<Estado>("/api/producao").then((x) => {
      setE(x);
      setTokens((t) => ({ ...t, time: x.vercel.time ?? "" }));
    }).catch(() => setE(null));
    void api<Vinculo>(`/api/projetos/${projetoId}/producao`).then(setV).catch(() => {});
  }, [projetoId]);
  if (!e) return null;
  const ligado = (v.vercel && e.vercel.configurado) || (v.sentry && e.sentry.configurado);

  const salvar = async () => {
    try {
      const corpo: Record<string, string> = { vercelTime: tokens.time };
      if (tokens.vercel.trim()) corpo.vercelToken = tokens.vercel;
      if (tokens.sentry.trim()) corpo.sentryToken = tokens.sentry;
      setE(await api<Estado>("/api/producao", "PUT", corpo));
      setV(await api<Vinculo>(`/api/projetos/${projetoId}/producao`, "PUT", { vercel: v.vercel || null, sentry: v.sentry || null }));
      setTokens((t) => ({ ...t, vercel: "", sentry: "" }));
      avisar("Produção ligada");
      setAberto(false);
    } catch (err) {
      avisarErro(err);
    }
  };

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5 text-pequeno font-medium text-fg">
        <Rocket className="size-4 text-fg-3" /> Produção (Vercel e Sentry)
        <span className="flex-1" />
        <Botao tamanho="p" variante="discreto" onClick={() => setAberto(!aberto)}>{aberto ? "Fechar" : ligado ? "Editar" : "Ligar"}</Botao>
      </div>
      {!aberto ? (
        <p className="text-pequeno text-fg-2">
          {v.vercel && e.vercel.configurado ? <>Vercel: <span className="font-mono">{v.vercel}</span>. </> : "Sem prévia publicada. "}
          {v.sentry && e.sentry.configurado ? <>Sentry: <span className="font-mono">{v.sentry}</span> (erros novos depois do merge viram bugs).</> : "Sem monitoramento de erros."}
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          <Campo tamanho="p" rotulo="Projeto na Vercel (id ou nome)" value={v.vercel ?? ""} onChange={(x) => setV({ ...v, vercel: x.target.value })} placeholder="prj_… ou meu-app" className="font-mono" />
          <Campo tamanho="p" rotulo="Projeto no Sentry (organização/projeto)" value={v.sentry ?? ""} onChange={(x) => setV({ ...v, sentry: x.target.value })} placeholder="minha-org/meu-app" className="font-mono" />
          <CampoSegredo rotulo="Token da Vercel" ajuda="Só leitura dos deploys basta. Vale para todos os projetos." configurado={e.vercel.configurado} valor={tokens.vercel} onChange={(x) => setTokens({ ...tokens, vercel: x })} placeholder="token da Vercel" />
          <CampoSegredo rotulo="Token do Sentry" ajuda="Escopo project:read (event:read). Vale para todos os projetos." configurado={e.sentry.configurado} valor={tokens.sentry} onChange={(x) => setTokens({ ...tokens, sentry: x })} placeholder="sntrys_…" />
          <Campo tamanho="p" rotulo="Time da Vercel (opcional)" value={tokens.time} onChange={(x) => setTokens({ ...tokens, time: x.target.value })} placeholder="team_…" className="font-mono" />
          <div className="flex items-end">
            <Botao tamanho="p" variante="principal" onClick={() => void salvar()}>Salvar</Botao>
          </div>
          <p className="text-legenda text-fg-3 md:col-span-2">A prévia publica a branch no GitHub (token do GitHub na seção de código do card) e a Vercel faz o deploy. Nada é publicado sem o seu clique.</p>
        </div>
      )}
    </div>
  );
}
