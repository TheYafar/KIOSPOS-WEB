import { expect, test } from "@playwright/test";
import { ir, preparar, sesionCajero, sesionDueno } from "./mock";

// Ninguna pantalla debe desbordarse a lo ancho en móvil, tablet ni PC.
const tamanos = [["movil", 390, 844], ["tablet", 820, 1180], ["pc", 1920, 1080]] as const;
const pantallas = [
  { n: "vender", ses: sesionCajero, tecla: "Alt+1" }, { n: "cierre", ses: sesionCajero, tecla: "Alt+2" },
  { n: "ventas", ses: sesionCajero, tecla: "Alt+3" }, { n: "fiado", ses: sesionDueno, tecla: "Alt+5" }, { n: "config", ses: sesionDueno, tecla: "Alt+6" }, { n: "reportes", ses: sesionDueno, tecla: "Alt+1" },
  { n: "productos", ses: sesionDueno, tecla: "Alt+3" }, { n: "mas", ses: sesionDueno, tecla: "Alt+7" },
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
      // Tampoco hacia abajo: la pantalla se desplaza por dentro y el menú queda completo.
      const abajo = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
      expect(abajo).toBeLessThanOrEqual(1);
    });
  }
}

test("con letra grande tampoco se desborda y se recuerda", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await preparar(page, { turnoAbierto: true }, { "kioskpos.sesion": sesionCajero, "kioskpos.turno": "7" });
  await ir(page);
  await page.getByRole("button", { name: /Tamaño de letra: Normal/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-tam", "grande");
  await page.getByRole("button", { name: /Tamaño de letra: Grande/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-tam", "muy-grande");
  for (const tecla of ["Alt+1", "Alt+2", "Alt+3"]) {
    await page.keyboard.press(tecla);
    await page.waitForTimeout(200);
    const d = await page.evaluate(() => [document.documentElement.scrollWidth - innerWidth, document.documentElement.scrollHeight - innerHeight]);
    expect(d[0]).toBeLessThanOrEqual(1);
    expect(d[1]).toBeLessThanOrEqual(1);
  }
  await page.reload(); await page.waitForLoadState("networkidle");
  await expect(page.locator("html")).toHaveAttribute("data-tam", "muy-grande");
});
