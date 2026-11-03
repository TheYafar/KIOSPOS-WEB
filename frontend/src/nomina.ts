// Nómina — capa de datos.
//
// POR AHORA son datos de DEMO en memoria (esta tanda es "frontend solamente").
// La forma de los datos y las funciones ya calcan la API del diseño
// (docs/superpowers/specs/2026-10-31-nomina-design.md §API), así que cuando exista
// el backend (migración V7__nomina.sql + /api/nomina/*) solo hay que cambiar el
// cuerpo de estas funciones por fetch() al estilo de api.ts. El resto (pantalla,
// cálculo de saldo) no cambia.

import { getTasa } from "./session";

export type Periodo = "SEMANAL" | "QUINCENAL";
export type TipoMov = "PAGO" | "CONSUMO" | "AJUSTE";

export interface MovNomina {
  id: number;
  tipo: TipoMov;
  montoUsd: number;          // siempre positivo; el signo visual depende del tipo
  fecha: string;             // ISO corta (YYYY-MM-DD)
  nota?: string;
  metodo?: string;           // para PAGO (efectivo, pago móvil…)
  productoNombre?: string;   // para CONSUMO
  cantidad?: number;         // para CONSUMO
}

export interface Empleado {
  usuarioId: number;
  nombre: string;
  rol: string;               // "Cajero" | "Encargado" | …
  sueldoUsd: number;
  periodo: Periodo;
  movimientos: MovNomina[];
}

export interface Saldo {
  leToca: number;    // sueldo del período
  pagado: number;    // Σ pagos del período
  consumos: number;  // Σ consumos del período
  ajustes: number;   // Σ ajustes (±)
  saldo: number;     // leToca − pagado − consumos ± ajustes  (>0 le debes, <0 te debe)
}

export interface ProductoLite { id: number; nombre: string; precioUsd: number; }

const r2 = (n: number) => Math.round(n * 100) / 100;
const hoy = () => new Date().toISOString().slice(0, 10);

/** Saldo del período (v1: sueldo completo; ver spec "Cálculo del saldo"). */
export function calcSaldo(e: Empleado): Saldo {
  let pagado = 0, consumos = 0, ajustes = 0;
  for (const m of e.movimientos) {
    if (m.tipo === "PAGO") pagado += m.montoUsd;
    else if (m.tipo === "CONSUMO") consumos += m.montoUsd;
    else ajustes += m.montoUsd;
  }
  return {
    leToca: r2(e.sueldoUsd),
    pagado: r2(pagado),
    consumos: r2(consumos),
    ajustes: r2(ajustes),
    saldo: r2(e.sueldoUsd - pagado - consumos + ajustes),
  };
}

const tasaNum = () => parseFloat((getTasa() || "0").replace(",", ".")) || 0;
export const equivBs = (usd: number) => r2(usd * tasaNum());

// ----------------------------------------------------------- DEMO (en memoria)

let _seq = 1000;
const nid = () => ++_seq;
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

// Empleados de la quincena 16–31 oct del mockup (Ana con saldo a favor del
// empleado, José en contra, Carlos sin consumos).
const EMPLEADOS: Empleado[] = [
  { usuarioId: 1, nombre: "Ana Pérez", rol: "Cajera", sueldoUsd: 120, periodo: "QUINCENAL", movimientos: [
    { id: nid(), tipo: "PAGO", montoUsd: 50, fecha: "2026-10-16", metodo: "Pago móvil" },
    { id: nid(), tipo: "CONSUMO", montoUsd: 7, fecha: "2026-10-21", productoNombre: "Pan canilla", cantidad: 3 },
    { id: nid(), tipo: "CONSUMO", montoUsd: 4, fecha: "2026-10-24", productoNombre: "Refresco 2L", cantidad: 2 },
    { id: nid(), tipo: "CONSUMO", montoUsd: 3.5, fecha: "2026-10-28", productoNombre: "Harina Pan 1kg", cantidad: 1 },
    { id: nid(), tipo: "PAGO", montoUsd: 30, fecha: "2026-10-30", metodo: "Efectivo" },
  ] },
  { usuarioId: 2, nombre: "José Marín", rol: "Cajero", sueldoUsd: 120, periodo: "QUINCENAL", movimientos: [
    { id: nid(), tipo: "PAGO", montoUsd: 120, fecha: "2026-10-16", metodo: "Efectivo" },
    { id: nid(), tipo: "CONSUMO", montoUsd: 7, fecha: "2026-10-22", productoNombre: "Café 250g", cantidad: 1 },
  ] },
  { usuarioId: 3, nombre: "Carlos", rol: "Encargado", sueldoUsd: 200, periodo: "QUINCENAL", movimientos: [
    { id: nid(), tipo: "PAGO", montoUsd: 100, fecha: "2026-10-16", metodo: "Pago móvil" },
  ] },
];

// Catálogo de demo para el buscador de "Registrar consumo".
// (Con backend: reemplazar buscarProductos por la API real de inventario.)
const PRODUCTOS: ProductoLite[] = [
  { id: 1, nombre: "Harina Pan 1kg", precioUsd: 1.2 },
  { id: 2, nombre: "Refresco 2L", precioUsd: 2.0 },
  { id: 3, nombre: "Pan canilla", precioUsd: 0.5 },
  { id: 4, nombre: "Café 250g", precioUsd: 3.5 },
  { id: 5, nombre: "Leche 1L", precioUsd: 1.8 },
  { id: 6, nombre: "Aceite 1L", precioUsd: 2.6 },
  { id: 7, nombre: "Arroz 1kg", precioUsd: 1.1 },
  { id: 8, nombre: "Azúcar 1kg", precioUsd: 1.0 },
  { id: 9, nombre: "Jabón azul", precioUsd: 0.9 },
  { id: 10, nombre: "Refresco lata", precioUsd: 0.8 },
];

/** GET /api/nomina/empleados */
export async function listarEmpleados(): Promise<Empleado[]> {
  return clone(EMPLEADOS);
}

/** Snapshot síncrono de los empleados demo (para previews/tests). */
export const empleadosDemo = (): Empleado[] => clone(EMPLEADOS);

/** Buscador de productos para el consumo (mock del inventario). */
export async function buscarProductos(q: string): Promise<ProductoLite[]> {
  const s = q.trim().toLowerCase();
  return PRODUCTOS.filter((p) => !s || p.nombre.toLowerCase().includes(s)).slice(0, 20);
}

/** PUT /api/nomina/empleados/{id} — fija sueldo + período. */
export async function fijarSueldo(usuarioId: number, sueldoUsd: number, periodo: Periodo): Promise<Empleado> {
  const e = EMPLEADOS.find((x) => x.usuarioId === usuarioId)!;
  e.sueldoUsd = r2(sueldoUsd);
  e.periodo = periodo;
  return clone(e);
}

/** POST /api/nomina/empleados/{id}/pago */
export async function registrarPago(usuarioId: number, montoUsd: number, metodo: string, nota?: string): Promise<Empleado> {
  const e = EMPLEADOS.find((x) => x.usuarioId === usuarioId)!;
  e.movimientos.push({ id: nid(), tipo: "PAGO", montoUsd: r2(montoUsd), fecha: hoy(), metodo, nota });
  return clone(e);
}

/** POST /api/nomina/empleados/{id}/consumo — baja stock y carga a precio de venta. */
export async function registrarConsumo(usuarioId: number, producto: ProductoLite, cantidad: number): Promise<Empleado> {
  const e = EMPLEADOS.find((x) => x.usuarioId === usuarioId)!;
  e.movimientos.push({
    id: nid(), tipo: "CONSUMO", montoUsd: r2(producto.precioUsd * cantidad),
    fecha: hoy(), productoNombre: producto.nombre, cantidad,
  });
  return clone(e);
}

/** Ajusta el TOTAL pagado del período a `nuevoTotal`, creando un movimiento por
 *  la diferencia (así el número que escribe el dueño cuadra y queda rastro). En
 *  el backend equivale a un PAGO de ajuste; método "Ajuste manual". */
export async function ajustarPagado(usuarioId: number, nuevoTotal: number): Promise<Empleado> {
  const e = EMPLEADOS.find((x) => x.usuarioId === usuarioId)!;
  const actual = e.movimientos.filter((m) => m.tipo === "PAGO").reduce((s, m) => s + m.montoUsd, 0);
  const dif = r2(nuevoTotal - actual);
  if (dif !== 0) {
    e.movimientos.push({ id: nid(), tipo: "PAGO", montoUsd: dif, fecha: hoy(), metodo: "Ajuste manual", nota: "Ajuste de lo pagado" });
  }
  return clone(e);
}

/** DELETE /api/nomina/empleados/{id}/movimientos/{movId} — borra un movimiento
 *  (por si el dueño se equivoca). IMPORTANTE para el backend: borrar un CONSUMO
 *  debe DEVOLVER el stock al inventario (reponer la cantidad) en la misma
 *  transacción; borrar un PAGO solo quita el abono. El saldo se recalcula solo. */
export async function eliminarMovimiento(usuarioId: number, movId: number): Promise<Empleado> {
  const e = EMPLEADOS.find((x) => x.usuarioId === usuarioId)!;
  e.movimientos = e.movimientos.filter((m) => m.id !== movId);
  return clone(e);
}
