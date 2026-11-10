// Tamaño de la interfaz (letras y botones) para quien no ve bien la pantalla pequeña.
// Se guarda en este equipo. El CSS agranda todo con zoom (html[data-tam]).

export type Tamano = "normal" | "grande" | "muy-grande";
const KEY = "kp_tam";
export const TAMANOS: { id: Tamano; n: string }[] = [{ id: "normal", n: "Normal" }, { id: "grande", n: "Grande" }, { id: "muy-grande", n: "Muy grande" }];

export function tamanoActual(): Tamano {
  try { const t = localStorage.getItem(KEY); return t === "grande" || t === "muy-grande" ? t : "normal"; } catch { return "normal"; }
}

export function aplicarTamano(t: Tamano): void {
  if (t === "normal") document.documentElement.removeAttribute("data-tam");
  else document.documentElement.setAttribute("data-tam", t);
  try { localStorage.setItem(KEY, t); } catch { /* */ }
}

/** Al arrancar la app. */
export function iniciarTamano(): void { aplicarTamano(tamanoActual()); }
