// Configuración de la caja: qué formas de pago se usan y cómo se calcula la tasa del
// dólar a partir de la BCV automática. Es del NEGOCIO y vive en el servidor (la comparten
// todas sus cajas); aquí queda una copia en el equipo para cobrar sin internet.

export type MetodoId = "EFECTIVO_USD" | "EFECTIVO_BS" | "PAGO_MOVIL" | "PUNTO" | "BIOPAGO";
export type TasaModo = "bcv" | "ajuste" | "manual";

/** Forma de pago o moneda extra que agrega el negocio (Zelle, Binance, euros...). */
export interface MetodoExtra {
  id: string;
  nombre: string;
  tipo: "USD" | "VES" | "OTRA"; // se cobra en $, en Bs, u otra moneda con su tasa
  simbolo: string;              // para "OTRA": ej. "€", "COP"
  tasaUsd: number;              // para "OTRA": cuántos $ vale 1 unidad (ej. 1 € = 1,08 $)
  activo: boolean;
}

export interface ConfigCaja {
  metodos: Record<MetodoId, boolean>;
  extras: MetodoExtra[];
  tasaModo: TasaModo;
  ajusteTipo: "pct" | "bs";   // aumento sobre la BCV: porcentaje o bolívares fijos
  ajuste: number;
  tasaManual: number;
}

const KEY = "kp_config";
const BCV_KEY = "kp_bcv";
export const DEFAULT_CONFIG: ConfigCaja = {
  metodos: { EFECTIVO_USD: true, EFECTIVO_BS: true, PAGO_MOVIL: true, PUNTO: true, BIOPAGO: true },
  extras: [],
  tasaModo: "bcv", ajusteTipo: "pct", ajuste: 0, tasaManual: 0,
};

export function getConfig(): ConfigCaja {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_CONFIG;
    const c = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...c, metodos: { ...DEFAULT_CONFIG.metodos, ...(c.metodos || {}) }, extras: Array.isArray(c.extras) ? c.extras : [] };
  } catch { return DEFAULT_CONFIG; }
}

export function setConfig(c: ConfigCaja): void {
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* sin storage */ }
  window.dispatchEvent(new Event("kp-config"));
}

// ---- Copia del servidor <-> equipo ----
interface CfgServidor { metodosPago: string | null; tasaModo: string; ajusteTipo: string; ajuste: number; tasaManual: number; tasaBcv: number | null; tasaEfectiva: number | null; }

/** Convierte la config del servidor a la de la PWA (sin metodosPago → todas activas). */
export function desdeServidor(r: CfgServidor): ConfigCaja {
  let mp: { metodos?: Partial<Record<MetodoId, boolean>>; extras?: MetodoExtra[] } = {};
  try { mp = r.metodosPago ? JSON.parse(r.metodosPago) : {}; } catch { mp = {}; }
  const modo = (r.tasaModo || "BCV").toLowerCase();
  return {
    metodos: { ...DEFAULT_CONFIG.metodos, ...(mp.metodos || {}) },
    extras: Array.isArray(mp.extras) ? mp.extras : [],
    tasaModo: modo === "ajuste" || modo === "manual" ? modo : "bcv",
    ajusteTipo: (r.ajusteTipo || "PCT").toLowerCase() === "bs" ? "bs" : "pct",
    ajuste: Number(r.ajuste) || 0,
    tasaManual: Number(r.tasaManual) || 0,
  };
}
export function aServidor(c: ConfigCaja) {
  return {
    metodosPago: JSON.stringify({ metodos: c.metodos, extras: c.extras }),
    tasaModo: c.tasaModo.toUpperCase(), ajusteTipo: c.ajusteTipo.toUpperCase(),
    ajuste: c.ajuste, tasaManual: c.tasaManual,
  };
}
/** Guarda en el equipo lo que dice el servidor (y su BCV). Devuelve la tasa con que se cobra. */
export function aplicarDelServidor(r: CfgServidor): number {
  if (r.tasaBcv && r.tasaBcv > 0) setBcv(r.tasaBcv);
  setConfig(desdeServidor(r));
  const e = Number(r.tasaEfectiva) || 0;
  return e > 0 ? e : tasaEfectiva(getBcv());
}

/** Última tasa BCV que trajo el servidor (sin ajustes). */
export function getBcv(): number { try { return Number(localStorage.getItem(BCV_KEY)) || 0; } catch { return 0; } }
/** n = tasa; `delServidor` marca que vino del BCV (si no, es la última conocida del equipo). */
export function setBcv(n: number, delServidor = true): void {
  try {
    localStorage.setItem(BCV_KEY, String(n));
    if (delServidor) localStorage.setItem(BCV_KEY + "_at", new Date().toISOString());
  } catch { /* */ }
}
/** Cuándo llegó la BCV del servidor por última vez (null = nunca: se usa la última conocida). */
export function bcvActualizada(): Date | null {
  try { const v = localStorage.getItem(BCV_KEY + "_at"); return v ? new Date(v) : null; } catch { return null; }
}

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

/** Extras activas (las que se muestran al cobrar). */
export const extrasActivas = () => getConfig().extras.filter((x) => x.activo && x.nombre.trim());
