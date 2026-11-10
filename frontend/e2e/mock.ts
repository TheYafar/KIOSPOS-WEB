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
];

/** Config de caja del negocio tal como la guarda el servidor (PUT /api/mi-negocio/caja-config). */
export interface CajaCfg { metodosPago: string | null; tasaModo: string; ajusteTipo: string; ajuste: number; tasaManual: number; }
export interface Estado { turnoAbierto: boolean; abrirFalla?: boolean; venta?: any; cierre?: any; tasa?: number | null; cajaConfig?: CajaCfg; puts?: CajaCfg[];
  movs?: any[]; clientes?: any[]; abonos?: any[]; nuevoCliente?: any; }

export const clientesDemo = () => [
  { id: 1, nombre: "María Pérez", cedula: "V12345678", telefono: "04121234567", limiteUsd: 10, activo: true, saldoUsd: 8, ultimoMovimiento: "2026-11-09T12:00:00Z" },
  { id: 2, nombre: "José Rojas", cedula: null, telefono: null, limiteUsd: 0, activo: true, saldoUsd: 0, ultimoMovimiento: null },
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
    if (u.includes("/api/caja/cajeros")) return r.fulfill({ json: [{ id: 2, nombre: "test1" }, { id: 3, nombre: "test2" }] });
    if (u.includes("/api/auth/login-cajero")) return r.fulfill({ json: { token: "x", rol: "CAJERO", usuarioId: 3, negocioId: 1, cajaId: 1, nombreCompleto: "test2" } });
    if (u.includes("/api/inventario")) return r.fulfill({ json: productos });
    if (u.includes("/api/tasa")) return r.fulfill({ json: { bs: st.tasa === undefined ? 900 : st.tasa } });
    if (u.includes("/api/cuadre/actual")) return st.turnoAbierto ? r.fulfill({ json: resumen }) : r.fulfill({ status: 204, body: "" });
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
    if (u.includes("/api/cuadre/turnos/")) return r.fulfill({ json: resumen });
    if (/\/api\/clientes\/\d+\/abonos/.test(u)) { const b = JSON.parse(r.request().postData() || "{}"); (st.abonos ??= []).push(b); return r.fulfill({ json: { id: 99, tipo: "ABONO", ...b } }); }
    if (/\/api\/clientes\/\d+$/.test(u)) {
      const id = Number(u.split("/").pop()); const c = (st.clientes ?? clientesDemo()).find((x) => x.id === id);
      return r.fulfill({ json: { cliente: c, movimientos: c && c.saldoUsd > 0 ? [{ id: 5, tipo: "CARGO", montoUsd: c.saldoUsd, ventaId: 12, metodo: "FIADO", moneda: "USD", montoOriginal: c.saldoUsd, referencia: null, nota: null, createdAt: "2026-11-09T12:00:00Z" }] : [] } });
    }
    if (u.includes("/api/clientes") && m === "POST") { const b = JSON.parse(r.request().postData() || "{}"); st.nuevoCliente = b; const c = { id: 50, cedula: null, telefono: null, limiteUsd: 0, activo: true, saldoUsd: 0, ultimoMovimiento: null, ...b }; (st.clientes ??= clientesDemo()).push(c); return r.fulfill({ json: c }); }
    if (u.includes("/api/clientes")) return r.fulfill({ json: st.clientes ?? clientesDemo() });
    if (u.includes("/api/ventas") && m === "POST") { st.venta = JSON.parse(r.request().postData() || "{}"); return r.fulfill({ json: { id: 99, numeroFactura: 1 } }); }
    if (u.includes("/api/mi-negocio/caja-config")) {
      if (m === "PUT") { st.cajaConfig = JSON.parse(r.request().postData() || "{}"); (st.puts ??= []).push(st.cajaConfig!); }
      const c = st.cajaConfig ?? { metodosPago: null, tasaModo: "BCV", ajusteTipo: "PCT", ajuste: 0, tasaManual: 0 };
      const bcv = st.tasa === undefined ? 900 : st.tasa;
      return r.fulfill({ json: { ...c, tasaBcv: bcv, tasaEfectiva: efectiva(c, bcv) } });
    }
    if (u.includes("/api/mi-negocio/config")) return r.fulfill({ json: { nombre: "Bodega", telefono: null, direccion: null, cajasContratadas: 1, horariosCierre: null } });
    if (u.includes("/api/mi-negocio/suscripcion")) return r.fulfill({ json: { negocioId: 1, nombre: "Bodega", plan: "BASICO", estadoEfectivo: "ACTIVA", puedeCobrar: true, pagoHasta: "2026-12-10", diasVencido: 0, mesesPendientes: 0, deuda: 0, mensaje: "" } });
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
