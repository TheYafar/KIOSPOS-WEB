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
  id: number; codigoBarras: string; nombre: string; precioUsd: number;
  stockActual: number; categoria: string; activo: boolean;
}

export async function listarProductos(q?: string): Promise<Producto[]> {
  const url = "/api/inventario/productos" + (q ? "?q=" + encodeURIComponent(q) : "");
  const resp = await fetch(url, { headers: auth() });
  return parse(resp);
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

export { getTasa, setTasa };
