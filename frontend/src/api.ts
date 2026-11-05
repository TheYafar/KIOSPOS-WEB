import { encolar, listar, marcar, quitar } from "./outbox";
import {
  getCajaToken,
  getPermiso,
  getSesion,
  getTasa,
  setPermiso,
  setSesion,
  setTasa,
  type Rol,
  type Sesion
} from "./session";

/**
 * Llamadas al backend de KioskPOS. Cobrar SIEMPRE encola primero (durable) y luego
 * intenta enviar; sin internet la venta espera y se sincroniza al reconectar, con su
 * codigoUnico para que el servidor deduplique (no cobra dos veces).
 */

function auth(): HeadersInit {
  const s = getSesion();
  return s ? { Authorization: "Bearer " + s.token } : {};
}

async function parse(resp: Response): Promise<any> {
  const txt = await resp.text();
  const body = txt ? JSON.parse(txt) : null;
  if (!resp.ok) {
    throw new Error(body?.error || "Error " + resp.status);
  }
  return body;
}

// ---------- Auth ----------

export interface Cajero { id: number; nombre: string; }

export async function listarCajeros(): Promise<Cajero[]> {
  const resp = await fetch("/api/caja/cajeros", { headers: { "X-Caja-Token": getCajaToken() } });
  return parse(resp);
}

export async function loginCajero(usuarioId: number, pin: string): Promise<Sesion> {
  const resp = await fetch("/api/auth/login-cajero", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cajaToken: getCajaToken(), usuarioId, pin })
  });
  const r = await parse(resp);
  const s: Sesion = {
    token: r.token, rol: r.rol as Rol, usuarioId: r.usuarioId,
    negocioId: r.negocioId, cajaId: r.cajaId, nombre: r.nombreCompleto
  };
  setSesion(s);
  return s;
}

export async function loginDueno(email: string, password: string): Promise<Sesion> {
  const resp = await fetch("/api/auth/login-dueno", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const r = await parse(resp);
  const s: Sesion = {
    token: r.token, rol: r.rol as Rol, usuarioId: r.usuarioId,
    negocioId: r.negocioId, cajaId: r.cajaId, nombre: r.nombreCompleto
  };
  setSesion(s);
  return s;
}

// ---------- Permiso de cobro (kill switch) ----------

export async function renovarPermiso(): Promise<{ ok: boolean; estado?: string; mensaje?: string }> {
  try {
    const resp = await fetch("/api/permiso/renovar", { method: "POST", headers: auth() });
    if (resp.ok) {
      const r = await resp.json();
      setPermiso(r.permiso);
      return { ok: true, estado: r.estado };
    }
    const b = await resp.json().catch(() => ({}));
    return { ok: false, mensaje: b.error || "Sin permiso" };
  } catch {
    return { ok: false, mensaje: "Sin conexión" };
  }
}

// ---------- Inventario ----------

export interface Producto {
  id: number; codigoBarras: string; nombre: string; precioUsd: number; costoUsd: number;
  stockActual: number; stockMinimo: number; categoria: string; esPesable: boolean; unidadMedida: string; activo: boolean;
}

export async function listarProductos(q?: string): Promise<Producto[]> {
  const url = "/api/inventario/productos" + (q ? "?q=" + encodeURIComponent(q) : "");
  return parse(await fetch(url, { headers: auth() }));
}

export interface DatosProducto {
  codigoBarras: string; nombre: string; precioUsd: number; costoUsd?: number;
  categoria?: string; stockInicial?: number; esPesable?: boolean; unidadMedida?: string; stockMinimo?: number;
}
export async function crearProducto(d: DatosProducto): Promise<Producto> {
  return parse(await fetch("/api/inventario/productos", { method: "POST", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify(d) }));
}
export async function ajustarStock(id: number, tipo: "ENTRADA" | "SALIDA" | "FIJAR", cantidad: number, motivo?: string): Promise<Producto> {
  return parse(await fetch("/api/inventario/productos/" + id + "/ajuste", { method: "POST", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify({ tipo, cantidad, motivo }) }));
}
export async function importarCsv(csv: string): Promise<{ creados: number; actualizados: number }> {
  return parse(await fetch("/api/inventario/importar", { method: "POST", headers: { "Content-Type": "text/plain", ...auth() }, body: csv }));
}

export interface DesglosePago { metodo: string; moneda: string; montoOriginal: number; equivalenteUsd: number; }
export interface ReporteDia { fecha: string; cantidadVentas: number; totalUsd: number; totalBs: number; costoUsd: number; gananciaUsd: number; pagos: DesglosePago[]; }
export async function reporteDia(fecha?: string): Promise<ReporteDia> {
  return parse(await fetch("/api/reportes/dia" + (fecha ? "?fecha=" + fecha : ""), { headers: auth() }));
}

// ---------- Cobro (con cola offline) ----------

export interface LineaCobro { productoId?: number | null; cantidad: number; precioUsd?: number; nombre?: string; }
export interface PagoCobro {
  metodo: "EFECTIVO_USD" | "EFECTIVO_BS" | "PUNTO" | "PAGO_MOVIL" | "BIOPAGO";
  moneda: "USD" | "VES"; montoOriginal: number; referencia?: string;
}

function nuevoCodigo(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "c-" + Date.now() + "-" + Math.random().toString(36).slice(2);
}

/** Registra una venta: la encola (durable) y trata de enviarla ya. */
export async function cobrar(items: LineaCobro[], pagos: PagoCobro[]): Promise<string> {
  const codigoUnico = nuevoCodigo();
  await encolar(codigoUnico, { codigoUnico, tasaBcv: Number(getTasa()) || 1, items, pagos });
  await sincronizar();
  return codigoUnico;
}

export interface ResultadoSync { enviadas: number; pendientes: number; errores: number; }

export async function sincronizar(): Promise<ResultadoSync> {
  let enviadas = 0;
  let errores = 0;
  for (const venta of await listar()) {
    if (venta.estado === "error") { errores++; continue; }
    try {
      const resp = await fetch("/api/ventas", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth(), "X-Permiso": getPermiso() },
        body: JSON.stringify(venta.payload)
      });
      if (resp.ok) {
        await quitar(venta.codigoUnico);
        enviadas++;
      } else if (resp.status === 401 || resp.status === 403) {
        await marcar(venta.codigoUnico, { intentos: venta.intentos + 1, ultimoError: "Sin permiso/sesión" });
      } else {
        const txt = await resp.text().catch(() => "");
        await marcar(venta.codigoUnico, { estado: "error", intentos: venta.intentos + 1, ultimoError: "HTTP " + resp.status + " " + txt.slice(0, 120) });
        errores++;
      }
    } catch {
      await marcar(venta.codigoUnico, { intentos: venta.intentos + 1, ultimoError: "Sin conexión" });
    }
  }
  return { enviadas, pendientes: (await listar()).length, errores };
}

// ---------- Cuadre ----------

export interface TurnoResumen {
  turnoId: number; estado: string;
  fondoUsd: number; fondoBs: number;
  efectivoUsd: number; efectivoBs: number;
  vueltoUsd: number; vueltoBs: number;
  esperadoUsd: number; esperadoBs: number;
  declaradoUsd: number | null; declaradoBs: number | null;
  diferenciaUsd: number | null; diferenciaBs: number | null;
}

export async function abrirTurno(fondoUsd: number, fondoBs: number): Promise<TurnoResumen> {
  const resp = await fetch("/api/cuadre/abrir", { method: "POST", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify({ fondoUsd, fondoBs }) });
  return parse(resp);
}
export async function resumenTurno(id: number): Promise<TurnoResumen> {
  return parse(await fetch("/api/cuadre/turnos/" + id, { headers: auth() }));
}
export async function cerrarTurno(id: number, declaradoUsd: number, declaradoBs: number): Promise<TurnoResumen> {
  const resp = await fetch("/api/cuadre/turnos/" + id + "/cerrar", { method: "POST", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify({ declaradoUsd, declaradoBs }) });
  return parse(resp);
}

// ---------- Usuarios (dueño/encargado) ----------

export interface Usuario { id: number; nombreCompleto: string; rol: Rol; activo: boolean; esSoporte: boolean; }
export async function listarUsuarios(): Promise<Usuario[]> { return parse(await fetch("/api/usuarios", { headers: auth() })); }
export async function crearUsuario(body: { rol: Rol; nombreCompleto: string; email?: string; password?: string; pin?: string }): Promise<Usuario> {
  return parse(await fetch("/api/usuarios", { method: "POST", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify(body) }));
}

export interface CajaInfo { id: number; nombre: string; localId: number; autorizada: boolean; activa: boolean; }
export interface CajaCreada extends CajaInfo { cajaToken: string; }
export async function listarCajas(): Promise<CajaInfo[]> { return parse(await fetch("/api/cajas", { headers: auth() })); }
export async function crearCaja(nombre: string): Promise<CajaCreada> {
  return parse(await fetch("/api/cajas", { method: "POST", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify({ nombre }) }));
}

// ---------- Super admin ----------

export async function adminLogin(email: string, password: string): Promise<string> {
  const r = await parse(await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) }));
  const s: Sesion = { token: r.token, rol: "SUPER_ADMIN", usuarioId: 0, negocioId: 0, cajaId: null, nombre: "Administración" };
  setSesion(s);
  return r.token;
}

export interface Situacion { negocioId: number; nombre: string; plan: string; estadoEfectivo: string; puedeCobrar: boolean; pagoHasta: string | null; diasVencido: number; mesesPendientes: number; deuda: number; mensaje: string; }
export interface NegocioVista { situacion: Situacion; cajas: number; ultimaVezEnLinea: string | null; ultimoPago: { monto: string; referencia: string | null; fecha: string } | null; }
export async function adminNegocios(): Promise<NegocioVista[]> { return parse(await fetch("/api/admin/negocios", { headers: auth() })); }
export async function adminCrearNegocio(body: { nombreNegocio: string; nombreDueno: string; email: string; password: string }): Promise<{ negocioId: number; duenoId: number }> {
  return parse(await fetch("/api/admin/negocios", { method: "POST", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify(body) }));
}
export async function adminSuspender(id: number): Promise<void> { await parse(await fetch(`/api/admin/negocios/${id}/suspender`, { method: "POST", headers: auth() })); }
export async function adminReactivar(id: number): Promise<void> { await parse(await fetch(`/api/admin/negocios/${id}/reactivar`, { method: "POST", headers: auth() })); }
export interface PagoPendiente { id: number; negocioId: number; monto: number; moneda: string; metodo: string; referencia: string | null; meses: number; estado: string; }
export async function adminPagosPendientes(): Promise<PagoPendiente[]> { return parse(await fetch("/api/admin/pagos-pendientes", { headers: auth() })); }
export async function adminAprobarPago(pagoId: number): Promise<void> { await parse(await fetch(`/api/admin/pagos/${pagoId}/aprobar`, { method: "POST", headers: auth() })); }

// ---------- Contabilidad (solo dueño) ----------

export type CategoriaGasto = "SERVICIOS" | "INTERNET" | "ALQUILER" | "OTRO";
export type TipoLinea = "INGRESO" | "EGRESO";

export interface ComparacionConta {
  entroAnterior: number; salioAnterior: number; quedaAnterior: number;
  diferenciaQueda: number; variacionPct: number | null;
}
export interface ResumenConta {
  desde: string; hasta: string;
  entro: number; nomina: number; servicios: number; otros: number; salio: number;
  queda: number; repartoMercanciaPct: number; mercancia: number; bolsillo: number;
  anterior: ComparacionConta;
}
export interface Gasto { id: number; fecha: string; categoria: CategoriaGasto; concepto: string; montoUsd: number; }
export interface LineaLibro { id: number; fecha: string; concepto: string; tipo: TipoLinea; montoUsd: number; }
export interface LibroConta { lineas: LineaLibro[]; ingresos: number; egresos: number; saldo: number; }

function rangoQS(desde?: string, hasta?: string): string {
  const p = new URLSearchParams();
  if (desde) p.set("desde", desde);
  if (hasta) p.set("hasta", hasta);
  const s = p.toString();
  return s ? "?" + s : "";
}

export async function contaResumen(desde?: string, hasta?: string): Promise<ResumenConta> {
  return parse(await fetch("/api/contabilidad/resumen" + rangoQS(desde, hasta), { headers: auth() }));
}

export async function contaGastos(desde?: string, hasta?: string): Promise<Gasto[]> {
  return parse(await fetch("/api/contabilidad/gastos" + rangoQS(desde, hasta), { headers: auth() }));
}
export async function contaCrearGasto(g: Omit<Gasto, "id">): Promise<Gasto> {
  return parse(await fetch("/api/contabilidad/gastos", { method: "POST", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify(g) }));
}
export async function contaActualizarGasto(id: number, g: Omit<Gasto, "id">): Promise<Gasto> {
  return parse(await fetch("/api/contabilidad/gastos/" + id, { method: "PUT", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify(g) }));
}
export async function contaEliminarGasto(id: number): Promise<void> {
  await parse(await fetch("/api/contabilidad/gastos/" + id, { method: "DELETE", headers: auth() }));
}

export async function contaLibro(desde?: string, hasta?: string): Promise<LibroConta> {
  return parse(await fetch("/api/contabilidad/libro" + rangoQS(desde, hasta), { headers: auth() }));
}
export async function contaCrearLinea(l: Omit<LineaLibro, "id">): Promise<LineaLibro> {
  return parse(await fetch("/api/contabilidad/libro", { method: "POST", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify(l) }));
}
export async function contaActualizarLinea(id: number, l: Omit<LineaLibro, "id">): Promise<LineaLibro> {
  return parse(await fetch("/api/contabilidad/libro/" + id, { method: "PUT", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify(l) }));
}
export async function contaEliminarLinea(id: number): Promise<void> {
  await parse(await fetch("/api/contabilidad/libro/" + id, { method: "DELETE", headers: auth() }));
}

export async function contaGetReparto(): Promise<number> {
  const r = await parse(await fetch("/api/contabilidad/config", { headers: auth() }));
  return Number(r.repartoMercanciaPct);
}
export async function contaSetReparto(pct: number): Promise<number> {
  const r = await parse(await fetch("/api/contabilidad/config", { method: "PUT", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify({ repartoMercanciaPct: pct }) }));
  return Number(r.repartoMercanciaPct);
}

export { getTasa, setTasa };
