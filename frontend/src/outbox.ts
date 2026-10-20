import { openDB, type DBSchema, type IDBPDatabase } from "idb";

/**
 * Cola de envíos (outbox) de ventas, en IndexedDB. Cuando no hay internet (o el envío
 * falla), la venta se guarda aquí y se reintenta al reconectar. La clave es el
 * codigoUnico de la venta: el servidor deduplica por ese código, así que reenviar la
 * misma venta nunca cobra dos veces (sincronización idempotente, modelo
 * SincronizadorModoLocal del escritorio).
 */

export type EstadoEnvio = "pendiente" | "error";

export interface VentaEnCola {
  codigoUnico: string;
  payload: unknown; // el cuerpo que espera POST /api/ventas
  creadoAt: number;
  intentos: number;
  estado: EstadoEnvio;
  ultimoError?: string;
}

interface KioskDB extends DBSchema {
  ventas_outbox: {
    key: string; // codigoUnico
    value: VentaEnCola;
  };
}

let dbPromise: Promise<IDBPDatabase<KioskDB>> | null = null;

function db() {
  if (!dbPromise) {
    dbPromise = openDB<KioskDB>("kioskpos", 1, {
      upgrade(d) {
        if (!d.objectStoreNames.contains("ventas_outbox")) {
          d.createObjectStore("ventas_outbox", { keyPath: "codigoUnico" });
        }
      }
    });
  }
  return dbPromise;
}

export async function encolar(codigoUnico: string, payload: unknown): Promise<void> {
  const d = await db();
  const existente = await d.get("ventas_outbox", codigoUnico);
  if (existente) {
    return; // ya está en cola; no duplicar
  }
  await d.put("ventas_outbox", {
    codigoUnico,
    payload,
    creadoAt: Date.now(),
    intentos: 0,
    estado: "pendiente"
  });
}

export async function listar(): Promise<VentaEnCola[]> {
  const d = await db();
  const todas = await d.getAll("ventas_outbox");
  return todas.sort((a, b) => a.creadoAt - b.creadoAt);
}

export async function quitar(codigoUnico: string): Promise<void> {
  const d = await db();
  await d.delete("ventas_outbox", codigoUnico);
}

export async function marcar(codigoUnico: string, cambios: Partial<VentaEnCola>): Promise<void> {
  const d = await db();
  const actual = await d.get("ventas_outbox", codigoUnico);
  if (!actual) {
    return;
  }
  await d.put("ventas_outbox", { ...actual, ...cambios });
}

export async function pendientes(): Promise<number> {
  return (await listar()).length;
}
