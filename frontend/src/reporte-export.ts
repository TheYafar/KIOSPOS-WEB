import type { ReporteDia } from "./api";

/** Días de un período en el calendario de Venezuela: hoy, últimos 7 días o el mes en curso. */
export type Periodo = "hoy" | "semana" | "mes";
export function rangoDe(p: Periodo, ahora = new Date()): { desde: string; hasta: string } {
  const hoy = ahora.toLocaleDateString("en-CA", { timeZone: "America/Caracas" });
  if (p === "hoy") return { desde: hoy, hasta: hoy };
  if (p === "mes") return { desde: hoy.slice(0, 8) + "01", hasta: hoy };
  const d = new Date(hoy + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - 6);
  return { desde: d.toISOString().slice(0, 10), hasta: hoy };
}

const num = (n: number | undefined) => (n ?? 0).toFixed(2).replace(".", ",");
const celda = (v: string | number) => {
  const t = typeof v === "number" ? num(v) : v;
  return /[;"\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
};
const METODO: Record<string, string> = { EFECTIVO_USD: "Efectivo $", EFECTIVO_BS: "Efectivo Bs", PUNTO: "Punto", PAGO_MOVIL: "Pago móvil", BIOPAGO: "Biopago", OTRO: "Otras formas", FIADO: "Fiado" };

/** CSV para Excel en español: separador ';', coma decimal y BOM para que abra con acentos. */
export function reporteCsv(r: ReporteDia): string {
  const filas: (string | number)[][] = [];
  filas.push(["Reporte KioskPOS", r.hasta && r.hasta !== r.fecha ? `${r.fecha} al ${r.hasta}` : r.fecha]);
  filas.push([]);
  filas.push(["Resumen", "Monto"]);
  filas.push(["Vendido ($)", r.totalUsd], ["Vendido (Bs)", r.totalBs], ["Ventas (cantidad)", String(r.cantidadVentas)],
    ["Devoluciones ($)", r.devolucionesUsd ?? 0], ["Costo ($)", r.costoUsd], ["Ganancia ($)", r.gananciaUsd]);
  if ((r.cantidadRecargas ?? 0) > 0) filas.push(["Recargas (Bs)", r.recargasBs ?? 0], ["Ganancia recargas (Bs)", r.comisionRecargasBs ?? 0]);
  filas.push([]);
  filas.push(["Forma de pago", "Moneda", "Monto", "Equivalente $"]);
  for (const p of r.pagos) filas.push([METODO[p.metodo] || p.metodo, p.moneda, p.montoOriginal, p.equivalenteUsd]);
  if (r.porDia && r.porDia.length) {
    filas.push([]);
    filas.push(["Día", "Ventas", "Vendido $", "Ganancia $"]);
    for (const d of r.porDia) filas.push([d.fecha, String(d.cantidadVentas), d.totalUsd, d.gananciaUsd]);
  }
  if (r.masVendidos && r.masVendidos.length) {
    filas.push([]);
    filas.push(["Más vendidos", "Cantidad", "Vendido $", "Ganancia $"]);
    for (const m of r.masVendidos) filas.push([m.nombre, String(m.cantidad).replace(".", ","), m.vendidoUsd, m.gananciaUsd]);
  }
  return "﻿" + filas.map((f) => f.map(celda).join(";")).join("\r\n") + "\r\n";
}

export function descargarCsv(nombre: string, contenido: string) {
  const url = URL.createObjectURL(new Blob([contenido], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
