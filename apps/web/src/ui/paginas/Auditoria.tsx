import { useEffect, useState } from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { agentById } from "@empresa/org";
import { api } from "../../api.ts";
import { Botao, EstadoVazio, Etiqueta, avisarErro } from "../kit/index.ts";

// Operação → Auditoria: quem fez o quê e quando (você pela tela e os agentes nos cards). Cada registro
// leva o hash do anterior: se alguém mexer no histórico, a corrente quebra e a verificação mostra onde.

interface Registro {
  id: number;
  ts: number;
  ator: string;
  acao: string;
  alvo: string | null;
  detalhe: string | null;
  hash: string;
}
interface Resposta {
  registros: Registro[];
  verificacao: { ok: boolean; registros: number; quebraEm: number | null; motivo: string | null };
}

const nomeDe = (ator: string) => (ator === "voce" ? "Você" : ator === "hefesto" ? "Hefesto" : agentById[ator]?.nome ?? ator);

export function Auditoria() {
  const [r, setR] = useState<Resposta | null>(null);
  const [ator, setAtor] = useState<"" | "voce" | "agentes">("");
  const [mais, setMais] = useState(false);
  const carregar = (antesDe?: number) =>
    void api<Resposta>(`/api/auditoria?limite=100${ator === "voce" ? "&ator=voce" : ""}${antesDe ? `&antesDe=${antesDe}` : ""}`)
      .then((n) => {
        setMais(n.registros.length === 100);
        setR((v) => (antesDe && v ? { ...n, registros: [...v.registros, ...n.registros] } : n));
      })
      .catch(avisarErro);
  useEffect(() => carregar(), [ator]);
  if (!r) return null;
  const lista = ator === "agentes" ? r.registros.filter((x) => x.ator !== "voce") : r.registros;
  const v = r.verificacao;
  return (
    <div className="space-y-4">
      <div className={`flex items-center gap-3 rounded-panel p-4 shadow-1 ${v.ok ? "bg-surface" : "bg-danger-soft"}`}>
        {v.ok ? <ShieldCheck className="size-5 text-success" /> : <ShieldAlert className="size-5 text-danger" />}
        <div className="flex-1 text-pequeno">
          <div className="font-semibold text-fg">{v.ok ? "Histórico íntegro" : "O histórico foi alterado"}</div>
          <div className="text-fg-3">
            {v.ok ? `${v.registros} registros conferidos pela corrente de hashes.` : `Quebra no registro #${v.quebraEm}: ${v.motivo}. Daí para trás não dá para confiar.`}
          </div>
        </div>
        <div className="flex gap-1">
          {(["", "voce", "agentes"] as const).map((a) => (
            <Botao key={a || "todos"} tamanho="p" variante={ator === a ? "principal" : "discreto"} onClick={() => setAtor(a)}>
              {a === "" ? "Todos" : a === "voce" ? "Você" : "Agentes"}
            </Botao>
          ))}
        </div>
      </div>
      {lista.length === 0 ? (
        <div className="rounded-panel bg-surface shadow-1">
          <EstadoVazio icone={ShieldCheck} titulo="Nada registrado ainda" texto="As suas ações e as dos agentes (entregas, aprovações, comandos) aparecem aqui." />
        </div>
      ) : (
        <section className="rounded-panel bg-surface p-4 shadow-1">
          <table className="w-full text-pequeno">
            <tbody>
              {lista.map((x) => (
                <tr key={x.id} className={`border-t border-line align-top ${v.quebraEm === x.id ? "bg-danger-soft" : ""}`}>
                  <td className="whitespace-nowrap py-1.5 pr-3 text-fg-3">{new Date(x.ts).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" })}</td>
                  <td className="whitespace-nowrap pr-3 text-fg">{nomeDe(x.ator)}</td>
                  <td className="pr-3">
                    <span className="text-fg-2">{x.acao}</span>
                    {x.alvo && <Etiqueta className="ml-1.5">{x.alvo}</Etiqueta>}
                    {x.detalhe && <div className="mt-0.5 line-clamp-2 text-legenda text-fg-3" title={x.detalhe}>{x.detalhe}</div>}
                  </td>
                  <td className="hidden font-mono text-legenda text-fg-3 md:table-cell" title={x.hash}>{x.hash.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {mais && (
            <div className="mt-3 text-center">
              <Botao tamanho="p" variante="discreto" onClick={() => carregar(r.registros.at(-1)?.id)}>Carregar mais</Botao>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
