// Situación del plan de KioskPOS del negocio (al día / aviso / suspendido). La consulta
// el Shell al entrar y cada pocos minutos; la caja la usa para no cobrar si está suspendido.
import { miSuscripcion, type Situacion } from "./api";

const KEY = "kp_plan";
let actual: Situacion | null = (() => { try { const v = localStorage.getItem(KEY); return v ? JSON.parse(v) : null; } catch { return null; } })();

export const getPlan = () => actual;
export const planSuspendido = () => actual != null && !actual.puedeCobrar;

export async function cargarPlan(): Promise<Situacion | null> {
  try {
    actual = await miSuscripcion();
    try { localStorage.setItem(KEY, JSON.stringify(actual)); } catch { /* */ }
    window.dispatchEvent(new Event("kp-plan"));
  } catch { /* sin conexión: se queda lo último que se supo */ }
  return actual;
}
