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

export interface Estado { turnoAbierto: boolean; abrirFalla?: boolean; venta?: any; cierre?: any; tasa?: number | null; }

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
    if (u.includes("/api/cuadre/turnos/")) return r.fulfill({ json: resumen });
    if (u.includes("/api/ventas") && m === "POST") { st.venta = JSON.parse(r.request().postData() || "{}"); return r.fulfill({ json: { id: 99, numeroFactura: 1 } }); }
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
