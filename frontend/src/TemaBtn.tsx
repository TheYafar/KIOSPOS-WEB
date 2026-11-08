import { useState } from "react";
import { UIcono } from "./icons";
import { aplicarTema, temaActual, type Tema } from "./tema";

/** Botón para alternar tema claro/oscuro. Muestra el ícono del tema al que cambiaría. */
export function TemaBtn({ className = "" }: { className?: string }) {
  const [tema, setTema] = useState<Tema>(temaActual());
  const flip = () => {
    const n: Tema = tema === "oscuro" ? "claro" : "oscuro";
    aplicarTema(n);
    setTema(n);
  };
  const aOscuro = tema !== "oscuro"; // si está claro, el botón lleva a oscuro
  return (
    <button
      className={"tema-btn press " + className}
      onClick={flip}
      aria-label={aOscuro ? "Cambiar a modo oscuro" : "Cambiar a modo claro"}
      title={aOscuro ? "Modo oscuro" : "Modo claro"}
    >
      <UIcono k={aOscuro ? "luna" : "sol"} sw={1.9} />
    </button>
  );
}
