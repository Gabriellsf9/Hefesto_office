import { lazy, Suspense, useEffect, useState } from "react";
import { useStore } from "./store.ts";
import { useNav } from "./nav.ts";
import { DetalheCard } from "./ui/trabalho/DetalheCard.tsx";
import { NovoCard } from "./ui/board/NovoCard.tsx";
import { PainelEntrevista } from "./ui/Entrevista.tsx";
import { Onboarding } from "./ui/Onboarding.tsx";
import { useAvisoSonoro } from "./ui/useAvisoSonoro.ts";
import { Minimapa } from "./ui/Minimapa.tsx";
import { AvisoConquista } from "./ui/AvisoConquista.tsx";
import { FaixaControle } from "./ui/Maquina.tsx";
import { BarraLateral } from "./ui/shell/BarraLateral.tsx";
import { Cabecalho } from "./ui/shell/Cabecalho.tsx";
import { Dock } from "./ui/shell/Dock.tsx";
import { Paleta } from "./ui/shell/Paleta.tsx";
import { PainelContexto, PainelSalas, TickerAtividade } from "./ui/escritorio/Paineis.tsx";
import { Avisos, Confirmacoes, Esqueleto } from "./ui/kit/index.ts";
import { ProtecaoDeErro } from "./ui/ProtecaoDeErro.tsx";
import "./ui/shell/tema.ts";

// Casca da aplicação (DESIGN-INTERFACE.md §3): barra lateral + cabeçalho + página.
// O escritório 3D fica montado (a câmera e os agentes não reiniciam), mas só desenha quando está à vista.

// O 3D (three.js, ~1 MB) carrega sob demanda: só baixa e monta depois da primeira visita ao Escritório.
const Office = lazy(() => import("./scene/Office.tsx").then((m) => ({ default: m.Office })));
const PaginaEntrada = lazy(() => import("./ui/paginas/Entrada.tsx"));
const PaginaConversas = lazy(() => import("./ui/paginas/Conversas.tsx"));
const PaginaTrabalho = lazy(() => import("./ui/paginas/Trabalho.tsx"));
const PaginaClientes = lazy(() => import("./ui/paginas/Clientes.tsx"));
const PaginaEquipe = lazy(() => import("./ui/paginas/Equipe.tsx"));
const PaginaEmpresa = lazy(() => import("./ui/paginas/Empresa.tsx"));
const PaginaOperacao = lazy(() => import("./ui/paginas/Operacao.tsx"));
const PaginaConfig = lazy(() => import("./ui/paginas/Configuracoes.tsx"));
const PaginaEscritorios = lazy(() => import("./ui/paginas/Escritorios.tsx"));

export function App() {
  const rota = useNav((s) => s.rota);
  const noEscritorio = rota.area === "escritorio";
  const [visitouEscritorio, setVisitouEscritorio] = useState(noEscritorio);
  useEffect(() => {
    if (noEscritorio) setVisitouEscritorio(true);
  }, [noEscritorio]);
  useAvisoSonoro();

  // Trocar de página fecha o que é passageiro (janela de novo card, menu da equipe).
  useEffect(() => {
    useStore.setState({ novoCardAberto: false, equipeAberta: false });
  }, [rota.area, rota.sub]);

  // O card aberto acompanha o endereço (?card=25): link direto, voltar do navegador e recarregar funcionam.
  useEffect(() => {
    const atual = useStore.getState().cardAberto;
    if (rota.card !== atual) useStore.setState({ cardAberto: rota.card, comentarios: [], entregas: [] });
  }, [rota.card]);

  return (
    <div className="flex h-full w-full bg-bg">
      <BarraLateral />
      <div className="flex min-w-0 flex-1 flex-col">
        <Cabecalho />
        <main className="relative min-h-0 flex-1 overflow-hidden">
          {visitouEscritorio && (
            <div className={noEscritorio ? "absolute inset-0" : "invisible absolute inset-0"} aria-hidden={!noEscritorio}>
              <ProtecaoDeErro onde="escritorio-3d">
                <Suspense fallback={null}>
                  <Office ativo={noEscritorio} />
                </Suspense>
              </ProtecaoDeErro>
            </div>
          )}
          {noEscritorio && (
            <div className="pointer-events-none absolute inset-0 z-[100]">
              <PainelSalas />
              <PainelContexto />
              <TickerAtividade />
              <Minimapa />
            </div>
          )}
          {!noEscritorio && (
            <div className="absolute inset-0 z-[100] bg-bg">
              <ProtecaoDeErro key={`${rota.area}/${rota.sub ?? ""}`} onde={rota.area}>
              <Suspense fallback={<div className="space-y-3 p-8"><Esqueleto className="h-8 w-60" /><Esqueleto className="h-40 w-full" /></div>}>
                {rota.area === "entrada" && <PaginaEntrada />}
                {rota.area === "conversas" && <PaginaConversas />}
                {rota.area === "trabalho" && <PaginaTrabalho />}
                {rota.area === "clientes" && <PaginaClientes />}
                {rota.area === "equipe" && <PaginaEquipe />}
                {rota.area === "empresa" && <PaginaEmpresa />}
                {rota.area === "operacao" && <PaginaOperacao />}
                {rota.area === "config" && <PaginaConfig />}
                {rota.area === "escritorios" && <PaginaEscritorios />}
              </Suspense>
              </ProtecaoDeErro>
            </div>
          )}
          <div className="pointer-events-none absolute inset-0 z-[200]">
            <FaixaControle />
            <AvisoConquista />
            <PainelEntrevista />
          </div>
          <Dock />
        </main>
      </div>
      <ProtecaoDeErro key={rota.card ?? 0} onde="detalhe-do-card">
        <DetalheCard />
      </ProtecaoDeErro>
      <NovoCard />
      <Onboarding />
      <Paleta />
      <Confirmacoes />
      <Avisos />
    </div>
  );
}
