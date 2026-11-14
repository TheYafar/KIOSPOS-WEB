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
      centrar("DOCUMENTO NO FISCAL"), "FECHA : 08/10/2026 09:15:00 a. m.", "NRO. CONTROL INTERNO: 000012", "-".repeat(40),
      "CLIENTE: Consumidor Final", "-".repeat(40),
      fila("CANT  DESCRIPCION", "PRECIO (Bs)"), "-".repeat(40), "2 x COPIAS", fila("  (2 x Bs. 157,50)", "Bs. 315,00"),
      "-".repeat(40), fila("TOTAL EN BOLIVARES", "Bs. 315,00"), "=".repeat(40), centrar("FORMA DE PAGO"), "-".repeat(40),
      fila("PUNTO", "VES 315,00"), "=".repeat(40),
      centrar("ESTE DOCUMENTO NO ES UNA FACTURA"), centrar("SIN DERECHO A CREDITO FISCAL"), centrar("SI REQUIERE FACTURA, SOLICITELA"),
    ].join("\n"));
    expect(t.split("\n").every((l) => l.length <= 40)).toBe(true);
  });
  it("lleva el cliente con su cédula/RIF y nunca dice FACTURA #", () => {
    const t = armarTicket({ negocio: { nombre: "X" }, fecha: new Date(2026, 9, 8, 15, 4, 7), numero: 3, cliente: "Pedro Pérez", doc: "V-12345678",
      tasa: 100, lineas: [], totalBs: 0, pagos: [] });
    expect(t).toContain("CLIENTE: Pedro Pérez\nC.I./RIF: V-12345678");
    expect(t).toContain("03:04:07 p. m.");
    expect(t).not.toContain("FACTURA #");
  });
  it("miles con punto", () => {
    const t = armarTicket({ negocio: { nombre: "X" }, fecha: new Date(), tasa: 900, lineas: [{ cantidad: 1, nombre: "A", precioUsd: 20, subtotalUsd: 20 }], totalBs: 18000, pagos: [] });
    expect(t).toContain("Bs. 18.000,00");
  });
});
