import type { Page } from "@playwright/test";

// Servidor simulado para las pruebas: responde como el backend real.
export const metodos = [
  { metodo: "EFECTIVO_USD", moneda: "USD", esperado: 62, digital: false },
  { metodo: "EFECTIVO_BS", moneda: "VES", esperado: 9000, digital: false },
  { metodo: "PUNTO", moneda: "VES", esperado: 13500, digital: true },
  { metodo: "PAGO_MOVIL", moneda: "VES", esperado: 8070, digital: true },
  { metodo: "BIOPAGO", moneda: "VES", esperado: 0, digital: true },
];
export const resumen = { turnoId: 7, estado: "ABIERTO", fondoUsd: 20, fondoBs: 0, efectivoUsd: 45, efectivoBs: 9000, vueltoUsd: 3, vueltoBs: 0, esperadoUsd: 62, esperadoBs: 9000, declaradoUsd: null, declaradoBs: null, diferenciaUsd: null, diferenciaBs: null, metodos };
export const productos = [
  { id: 1, codigoBarras: "7591001", nombre: "Harina PAN", precioUsd: 1, costoUsd: 0.7, stockActual: 20, stockMinimo: 2, categoria: "Víveres", esPesable: false, unidadMedida: "UND", activo: true },
  { id: 2, codigoBarras: "7591002", nombre: "Coca-Cola 2L", precioUsd: 1.75, costoUsd: 1, stockActual: 20, stockMinimo: 2, categoria: "Bebidas", esPesable: false, unidadMedida: "UND", activo: true },
  { id: 3, codigoBarras: "7591003", nombre: "Arroz Mary", precioUsd: 2.5, costoUsd: 1.5, stockActual: 0, stockMinimo: 2, categoria: "Víveres", esPesable: false, unidadMedida: "UND", activo: true },
  { id: 4, codigoBarras: "2000001", nombre: "Queso blanco", precioUsd: 6, costoUsd: 4, stockActual: 5, stockMinimo: 1, categoria: "Charcutería", esPesable: true, unidadMedida: "KG", activo: true },
];

/** Config de caja del negocio tal como la guarda el servidor (PUT /api/mi-negocio/caja-config). */
export interface CajaCfg { metodosPago: string | null; tasaModo: string; ajusteTipo: string; ajuste: number; tasaManual: number; }
export interface Estado { turnoAbierto: boolean; abrirFalla?: boolean; venta?: any; cierre?: any; tasa?: number | null; cajaConfig?: CajaCfg; puts?: CajaCfg[];
  movs?: any[]; clientes?: any[]; abonos?: any[]; nuevoCliente?: any;
  anulada?: any; devuelta?: any; compra?: any; descuento?: any; fiado?: any; producto?: any; categoria?: any; nomina?: any;
  ventaFalla?: string; turnoDesde?: string; nominaHist?: any[]; nominaAnulada?: any;
  recargas?: any[]; rango?: any; configNeg?: any;
  contab?: Record<string, { contenido: string; version: number }>; contabPuts?: number;
  prueba?: boolean; planCambio?: any; sesionVencida?: boolean;
  bloques?: any[]; bloquesPut?: { productoId: number; lista: any[] }; }

export const ventasDemo = [
  { id: 11, numeroFactura: 5, fechaHora: "2026-11-10T14:05:00Z", cajaId: 1, totalUsd: 2.75, totalBs: 2475, estado: "COMPLETADA", clienteId: null, pagos: "EFECTIVO_USD", items: 2, devueltoUsd: 0 },
  { id: 12, numeroFactura: 4, fechaHora: "2026-11-10T13:10:00Z", cajaId: 1, totalUsd: 6, totalBs: 5400, estado: "COMPLETADA", clienteId: null, pagos: "PAGO_MOVIL", items: 1, devueltoUsd: 0 },
];
const detalleDemo = (id: number) => ({
  id, numeroFactura: id === 11 ? 5 : 4, fechaHora: "2026-11-10T14:05:00Z", estado: "COMPLETADA", cajaId: 1, turnoId: 7, turnoAbierto: id === 11, tasa: 900,
  totalUsd: id === 11 ? 2.75 : 6, totalBs: id === 11 ? 2475 : 5400, vueltoUsd: 0, vueltoBs: 0, clienteId: null, motivoAnulacion: null,
  lineas: id === 11
    ? [{ detalleId: 101, productoId: 2, nombre: "Coca-Cola 2L", cantidad: 1, precioUsd: 1.75, subtotalUsd: 1.75, devuelto: 0 }, { detalleId: 102, productoId: 1, nombre: "Harina PAN", cantidad: 1, precioUsd: 1, subtotalUsd: 1, devuelto: 0 }]
    : [{ detalleId: 201, productoId: 3, nombre: "Arroz Mary", cantidad: 3, precioUsd: 2, subtotalUsd: 6, devuelto: 1 }],
  pagos: [{ metodo: id === 11 ? "EFECTIVO_USD" : "PAGO_MOVIL", moneda: id === 11 ? "USD" : "VES", monto: id === 11 ? 2.75 : 5400, referencia: null }],
  devoluciones: id === 11 ? [] : [{ devolucion: { id: 1, totalUsd: 2, metodoReembolso: "EFECTIVO_USD", montoReembolso: 2, motivo: null, createdAt: "" }, reembolsos: [{ metodo: "EFECTIVO_USD", moneda: "USD", monto: 2, referencia: null }] }], devueltoUsd: id === 11 ? 0 : 2,
});

/** Reporte por rango: un día por cada fecha entre desde y hasta, con dos productos top. */
export function rangoDemo(u: string) {
  const q = new URL(u).searchParams, desde = q.get("desde")!, hasta = q.get("hasta")!;
  const dias: any[] = [];
  for (let d = new Date(desde + "T12:00:00Z"); d.toISOString().slice(0, 10) <= hasta; d.setUTCDate(d.getUTCDate() + 1)) {
    const i = dias.length; dias.push({ fecha: d.toISOString().slice(0, 10), cantidadVentas: 3 + i, totalUsd: 10 + i * 2, gananciaUsd: 3 + i });
  }
  const total = dias.reduce((s, x) => s + x.totalUsd, 0), gan = dias.reduce((s, x) => s + x.gananciaUsd, 0);
  return { fecha: desde, hasta, cantidadVentas: dias.reduce((s, x) => s + x.cantidadVentas, 0), totalUsd: total, totalBs: total * 900, costoUsd: total - gan, gananciaUsd: gan,
    pagos: [{ metodo: "EFECTIVO_USD", moneda: "USD", montoOriginal: total, equivalenteUsd: total }], movimientos: [], comisionAvancesBs: 0, abonosFiadoUsd: 0, devolucionesUsd: 0,
    cantidadRecargas: 4, recargasBs: 1200, comisionRecargasBs: 120,
    masVendidos: [{ productoId: 1, nombre: "Harina PAN", cantidad: 30, vendidoUsd: 30, gananciaUsd: 9 }, { productoId: 2, nombre: "Coca-Cola 2L", cantidad: 8, vendidoUsd: 14, gananciaUsd: 6 }],
    porDia: dias.length > 1 ? dias : [] };
}

export const planesDemo = [
  { codigo: "BASICO", nombre: "Bodega", precioBase: 25, cajasIncluidas: 1, precioCajaExtra: 10, maxCajas: 3, descripcion: "Para la bodega de una o dos cajas." },
  { codigo: "PRO", nombre: "Bodega Pro", precioBase: 40, cajasIncluidas: 2, precioCajaExtra: 8, maxCajas: 10, descripcion: "Para negocios con varias cajas." },
];
export const situacionDemo = (st: Estado) => ({ negocioId: 1, nombre: "Bodega", plan: "BASICO", planNombre: "Bodega", estadoEfectivo: "ACTIVA", puedeCobrar: true, pagoHasta: "2026-12-10",
  diasVencido: 0, mesesPendientes: 0, deuda: 0, mensaje: st.prueba ? "Prueba gratis: te quedan 5 días" : "", enPrueba: !!st.prueba, cajasContratadas: 1, mensualidad: 25 });

export const clientesDemo = () => [
  { id: 1, nombre: "María Pérez", cedula: "V12345678", telefono: "04121234567", limiteUsd: 10, activo: true, saldoUsd: 8, ultimoMovimiento: "2026-11-09T12:00:00Z" },
  { id: 2, nombre: "José Rojas", cedula: null, telefono: null, limiteUsd: 0, activo: true, saldoUsd: 0, ultimoMovimiento: null },
  { id: 3, nombre: "Luis (empleado)", cedula: null, telefono: null, limiteUsd: 0, activo: true, saldoUsd: 12, ultimoMovimiento: null, tipo: "TRABAJADOR", sueldoUsd: 15 },
];

/** Config del servidor a partir de la de la PWA (para armar escenarios). */
export const cfgServidor = (c: { metodos?: object; extras?: object[]; tasaModo?: string; ajusteTipo?: string; ajuste?: number; tasaManual?: number }): CajaCfg => ({
  metodosPago: JSON.stringify({ metodos: c.metodos || {}, extras: c.extras || [] }),
  tasaModo: (c.tasaModo || "bcv").toUpperCase(), ajusteTipo: (c.ajusteTipo || "pct").toUpperCase(), ajuste: c.ajuste || 0, tasaManual: c.tasaManual || 0,
});

/** Igual que TasaNegocioService.calcular del servidor. */
function efectiva(c: CajaCfg, bcv: number | null): number | null {
  if (c.tasaModo === "MANUAL") return c.tasaManual > 0 ? c.tasaManual : null;
  if (!bcv) return null;
  if (c.tasaModo === "AJUSTE" && c.ajuste > 0) return Math.ceil(bcv + (c.ajusteTipo === "BS" ? c.ajuste : (bcv * c.ajuste) / 100) - 1e-9);
  return bcv;
}

export const sesionCajero = { token: "x", rol: "CAJERO", usuarioId: 3, negocioId: 1, cajaId: 1, nombre: "test2" };
export const sesionDueno = { token: "x", rol: "DUENO", usuarioId: 1, negocioId: 1, cajaId: null, nombre: "ingri" };

/** Prepara el equipo (localStorage) una sola vez y simula la API. */
export async function preparar(page: Page, st: Estado, local: Record<string, unknown> = {}) {
  await page.addInitScript((ls) => {
    if (sessionStorage.getItem("__init")) return;
    sessionStorage.setItem("__init", "1");
    localStorage.clear();
    localStorage.setItem("kioskpos.cajaToken", JSON.stringify("tok"));
    localStorage.setItem("kioskpos.tasa", JSON.stringify("900"));
    for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v));
  }, local);
  await page.route("**/api/**", async (r) => {
    const u = r.request().url(), m = r.request().method();
    if (st.sesionVencida && !u.includes("/api/auth/") && !u.includes("/api/caja/cajeros") && !u.includes("/api/tasa")) return r.fulfill({ status: 401, json: { error: "Sesión vencida" } });
    if (u.includes("/api/caja/cajeros")) return r.fulfill({ json: [{ id: 2, nombre: "test1" }, { id: 3, nombre: "test2" }] });
    if (u.includes("/api/auth/login-cajero")) return r.fulfill({ json: { token: "x", rol: "CAJERO", usuarioId: 3, negocioId: 1, cajaId: 1, nombreCompleto: "test2" } });
    if (u.includes("/api/inventario/categorias")) {
      if (m !== "GET") { st.categoria = { metodo: m, ...JSON.parse(r.request().postData() || "{}") }; return r.fulfill({ json: { nombre: "x", productos: 0 } }); }
      return r.fulfill({ json: [{ nombre: "Bebidas", productos: 1 }, { nombre: "Charcutería", productos: 1 }, { nombre: "General", productos: 0 }, { nombre: "Víveres", productos: 2 }] });
    }
    if (u.includes("/api/inventario/presentaciones")) return r.fulfill({ json: st.bloques ?? [] });
    if (/\/api\/inventario\/productos\/\d+\/presentaciones/.test(u)) {
      const productoId = Number(u.split("/").slice(-2)[0]); const lista = JSON.parse(r.request().postData() || "[]");
      st.bloquesPut = { productoId, lista };
      return r.fulfill({ json: lista.map((b: any, i: number) => ({ id: 100 + i, productoId, ...b })) });
    }
    if (u.includes("/api/inventario/productos") && (m === "POST" || m === "PUT")) { st.producto = { metodo: m, ...JSON.parse(r.request().postData() || "{}") }; return r.fulfill({ json: productos[0] }); }
    if (u.includes("/api/inventario")) return r.fulfill({ json: productos });
    if (u.includes("/api/tasa")) return r.fulfill({ json: { bs: st.tasa === undefined ? 900 : st.tasa } });
    const res = { ...resumen, fechaApertura: st.turnoDesde ?? new Date().toISOString() };
    if (u.includes("/api/cuadre/actual")) return st.turnoAbierto ? r.fulfill({ json: res }) : r.fulfill({ status: 204, body: "" });
    if (u.includes("/api/cuadre/abrir")) { const ya = st.turnoAbierto; st.turnoAbierto = true; return st.abrirFalla && ya ? r.fulfill({ status: 409, json: { error: "Esta caja ya tiene un turno abierto" } }) : r.fulfill({ json: resumen }); }
    if (u.includes("/cerrar")) { st.cierre = JSON.parse(r.request().postData() || "{}"); st.turnoAbierto = false; return r.fulfill({ json: { ...resumen, estado: "CERRADO", declaradoUsd: st.cierre.declaradoUsd, declaradoBs: st.cierre.declaradoBs, diferenciaUsd: st.cierre.declaradoUsd - 62, diferenciaBs: st.cierre.declaradoBs - 9000 } }); }
    if (/\/api\/cuadre\/turnos\/\d+\/movimientos/.test(u)) return r.fulfill({ json: st.movs ?? [] });
    if (u.includes("/api/cuadre/movimientos") && m === "POST" && !u.includes("/anular")) {
      const b = JSON.parse(r.request().postData() || "{}");
      const mv = { id: (st.movs?.length ?? 0) + 1, turnoId: 7, anulado: false, createdAt: new Date().toISOString(), metodoCobro: null, montoCobrado: null, comision: null, ...b,
        concepto: b.concepto || (b.tipo === "AVANCE" ? "Avance de efectivo" : ""), ...(b.tipo === "AVANCE" ? { comision: Math.round((b.montoCobrado - b.monto) * 100) / 100 } : {}) };
      (st.movs ??= []).push(mv);
      return r.fulfill({ json: mv });
    }
    if (u.includes("/api/cuadre/turnos/")) return r.fulfill({ json: res });
    if (/\/api\/clientes\/\d+\/fiar/.test(u)) { st.fiado = { id: Number(u.split("/").slice(-2)[0]), ...JSON.parse(r.request().postData() || "{}") }; return r.fulfill({ json: { ventaId: 70, numeroFactura: 3, totalUsd: 3.5, totalBs: 3150 } }); }
    if (/\/api\/clientes\/\d+\/descuento-sueldo/.test(u)) { st.descuento = { id: Number(u.split("/").slice(-2)[0]), ...JSON.parse(r.request().postData() || "{}") }; return r.fulfill({ json: { id: 98, tipo: "ABONO" } }); }
    if (/\/api\/clientes\/\d+\/abonos/.test(u)) { const b = JSON.parse(r.request().postData() || "{}"); (st.abonos ??= []).push(b); return r.fulfill({ json: { id: 99, tipo: "ABONO", ...b } }); }
    if (/\/api\/clientes\/\d+$/.test(u)) {
      const id = Number(u.split("/").pop()); const c = (st.clientes ?? clientesDemo()).find((x) => x.id === id);
      return r.fulfill({ json: { cliente: c, movimientos: c && c.saldoUsd > 0 ? [{ id: 5, tipo: "CARGO", montoUsd: c.saldoUsd, ventaId: 12, metodo: "FIADO", moneda: "USD", montoOriginal: c.saldoUsd, referencia: null, nota: null, createdAt: "2026-11-09T12:00:00Z" }] : [] } });
    }
    if (u.includes("/api/clientes") && m === "POST") { const b = JSON.parse(r.request().postData() || "{}"); st.nuevoCliente = b; const c = { id: 50, cedula: null, telefono: null, limiteUsd: 0, activo: true, saldoUsd: 0, ultimoMovimiento: null, ...b }; (st.clientes ??= clientesDemo()).push(c); return r.fulfill({ json: c }); }
    if (u.includes("/api/clientes")) return r.fulfill({ json: st.clientes ?? clientesDemo() });
    if (/\/api\/ventas\/\d+\/detalle/.test(u)) return r.fulfill({ json: detalleDemo(Number(u.split("/").slice(-2)[0])) });
    if (/\/api\/ventas\/\d+\/anular/.test(u)) { st.anulada = { id: Number(u.split("/").slice(-2)[0]), ...JSON.parse(r.request().postData() || "{}") }; return r.fulfill({ json: { id: 11, estado: "ANULADA" } }); }
    if (/\/api\/ventas\/\d+\/devolver/.test(u)) { st.devuelta = { id: Number(u.split("/").slice(-2)[0]), ...JSON.parse(r.request().postData() || "{}") }; return r.fulfill({ json: { id: 2 } }); }
    if (u.includes("/api/ventas/buscar")) { const n = Number(new URL(u).searchParams.get("numero")); return r.fulfill({ json: ventasDemo.filter((v) => v.numeroFactura === n) }); }
    if (u.includes("/api/ventas") && m === "GET") return r.fulfill({ json: ventasDemo });
    if (u.includes("/api/recargas") && m === "POST" && !u.includes("/anular")) {
      const b = JSON.parse(r.request().postData() || "{}");
      const enBs = b.metodoCobro === "EFECTIVO_USD" ? Math.round(b.montoCobrado * b.tasa * 100) / 100 : b.montoCobrado;
      const rec = { id: (st.recargas?.length ?? 0) + 1, turnoId: 7, anulada: false, createdAt: new Date().toISOString(), referencia: null, moneda: b.metodoCobro === "EFECTIVO_USD" ? "USD" : "VES", comisionBs: Math.round((enBs - b.montoBs) * 100) / 100, ...b };
      (st.recargas ??= []).push(rec); return r.fulfill({ json: rec });
    }
    if (/\/api\/recargas\/\d+\/anular/.test(u)) { const id = Number(u.split("/").slice(-2)[0]); const x = st.recargas?.find((y) => y.id === id); if (x) x.anulada = true; return r.fulfill({ json: x ?? {} }); }
    if (u.includes("/api/recargas")) return r.fulfill({ json: [...(st.recargas ?? [])].reverse() });
    if (u.includes("/api/contabilidad/")) {
      const clave = u.split("/api/contabilidad/")[1].split("?")[0];
      st.contab ??= {};
      if (m === "PUT") {
        const b = JSON.parse(r.request().postData() || "{}"); const cur = st.contab[clave];
        if ((cur?.version ?? 0) !== b.version) return r.fulfill({ status: 409, json: { error: "Otro equipo guardó cambios más nuevos", actual: cur ? { clave, ...cur, updatedAt: "" } : null } });
        st.contab[clave] = { contenido: b.contenido, version: (cur?.version ?? 0) + 1 }; st.contabPuts = (st.contabPuts ?? 0) + 1;
        return r.fulfill({ json: { clave, ...st.contab[clave], updatedAt: "" } });
      }
      return st.contab[clave] ? r.fulfill({ json: { clave, ...st.contab[clave], updatedAt: "" } }) : r.fulfill({ status: 204, body: "" });
    }
    if (u.includes("/api/reportes/rango")) { st.rango = u; return r.fulfill({ json: rangoDemo(u) }); }
    if (u.includes("/api/mi-negocio/config")) {
      if (m === "PUT") st.configNeg = JSON.parse(r.request().postData() || "{}");
      return r.fulfill({ json: { nombre: "Bodega Cocoa", telefono: null, direccion: null, cajasContratadas: 1, horariosCierre: null, rif: null, mensajeTicket: null, ...(st.configNeg ?? {}) } });
    }
    if (/\/api\/nomina\/pagos\/\d+\/anular/.test(u)) {
      st.nominaAnulada = { id: Number(u.split("/").slice(-2)[0]), ...JSON.parse(r.request().postData() || "{}") };
      const h = st.nominaHist?.find((x) => x.pago.id === st.nominaAnulada.id);
      if (h) { h.pago = { ...h.pago, estado: "ANULADO", motivoAnulacion: st.nominaAnulada.motivo }; }
      return r.fulfill({ json: h ?? {} });
    }
    if (u.includes("/api/nomina/pagos") && m === "POST") {
      const b = JSON.parse(r.request().postData() || "{}"); st.nomina = b;
      const neto = Math.round((b.sueldoUsd + b.bonosUsd - b.otrosDescuentosUsd - b.fiadoDescontadoUsd) * 100) / 100;
      return r.fulfill({ json: { trabajador: "Luis (empleado)", pago: { id: 5, trabajadorId: b.trabajadorId, periodo: b.periodo, sueldoUsd: b.sueldoUsd, bonosUsd: b.bonosUsd, otrosDescuentosUsd: b.otrosDescuentosUsd,
        conceptoDescuentos: b.conceptoDescuentos ?? null, fiadoDescontadoUsd: b.fiadoDescontadoUsd, netoUsd: neto, metodo: b.metodo, moneda: b.tasa ? "VES" : "USD", montoPagado: b.tasa ? neto * b.tasa : neto, tasa: b.tasa ?? null, referencia: b.referencia ?? null, nota: null, createdAt: "2026-11-10T15:00:00Z" } } });
    }
    if (u.includes("/api/nomina/pagos")) return r.fulfill({ json: st.nominaHist ?? [] });
    if (u.includes("/api/nomina")) return r.fulfill({ json: { totalSueldosUsd: 15, totalFiadoUsd: 12, pagadoEsteMesUsd: 0,
      trabajadores: [{ id: 3, nombre: "Luis (empleado)", telefono: null, activo: true, sueldoUsd: 15, debeFiadoUsd: 12, netoSugeridoUsd: 3, ultimoPago: null, ultimoPeriodo: null, pagadoEsteMesUsd: 0 }] } });
    if (u.includes("/api/proveedores")) return r.fulfill({ json: [{ id: 3, nombre: "Distribuidora Polar", rif: "J-1", telefono: null, contacto: null, activo: true, porPagarUsd: 40, compras: 2 }] });
    if (u.includes("/api/compras") && m === "POST") { st.compra = JSON.parse(r.request().postData() || "{}"); return r.fulfill({ json: { compra: { id: 9 }, proveedor: null, detalles: [] } }); }
    if (u.includes("/api/compras")) return r.fulfill({ json: [{ compra: { id: 8, proveedorId: 3, numeroFactura: "A-77", fecha: "2026-11-09", totalUsd: 40, tasa: 900, pagada: false, estado: "REGISTRADA", nota: null }, proveedor: "Distribuidora Polar", detalles: [] }] });
    if (u.includes("/api/ventas") && m === "POST" && st.ventaFalla) return r.fulfill({ status: 409, json: { error: st.ventaFalla } });
    if (u.includes("/api/ventas") && m === "POST") { st.venta = JSON.parse(r.request().postData() || "{}"); return r.fulfill({ json: { id: 99, numeroFactura: 1 } }); }
    if (u.includes("/api/mi-negocio/caja-config")) {
      if (m === "PUT") { st.cajaConfig = JSON.parse(r.request().postData() || "{}"); (st.puts ??= []).push(st.cajaConfig!); }
      const c = st.cajaConfig ?? { metodosPago: null, tasaModo: "BCV", ajusteTipo: "PCT", ajuste: 0, tasaManual: 0 };
      const bcv = st.tasa === undefined ? 900 : st.tasa;
      return r.fulfill({ json: { ...c, tasaBcv: bcv, tasaEfectiva: efectiva(c, bcv) } });
    }
    if (u.includes("/api/mi-negocio/config")) return r.fulfill({ json: { nombre: "Bodega", telefono: null, direccion: null, cajasContratadas: 1, horariosCierre: null } });
    if (u.includes("/api/planes")) return r.fulfill({ json: planesDemo });
    if (u.includes("/api/mi-negocio/plan") && m === "PUT") {
      st.planCambio = JSON.parse(r.request().postData() || "{}");
      const p = planesDemo.find((x) => x.codigo === st.planCambio.plan)!;
      return r.fulfill({ json: { ...situacionDemo(st), plan: p.codigo, planNombre: p.nombre, cajasContratadas: st.planCambio.cajas, mensualidad: p.precioBase + Math.max(0, st.planCambio.cajas - p.cajasIncluidas) * p.precioCajaExtra } });
    }
    if (u.includes("/api/mi-negocio/suscripcion")) return r.fulfill({ json: situacionDemo(st) });
    if (/\/api\/(usuarios|cajas|reportes\/cierres|mi-negocio\/pagos|admin\/pagos-pendientes)/.test(u)) return r.fulfill({ json: [] });
    if (u.includes("/api/reportes/dia")) return r.fulfill({ json: { fecha: "2026-11-10", cantidadVentas: 0, totalUsd: 0, totalBs: 0, costoUsd: 0, gananciaUsd: 0, pagos: [] } });
    return r.fulfill({ json: {} });
  });
}

/** Abre la app y espera a que termine de cargar (antes de usar el teclado). */
export async function ir(page: Page) {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
}
