// Configuración de la caja (en este equipo): qué formas de pago se usan y cómo se
// calcula la tasa del dólar a partir de la BCV automática.

export type MetodoId = "EFECTIVO_USD" | "EFECTIVO_BS" | "PAGO_MOVIL" | "PUNTO" | "BIOPAGO";
export type TasaModo = "bcv" | "ajuste" | "manual";

export interface ConfigCaja {
  metodos: Record<MetodoId, boolean>;
  tasaModo: TasaModo;
  ajusteTipo: "pct" | "bs";   // aumento sobre la BCV: porcentaje o bolívares fijos
  ajuste: number;
  tasaManual: number;
}

const KEY = "kp_config";
const BCV_KEY = "kp_bcv";
export const DEFAULT_CONFIG: ConfigCaja = {
  metodos: { EFECTIVO_USD: true, EFECTIVO_BS: true, PAGO_MOVIL: true, PUNTO: true, BIOPAGO: true },
  tasaModo: "bcv", ajusteTipo: "pct", ajuste: 0, tasaManual: 0,
};

export function getConfig(): ConfigCaja {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_CONFIG;
    const c = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...c, metodos: { ...DEFAULT_CONFIG.metodos, ...(c.metodos || {}) } };
  } catch { return DEFAULT_CONFIG; }
}

export function setConfig(c: ConfigCaja): void {
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* sin storage */ }
  window.dispatchEvent(new Event("kp-config"));
}

/** Última tasa BCV que trajo el servidor (sin ajustes). */
export function getBcv(): number { try { return Number(localStorage.getItem(BCV_KEY)) || 0; } catch { return 0; } }
export function setBcv(n: number): void { try { localStorage.setItem(BCV_KEY, String(n)); } catch { /* */ } }

/** La tasa con la que se cobra: BCV, BCV + aumento (redondeada hacia arriba al Bs) o manual. */
export function tasaEfectiva(bcv: number, c: ConfigCaja = getConfig()): number {
  if (c.tasaModo === "manual" && c.tasaManual > 0) return Math.round(c.tasaManual * 100) / 100;
  if (c.tasaModo === "ajuste" && bcv > 0 && c.ajuste > 0) {
    const extra = c.ajusteTipo === "pct" ? (bcv * c.ajuste) / 100 : c.ajuste;
    return Math.ceil(bcv + extra - 1e-9);
  }
  return bcv;
}

/** ¿Está activa esta forma de pago en este equipo? */
export const metodoActivo = (m: string) => (getConfig().metodos as Record<string, boolean>)[m] !== false;
