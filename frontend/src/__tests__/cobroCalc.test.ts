import { describe, expect, it } from "vitest";
import { calcularCobro as C, restoPara as R } from "../cobroCalc";

// Mismo criterio que el servidor (CobroCalculadora): $ exacto, Bs exacto, mixto en Bs con tolerancia Bs 1.
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
  it("mixto se compara en Bs: el caso real con Bs 20,80 de menos NO cubre", () => {
    // $2,90 a 912 = Bs 2.644,80; paga $2 (Bs 1.824) + Bs 800 → faltan Bs 20,80.
    expect(C(2.9, 912, { EFECTIVO_USD: 2, EFECTIVO_BS: 800 })).toMatchObject({ cubre: false, faltaBs: 20.8, faltaUsd: 0.03 });
    expect(C(2.9, 912, { EFECTIVO_USD: 2, EFECTIVO_BS: 820.8 })).toMatchObject({ cubre: true, faltaBs: 0, vueltoUsd: 0, vueltoBs: 0 });
  });
  it("mixto solo tolera céntimos (Bs 1)", () => {
    expect(C(2.9, 912, { EFECTIVO_USD: 2, EFECTIVO_BS: 820.3 }).cubre).toBe(true);
    expect(C(2.9, 912, { EFECTIVO_USD: 2, EFECTIVO_BS: 819.5 }).cubre).toBe(false);
    expect(C(10, 900, { EFECTIVO_USD: 5, PAGO_MOVIL: 4473 })).toMatchObject({ cubre: false, faltaBs: 27 });
  });
  it("vuelto partido: dólares en billetes y el resto en Bs (como el servidor)", () => {
    expect(C(2.9, 912, { EFECTIVO_USD: 5 })).toMatchObject({ vueltoUsd: 2.1, vueltoBs: 0, sobraBs: 1915.2 });
    expect(C(2.9, 912, { EFECTIVO_USD: 5 }, undefined, undefined, 2)).toMatchObject({ vueltoUsd: 2, vueltoBs: 91.2 });
    expect(C(2.9, 912, { EFECTIVO_USD: 5 }, undefined, undefined, 0)).toMatchObject({ vueltoUsd: 0, vueltoBs: 1915.2 });
  });
  it("vuelto a mano: se respeta lo entregado y dice la diferencia", () => {
    const menos = C(2.9, 912, { EFECTIVO_USD: 5 }, undefined, undefined, 2, 90);
    expect(menos).toMatchObject({ vueltoUsd: 2, vueltoBs: 90, difBs: 1.2 });
    expect(C(2.9, 912, { EFECTIVO_USD: 5 }, undefined, undefined, 2, 100).difBs).toBeCloseTo(-8.8, 2);
  });
  it("venta toda a crédito (nada que cobrar) cubre", () => {
    expect(C(0, 912, {})).toMatchObject({ cubre: true });
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
