import { expect, test } from "@playwright/test";
import { ir, preparar, sesionCajero, sesionDueno } from "./mock";

// Ninguna pantalla debe desbordarse a lo ancho en móvil, tablet ni PC.
const tamanos = [["movil", 390, 844], ["tablet", 820, 1180], ["pc", 1920, 1080]] as const;
const pantallas = [
  { n: "vender", ses: sesionCajero, tecla: "Alt+1" }, { n: "cierre", ses: sesionCajero, tecla: "Alt+2" },
  { n: "config", ses: sesionCajero, tecla: "Alt+3" }, { n: "reportes", ses: sesionDueno, tecla: "Alt+1" },
  { n: "productos", ses: sesionDueno, tecla: "Alt+2" }, { n: "mas", ses: sesionDueno, tecla: "Alt+5" },
];
for (const [t, w, h] of tamanos) {
  for (const p of pantallas) {
    test(`${p.n} cabe en ${t} (${w}px)`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await preparar(page, { turnoAbierto: true }, { "kioskpos.sesion": p.ses, "kioskpos.turno": "7" });
      await ir(page);
      await page.keyboard.press(p.tecla);
      await page.waitForTimeout(300);
      const desborde = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(desborde).toBeLessThanOrEqual(1);
    });
  }
}
