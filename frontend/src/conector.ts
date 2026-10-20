/**
 * Cliente del Conector KioskPOS (programa Java local, en http://127.0.0.1:9010).
 * La PWA pide el texto del ticket al backend (GET /api/ventas/{id}/ticket) y se lo
 * pasa al Conector, que lo imprime en la térmica y abre la gaveta. El navegador no
 * imprime directo a la térmica, por eso existe el Conector.
 */

const BASE = "http://127.0.0.1:9010";

export async function conectorDisponible(): Promise<boolean> {
  try {
    const r = await fetch(BASE + "/estado", { method: "GET" });
    return r.ok;
  } catch {
    return false;
  }
}

export async function imprimirTicket(ticket: string, abrirGaveta = true, impresora?: string): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": "text/plain; charset=utf-8",
    "X-Abrir-Gaveta": abrirGaveta ? "true" : "false"
  };
  if (impresora) {
    headers["X-Impresora"] = impresora;
  }
  const r = await fetch(BASE + "/imprimir", { method: "POST", headers, body: ticket });
  if (!r.ok) {
    throw new Error("El Conector no pudo imprimir: " + (await r.text().catch(() => r.status)));
  }
}

export async function abrirGaveta(impresora?: string): Promise<void> {
  const headers: Record<string, string> = {};
  if (impresora) {
    headers["X-Impresora"] = impresora;
  }
  const r = await fetch(BASE + "/abrir-gaveta", { method: "POST", headers });
  if (!r.ok) {
    throw new Error("El Conector no pudo abrir la gaveta");
  }
}
