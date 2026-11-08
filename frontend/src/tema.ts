// Tema claro/oscuro. Por defecto sigue al sistema; si el usuario elige, se guarda y manda.
// Aplica data-theme en <html> ("light" | "dark"); el CSS (styles.css) hace el resto.

export type Tema = "claro" | "oscuro";
const KEY = "kp_tema";

/** Lo que el usuario eligió explícitamente, o null si no ha elegido (sigue al sistema). */
export function temaGuardado(): Tema | null {
  try {
    const t = localStorage.getItem(KEY);
    return t === "claro" || t === "oscuro" ? t : null;
  } catch { return null; }
}

/** El tema que se está mostrando ahora (elección del usuario o preferencia del sistema). */
export function temaActual(): Tema {
  const g = temaGuardado();
  if (g) return g;
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "oscuro" : "claro";
  } catch { return "oscuro"; }
}

/** Fija el tema y lo recuerda. */
export function aplicarTema(t: Tema): void {
  document.documentElement.setAttribute("data-theme", t === "oscuro" ? "dark" : "light");
  try { localStorage.setItem(KEY, t); } catch { /* sin storage: solo esta sesión */ }
}

/** Al arrancar: si el usuario ya eligió, aplicarlo; si no, no tocar (sigue al sistema). */
export function initTema(): void {
  const g = temaGuardado();
  if (g) document.documentElement.setAttribute("data-theme", g === "oscuro" ? "dark" : "light");
}
