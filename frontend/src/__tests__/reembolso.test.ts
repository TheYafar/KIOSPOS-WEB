import { describe, expect, it } from "vitest";
import { repartir } from "../reembolso";

const de = (l: { metodo: string; monto: number }[], m: string) => l.find((x) => x.metodo === m)?.monto ?? 0;

describe("devolver como pagó", () => {
  it("reparte en proporción entre efectivo y pago móvil", () => {
    const r = repartir([{ metodo: "EFECTIVO_USD", moneda: "USD", monto: 3 }, { metodo: "PAGO_MOVIL", moneda: "VES", monto: 2700 }], 0, 0, 900, 6, 3);
    expect(de(r, "EFECTIVO_USD")).toBe(1.5);
    expect(de(r, "PAGO_MOVIL")).toBe(1350);
  });
  it("no devuelve el vuelto", () => {
    expect(repartir([{ metodo: "EFECTIVO_USD", moneda: "USD", monto: 5 }], 1, 0, 900, 4, 4)).toEqual([{ metodo: "EFECTIVO_USD", moneda: "USD", monto: 4 }]);
    expect(de(repartir([{ metodo: "EFECTIVO_USD", moneda: "USD", monto: 5 }], 0, 900, 900, 4, 4), "EFECTIVO_USD")).toBe(4);
  });
  it("lo fiado vuelve a la cuenta del cliente", () => {
    const r = repartir([{ metodo: "EFECTIVO_USD", moneda: "USD", monto: 1 }, { metodo: "FIADO", moneda: "USD", monto: 3 }], 0, 0, 900, 4, 4);
    expect(de(r, "A_CUENTA")).toBe(3);
    expect(de(r, "EFECTIVO_USD")).toBe(1);
  });
});
