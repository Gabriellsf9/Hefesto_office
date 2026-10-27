import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { prepararEscritorio } from "./escritorio.ts";

// O escritório ativo (salas, equipe, planta) precisa estar no registro antes de carregar o 3D e as telas.
prepararEscritorio();

const [{ App }, { connect }, { iniciarVoz }] = await Promise.all([import("./App.tsx"), import("./ws.ts"), import("./voz/controle.ts")]);

connect();
iniciarVoz();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
