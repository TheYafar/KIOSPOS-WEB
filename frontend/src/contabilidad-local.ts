/**
 * Copia LOCAL (en el equipo, localStorage) de lo que el dueño anota a mano en
 * Contabilidad: la libreta guiada y las hojas libres. La copia buena vive en el servidor
 * (contabilidad-sync.ts, tabla contabilidad_docs con RLS); esta sirve sin internet.
 * Todo get/set va envuelto en try/catch para que la pantalla funcione aunque
 * localStorage falle (modo privado, almacenamiento bloqueado, etc.).
 */

export type EntradaTipo = "venta" | "gasto" | "entrada";

export interface EntradaLibro {
  id: string;
  fecha: string;
  tipo: EntradaTipo;
  concepto: string;
  vendio?: number;
  costo?: number;
  monto?: number;
}

export interface ColHoja { name: string; money: boolean; bs?: boolean; }
export interface Hoja { id: string; name: string; cols: ColHoja[]; rows: string[][]; }

const LIBRO_KEY = "kioskpos.contab.libro";
const HOJAS_KEY = "kioskpos.contab.hojas";

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, val: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    /* modo privado / almacenamiento lleno: se pierde al recargar, sin romper la UI */
  }
}

export function nuevoId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "x-" + Date.now() + "-" + Math.random().toString(36).slice(2);
}

export const getLibro = (): EntradaLibro[] => load<EntradaLibro[]>(LIBRO_KEY, []);
export const setLibro = (l: EntradaLibro[]): void => save(LIBRO_KEY, l);

export function plantillasHoja(): Record<string, { name: string; cols: ColHoja[]; rows: string[][] }> {
  return {
    caja: {
      name: "Caja del día",
      cols: [{ name: "Fecha", money: false }, { name: "Concepto", money: false }, { name: "Entró", money: true }, { name: "Salió", money: true }],
      rows: [["", "Ventas de contado", "", ""], ["", "Pago a proveedor", "", ""], ["", "Vuelto / sencillo", "", ""]]
    },
    gastos: {
      name: "Gastos del mes",
      cols: [{ name: "Fecha", money: false }, { name: "En qué", money: false }, { name: "Monto", money: true }, { name: "¿Pagado?", money: false }],
      rows: [["", "Luz", "", ""], ["", "Bolsas", "", ""], ["", "Flete", "", ""]]
    },
    fiado: {
      name: "Crédito de clientes",
      cols: [{ name: "Cliente", money: false }, { name: "Fecha", money: false }, { name: "Debe", money: true }, { name: "Abonó", money: true }],
      rows: [["", "", "", ""], ["", "", "", ""], ["", "", "", ""]]
    },
    cuentas: {
      name: "Mis cuentas",
      cols: [{ name: "Concepto", money: false }, { name: "Monto", money: true }],
      rows: [["Vendí hoy", ""], ["Me costó (reponer)", ""], ["Me quedó (ganancia)", ""], ["Aparto pa' mercancía", ""], ["Para mí", ""]]
    },
    blank: {
      name: "Hoja nueva",
      cols: [{ name: "Columna 1", money: false }, { name: "Columna 2", money: false }, { name: "Monto", money: true }],
      rows: [["", "", ""], ["", "", ""], ["", "", ""]]
    }
  };
}

function hojasIniciales(): Hoja[] {
  const t = plantillasHoja();
  return [
    { id: nuevoId(), name: "Caja del día", cols: t.caja.cols, rows: t.caja.rows.map((r) => r.slice()) },
    { id: nuevoId(), name: "Mis cuentas", cols: t.cuentas.cols, rows: t.cuentas.rows.map((r) => r.slice()) }
  ];
}

export function getHojas(): Hoja[] {
  const h = load<Hoja[] | null>(HOJAS_KEY, null);
  return h && h.length ? h : hojasIniciales();
}
export const setHojas = (h: Hoja[]): void => save(HOJAS_KEY, h);
