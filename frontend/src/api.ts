import { encolar, listar, marcar, quitar } from "./outbox";

/**
 * Cliente de la API de la caja. Cobrar SIEMPRE encola primero (durabilidad) y luego
 * intenta enviar; si no hay internet, la venta queda en la cola y se envía al
 * reconectar. El codigoUnico hace el envío idempotente.
 */

export interface ConfigCaja {
  token: string; // JWT de sesión de caja
  permiso: string; // permiso de cobro vigente (header X-Permiso)
  tasaBcv: string;
}

const CFG_KEY = "kioskpos.config";

export function leerConfig(): ConfigCaja {
  try {
    const raw = localStorage.getItem(CFG_KEY);
    if (raw) {
      return JSON.parse(raw) as ConfigCaja;
    }
  } catch {
    /* localStorage puede fallar en modo privado */
  }
  return { token: "", permiso: "", tasaBcv: "40" };
}

export function guardarConfig(cfg: ConfigCaja): void {
  try {
    localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
  } catch {
    /* ignorar */
  }
}

export interface LineaCobro {
  productoId?: number | null;
  cantidad: number;
  precioUsd?: number;
  nombre?: string;
}

export interface PagoCobro {
  metodo: "EFECTIVO_USD" | "EFECTIVO_BS" | "PUNTO" | "PAGO_MOVIL" | "BIOPAGO";
  moneda: "USD" | "VES";
  montoOriginal: number;
  referencia?: string;
}

function nuevoCodigo(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "c-" + Date.now() + "-" + Math.random().toString(36).slice(2);
}

/**
 * Registra una venta: la encola (durable) y trata de enviarla ya. Devuelve el
 * codigoUnico para que la UI la siga en la cola.
 */
export async function cobrar(items: LineaCobro[], pagos: PagoCobro[]): Promise<string> {
  const cfg = leerConfig();
  const codigoUnico = nuevoCodigo();
  const payload = {
    codigoUnico,
    tasaBcv: Number(cfg.tasaBcv) || 1,
    items,
    pagos
  };
  await encolar(codigoUnico, payload);
  await sincronizar(); // intento inmediato; si falla, queda en cola
  return codigoUnico;
}

export interface ResultadoSync {
  enviadas: number;
  pendientes: number;
  errores: number;
}

/**
 * Vacía la cola contra el servidor. Cada venta se envía con su codigoUnico; el
 * servidor deduplica, así que un reintento de algo ya cobrado se trata como éxito y
 * se saca de la cola. Un error de red mantiene la venta para el próximo intento; un
 * error de negocio (ej. pago insuficiente) la marca como error para que el cajero la
 * revise, sin reintentar en bucle.
 */
export async function sincronizar(): Promise<ResultadoSync> {
  const cfg = leerConfig();
  let enviadas = 0;
  let errores = 0;

  for (const venta of await listar()) {
    if (venta.estado === "error") {
      errores++;
      continue;
    }
    try {
      const resp = await fetch("/api/ventas", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + cfg.token,
          "X-Permiso": cfg.permiso
        },
        body: JSON.stringify(venta.payload)
      });
      if (resp.ok) {
        await quitar(venta.codigoUnico); // incluye el caso dedup (200 con la venta ya existente)
        enviadas++;
      } else if (resp.status === 403 || resp.status === 401) {
        // Permiso/sesión vencidos: no es culpa de la venta; se reintenta luego.
        await marcar(venta.codigoUnico, {
          intentos: venta.intentos + 1,
          ultimoError: "Sin permiso/sesión (" + resp.status + ")"
        });
      } else {
        // 400/409 u otro error de negocio: la venta no sirve como está.
        const txt = await resp.text().catch(() => "");
        await marcar(venta.codigoUnico, {
          estado: "error",
          intentos: venta.intentos + 1,
          ultimoError: "HTTP " + resp.status + " " + txt.slice(0, 120)
        });
        errores++;
      }
    } catch {
      // Sin red: se queda en cola para el próximo intento.
      await marcar(venta.codigoUnico, {
        intentos: venta.intentos + 1,
        ultimoError: "Sin conexión"
      });
    }
  }

  const resto = await listar();
  return { enviadas, pendientes: resto.length, errores };
}
