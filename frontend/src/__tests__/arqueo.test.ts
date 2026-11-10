import { describe, expect, it } from "vitest";
import { calcularArqueo as A, leerMonto as L } from "../arqueo";

const M = [
  { metodo: "EFECTIVO_USD", moneda: "USD", esperado: 62, digital: false },
  { metodo: "EFECTIVO_BS", moneda: "VES", esperado: 9000, digital: false },
  { metodo: "PUNTO", moneda: "VES", esperado: 13500, digital: true },
  { metodo: "PAGO_MOVIL", moneda: "VES", esperado: 8070, digital: true },
  { metodo: "BIOPAGO", moneda: "VES", esperado: 0, digital: true },
];
const est = (r: ReturnType<typeof A>) => r.filas.map((f) => f.estado);

describe("arqueo del cierre", () => {
  it("lee montos en formato venezolano y con punto decimal", () => {
    expect([L(""), L("62"), L("1.234,50"), L("1234.50"), L("abc")]).toEqual([null, 62, 1234.5, 1234.5, null]);
  });
  it("sin contar: pide contar todo lo que tuvo movimiento", () => {
    const r = A(M, {}, 900);
    expect(est(r)).toEqual(["sin-contar", "sin-contar", "sin-contar", "sin-contar", "sin-movimiento"]);
    expect([r.porContar, r.listo]).toEqual([4, false]);
  });
  it("marca el faltante en la forma de pago correcta", () => {
    const r = A(M, { EFECTIVO_USD: "60", EFECTIVO_BS: "9000", PUNTO: "13.500,00", PAGO_MOVIL: "8070" }, 900);
    expect(est(r)).toEqual(["falta", "cuadra", "cuadra", "cuadra", "sin-movimiento"]);
    expect(r.faltantes.map((f) => [f.metodo, f.diferencia])).toEqual([["EFECTIVO_USD", -2]]);
    expect(r.diferenciaUsd).toBe(-2);
    expect(r.listo).toBe(true);
  });
  it("sobrante y contado en cero cuadran bien", () => {
    const r = A(M, { EFECTIVO_USD: "62", EFECTIVO_BS: "9000", PUNTO: "13500", PAGO_MOVIL: "8100", BIOPAGO: "0" }, 900);
    expect(est(r)).toEqual(["cuadra", "cuadra", "cuadra", "sobra", "cuadra"]);
  });
  it("diferencia total sin perder el centavo", () => {
    const r = A(M, { EFECTIVO_USD: "62", EFECTIVO_BS: "9000", PUNTO: "13500", PAGO_MOVIL: "8070", BIOPAGO: "500" }, 900);
    expect(r.diferenciaUsd).toBe(0.56);
  });
  it("un céntimo menos es faltante", () => {
    expect(est(A(M, { EFECTIVO_BS: "8999,99" }, 900))[1]).toBe("falta");
  });
});
