// Ticket de 40 columnas, texto plano, con el formato de Bodegas Cocoa. Es la MISMA forma que
// arma el servidor (backend TicketService.armar): aquí se usa para la vista previa en la caja
// y en Ajustes del negocio. Si cambias uno, cambia el otro.

export const W = 40;
export interface NegocioTicket { nombre: string; frase?: string | null; rif?: string | null; direccion?: string | null; telefono?: string | null; }
export interface LineaTicket { cantidad: number; nombre: string; precioUsd: number; subtotalUsd: number; }
export interface PagoTicket { nombre: string; moneda: "USD" | "VES"; monto: number; ref?: string; }
export interface DatosTicket {
  negocio: NegocioTicket; fecha: Date; numero?: number | null; cliente?: string | null;
  tasa: number; lineas: LineaTicket[]; totalBs: number; pagos: PagoTicket[]; vueltoBs?: number; vueltoUsd?: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
export const numVE = (n: number) => r2(n).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true })
  // es-VE en algunos navegadores no agrupa miles: se fuerza "1.234,56"
  .replace(/^(-?\d+)(?=,)/, (m) => m.replace(/\B(?=(\d{3})+(?!\d))/g, "."));
const bsVE = (n: number) => "Bs. " + numVE(n);
const cantVE = (n: number) => String(Math.round(n * 1000) / 1000).replace(".", ",");
export const centrar = (t: string) => (t.length >= W ? t.slice(0, W) : " ".repeat(Math.floor((W - t.length) / 2)) + t);
export function fila(izq: string, der: string): string {
  const max = Math.max(1, W - 1 - der.length);
  const i = izq.length > max ? izq.slice(0, max) : izq;
  return i + " ".repeat(Math.max(1, W - i.length - der.length)) + der;
}
export function envolver(t: string): string[] {
  const out: string[] = []; let a = "";
  for (let w of t.replace(/\s+/g, " ").trim().split(" ")) {
    if (a && a.length + 1 + w.length > W) { out.push(a); a = ""; }
    while (w.length > W) { out.push(w.slice(0, W)); w = w.slice(W); }
    a = a ? a + " " + w : w;
  }
  if (a || !out.length) out.push(a);
  return out;
}
/** "08/10/2026 09:15 a. m." */
export function fechaVE(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const h = d.getHours() % 12 || 12;
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(h)}:${p(d.getMinutes())} ${d.getHours() < 12 ? "a. m." : "p. m."}`;
}

export function encabezado(n: NegocioTicket): string[] {
  const l = envolver((n.nombre || "Mi bodega").toUpperCase()).map(centrar);
  if (n.frase?.trim()) l.push(...envolver(n.frase.toUpperCase()).map(centrar));
  if (n.rif?.trim()) l.push(centrar("RIF: " + n.rif.trim()));
  if (n.direccion?.trim()) l.push(...envolver(n.direccion).map(centrar));
  if (n.telefono?.trim()) l.push(centrar("Tel: " + n.telefono.trim()));
  return l;
}

export function armarTicket(t: DatosTicket): string {
  const doble = "=".repeat(W), linea = "-".repeat(W);
  const L: string[] = [doble, ...encabezado(t.negocio), doble, "FECHA : " + fechaVE(t.fecha)];
  if (t.numero != null) L.push("FACTURA #: " + String(t.numero).padStart(6, "0"));
  L.push(linea, ("CLIENTE: " + (t.cliente || "Consumidor Final")).slice(0, W), linea, fila("CANT  DESCRIPCION", "PRECIO (Bs)"), linea);
  for (const l of t.lineas) {
    const c = cantVE(l.cantidad);
    L.push(...envolver(c + " x " + l.nombre.toUpperCase()));
    L.push(fila("  (" + c + " x " + bsVE(l.precioUsd * t.tasa) + ")", bsVE(l.subtotalUsd * t.tasa)));
  }
  L.push(linea, fila("TOTAL EN BOLIVARES", bsVE(t.totalBs)), doble);
  const pagos = t.pagos.filter((p) => p.monto > 0);
  if (pagos.length) {
    L.push(centrar("FORMA DE PAGO"), linea);
    for (const p of pagos) {
      L.push(fila(p.nombre, (p.moneda === "USD" ? "USD " : "VES ") + numVE(p.monto)));
      if (p.ref) L.push(fila("  Ref:", p.ref));
    }
    if ((t.vueltoBs || 0) > 0) L.push(fila("VUELTO", "VES " + numVE(t.vueltoBs!)));
    if ((t.vueltoUsd || 0) > 0) L.push(fila("VUELTO", "USD " + numVE(t.vueltoUsd!)));
    L.push(doble);
  }
  return L.join("\n");
}
