import { describe, expect, it } from "vitest";
import { calcularCobro as C, restoPara as R } from "../cobroCalc";

// Mismo criterio que el servidor (CobroCalculadora): $ exacto, Bs exacto, mixto con tolerancia $0,05.
describe("calcularCobro", () => {
  it("cuadra el caso mixto real (PM 702 + $1 + Bs 198 a 900)", () => {
    const e = C(2, 900, { PAGO_MOVIL: 702, EFECTIVO_USD: 1, EFECTIVO_BS: 198 });
    expect([e.cubre, e.faltaUsd, e.vueltoUsd]).toEqual([true, 0, 0]);
  });
  it("solo Bs repartido exacto no pierde centavos", () => {
    const e = C(1.37, 900, { PAGO_MOVIL: 616.5, EFECTIVO_BS: 616.5 });
    expect([e.cubre, e.faltaBs, e.vueltoBs]).toEqual([true, 0, 0]);
  });
  it("solo Bs corto por un céntimo no cubre", () => {
    expect(C(1.37, 900, { PAGO_MOVIL: 1232.99 })).toMatchObject({ cubre: false, faltaBs: 0.01 });
  });
  it("solo $: falta y vuelto exactos", () => {
    expect(C(2, 900, { EFECTIVO_USD: 1.99 })).toMatchObject({ cubre: false, faltaUsd: 0.01 });
    expect(C(2, 900, { EFECTIVO_USD: 5 })).toMatchObject({ cubre: true, vueltoUsd: 3 });
  });
  it("mixto acepta la tolerancia de $0,05 y rechaza más", () => {
    expect(C(10, 900, { EFECTIVO_USD: 5, PAGO_MOVIL: 4473 })).toMatchObject({ cubre: true, faltaUsd: 0 });
    expect(C(10, 900, { EFECTIVO_USD: 5, PAGO_MOVIL: 4400 })).toMatchObject({ cubre: false, faltaUsd: 0.11 });
  });
  it("sin pagos no cubre", () => {
    expect(C(2, 900, {})).toMatchObject({ cubre: false, hayPago: false, faltaUsd: 2, faltaBs: 1800 });
  });
  it("vuelto en Bs cuando todo es Bs", () => {
    expect(C(2, 900, { EFECTIVO_BS: 2000 })).toMatchObject({ cubre: true, vueltoBs: 200 });
  });
  it("formas extra usan la moneda que se les indique", () => {
    const mon = (m: string) => (m === "X:zelle" ? "USD" : m === "EFECTIVO_BS" ? "VES" : "USD") as "USD" | "VES";
    expect(C(5, 900, { "X:zelle": 5 }, mon)).toMatchObject({ cubre: true });
  });
});

describe("restoPara", () => {
  it("completa en la moneda de la forma", () => {
    expect(R("EFECTIVO_BS", 1.37, 900, { PAGO_MOVIL: 616.5 })).toBe(616.5);
    expect(R("PAGO_MOVIL", 2, 900, { EFECTIVO_USD: 1 })).toBe(900);
    expect(R("EFECTIVO_USD", 2, 900, { PAGO_MOVIL: 900 })).toBe(1);
    expect(R("EFECTIVO_USD", 2, 900, { PAGO_MOVIL: 1 })).toBe(2);
    expect(R("PUNTO", 2, 900, { EFECTIVO_USD: 5 })).toBe(0);
  });
  it.each([[1.37, 900], [7.49, 897], [0.33, 913], [125.5, 896]])("deja siempre el cobro cubierto (%s a %s)", (tot, tasa) => {
    const m: Record<string, number> = { EFECTIVO_USD: 0.5 };
    m.PAGO_MOVIL = R("PAGO_MOVIL", tot, tasa, m);
    expect(C(tot, tasa, m).cubre).toBe(true);
    const n: Record<string, number> = { PUNTO: 100 };
    n.EFECTIVO_BS = R("EFECTIVO_BS", tot, tasa, n);
    expect(C(tot, tasa, n)).toMatchObject({ cubre: true, vueltoBs: 0 });
  });
});
