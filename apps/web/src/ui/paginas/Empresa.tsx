import { BarChart3, BookOpen, CalendarClock, Lightbulb, Target, Trophy } from "lucide-react";
import { useStore } from "../../store.ts";
import { navegar, useNav } from "../../nav.ts";
import { Abas, CabecalhoPagina, Pagina } from "../kit/index.ts";
import { ConteudoLivro } from "../Livro.tsx";
import { PainelConhecimento } from "../Conhecimento.tsx";
import { AbaAtas, AbaIndicadores, AbaMetas, AbaRituais } from "../Rotina.tsx";
import { AbaConquistas } from "../Operacao.tsx";

// Empresa (DESIGN-INTERFACE.md §6.6): Livro, conhecimento, metas, indicadores, rituais e atas, conquistas.

type Sub = "livro" | "conhecimento" | "metas" | "indicadores" | "rituais" | "conquistas";
const SUBS: Sub[] = ["livro", "conhecimento", "metas", "indicadores", "rituais", "conquistas"];

export default function PaginaEmpresa() {
  const rota = useNav((s) => s.rota);
  const sub: Sub = rota.sub === "atas" ? "rituais" : SUBS.includes(rota.sub as Sub) ? (rota.sub as Sub) : "livro";
  const propostas = useStore((s) => s.conhecimento.filter((i) => !i.aprovado).length);
  const livro = useStore((s) => s.livro.length);
  return (
    <Pagina largura="media">
      <CabecalhoPagina
        icone={BookOpen}
        titulo="Empresa"
        descricao="Quem a empresa é e como ela trabalha: o Livro que todos os agentes leem, o conhecimento da casa, as metas e a cadência."
        abas={
          <Abas
            ativa={sub}
            onChange={(id) => navegar("empresa", id)}
            abas={[
              { id: "livro", rotulo: `Livro ${livro}/7`, icone: BookOpen },
              { id: "conhecimento", rotulo: "Conhecimento", icone: Lightbulb, contador: propostas, alerta: true },
              { id: "metas", rotulo: "Metas", icone: Target },
              { id: "indicadores", rotulo: "Indicadores", icone: BarChart3 },
              { id: "rituais", rotulo: "Rituais e atas", icone: CalendarClock },
              { id: "conquistas", rotulo: "Conquistas", icone: Trophy },
            ]}
          />
        }
      />
      {sub === "livro" && <ConteudoLivro />}
      {sub === "conhecimento" && <PainelConhecimento />}
      {sub === "metas" && <Cartao><AbaMetas /></Cartao>}
      {sub === "indicadores" && <Cartao><AbaIndicadores /></Cartao>}
      {sub === "rituais" && (
        <div className="space-y-6">
          <Cartao><AbaRituais /></Cartao>
          <div>
            <h2 className="mb-3 text-secao font-semibold text-fg">Atas</h2>
            <Cartao><AbaAtas /></Cartao>
          </div>
        </div>
      )}
      {sub === "conquistas" && <Cartao><AbaConquistas /></Cartao>}
    </Pagina>
  );
}

const Cartao = ({ children }: { children: React.ReactNode }) => <div className="rounded-panel bg-surface p-5 shadow-1">{children}</div>;
