// "Como pagó": reparte lo que se devuelve entre las formas en que pagó el cliente, en
// proporción, sin contar el vuelto (sale del efectivo). Lo fiado vuelve a su cuenta.
// Mismo cálculo que RepartoReembolso.java del servidor.

export interface PagoV { metodo: string; moneda: string; monto: number }
export interface Parte { metodo: string; moneda: "USD" | "VES"; monto: number }

const r2 = (n: number) => Math.round(n * 100 + Number.EPSILON * 100) / 100;

export function repartir(pagos: PagoV[], vueltoUsd: number, vueltoBs: number, tasa: number, totalVenta: number, devolver: number): Parte[] {
  const neto = new Map<string, Parte>();
  for (const p of pagos) {
    if (!(p.monto > 0)) continue;
    const metodo = p.metodo === "FIADO" ? "A_CUENTA" : p.metodo;
    const k = metodo + ":" + p.moneda;
    const prev = neto.get(k);
    neto.set(k, { metodo, moneda: p.moneda as Parte["moneda"], monto: (prev?.monto ?? 0) + p.monto });
  }
  const t = tasa > 0 ? tasa : 1;
  const quitar = (k: string, cuanto: number) => {
    const p = neto.get(k);
    if (!p || cuanto <= 0) return cuanto;
    const q = Math.min(p.monto, cuanto);
    neto.set(k, { ...p, monto: p.monto - q });
    return cuanto - q;
  };
  let vu = quitar("EFECTIVO_USD:USD", vueltoUsd || 0);
  const vb = quitar("EFECTIVO_BS:VES", vueltoBs || 0);
  if (vu > 0) vu = quitar("EFECTIVO_BS:VES", vu * t) / t;
  if (vb > 0) quitar("EFECTIVO_USD:USD", r2(vb / t));
  if (!(totalVenta > 0)) return [];
  const f = Math.min(1, Math.round((devolver / totalVenta) * 1e8) / 1e8);
  return [...neto.values()].map((p) => ({ ...p, monto: r2(p.monto * f) })).filter((p) => p.monto > 0);
}
