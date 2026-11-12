import { describe, expect, it } from "vitest";
import { armarTicket, centrar, fila } from "./ticket";

describe("ticket con formato Cocoa", () => {
  it("sale igual que el del servidor (TicketFormatoTest)", () => {
    const t = armarTicket({
      negocio: { nombre: "Bodegas Cocoa", frase: "Dios todo poderoso" }, fecha: new Date(2026, 9, 8, 9, 15), numero: 12,
      tasa: 157.5, lineas: [{ cantidad: 2, nombre: "Copias", precioUsd: 1, subtotalUsd: 2 }], totalBs: 315,
      pagos: [{ nombre: "PUNTO", moneda: "VES", monto: 315 }],
    });
    expect(t).toBe([
      "=".repeat(40), centrar("BODEGAS COCOA"), centrar("DIOS TODO PODEROSO"), "=".repeat(40),
      "FECHA : 08/10/2026 09:15 a. m.", "FACTURA #: 000012", "-".repeat(40), "CLIENTE: Consumidor Final", "-".repeat(40),
      fila("CANT  DESCRIPCION", "PRECIO (Bs)"), "-".repeat(40), "2 x COPIAS", fila("  (2 x Bs. 157,50)", "Bs. 315,00"),
      "-".repeat(40), fila("TOTAL EN BOLIVARES", "Bs. 315,00"), "=".repeat(40), centrar("FORMA DE PAGO"), "-".repeat(40),
      fila("PUNTO", "VES 315,00"), "=".repeat(40),
    ].join("\n"));
    expect(t.split("\n").every((l) => l.length <= 40)).toBe(true);
  });
  it("miles con punto", () => {
    const t = armarTicket({ negocio: { nombre: "X" }, fecha: new Date(), tasa: 900, lineas: [{ cantidad: 1, nombre: "A", precioUsd: 20, subtotalUsd: 20 }], totalBs: 18000, pagos: [] });
    expect(t).toContain("Bs. 18.000,00");
  });
});
