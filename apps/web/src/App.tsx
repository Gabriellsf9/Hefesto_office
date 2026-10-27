import { Office } from "./scene/Office.tsx";
import { useStore } from "./store.ts";
import { Board } from "./ui/board/Board.tsx";
import { CardDetalhe } from "./ui/board/CardDetalhe.tsx";
import { NovoCard } from "./ui/board/NovoCard.tsx";
import { CommandBar } from "./ui/CommandBar.tsx";
import { ConviteEntrevista, PainelEntrevista } from "./ui/Entrevista.tsx";
import { Feed } from "./ui/Feed.tsx";
import { Livro } from "./ui/Livro.tsx";
import { Onboarding } from "./ui/Onboarding.tsx";
import { Rotina } from "./ui/Rotina.tsx";
import { RoomList } from "./ui/RoomList.tsx";
import { SidePanel } from "./ui/SidePanel.tsx";
import { TopBar } from "./ui/TopBar.tsx";
import { AvisosVoz } from "./ui/Voz.tsx";
import { useAtalhoPaineis } from "./ui/Minimizavel.tsx";
import { useAvisoSonoro } from "./ui/useAvisoSonoro.ts";
import { Minimapa } from "./ui/Minimapa.tsx";
import { AvisoConquista } from "./ui/AvisoConquista.tsx";
import { PainelNavegador } from "./ui/NavegadorAgentes.tsx";
import { PainelConectores } from "./ui/Conectores.tsx";
import { FaixaControle } from "./ui/Maquina.tsx";

export function App() {
  // Com a board aberta, os painéis do escritório saem da frente.
  const boardAberta = useStore((s) => s.modoBoard !== "fechada");
  useAtalhoPaineis();
  useAvisoSonoro();
  return (
    <div className="relative h-full w-full">
      <Office />
      {/* A camada de interface não bloqueia a câmera; cada painel reativa os cliques. */}
      {/* z-index alto: fica acima das etiquetas 3D (Html do drei), que vivem fora do canvas. */}
      <div className="pointer-events-none absolute inset-0 z-[1000]">
        <TopBar />
        {!boardAberta && (
          <>
            <RoomList />
            <SidePanel />
            <Feed />
            <CommandBar />
            <Minimapa />
          </>
        )}
        {boardAberta && (
          <div className="pointer-events-auto absolute bottom-4 left-4 z-10 w-80">
            <AvisosVoz />
          </div>
        )}
        <FaixaControle />
        <AvisoConquista />
        <ConviteEntrevista />
        <Board />
        <PainelEntrevista />
        <CardDetalhe />
        <NovoCard />
        <Livro />
        <Rotina />
        <PainelNavegador />
        <PainelConectores />
        <Onboarding />
      </div>
    </div>
  );
}
