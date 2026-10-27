import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./App.tsx";
import { connect } from "./ws.ts";
import { iniciarVoz } from "./voz/controle.ts";

connect();
iniciarVoz();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
