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
  // Sesión vencida (el token dura 12 h): avisar a la app para que lleve a entrar otra vez.
  if (resp.status === 401 && getSesion() && !/\/api\/(auth|admin\/login)/.test(resp.url)) {
    window.dispatchEvent(new Event("kp-sesion-vencida"));
  }
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

const aSesion = (r: any): Sesion => ({ token: r.token, rol: r.rol as Rol, usuarioId: r.usuarioId, negocioId: r.negocioId, cajaId: r.cajaId, nombre: r.nombreCompleto });

/** Registro por cuenta propia: crea el negocio + la cuenta del dueño y deja la sesión iniciada. */
export async function registrarNegocio(d: { negocio: string; nombre: string; telefono?: string; email: string; password: string }): Promise<{ sesion: Sesion; codigo: string | null }> {
  const r = await parse(await fetch("/api/auth/registro", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) }));
  const s = aSesion(r.sesion);
  setSesion(s);
  return { sesion: s, codigo: r.codigoRecuperacion ?? null };
}

/** Qué ofrece la entrada: registro abierto, demo y si hay correo para recuperar la clave. */
export interface OpcionesEntrada { registro: boolean; demo: boolean; correo: boolean; }
export async function opcionesEntrada(): Promise<OpcionesEntrada> {
  return parse(await fetch("/api/auth/opciones"));
}

/** "Probar la demo": bodega de muestra propia (24 h). Trae la sesión de dueño y la de la cajera. */
export interface DemoCreada { dueno: Sesion; cajero: Sesion; pinCajero: string; expira: string; }
export async function crearDemo(): Promise<DemoCreada> {
  const r = await parse(await fetch("/api/auth/demo", { method: "POST" }));
  return { dueno: aSesion(r.dueno), cajero: aSesion(r.cajero), pinCajero: r.pinCajero, expira: r.expira };
}

/** Olvidé mi contraseña sin correo: correo + código → clave nueva. Devuelve un código NUEVO. */
export async function recuperarConCodigo(email: string, codigo: string, password: string): Promise<{ email: string; codigoNuevo: string }> {
  return parse(await fetch("/api/auth/recuperar-con-codigo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, codigo, password }) }));
}

export async function estadoRecuperacion(): Promise<{ tiene: boolean }> { return parse(await fetch("/api/mi-cuenta/recuperacion", { headers: auth() })); }
export async function generarCodigoRecuperacion(): Promise<string> {
  const r = await parse(await fetch("/api/mi-cuenta/recuperacion", { method: "POST", headers: auth() }));
  return r.codigo as string;
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

// ---------- Olvidé mi contraseña (dueño/encargado) ----------
export async function olvideClave(email: string): Promise<string> {
  const r = await parse(await fetch("/api/auth/olvide-clave", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) }));
  return r.mensaje;
}
/** Pone la contraseña nueva con el enlace; devuelve el correo de la cuenta. */
export async function restablecerClave(token: string, password: string): Promise<string> {
  const r = await parse(await fetch("/api/auth/restablecer-clave", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }) }));
  return r.email;
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

// ---------- Presentaciones / bloques (caja, media caja, saco...) ----------
/** Un bloque de un producto: "Caja" trae 20 a $5,00. La unidad suelta es el producto mismo. */
export interface Presentacion { id: number; productoId: number; nombre: string; cantidad: number; precioUsd: number; codigoBarras: string | null; }
export interface DatosPresentacion { nombre: string; cantidad: number; precioUsd: number; codigoBarras?: string | null; }
export async function listarPresentaciones(): Promise<Presentacion[]> {
  return parse(await fetch("/api/inventario/presentaciones", { headers: auth() }));
}
export async function guardarPresentaciones(productoId: number, lista: DatosPresentacion[]): Promise<Presentacion[]> {
  return parse(await fetch(`/api/inventario/productos/${productoId}/presentaciones`, { method: "PUT", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify(lista) }));
}

export interface DatosProducto {
  codigoBarras: string; nombre: string; precioUsd: number; costoUsd?: number;
  categoria?: string; stockInicial?: number; esPesable?: boolean; unidadMedida?: string; stockMinimo?: number;
}
export async function crearProducto(d: DatosProducto): Promise<Producto> {
  return parse(await fetch("/api/inventario/productos", { method: "POST", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify(d) }));
}
export async function actualizarProducto(id: number, d: DatosProducto): Promise<Producto> {
  return parse(await fetch("/api/inventario/productos/" + id, { method: "PUT", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify(d) }));
}
export async function eliminarProducto(id: number): Promise<void> {
  await parse(await fetch("/api/inventario/productos/" + id, { method: "DELETE", headers: auth() }));
}
// ---------- Categorías ----------
export interface Categoria { nombre: string; productos: number; }
export async function listarCategorias(): Promise<Categoria[]> { return parse(await fetch("/api/inventario/categorias", { headers: auth() })); }
export async function crearCategoria(nombre: string): Promise<Categoria> {
  return parse(await fetch("/api/inventario/categorias", { method: "POST", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify({ nombre }) }));
}
export async function renombrarCategoria(de: string, a: string): Promise<Categoria> {
  return parse(await fetch("/api/inventario/categorias", { method: "PUT", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify({ de, a }) }));
}
export async function borrarCategoria(nombre: string): Promise<void> {
  await parse(await fetch("/api/inventario/categorias?nombre=" + encodeURIComponent(nombre), { method: "DELETE", headers: auth() }));
}
export async function ajustarStock(id: number, tipo: "ENTRADA" | "SALIDA" | "FIJAR", cantidad: number, motivo?: string): Promise<Producto> {
  return parse(await fetch("/api/inventario/productos/" + id + "/ajuste", { method: "POST", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify({ tipo, cantidad, motivo }) }));
}
export async function importarCsv(csv: string): Promise<{ creados: number; actualizados: number }> {
  return parse(await fetch("/api/inventario/importar", { method: "POST", headers: { "Content-Type": "text/plain", ...auth() }, body: csv }));
}

export interface DesglosePago { metodo: string; moneda: string; montoOriginal: number; equivalenteUsd: number; }
export interface ReporteDia { fecha: string; cantidadVentas: number; totalUsd: number; totalBs: number; costoUsd: number; gananciaUsd: number; pagos: DesglosePago[];
  movimientos?: { tipo: string; moneda: string; total: number; cantidad: number }[]; comisionAvancesBs?: number; abonosFiadoUsd?: number; devolucionesUsd?: number;
  hasta?: string; cantidadRecargas?: number; recargasBs?: number; comisionRecargasBs?: number;
  masVendidos?: { productoId: number | null; nombre: string; cantidad: number; vendidoUsd: number; gananciaUsd: number }[];
  porDia?: { fecha: string; cantidadVentas: number; totalUsd: number; gananciaUsd: number }[]; }
export async function reporteRango(desde: string, hasta: string): Promise<ReporteDia> {
  return parse(await fetch(`/api/reportes/rango?desde=${desde}&hasta=${hasta}`, { headers: auth() }));
}
export async function reporteDia(fecha?: string): Promise<ReporteDia> {
  return parse(await fetch("/api/reportes/dia" + (fecha ? "?fecha=" + fecha : ""), { headers: auth() }));
}

export interface CierreDia {
  turnoId: number; cajaId: number; fechaCierre: string;
  vendidoUsd: number; gananciaUsd: number;
  diferenciaUsd: number | null; diferenciaBs: number | null;
}
export async function cierresDia(fecha?: string): Promise<CierreDia[]> {
  return parse(await fetch("/api/reportes/cierres" + (fecha ? "?fecha=" + fecha : ""), { headers: auth() }));
}

// ---------- Cobro (con cola offline) ----------

export interface LineaCobro { productoId?: number | null; cantidad: number; precioUsd?: number; nombre?: string; presentacionId?: number; }
export { listar as ventasEnCola, quitar as descartarDeCola, marcar as marcarEnCola } from "./outbox";
export interface PagoCobro {
  metodo: "EFECTIVO_USD" | "EFECTIVO_BS" | "PUNTO" | "PAGO_MOVIL" | "BIOPAGO" | "OTRO" | "FIADO";
  moneda: "USD" | "VES"; montoOriginal: number; referencia?: string;
}

function nuevoCodigo(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "c-" + Date.now() + "-" + Math.random().toString(36).slice(2);
}

/** Registra una venta: la encola (durable) y trata de enviarla ya. */
/** Recarga o avance de efectivo cobrado dentro de la venta (montos exactos en Bs). */
export interface ServicioCobro {
  tipo: "RECARGA" | "AVANCE"; operadora?: string; numero?: string; montoBs?: number;
  entregaMoneda?: "USD" | "VES"; entregaMonto?: number; cobradoBs: number;
}
/** vueltoUsd: dólares del vuelto que se entregan en $ (el resto sale en Bs). */
export async function cobrar(items: LineaCobro[], pagos: PagoCobro[], clienteId?: number | null, resumen?: { totalUsd: number; productos: string }, servicios?: ServicioCobro[], vueltoUsd?: number): Promise<string> {
  const codigoUnico = nuevoCodigo();
  await encolar(codigoUnico, { codigoUnico, tasaBcv: Number(getTasa()) || 1, items, pagos, ...(clienteId ? { clienteId } : {}),
    ...(servicios && servicios.length ? { servicios } : {}), ...(vueltoUsd != null ? { vueltoUsd } : {}) }, resumen);
  await sincronizar();
  return codigoUnico;
}

// Número de factura que dio el servidor a cada venta enviada (por su codigoUnico).
const facturas = new Map<string, number>();
export function facturaDe(codigoUnico: string): number | undefined { return facturas.get(codigoUnico); }

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
        // creadoAt: cuándo se cobró. Si llega tarde (cola sin internet), el servidor respeta su tasa.
        body: JSON.stringify({ ...(venta.payload as object), creadoAt: venta.creadoAt })
      });
      if (resp.ok) {
        try { const v = await resp.json(); if (v?.numeroFactura != null) facturas.set(venta.codigoUnico, v.numeroFactura); } catch { /* sin cuerpo */ }
        await quitar(venta.codigoUnico);
        enviadas++;
      } else if (resp.status === 401 || resp.status === 403) {
        await marcar(venta.codigoUnico, { intentos: venta.intentos + 1, ultimoError: "Sin permiso/sesión" });
      } else {
        const txt = await resp.text().catch(() => "");
        let motivo = txt.slice(0, 160);
        try { motivo = JSON.parse(txt)?.error || motivo; } catch { /* no es JSON */ }
        await marcar(venta.codigoUnico, { estado: "error", intentos: venta.intentos + 1, ultimoError: motivo || "Error " + resp.status });
        errores++;
      }
    } catch {
      await marcar(venta.codigoUnico, { intentos: venta.intentos + 1, ultimoError: "Sin conexión" });
    }
  }
  // Avisa a la pantalla (indicador de "ventas sin enviar").
  window.dispatchEvent(new Event("kp-cola"));
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
  metodos: { metodo: string; moneda: string; esperado: number; digital: boolean }[];
  /** Gastos, retiros, ingresos, avances (efectivo entregado) y abonos en efectivo del turno. */
  movimientos?: MovLinea[];
  fiadoUsd?: number;
  comisionAvancesBs?: number;
  /** Cuándo se abrió el turno (ISO). Sirve para avisar si quedó abierto de otro día. */
  fechaApertura?: string;
  recargasBs?: number;
  comisionRecargasBs?: number;
}

// ---------- Recargas de saldo ----------
export type Operadora = "MOVISTAR" | "DIGITEL" | "MOVILNET" | "CANTV" | "SIMPLE_TV" | "INTER" | "OTRA";
export interface RecargaV { id: number; turnoId: number; operadora: Operadora; numero: string; montoBs: number; metodoCobro: string; moneda: "USD" | "VES";
  montoCobrado: number; tasa: number; comisionBs: number; referencia: string | null; anulada: boolean; createdAt: string; ventaId?: number | null; }
export async function registrarRecarga(body: { operadora: Operadora; numero: string; montoBs: number; metodoCobro: string; montoCobrado: number; tasa: number; referencia?: string }): Promise<RecargaV> {
  return parse(await fetch("/api/recargas", { method: "POST", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify(body) }));
}
export async function recargasTurno(turnoId: number): Promise<RecargaV[]> { return parse(await fetch("/api/recargas?turnoId=" + turnoId, { headers: auth() })); }
export async function anularRecarga(id: number): Promise<RecargaV> { return parse(await fetch(`/api/recargas/${id}/anular`, { method: "POST", headers: auth() })); }
export interface MovLinea { tipo: "GASTO" | "RETIRO" | "INGRESO" | "AVANCE" | "ABONO" | "DEVOLUCION" | "RECARGA"; moneda: "USD" | "VES"; total: number; cantidad: number; }

// ---------- Movimientos de caja (gastos, retiros, ingresos, avances) ----------
export type TipoMov = "GASTO" | "RETIRO" | "INGRESO" | "AVANCE";
export interface MovimientoCaja {
  id: number; turnoId: number; tipo: TipoMov; moneda: "USD" | "VES"; monto: number; concepto: string;
  metodoCobro: string | null; montoCobrado: number | null; comision: number | null; anulado: boolean; createdAt: string;
}
export async function registrarMovimiento(body: { tipo: TipoMov; moneda: "USD" | "VES"; monto: number; concepto: string; metodoCobro?: string; montoCobrado?: number; tasa?: number }): Promise<MovimientoCaja> {
  return parse(await fetch("/api/cuadre/movimientos", { method: "POST", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify(body) }));
}
export async function movimientosTurno(turnoId: number): Promise<MovimientoCaja[]> {
  return parse(await fetch(`/api/cuadre/turnos/${turnoId}/movimientos`, { headers: auth() }));
}
export async function anularMovimiento(id: number): Promise<MovimientoCaja> {
  return parse(await fetch(`/api/cuadre/movimientos/${id}/anular`, { method: "POST", headers: auth() }));
}

// ---------- Ventas del día: anular y devolver ----------
export interface VentaFila { id: number; numeroFactura: number; fechaHora: string; cajaId: number; totalUsd: number; totalBs: number; estado: "COMPLETADA" | "ANULADA"; clienteId: number | null; pagos: string; items: number; devueltoUsd: number; productos?: string; }
export interface LineaVentaDet { detalleId: number; productoId: number | null; nombre: string; cantidad: number; precioUsd: number; subtotalUsd: number; devuelto: number; servicio?: "RECARGA" | "AVANCE" | null; montoBs?: number | null; }
export interface DevolucionReg { id: number; totalUsd: number; metodoReembolso: string; montoReembolso: number; motivo: string | null; createdAt: string; }
export interface VentaDetalle {
  id: number; numeroFactura: number; fechaHora: string; estado: "COMPLETADA" | "ANULADA"; cajaId: number; turnoId: number | null; turnoAbierto: boolean;
  tasa: number; totalUsd: number; totalBs: number; vueltoUsd: number; vueltoBs: number; clienteId: number | null; motivoAnulacion: string | null;
  lineas: LineaVentaDet[]; pagos: { metodo: string; moneda: string; monto: number; referencia: string | null }[];
  devoluciones: { devolucion: DevolucionReg; reembolsos: ReembolsoParte[] }[]; devueltoUsd: number;
}
export interface ReembolsoParte { metodo: string; moneda: "USD" | "VES"; monto: number; referencia: string | null; }
export async function buscarVenta(numero: number): Promise<VentaFila[]> { return parse(await fetch("/api/ventas/buscar?numero=" + numero, { headers: auth() })); }
export async function ventasDelDia(fecha?: string): Promise<VentaFila[]> {
  return parse(await fetch("/api/ventas" + (fecha ? "?fecha=" + fecha : ""), { headers: auth() }));
}
export async function detalleVenta(id: number): Promise<VentaDetalle> { return parse(await fetch(`/api/ventas/${id}/detalle`, { headers: auth() })); }
export async function anularVenta(id: number, motivo: string): Promise<void> {
  await parse(await fetch(`/api/ventas/${id}/anular`, { method: "POST", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify({ motivo }) }));
}
export async function devolverVenta(id: number, body: { items: { detalleId: number; cantidad: number }[]; metodoReembolso: string; motivo?: string; referencia?: string }): Promise<{ devolucion: DevolucionReg; reembolsos: ReembolsoParte[] }> {
  return parse(await fetch(`/api/ventas/${id}/devolver`, { method: "POST", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify(body) }));
}

// ---------- Compras y proveedores (dueño/encargado) ----------
export interface ProveedorV { id: number; nombre: string; rif: string | null; telefono: string | null; contacto: string | null; activo: boolean; porPagarUsd: number; compras: number; }
export interface CompraV { id: number; proveedorId: number | null; numeroFactura: string | null; fecha: string; totalUsd: number; pagadoUsd: number; vence: string | null; tasa: number | null; pagada: boolean; estado: "REGISTRADA" | "ANULADA"; nota: string | null; }
export interface CompraLinea { id: number; productoId: number | null; nombre: string; cantidad: number; costoUnitarioUsd: number; subtotalUsd: number; }
export interface CompraAbonoV { id: number; fecha: string; montoUsd: number; metodo: string | null; nota: string | null; }
export interface FotoMeta { id: number; mime: string; }
export interface CompraVista { compra: CompraV; proveedor: string | null; detalles: CompraLinea[]; abonos: CompraAbonoV[]; fotos: FotoMeta[]; saldoUsd: number; }
export async function listarProveedores(): Promise<ProveedorV[]> { return parse(await fetch("/api/proveedores", { headers: auth() })); }
export async function guardarProveedor(id: number | null, body: { nombre: string; rif?: string; telefono?: string; contacto?: string; activo?: boolean }): Promise<ProveedorV> {
  return parse(await fetch("/api/proveedores" + (id ? "/" + id : ""), { method: id ? "PUT" : "POST", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify(body) }));
}
export async function listarCompras(): Promise<CompraVista[]> { return parse(await fetch("/api/compras", { headers: auth() })); }
export async function detalleCompra(id: number): Promise<CompraVista> { return parse(await fetch(`/api/compras/${id}`, { headers: auth() })); }
export async function registrarCompra(body: { proveedorId: number | null; numeroFactura?: string; fecha?: string; vence?: string; tasa?: number; pagada: boolean; nota?: string;
  items: { productoId: number; cantidad: number; costoUsd: number; precioVentaUsd?: number }[] }): Promise<CompraVista> {
  return parse(await fetch("/api/compras", { method: "POST", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify(body) }));
}
export async function compraPagada(id: number, valor: boolean): Promise<void> { await parse(await fetch(`/api/compras/${id}/pagada?valor=${valor}`, { method: "POST", headers: auth() })); }
export async function abonarCompra(id: number, monto: number, metodo?: string, nota?: string): Promise<CompraVista> {
  return parse(await fetch(`/api/compras/${id}/abonos`, { method: "POST", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify({ monto, metodo, nota }) }));
}
export async function fijarVencimientoCompra(id: number, vence: string | null): Promise<void> {
  await parse(await fetch(`/api/compras/${id}/vencimiento`, { method: "POST", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify({ vence }) }));
}
export async function subirFotoCompra(id: number, mime: string, datos: string): Promise<FotoMeta> {
  return parse(await fetch(`/api/compras/${id}/fotos`, { method: "POST", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify({ mime, datos }) }));
}
export async function fotoCompra(id: number, fotoId: number): Promise<{ id: number; mime: string; datos: string }> {
  return parse(await fetch(`/api/compras/${id}/fotos/${fotoId}`, { headers: auth() }));
}
export async function borrarFotoCompra(id: number, fotoId: number): Promise<void> {
  await parse(await fetch(`/api/compras/${id}/fotos/${fotoId}`, { method: "DELETE", headers: auth() }));
}
export async function anularCompra(id: number): Promise<void> { await parse(await fetch(`/api/compras/${id}/anular`, { method: "POST", headers: auth() })); }

// ---------- Vaciar inventario y campanita de avisos (dueño/encargado) ----------
export async function vaciarInventario(): Promise<number> {
  const r = await parse(await fetch("/api/inventario/productos", { method: "DELETE", headers: auth() }));
  return r.borrados as number;
}
export interface PagoPendiente { compraId: number; proveedor: string | null; numeroFactura: string | null; fecha: string; vence: string | null; saldoUsd: number; vencida: boolean; diasPara: number | null; }
export interface AvisoStock { productoId: number; nombre: string; stock: number; minimo: number; unidad: string; agotado: boolean; }
export interface Avisos { pagos: PagoPendiente[]; stock: AvisoStock[]; pagosVencidos: number; agotados: number; bajos: number; }
export async function avisos(): Promise<Avisos> { return parse(await fetch("/api/avisos", { headers: auth() })); }

// ---------- Nómina (dueño/encargado) ----------
export interface TrabajadorNomina { id: number; nombre: string; telefono: string | null; activo: boolean; sueldoUsd: number; debeFiadoUsd: number;
  netoSugeridoUsd: number; ultimoPago: string | null; ultimoPeriodo: string | null; pagadoEsteMesUsd: number; }
export interface ResumenNomina { trabajadores: TrabajadorNomina[]; totalSueldosUsd: number; totalFiadoUsd: number; pagadoEsteMesUsd: number; }
export interface PagoNomina { id: number; trabajadorId: number; periodo: string; sueldoUsd: number; bonosUsd: number; otrosDescuentosUsd: number; conceptoDescuentos: string | null;
  fiadoDescontadoUsd: number; netoUsd: number; metodo: string; moneda: "USD" | "VES"; montoPagado: number; tasa: number | null; referencia: string | null; nota: string | null; createdAt: string;
  estado?: "PAGADO" | "ANULADO"; motivoAnulacion?: string | null; }
export async function anularPagoNomina(id: number, motivo: string): Promise<{ pago: PagoNomina; trabajador: string }> {
  return parse(await fetch(`/api/nomina/pagos/${id}/anular`, { method: "POST", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify({ motivo }) }));
}
export async function resumenNomina(): Promise<ResumenNomina> { return parse(await fetch("/api/nomina", { headers: auth() })); }
export async function historialNomina(trabajadorId?: number): Promise<{ pago: PagoNomina; trabajador: string }[]> {
  return parse(await fetch("/api/nomina/pagos" + (trabajadorId ? "?trabajadorId=" + trabajadorId : ""), { headers: auth() }));
}
export async function pagarNomina(body: { trabajadorId: number; periodo: string; sueldoUsd: number; bonosUsd: number; otrosDescuentosUsd: number; conceptoDescuentos?: string;
  fiadoDescontadoUsd: number; metodo: string; tasa?: number; referencia?: string; nota?: string }): Promise<{ pago: PagoNomina; trabajador: string }> {
  return parse(await fetch("/api/nomina/pagos", { method: "POST", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify(body) }));
}

// ---------- Fiado (clientes) ----------
export interface ClienteFiado { id: number; nombre: string; cedula: string | null; telefono: string | null; limiteUsd: number; activo: boolean; saldoUsd: number; ultimoMovimiento: string | null;
  tipo?: "CLIENTE" | "TRABAJADOR"; sueldoUsd?: number; }
export interface MovCliente { id: number; tipo: "CARGO" | "ABONO"; montoUsd: number; ventaId: number | null; metodo: string | null; moneda: string | null; montoOriginal: number | null; referencia: string | null; nota: string | null; createdAt: string; }
export async function listarClientes(q?: string): Promise<ClienteFiado[]> {
  return parse(await fetch("/api/clientes" + (q ? "?q=" + encodeURIComponent(q) : ""), { headers: auth() }));
}
export async function detalleCliente(id: number): Promise<{ cliente: ClienteFiado; movimientos: MovCliente[] }> {
  return parse(await fetch(`/api/clientes/${id}`, { headers: auth() }));
}
export async function crearCliente(body: { nombre: string; cedula?: string; telefono?: string; limiteUsd?: number; tipo?: string; sueldoUsd?: number }): Promise<ClienteFiado> {
  return parse(await fetch("/api/clientes", { method: "POST", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify(body) }));
}
export async function actualizarCliente(id: number, body: { nombre: string; cedula?: string | null; telefono?: string | null; limiteUsd?: number; activo?: boolean; tipo?: string; sueldoUsd?: number }): Promise<ClienteFiado> {
  return parse(await fetch(`/api/clientes/${id}`, { method: "PUT", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify(body) }));
}
/** Fiar productos directo desde el perfil del cliente/trabajador (el servidor pone los precios y baja el stock). */
export async function fiarCliente(id: number, items: { productoId: number; cantidad: number }[]): Promise<{ ventaId: number; numeroFactura: number; totalUsd: number; totalBs: number }> {
  return parse(await fetch(`/api/clientes/${id}/fiar`, { method: "POST", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify({ tasa: Number(getTasa()) || 1, items }) }));
}
/** El dueño descuenta del sueldo de un trabajador lo que debe (sin monto = todo). */
export async function descontarSueldo(id: number, montoUsd?: number, nota?: string): Promise<MovCliente> {
  return parse(await fetch(`/api/clientes/${id}/descuento-sueldo`, { method: "POST", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify({ montoUsd: montoUsd ?? null, nota: nota || null }) }));
}
export async function abonarCliente(id: number, body: { metodo: string; monto: number; tasa?: number; referencia?: string; nota?: string }): Promise<MovCliente> {
  return parse(await fetch(`/api/clientes/${id}/abonos`, { method: "POST", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify(body) }));
}

export async function abrirTurno(fondoUsd: number, fondoBs: number): Promise<TurnoResumen> {
  const resp = await fetch("/api/cuadre/abrir", { method: "POST", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify({ fondoUsd, fondoBs }) });
  return parse(resp);
}
/** Turno abierto de esta caja según el servidor (null si la caja está cerrada). */
export async function turnoActual(): Promise<TurnoResumen | null> {
  return parse(await fetch("/api/cuadre/actual", { headers: auth() }));
}
export async function resumenTurno(id: number): Promise<TurnoResumen> {
  return parse(await fetch("/api/cuadre/turnos/" + id, { headers: auth() }));
}
export async function cerrarTurno(id: number, declaradoUsd: number, declaradoBs: number, arqueoDetalle?: string, observaciones?: string): Promise<TurnoResumen> {
  const resp = await fetch("/api/cuadre/turnos/" + id + "/cerrar", { method: "POST", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify({ declaradoUsd, declaradoBs, arqueoDetalle, observaciones }) });
  return parse(resp);
}

// ---------- Usuarios (dueño/encargado) ----------

export interface Usuario { id: number; nombreCompleto: string; rol: Rol; activo: boolean; esSoporte: boolean; }
export async function listarUsuarios(): Promise<Usuario[]> { return parse(await fetch("/api/usuarios", { headers: auth() })); }
export async function crearUsuario(body: { rol: Rol; nombreCompleto: string; email?: string; password?: string; pin?: string }): Promise<Usuario> {
  return parse(await fetch("/api/usuarios", { method: "POST", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify(body) }));
}
export async function editarUsuario(id: number, body: { nombreCompleto?: string; password?: string; pin?: string }): Promise<Usuario> {
  return parse(await fetch(`/api/usuarios/${id}`, { method: "PUT", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify(body) }));
}
export async function borrarUsuario(id: number): Promise<void> {
  await parse(await fetch(`/api/usuarios/${id}`, { method: "DELETE", headers: auth() }));
}

export interface CajaInfo { id: number; nombre: string; localId: number; autorizada: boolean; activa: boolean; }
export interface CajaCreada extends CajaInfo { cajaToken: string; }
export async function listarCajas(): Promise<CajaInfo[]> { return parse(await fetch("/api/cajas", { headers: auth() })); }
export async function crearCaja(nombre: string): Promise<CajaCreada> {
  return parse(await fetch("/api/cajas", { method: "POST", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify({ nombre }) }));
}
export async function renombrarCaja(id: number, nombre: string): Promise<CajaInfo> {
  return parse(await fetch(`/api/cajas/${id}`, { method: "PUT", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify({ nombre }) }));
}
export async function borrarCaja(id: number): Promise<void> {
  await parse(await fetch(`/api/cajas/${id}`, { method: "DELETE", headers: auth() }));
}

// ---------- Super admin ----------

/** La clave del super admin es correcta pero falta el código de la app de autenticación. */
export class Requiere2fa extends Error {}

export async function adminLogin(email: string, password: string, codigo?: string): Promise<string> {
  const resp = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, codigo: codigo || null }) });
  if (resp.status === 401) {
    const b = await resp.json().catch(() => ({}));
    if (b.requiere2fa) throw new Requiere2fa(b.error || "Escribe el código de 6 dígitos");
    throw new Error(b.error || "Correo o contraseña incorrectos");
  }
  const r = await parse(resp);
  const s: Sesion = { token: r.token, rol: "SUPER_ADMIN", usuarioId: 0, negocioId: 0, cajaId: null, nombre: "Administración" };
  setSesion(s);
  return r.token;
}

export interface Situacion { negocioId: number; nombre: string; plan: string; estadoEfectivo: string; puedeCobrar: boolean; soloConsulta?: boolean; pagoHasta: string | null; diasVencido: number; mesesPendientes: number; deuda: number; mensaje: string;
  enPrueba?: boolean; cajasContratadas?: number; mensualidad?: number; planNombre?: string; }
export interface PlanV { codigo: string; nombre: string; precioBase: number; cajasIncluidas: number; precioCajaExtra: number; maxCajas: number; descripcion: string; }
export const mensualidadDe = (p: PlanV, cajas: number) => Math.round((p.precioBase + Math.max(0, cajas - p.cajasIncluidas) * p.precioCajaExtra) * 100) / 100;
export async function listarPlanes(): Promise<PlanV[]> { return parse(await fetch("/api/planes", { headers: auth() })); }
export async function cambiarMiPlan(plan: string, cajas: number): Promise<Situacion> {
  return parse(await fetch("/api/mi-negocio/plan", { method: "PUT", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify({ plan, cajas }) }));
}
export async function adminCambiarPlan(id: number, plan: string, cajas: number): Promise<unknown> {
  return parse(await fetch(`/api/admin/negocios/${id}/plan`, { method: "PUT", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify({ plan, cajas }) }));
}

// ---------- Mi negocio (suscripción del dueño) ----------
export interface MiPago { id: number; monto: number; moneda: string; metodo: string; referencia: string | null; meses: number; estado: string; }
export async function miSuscripcion(): Promise<Situacion> { return parse(await fetch("/api/mi-negocio/suscripcion", { headers: auth() })); }
export async function misPagos(): Promise<MiPago[]> { return parse(await fetch("/api/mi-negocio/pagos", { headers: auth() })); }
export async function reportarPago(body: { monto: number; moneda?: string; metodo: string; referencia?: string; meses?: number }): Promise<void> {
  await parse(await fetch("/api/mi-negocio/pagos", { method: "POST", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify(body) }));
}
export interface NegocioVista { situacion: Situacion; cajas: number; ultimaVezEnLinea: string | null; ultimoPago: { monto: string; referencia: string | null; fecha: string } | null; }
export async function adminNegocios(): Promise<NegocioVista[]> { return parse(await fetch("/api/admin/negocios", { headers: auth() })); }
export async function adminCrearNegocio(body: { nombreNegocio: string; nombreDueno: string; email: string; password: string; telefono?: string; direccion?: string; cajasContratadas?: number; horariosCierre?: string; plan?: string }): Promise<{ negocioId: number; duenoId: number }> {
  return parse(await fetch("/api/admin/negocios", { method: "POST", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify(body) }));
}

// ---------- Config del negocio (perfil + horarios de cierre) ----------
export interface ConfigNegocio { nombre: string; telefono: string | null; direccion: string | null; cajasContratadas: number; horariosCierre: string | null; rif?: string | null; mensajeTicket?: string | null; }
export async function getConfigNegocio(): Promise<ConfigNegocio> { return parse(await fetch("/api/mi-negocio/config", { headers: auth() })); }
export async function putConfigNegocio(body: { telefono?: string; direccion?: string; horariosCierre?: string; nombre?: string; rif?: string; mensajeTicket?: string }): Promise<ConfigNegocio> {
  return parse(await fetch("/api/mi-negocio/config", { method: "PUT", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify(body) }));
}
// ---------- Config de caja del negocio (formas de pago + tasa) — la comparten todas sus cajas ----------
export interface CajaConfigServidor {
  metodosPago: string | null; // JSON { metodos, extras } de la PWA
  tasaModo: "BCV" | "AJUSTE" | "MANUAL"; ajusteTipo: "PCT" | "BS"; ajuste: number; tasaManual: number;
  tasaBcv: number | null; tasaEfectiva: number | null;
  comisionRecargaPct?: number | null; comisionAvancePct?: number | null;
}
export async function getCajaConfig(): Promise<CajaConfigServidor> { return parse(await fetch("/api/mi-negocio/caja-config", { headers: auth() })); }
export async function putCajaConfig(body: { metodosPago: string; tasaModo: string; ajusteTipo: string; ajuste: number; tasaManual: number; comisionRecargaPct?: number; comisionAvancePct?: number }): Promise<CajaConfigServidor> {
  return parse(await fetch("/api/mi-negocio/caja-config", { method: "PUT", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify(body) }));
}
// ---------- Seguridad del super admin ----------
export async function admin2fa(): Promise<{ activo: boolean }> { return parse(await fetch("/api/admin/2fa", { headers: auth() })); }
export async function admin2faIniciar(): Promise<{ secreto: string; uri: string }> { return parse(await fetch("/api/admin/2fa/iniciar", { method: "POST", headers: auth() })); }
export async function admin2faActivar(codigo: string): Promise<{ activo: boolean }> {
  return parse(await fetch("/api/admin/2fa/activar", { method: "POST", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify({ codigo }) }));
}
export async function admin2faDesactivar(codigo: string): Promise<{ activo: boolean }> {
  return parse(await fetch("/api/admin/2fa/desactivar", { method: "POST", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify({ codigo }) }));
}
/** Enlace (24 h, un uso) para que el dueño de un negocio ponga contraseña nueva. */
export async function adminEnlaceClave(negocioId: number): Promise<string> {
  return (await parse(await fetch(`/api/admin/negocios/${negocioId}/enlace-clave`, { method: "POST", headers: auth() }))).enlace;
}
export async function adminSuspender(id: number): Promise<void> { await parse(await fetch(`/api/admin/negocios/${id}/suspender`, { method: "POST", headers: auth() })); }
export async function adminReactivar(id: number): Promise<void> { await parse(await fetch(`/api/admin/negocios/${id}/reactivar`, { method: "POST", headers: auth() })); }
/** Opción A: el super admin entra a un negocio como SOPORTE (solo lectura). Deja la sesión lista. */
export async function adminEntrarSoporte(negocioId: number): Promise<Sesion> {
  const r = await parse(await fetch(`/api/admin/negocios/${negocioId}/entrar-soporte`, { method: "POST", headers: auth() }));
  const s: Sesion = { token: r.token, rol: r.rol as Rol, usuarioId: r.usuarioId, negocioId: r.negocioId, cajaId: r.cajaId, nombre: r.nombreCompleto };
  setSesion(s);
  return s;
}
export interface PagoPendiente { id: number; negocioId: number; monto: number; moneda: string; metodo: string; referencia: string | null; meses: number; estado: string; }
export async function adminPagosPendientes(): Promise<PagoPendiente[]> { return parse(await fetch("/api/admin/pagos-pendientes", { headers: auth() })); }
export async function adminAprobarPago(pagoId: number): Promise<void> { await parse(await fetch(`/api/admin/pagos/${pagoId}/aprobar`, { method: "POST", headers: auth() })); }
export async function adminRegistrarPago(negocioId: number, body: { monto: number; moneda?: string; metodo: string; referencia?: string; meses?: number }): Promise<void> {
  await parse(await fetch(`/api/admin/negocios/${negocioId}/pagos`, { method: "POST", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify(body) }));
}

export { getTasa, setTasa };

// ---------- Tasa BCV (automática, la sirve el servidor) ----------
export interface TasaBcv { bs: number | null; fuente: string; fechaFuente: string | null; actualizado: string | null; }
export async function tasaBcvServidor(): Promise<TasaBcv> { return parse(await fetch("/api/tasa")); }

// ---------- Cuentas "a mano" guardadas en el servidor ----------
export interface DocContab { clave: string; contenido: string; version: number; updatedAt: string; }
export class ConflictoDoc extends Error { constructor(public actual: DocContab | null) { super("Otro equipo guardó cambios más nuevos"); } }
export async function leerDocContab(clave: "libro" | "hojas"): Promise<DocContab | null> {
  const r = await fetch("/api/contabilidad/" + clave, { headers: auth() });
  if (r.status === 204) return null;
  return parse(r);
}
export async function guardarDocContab(clave: "libro" | "hojas", contenido: string, version: number): Promise<DocContab> {
  const r = await fetch("/api/contabilidad/" + clave, { method: "PUT", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify({ contenido, version }) });
  if (r.status === 409) { const b = await r.json().catch(() => ({})); throw new ConflictoDoc(b?.actual ?? null); }
  return parse(r);
}

// ---------- Cierres del punto de venta / Biopago (tickets del banco) ----------
export interface SeccionPunto { comprasN: number; compras: number; anulN: number; anul: number; }
export interface CierrePunto {
  id: number; turnoId: number | null; cajaId: number | null; usuarioId: number | null; tipo: "PUNTO" | "BIOPAGO";
  titular: string | null; afiliado: string | null; loteCredito: string | null; loteDebito: string | null; loteMasterVisa: string | null;
  fechaHora: string; credComprasN: number; credCompras: number; credAnulN: number; credAnul: number;
  debComprasN: number; debCompras: number; debAnulN: number; debAnul: number;
  mvComprasN: number; mvCompras: number; mvAnulN: number; mvAnul: number; totalBs: number; nota: string | null; createdAt: string;
}
export interface NuevoCierrePunto {
  tipo: "PUNTO" | "BIOPAGO"; titular?: string; afiliado?: string; loteCredito?: string; loteDebito?: string; loteMasterVisa?: string;
  fechaHora: string; credito: SeccionPunto; debito: SeccionPunto; masterVisa: SeccionPunto; nota?: string;
}
export interface CierrePuntoVista { cierre: CierrePunto; caja: string | null; cajero: string | null; sistemaBs: number | null; }
export async function registrarCierrePunto(body: NuevoCierrePunto): Promise<CierrePunto> {
  return parse(await fetch("/api/cierres-punto", { method: "POST", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify(body) }));
}
export async function cierresPuntoDelTurno(turnoId: number): Promise<CierrePunto[]> {
  return parse(await fetch(`/api/cierres-punto/turno/${turnoId}`, { headers: auth() }));
}
export async function cierresPuntoEntre(desde: string, hasta: string): Promise<CierrePuntoVista[]> {
  return parse(await fetch(`/api/cierres-punto?desde=${desde}&hasta=${hasta}`, { headers: auth() }));
}
export async function borrarCierrePunto(id: number): Promise<void> {
  await parse(await fetch(`/api/cierres-punto/${id}`, { method: "DELETE", headers: auth() }));
}
