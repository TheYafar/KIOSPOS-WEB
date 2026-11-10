import { describe, expect, it } from "vitest";
import { avisoCierre } from "../screens/negocio";

const at = (h: number, m: number) => new Date(2026, 0, 1, h, m);
describe("aviso de cierre al cajero", () => {
  it("sin horarios no avisa", () => { expect(avisoCierre(null, at(18, 0))).toBeNull(); expect(avisoCierre("", at(18, 0))).toBeNull(); });
  it("avisa 20 minutos antes", () => {
    expect(avisoCierre("18:00", at(17, 40))).toEqual({ tipo: "pronto", hora: "18:00", minutos: 20 });
    expect(avisoCierre("18:00", at(17, 39))).toBeNull();
  });
  it("avisa a la hora y hasta 30 minutos después", () => {
    expect(avisoCierre("18:00", at(18, 0))).toEqual({ tipo: "ahora", hora: "18:00", minutos: 0 });
    expect(avisoCierre("18:00", at(18, 31))).toBeNull();
  });
  it("prioriza 'ahora' y el más cercano", () => {
    expect(avisoCierre("18:00,18:10", at(18, 5))).toEqual({ tipo: "ahora", hora: "18:00", minutos: 5 });
    expect(avisoCierre("15:00,19:00,22:00", at(18, 50))).toEqual({ tipo: "pronto", hora: "19:00", minutos: 10 });
  });
  it("ignora horas mal escritas", () => {
    expect(avisoCierre("xx:yy,18:00", at(17, 50))).toEqual({ tipo: "pronto", hora: "18:00", minutos: 10 });
  });
});
