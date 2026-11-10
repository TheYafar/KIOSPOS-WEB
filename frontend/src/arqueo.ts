// Arqueo del cierre de caja: el cajero cuenta CADA forma de pago y la app le dice,
// fila por fila, si cuadra, si falta o si sobra. Todo en centavos enteros.

export type EstadoFila = "sin-contar" | "sin-movimiento" | "cuadra" | "falta" | "sobra";

export interface MetodoEsperado { metodo: string; moneda: string; esperado: number; digital: boolean; }
export interface FilaArqueo {
  metodo: string; moneda: "USD" | "VES"; digital: boolean;
  esperado: number; contado: number | null; diferencia: number; estado: EstadoFila;
}
export interface TotalesArqueo {
  filas: FilaArqueo[];
  porContar: number;          // filas con movimiento que aún no se han contado
  contadas: number; requeridas: number;
  esperadoUsd: number; contadoUsd: number; diferenciaUsd: number; // todo convertido a $
  faltantes: FilaArqueo[]; sobrantes: FilaArqueo[];
  listo: boolean;             // todas las filas con movimiento están contadas
}

const c = (n: number) => Math.round((n || 0) * 100);

/** "1.234,50" / "1234.50" / "50,5" -> número; vacío -> null (no contado). */
export function leerMonto(s: string | undefined): number | null {
  const t = (s || "").trim();
  if (!t) return null;
  const norm = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const n = parseFloat(norm);
  return isNaN(n) ? null : n;
}

export function calcularArqueo(metodos: MetodoEsperado[], contados: Record<string, string>, tasa: number): TotalesArqueo {
  const t = tasa > 0 ? tasa : 1;
  const filas: FilaArqueo[] = metodos.map((m) => {
    const moneda = m.moneda === "USD" ? "USD" : "VES";
    const contado = leerMonto(contados[m.metodo]);
    const esperadoC = c(m.esperado);
    let estado: EstadoFila; let difC = 0;
    if (contado == null) {
      estado = esperadoC === 0 ? "sin-movimiento" : "sin-contar";
    } else {
      difC = c(contado) - esperadoC;
      estado = difC === 0 ? "cuadra" : difC < 0 ? "falta" : "sobra";
    }
    return { metodo: m.metodo, moneda, digital: m.digital, esperado: esperadoC / 100, contado, diferencia: difC / 100, estado };
  });
  const aUsd = (f: FilaArqueo, v: number) => (f.moneda === "USD" ? v : v / t);
  const requeridas = filas.filter((f) => f.estado !== "sin-movimiento" || f.contado != null).length;
  const contadas = filas.filter((f) => f.contado != null).length;
  const porContar = filas.filter((f) => f.estado === "sin-contar").length;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const espRaw = filas.reduce((s, f) => s + aUsd(f, f.esperado), 0);
  const conRaw = filas.reduce((s, f) => s + aUsd(f, f.contado ?? 0), 0);
  return {
    filas, porContar, contadas, requeridas, esperadoUsd: r2(espRaw), contadoUsd: r2(conRaw),
    diferenciaUsd: r2(conRaw - espRaw),
    faltantes: filas.filter((f) => f.estado === "falta"),
    sobrantes: filas.filter((f) => f.estado === "sobra"),
    listo: porContar === 0,
  };
}
