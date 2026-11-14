// Cálculo del cobro en la caja. Copia EXACTA de la regla del servidor
// (backend: venta/CobroCalculadora.java, portada del KioskPOS de escritorio), para que
// la pantalla nunca diga "falta" cuando el servidor aceptaría, ni al revés.
//
//  - Solo $   -> se compara en dólares exactos.
//  - Solo Bs  -> se compara en bolívares exactos (sin pasar por $, no se pierden centavos).
//  - Mixto    -> se compara en BOLÍVARES (lo pagado en $ a la tasa) con tolerancia de Bs 1.
//                (Antes era $0,05 = ~Bs 45 a tasa 900: dejaba cobrar con Bs 20 de menos.)
//
// Vuelto: el cajero elige cuántos DÓLARES entrega en billetes; el resto sale en bolívares.
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

const TOLERANCIA_BS_CENT = 100; // Bs 1,00 (TOLERANCIA_BS del servidor)
const cent = (n: number) => Math.round((n || 0) * 100);
const r4 = (n: number) => Math.round(n * 10000) / 10000;

export interface EstadoCobro {
  totalBs: number;     // total en Bs a la tasa del día
  cubierto: number;    // equivalente en $ de lo pagado (para la barra)
  hayPago: boolean;
  cubre: boolean;      // ¿el servidor lo aceptaría?
  faltaUsd: number;
  faltaBs: number;
  vueltoUsd: number;   // lo que se entrega en dólares
  vueltoBs: number;    // lo que se entrega en bolívares
  sobraUsd: number;    // vuelto total expresado en $
  sobraBs: number;     // vuelto total expresado en Bs
  soloBs: boolean;     // se pagó solo en bolívares
  difBs: number;       // lo que se debía de vuelto − lo que se entrega (en Bs): >0 recibe menos, <0 recibe de más
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

/**
 * totalBsFijo: total exacto en Bs cuando la venta lleva recargas/avances (el servidor también lo usa).
 * vueltoUsdPedido: cuántos dólares del vuelto se dan en $ (el resto en Bs); undefined = automático
 * (solo Bs → todo en Bs; si no → todo en $), igual que el servidor.
 */
export function calcularCobro(total: number, tasa: number, montos: Montos, mon: MonedaDe = monedaFija, totalBsFijo?: number, vueltoUsdPedido?: number, vueltoBsPedido?: number): EstadoCobro {
  const totalC = cent(total);
  const totalBsC = totalBsFijo != null ? Math.round(totalBsFijo * 100) : Math.round(total * tasa * 100);
  const { usdC, bsC } = sumas(montos, undefined, mon);
  const t = tasa > 0 ? tasa : 1;
  // Igual que el servidor: pagadoUsd + (pagadoBs / tasa con 4 decimales), a 2 decimales.
  const tpuC = cent(usdC / 100 + r4(bsC / 100 / t));
  const base = { totalBs: totalBsC / 100, cubierto: tpuC / 100, hayPago: usdC + bsC > 0, soloBs: usdC === 0 && bsC > 0 };
  const nada = { vueltoUsd: 0, vueltoBs: 0, sobraUsd: 0, sobraBs: 0, difBs: 0 };

  if (usdC === 0 && bsC === 0) {
    return { ...base, ...nada, cubre: totalC === 0, faltaUsd: totalC / 100, faltaBs: totalBsC / 100 };
  }
  let cubre: boolean, faltaUsdC: number, faltaBsC: number, sobraUsdC: number, sobraBsC: number;
  if (bsC === 0) { // solo $
    cubre = usdC >= totalC;
    faltaUsdC = Math.max(0, totalC - usdC); faltaBsC = Math.round(faltaUsdC * t);
    sobraUsdC = Math.max(0, usdC - totalC); sobraBsC = Math.round(sobraUsdC * t);
  } else if (usdC === 0) { // solo Bs
    cubre = bsC >= totalBsC;
    faltaBsC = Math.max(0, totalBsC - bsC); faltaUsdC = Math.ceil(faltaBsC / t);
    sobraBsC = Math.max(0, bsC - totalBsC); sobraUsdC = Math.round(sobraBsC / t);
  } else { // mixto: en Bs exactos (lo pagado en $ a la tasa)
    const pagadoBsC = bsC + Math.round(usdC * t);
    cubre = pagadoBsC + TOLERANCIA_BS_CENT >= totalBsC;
    faltaBsC = cubre ? 0 : totalBsC - pagadoBsC; faltaUsdC = Math.ceil(faltaBsC / t);
    sobraBsC = Math.max(0, pagadoBsC - totalBsC); sobraUsdC = Math.round(sobraBsC / t);
  }
  let vUsdC = 0, vBsC = 0;
  if (cubre && sobraBsC > 0 && vueltoBsPedido != null) {
    // Vuelto escrito a mano: se respeta lo que de verdad se entrega.
    vUsdC = Math.max(0, cent(vueltoUsdPedido ?? 0)); vBsC = Math.max(0, cent(vueltoBsPedido));
  } else if (cubre && sobraBsC > 0) {
    const pedC = vueltoUsdPedido == null ? (usdC === 0 ? 0 : sobraUsdC) : Math.max(0, cent(vueltoUsdPedido));
    if (pedC >= sobraUsdC) vUsdC = sobraUsdC;
    else { vUsdC = pedC; vBsC = Math.max(0, Math.round(sobraBsC - pedC * t)); }
  }
  return { ...base, cubre, faltaUsd: cubre ? 0 : faltaUsdC / 100, faltaBs: cubre ? 0 : faltaBsC / 100,
    vueltoUsd: vUsdC / 100, vueltoBs: vBsC / 100, sobraUsd: cubre ? sobraUsdC / 100 : 0, sobraBs: cubre ? sobraBsC / 100 : 0,
    difBs: cubre && sobraBsC > 0 ? (sobraBsC - (Math.round(vUsdC * t) + vBsC)) / 100 : 0 };
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
