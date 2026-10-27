import { useEffect, useState } from "react";
import { api } from "../api.ts";

// Backup dos dados da empresa (menu ⋯): uma cópia por dia numa pasta fora do projeto.

interface Estado {
  ativo: boolean;
  pasta: string;
  manter: number;
  ultimo: { quando: number; pasta: string; tamanhoMb: number } | null;
  erro: string | null;
  total: number;
}

export function ConfigBackup() {
  const [e, setE] = useState<Estado | null>(null);
  const [pasta, setPasta] = useState("");
  const [fazendo, setFazendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    void api<Estado>("/api/backup").then((x) => {
      setE(x);
      setPasta(x.pasta);
    });
  }, []);
  if (!e) return null;
  const salvar = async (d: Partial<Estado>) => {
    try {
      setErro(null);
      const x = await api<Estado>("/api/backup", "PUT", d);
      setE(x);
      setPasta(x.pasta);
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
    }
  };
  const agora = async () => {
    setFazendo(true);
    try {
      setE(await api<Estado>("/api/backup/agora", "POST"));
    } finally {
      setFazendo(false);
    }
  };
  return (
    <div className="space-y-1.5 rounded-xl bg-black/[0.03] p-2.5 text-[11px] text-black/65">
      <div className="font-semibold text-black/80">Backup dos dados</div>
      <label className="flex items-start gap-2">
        <input type="checkbox" checked={e.ativo} onChange={(ev) => void salvar({ ativo: ev.target.checked })} className="mt-0.5" />
        <span>Uma cópia por dia (cards, Livro, conhecimento, leads, chat e prints), guardando as últimas {e.manter}</span>
      </label>
      <div>Pasta (de preferência no iCloud Drive ou num disco externo):</div>
      <div className="flex gap-1">
        <input value={pasta} onChange={(ev) => setPasta(ev.target.value)} className="min-w-0 flex-1 rounded-lg bg-white px-2 py-1 font-mono text-[10px] ring-1 ring-black/10" />
        {pasta !== e.pasta && (
          <button onClick={() => void salvar({ pasta })} className="rounded-lg px-2 text-[10px] font-semibold ring-1 ring-black/10 hover:bg-black/5">
            Salvar
          </button>
        )}
      </div>
      <div>
        {e.ultimo ? `Último: ${new Date(e.ultimo.quando).toLocaleString("pt-BR")} · ${e.ultimo.tamanhoMb} MB · ${e.total} guardado(s)` : "Nenhum backup ainda."}
      </div>
      {(e.erro || erro) && <div className="text-rose-700">{erro ?? `Falhou: ${e.erro}`}</div>}
      <button onClick={() => void agora()} disabled={fazendo} className="rounded-lg px-2 py-1 text-[10px] font-semibold ring-1 ring-black/10 hover:bg-black/5 disabled:opacity-50">
        {fazendo ? "Fazendo backup…" : "Fazer backup agora"}
      </button>
      <div className="text-black/45">A chave mestra não vai junto: segredos ficam ilegíveis na cópia. Ao restaurar em outro Mac, cadastre de novo a chave da API e os conectores.</div>
    </div>
  );
}
