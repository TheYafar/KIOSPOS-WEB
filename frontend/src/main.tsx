import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";
import "./atras"; // botón Atrás: cierra ventanas antes de cambiar de pestaña
import { App } from "./App";
import { initTema } from "./tema";
import { iniciarTamano } from "./tamano";
import { vigilarVersion } from "./version";

initTema();
iniciarTamano();
vigilarVersion();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
