import { useState } from "react";
import { aplicarTamano, tamanoActual, TAMANOS } from "./tamano";

/** Botón "A+": cambia el tamaño de letras y botones (Normal → Grande → Muy grande). */
export function TamBtn({ className = "" }: { className?: string }) {
  const [t, setT] = useState(tamanoActual());
  const i = TAMANOS.findIndex((x) => x.id === t);
  const sig = TAMANOS[(i + 1) % TAMANOS.length];
  const cambiar = () => { aplicarTamano(sig.id); setT(sig.id); };
  return (
    <button className={"tema-btn press tam-btn " + className} onClick={cambiar}
      aria-label={"Tamaño de letra: " + TAMANOS[i].n + ". Cambiar a " + sig.n} title={"Tamaño: " + TAMANOS[i].n + " (toca para " + sig.n.toLowerCase() + ")"}>
      <span aria-hidden="true">A<small>{t === "normal" ? "+" : t === "grande" ? "++" : "−"}</small></span>
    </button>
  );
}
