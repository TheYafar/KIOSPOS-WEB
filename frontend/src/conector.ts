/**
 * Cliente del Conector KioskPOS (programa Java local, en http://127.0.0.1:9010).
 * La PWA pide el texto del ticket al backend (GET /api/ventas/{id}/ticket) y se lo
 * pasa al Conector, que lo imprime en la térmica y abre la gaveta. El navegador no
 * imprime directo a la térmica, por eso existe el Conector.
 */

const BASE = "http://127.0.0.1:9010";
const IMP_KEY = "kp_impresora"; // impresora elegida en Configuración (por equipo)

/** Impresora que el dueño/cajero eligió en este equipo (vacío = la por defecto del sistema). */
export function getImpresora(): string {
  try { return localStorage.getItem(IMP_KEY) || ""; } catch { return ""; }
}
export function setImpresora(nombre: string): void {
  try { if (nombre) localStorage.setItem(IMP_KEY, nombre); else localStorage.removeItem(IMP_KEY); } catch { /* sin storage */ }
}

export async function conectorDisponible(): Promise<boolean> {
  try {
    const r = await fetch(BASE + "/estado", { method: "GET" });
    return r.ok;
  } catch {
    return false;
  }
}

export interface EstadoConector { defecto: string; impresoras: string[]; }
/** Lee /estado del Conector y devuelve la impresora por defecto del sistema y la lista. */
export async function estadoConector(): Promise<EstadoConector> {
  const r = await fetch(BASE + "/estado", { method: "GET" });
  if (!r.ok) throw new Error("El Conector no respondió");
  const txt = await r.text();
  let defecto = "";
  const impresoras: string[] = [];
  for (const raw of txt.split("\n")) {
    const l = raw.trim();
    if (l.startsWith("defecto:")) defecto = l.slice("defecto:".length).trim();
    else if (l.startsWith("- ")) impresoras.push(l.slice(2).trim());
  }
  return { defecto, impresoras: impresoras.filter(Boolean) };
}

export async function imprimirTicket(ticket: string, abrirGaveta = true, impresora?: string): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": "text/plain; charset=utf-8",
    "X-Abrir-Gaveta": abrirGaveta ? "true" : "false"
  };
  const imp = impresora ?? getImpresora();
  if (imp) {
    headers["X-Impresora"] = imp;
  }
  const r = await fetch(BASE + "/imprimir", { method: "POST", headers, body: ticket });
  if (!r.ok) {
    throw new Error("El Conector no pudo imprimir: " + (await r.text().catch(() => r.status)));
  }
}

export async function abrirGaveta(impresora?: string): Promise<void> {
  const headers: Record<string, string> = {};
  const imp = impresora ?? getImpresora();
  if (imp) {
    headers["X-Impresora"] = imp;
  }
  const r = await fetch(BASE + "/abrir-gaveta", { method: "POST", headers });
  if (!r.ok) {
    throw new Error("El Conector no pudo abrir la gaveta");
  }
}
