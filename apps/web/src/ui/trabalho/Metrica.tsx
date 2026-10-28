import { useEffect, useState } from "react";
import { Target } from "lucide-react";
import type { Card } from "@empresa/shared";
import { api } from "../../api.ts";
import { Botao, Campo, Etiqueta, avisar, avisarErro } from "../kit/index.ts";

// Métrica de sucesso do card: o que deve mudar no negócio, o alvo e em quantos dias medir depois da entrega.
// No prazo, o Hefesto pergunta o resultado (chat e card); você registra aqui.

interface Metrica {
  nome: string;
  alvo: string;
  comoMedir: string;
  prazoDias: number;
  medirEm: number | null;
  resultado: string | null;
  atingiu: boolean | null;
}

export function MetricaDoCard({ card }: { card: Card }) {
  const [m, setM] = useState<Metrica | null | undefined>(undefined);
  const [editando, setEditando] = useState(false);
  const [f, setF] = useState({ nome: "", alvo: "", comoMedir: "", prazoDias: "14" });
  const [resultado, setResultado] = useState("");
  useEffect(() => void api<Metrica | { semMetrica: true }>(`/api/cards/${card.id}/metrica`).then((r) => setM("semMetrica" in r ? null : r)).catch(() => setM(null)), [card.id]);
  if (m === undefined) return null;

  const salvar = async () => {
    try {
      const r = await api<Metrica>(`/api/cards/${card.id}/metrica`, "PUT", { ...f, prazoDias: Number(f.prazoDias) });
      setM(r);
      setEditando(false);
      avisar("Métrica salva");
    } catch (e) {
      avisarErro(e);
    }
  };
  const registrar = async (atingiu?: boolean) => {
    try {
      setM(await api<Metrica>(`/api/cards/${card.id}/metrica/resultado`, "POST", { resultado, ...(atingiu === undefined ? {} : { atingiu }) }));
      setResultado("");
    } catch (e) {
      avisarErro(e);
    }
  };

  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <h3 className="flex flex-1 items-center gap-1.5 text-pequeno font-semibold text-fg"><Target className="size-4 text-fg-3" /> Métrica de sucesso</h3>
        {!editando && (
          <Botao
            tamanho="p"
            variante="discreto"
            onClick={() => {
              setF(m ? { nome: m.nome, alvo: m.alvo, comoMedir: m.comoMedir, prazoDias: String(m.prazoDias) } : { nome: "", alvo: "", comoMedir: "", prazoDias: "14" });
              setEditando(true);
            }}
          >
            {m ? "Editar" : "Definir"}
          </Botao>
        )}
      </div>
      {editando ? (
        <div className="grid gap-2 rounded-card bg-surface p-3 shadow-1 sm:grid-cols-2">
          <Campo tamanho="p" rotulo="O que medir" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="Conversão do checkout" />
          <Campo tamanho="p" rotulo="Alvo" value={f.alvo} onChange={(e) => setF({ ...f, alvo: e.target.value })} placeholder="≥ 3,5%" />
          <Campo tamanho="p" rotulo="Como medir" value={f.comoMedir} onChange={(e) => setF({ ...f, comoMedir: e.target.value })} placeholder="Painel do analytics, últimos 7 dias" />
          <Campo tamanho="p" rotulo="Medir quantos dias depois da entrega" inputMode="numeric" value={f.prazoDias} onChange={(e) => setF({ ...f, prazoDias: e.target.value })} />
          <div className="flex gap-2 sm:col-span-2">
            <Botao tamanho="p" variante="principal" disabled={!f.nome.trim() || !f.alvo.trim()} onClick={() => void salvar()}>Salvar</Botao>
            <Botao tamanho="p" variante="discreto" onClick={() => setEditando(false)}>Cancelar</Botao>
            {m && <Botao tamanho="p" variante="discreto" onClick={() => void api(`/api/cards/${card.id}/metrica`, "DELETE").then(() => (setM(null), setEditando(false))).catch(avisarErro)}>Remover</Botao>}
          </div>
        </div>
      ) : !m ? (
        <p className="text-pequeno text-fg-3">Sem métrica. Defina o que deve mudar no negócio para saber, depois, se este card valeu a pena.</p>
      ) : (
        <div className="rounded-card bg-surface p-3 text-pequeno shadow-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-fg">{m.nome}</span>
            <Etiqueta>alvo {m.alvo}</Etiqueta>
            {m.resultado ? (
              <Etiqueta tom={m.atingiu === null ? "neutro" : m.atingiu ? "sucesso" : "perigo"}>resultado {m.resultado}</Etiqueta>
            ) : (
              <span className="text-legenda text-fg-3">{m.medirEm ? `medir em ${new Date(m.medirEm).toLocaleDateString("pt-BR")}` : `medir ${m.prazoDias} dia(s) depois da entrega`}</span>
            )}
          </div>
          {m.comoMedir && <p className="mt-1 text-legenda text-fg-3">{m.comoMedir}</p>}
          {!m.resultado && (
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <div className="w-44"><Campo tamanho="p" value={resultado} onChange={(e) => setResultado(e.target.value)} placeholder="Resultado medido" aria-label="Resultado medido" /></div>
              <Botao tamanho="p" disabled={!resultado.trim()} onClick={() => void registrar()}>Registrar</Botao>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
