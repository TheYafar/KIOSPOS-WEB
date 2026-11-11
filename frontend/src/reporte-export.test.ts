import { describe, expect, it } from "vitest";
import { rangoDe, reporteCsv } from "./reporte-export";

describe("rangoDe", () => {
  const ahora = new Date("2026-11-11T15:00:00Z"); // 11:00 en Caracas
  it("hoy, semana (7 días con hoy) y mes en curso", () => {
    expect(rangoDe("hoy", ahora)).toEqual({ desde: "2026-11-11", hasta: "2026-11-11" });
    expect(rangoDe("semana", ahora)).toEqual({ desde: "2026-11-05", hasta: "2026-11-11" });
    expect(rangoDe("mes", ahora)).toEqual({ desde: "2026-11-01", hasta: "2026-11-11" });
  });
  it("usa el día de Venezuela, no el UTC", () => {
    expect(rangoDe("hoy", new Date("2026-11-12T02:00:00Z"))).toEqual({ desde: "2026-11-11", hasta: "2026-11-11" });
  });
});

describe("reporteCsv", () => {
  it("separa con ; usa coma decimal, BOM y escapa comillas", () => {
    const csv = reporteCsv({ fecha: "2026-11-05", hasta: "2026-11-11", cantidadVentas: 3, totalUsd: 12.5, totalBs: 11250, costoUsd: 8, gananciaUsd: 4.5,
      pagos: [{ metodo: "PAGO_MOVIL", moneda: "VES", montoOriginal: 11250, equivalenteUsd: 12.5 }],
      masVendidos: [{ productoId: 1, nombre: 'Queso "llanero"; 1kg', cantidad: 1.5, vendidoUsd: 9, gananciaUsd: 3 }], porDia: [] });
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("2026-11-05 al 2026-11-11");
    expect(csv).toContain("Ganancia ($);4,50");
    expect(csv).toContain("Pago móvil;VES;11250,00;12,50");
    expect(csv).toContain('"Queso ""llanero""; 1kg";1,5;9,00;3,00');
  });
});
