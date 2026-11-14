// "Usar este equipo como caja" sin copiar tokens: el dueño, con su sesión abierta, crea
// la caja y su token se guarda aquí mismo. Al salir de la cuenta del dueño, este equipo
// abre directo en "¿Quién va a cobrar?" con los cajeros y su PIN.
import { crearCaja, type CajaCreada } from "./api";
import { getCajaToken, setCajaToken } from "./session";

const LOCAL_KEY = "kp_caja_local";

/** Id de la caja que quedó configurada en este equipo (si se hizo desde aquí). */
export function cajaLocalId(): number | null {
  try { const v = Number(localStorage.getItem(LOCAL_KEY)); return v > 0 ? v : null; } catch { return null; }
}

export const esteEquipoEsCaja = () => !!getCajaToken();

/** Deja este equipo como la caja (con el token que se acaba de crear). */
export function adoptarCaja(token: string, id?: number) {
  setCajaToken(token);
  try { if (id) localStorage.setItem(LOCAL_KEY, String(id)); else localStorage.removeItem(LOCAL_KEY); } catch { /* sin storage */ }
}

/** Crea la caja y la configura en este equipo, todo de una vez. */
export async function usarEsteEquipoComoCaja(nombre: string): Promise<CajaCreada> {
  const c = await crearCaja(nombre.trim() || "Caja 1");
  adoptarCaja(c.cajaToken, c.id);
  return c;
}

// ---------- Bienvenida al registrarse ----------
const BIENV_KEY = "kp_bienvenida";
export function marcarBienvenida() { try { localStorage.setItem(BIENV_KEY, "1"); } catch { /* ignore */ } }
export function pideBienvenida() { try { return localStorage.getItem(BIENV_KEY) === "1"; } catch { return false; } }
export function cerrarBienvenida() { try { localStorage.removeItem(BIENV_KEY); } catch { /* ignore */ } }
