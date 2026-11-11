import { describe, expect, it } from "vitest";
import { diaVe, hace } from "./dia";

describe("día de Venezuela", () => {
  it("a las 11 pm de Caracas (03:00 UTC del día siguiente) sigue siendo el mismo día", () => {
    expect(diaVe(new Date("2026-11-11T03:30:00Z"))).toBe("2026-11-10");
    expect(hace(1, new Date("2026-11-11T03:30:00Z"))).toBe("2026-11-09");
  });
  it("cruza meses", () => {
    expect(hace(1, new Date("2026-12-01T15:00:00Z"))).toBe("2026-11-30");
  });
});
