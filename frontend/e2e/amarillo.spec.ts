import { expect, test } from "@playwright/test";
import { ir, preparar, sesionCajero, sesionDueno, type Estado } from "./mock";

test.use({ viewport: { width: 1366, height: 900 } });

test("reportes: semana y mes con día por día, más vendidos, recargas y exportar a Excel", async ({ page }) => {
  const st: Estado = { turnoAbierto: false };
  await preparar(page, st, { "kioskpos.sesion": sesionDueno });
  await ir(page);
  await page.getByRole("tab", { name: "Semana" }).click();
  await expect(page.locator(".rep-col")).toHaveCount(7);
  expect(st.rango).toMatch(/desde=\d{4}-\d{2}-\d{2}&hasta=\d{4}-\d{2}-\d{2}/);
  await expect(page.locator(".rep-top li").first()).toContainText("Harina PAN");
  await expect(page.getByText("Ganancia de recargas")).toBeVisible();
  await page.locator(".rep-col").nth(6).hover();
  await expect(page.locator(".rep-dias-h .d")).toContainText("$ 22,00");
  const descarga = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar a Excel" }).click();
  const d = await descarga;
  expect(d.suggestedFilename()).toMatch(/^reporte-\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.csv$/);
  await page.getByRole("tab", { name: "Mes" }).click();
  await expect(page.getByText(/Vendido este mes/)).toBeVisible();
});

test("ajustes del negocio: nombre, RIF y frase salen en la vista del ticket", async ({ page }) => {
  const st: Estado = { turnoAbierto: false };
  await preparar(page, st, { "kioskpos.sesion": sesionDueno });
  await ir(page);
  await page.getByRole("button", { name: /^Más/ }).first().click();
  await page.getByLabel("RIF").fill("J-12345678-9");
  await page.getByLabel("Frase del ticket").fill("Dios todo poderoso");
  const vista = page.getByLabel("Vista del ticket");
  await expect(vista).toContainText("BODEGA COCOA");
  await expect(vista).toContainText("RIF: J-12345678-9");
  await expect(vista).toContainText("DIOS TODO PODEROSO");
  await expect(vista).toContainText("FORMA DE PAGO");
  await page.getByRole("button", { name: "Guardar ajustes" }).click();
  await expect(page.getByText("Guardado ✓")).toBeVisible();
  expect(st.configNeg).toMatchObject({ nombre: "Bodega Cocoa", rif: "J-12345678-9", mensajeTicket: "Dios todo poderoso" });
});
