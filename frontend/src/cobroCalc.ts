// Cálculo del cobro en la caja. Copia EXACTA de la regla del servidor
// (backend: venta/CobroCalculadora.java, portada del KioskPOS de escritorio), para que
// la pantalla nunca diga "falta" cuando el servidor aceptaría, ni al revés.
//
//  - Solo $   -> se compara en dólares exactos.
//  - Solo Bs  -> se compara en bolívares exactos (sin pasar por $, no se pierden centavos).
//  - Mixto    -> se convierte todo a $ y se acepta una tolerancia de $0,05 por conversión.
//
// Todo se hace en CENTAVOS enteros para evitar los errores de coma flotante
// (0,78 + 1,00 + 0,22 no siempre da 2,00 en la computadora).

export type MetodoId = "EFECTIVO_USD" | "EFECTIVO_BS" | "PAGO_MOVIL" | "PUNTO" | "BIOPAGO";
export const MONEDA: Record<MetodoId, "USD" | "VES"> = {
  EFECTIVO_USD: "USD", EFECTIVO_BS: "VES", PAGO_MOVIL: "VES", PUNTO: "VES", BIOPAGO: "VES",
};
export type Montos = Partial<Record<string, number>>;
/** Moneda de cada forma de pago (las extras de Configuración se resuelven aparte). */
export type MonedaDe = (metodo: string) => "USD" | "VES";
const monedaFija: MonedaDe = (m) => (MONEDA as Record<string, "USD" | "VES">)[m] ?? "USD";

const TOLERANCIA_CENT = 5; // $0,05 (TOLERANCIA_USD del servidor)
const cent = (n: number) => Math.round((n || 0) * 100);
const r4 = (n: number) => Math.round(n * 10000) / 10000;

export interface EstadoCobro {
  totalBs: number;     // total en Bs a la tasa del día
  cubierto: number;    // equivalente en $ de lo pagado (para la barra)
  hayPago: boolean;
  cubre: boolean;      // ¿el servidor lo aceptaría?
  faltaUsd: number;
  faltaBs: number;
  vueltoUsd: number;
  vueltoBs: number;
}

function sumas(montos: Montos, excepto: string | undefined, mon: MonedaDe) {
  let usdC = 0, bsC = 0;
  Object.keys(montos).forEach((m) => {
    if (m === excepto) return;
    const c = cent(montos[m] || 0);
    if (c <= 0) return;
    if (mon(m) === "USD") usdC += c; else bsC += c;
  });
  return { usdC, bsC };
}

/** totalBsFijo: total exacto en Bs cuando la venta lleva recargas/avances (el servidor también lo usa). */
export function calcularCobro(total: number, tasa: number, montos: Montos, mon: MonedaDe = monedaFija, totalBsFijo?: number): EstadoCobro {
  const totalC = cent(total);
  const totalBsC = totalBsFijo != null ? Math.round(totalBsFijo * 100) : Math.round(total * tasa * 100);
  const { usdC, bsC } = sumas(montos, undefined, mon);
  const t = tasa > 0 ? tasa : 1;
  // Igual que el servidor: pagadoUsd + (pagadoBs / tasa con 4 decimales), a 2 decimales.
  const tpuC = cent(usdC / 100 + r4(bsC / 100 / t));
  const base = { totalBs: totalBsC / 100, cubierto: tpuC / 100, hayPago: usdC + bsC > 0 };

  if (usdC === 0 && bsC === 0) {
    return { ...base, cubre: false, faltaUsd: totalC / 100, faltaBs: totalBsC / 100, vueltoUsd: 0, vueltoBs: 0 };
  }
  if (bsC === 0) { // solo $
    const cubre = usdC >= totalC;
    const f = Math.max(0, totalC - usdC);
    return { ...base, cubre, faltaUsd: f / 100, faltaBs: Math.round((f / 100) * t * 100) / 100, vueltoUsd: Math.max(0, usdC - totalC) / 100, vueltoBs: 0 };
  }
  if (usdC === 0) { // solo Bs
    const cubre = bsC >= totalBsC;
    const fBs = Math.max(0, totalBsC - bsC);
    return { ...base, cubre, faltaUsd: Math.ceil(fBs / t) / 100, faltaBs: fBs / 100, vueltoUsd: 0, vueltoBs: Math.max(0, bsC - totalBsC) / 100 };
  }
  // mixto
  const cubre = tpuC + TOLERANCIA_CENT >= totalC;
  const f = cubre ? 0 : totalC - tpuC;
  return { ...base, cubre, faltaUsd: f / 100, faltaBs: Math.round((f / 100) * t * 100) / 100, vueltoUsd: cubre ? Math.max(0, tpuC - totalC) / 100 : 0, vueltoBs: 0 };
}

/** Cuánto hay que poner en `metodo` (en SU moneda) para completar el total con lo demás. */
export function restoPara(metodo: string, total: number, tasa: number, montos: Montos, mon: MonedaDe = monedaFija, totalBsFijo?: number): number {
  const t = tasa > 0 ? tasa : 1;
  const { usdC, bsC } = sumas(montos, metodo, mon);
  if (mon(metodo) === "VES") {
    const faltaBsC = (totalBsFijo != null ? Math.round(totalBsFijo * 100) : Math.round(total * t * 100)) - bsC - usdC * t;
    return Math.max(0, Math.ceil(faltaBsC - 1e-6)) / 100;
  }
  const faltaC = cent(total) - usdC - bsC / t;
  return Math.max(0, Math.ceil(faltaC - 1e-6)) / 100;
}
