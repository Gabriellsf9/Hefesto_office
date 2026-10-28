import { useEffect, useState } from "react";
import { Cloud } from "lucide-react";
import { api } from "../../api.ts";
import { Botao, Campo, CampoSegredo, Interruptor, avisar, avisarErro } from "../kit/index.ts";
import { Bloco } from "./Configuracoes.tsx";

// Configurações → Permissões: sandbox na nuvem (opcional). Os comandos dos agentes rodam num executor
// remoto seu em vez da sandbox do Mac. Desligada por padrão: o código da cópia isolada sai do Mac.
// Há um executor pronto em scripts/executor-nuvem (Docker numa VM sua).

interface Estado {
  ativo: boolean;
  url: string | null;
  temToken: boolean;
}

export function SandboxNuvem() {
  const [e, setE] = useState<Estado | null>(null);
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [teste, setTeste] = useState<{ ok: boolean; detalhe: string } | null>(null);
  useEffect(() => void api<Estado>("/api/nuvem").then((x) => (setE(x), setUrl(x.url ?? ""))).catch(() => setE(null)), []);
  if (!e) return null;
  const salvar = async (corpo: Record<string, unknown>) => {
    try {
      const x = await api<Estado>("/api/nuvem", "PUT", corpo);
      setE(x);
      setToken("");
      avisar(x.ativo ? "Sandbox na nuvem ligada" : "Configuração salva");
    } catch (err) {
      avisarErro(err);
    }
  };
  return (
    <Bloco
      titulo={<span className="flex items-center gap-2"><Cloud className="size-5 text-fg-3" /> Sandbox na nuvem</span>}
      descricao="Opcional. Os testes, builds e lints dos agentes rodam num executor seu na nuvem em vez da sandbox do Mac. Há um pronto em scripts/executor-nuvem (Docker numa VM sua, atrás de HTTPS); o protocolo está no README. As mesmas regras valem: lista de programas, sem shell, tempo máximo. Os arquivos da cópia isolada saem do seu Mac."
    >
      <div className="grid gap-3 md:grid-cols-2">
        <Campo tamanho="p" rotulo="URL do executor" value={url} onChange={(x) => setUrl(x.target.value)} placeholder="https://executor.suaempresa.com" className="font-mono" />
        <CampoSegredo rotulo="Token" configurado={e.temToken} valor={token} onChange={setToken} placeholder="token do executor" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Botao tamanho="p" onClick={() => void salvar({ url, ...(token.trim() ? { token } : {}) })}>Salvar</Botao>
        <Botao
          tamanho="p"
          variante="discreto"
          disabled={!e.temToken || !e.url}
          onClick={() => void api<{ ok: boolean; detalhe: string }>("/api/nuvem/testar", "POST").then(setTeste).catch(avisarErro)}
        >
          Testar conexão
        </Botao>
        <Interruptor ativo={e.ativo} onChange={(v) => void salvar({ ativo: v, url, ...(token.trim() ? { token } : {}) })} rotulo="Usar a sandbox na nuvem" />
      </div>
      {teste && <p role="status" className={`text-pequeno ${teste.ok ? "text-success-fg" : "text-danger-fg"}`}>{teste.detalhe}</p>}
    </Bloco>
  );
}
