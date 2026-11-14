// Sesiones de "Probar la demo": la de dueño y la de la cajera, para cambiar entre ambas.
import type { DemoCreada } from "./api";
import type { Sesion } from "./session";

const KEY = "kp_demo";

export function guardarDemo(d: DemoCreada) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* sin storage */ } }

export function getDemo(): DemoCreada | null {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || "null") as DemoCreada | null;
    if (!d || new Date(d.expira).getTime() < Date.now()) return null;
    return d;
  } catch { return null; }
}

export function salirDemo() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }

/** ¿Esta sesión es de la demo? */
export function esSesionDemo(s: Sesion | null): boolean {
  const d = getDemo();
  return !!(s && d && s.negocioId === d.dueno.negocioId);
}

/** Horas que le quedan a la demo (para el aviso). */
export function horasDemo(): number {
  const d = getDemo();
  return d ? Math.max(0, Math.round((new Date(d.expira).getTime() - Date.now()) / 3600000)) : 0;
}
