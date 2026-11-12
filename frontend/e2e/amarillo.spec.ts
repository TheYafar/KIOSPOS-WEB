import { expect, test } from "@playwright/test";
import { ir, preparar, sesionCajero, sesionDueno, type Estado } from "./mock";

test.use({ viewport: { width: 1366, height: 900 } });

test("recarga desde la caja: operadora, número, monto y cobro con comisión", async ({ page }) => {
  const st: Estado = { turnoAbierto: true };
  await preparar(page, st, { "kioskpos.sesion": sesionCajero, "kioskpos.turno": "7" });
  await ir(page);
  await page.keyboard.press("F4");
  const dlg = page.getByRole("dialog", { name: "Recargas" });
  await expect(dlg.getByRole("button", { name: "Elige la operadora" })).toBeDisabled();
  await dlg.getByRole("radio", { name: "Movistar" }).click();
  await dlg.getByLabel("Número a recargar").fill("0414-1234567");
  await dlg.getByRole("button", { name: "Bs 300" }).click();
  await dlg.getByLabel("Comisión de la recarga").fill("10");
  await expect(dlg.locator(".mov-av")).toContainText("Bs 330,00");
  await expect(dlg.locator(".mov-av")).toContainText("Bs 30,00");
  await dlg.getByRole("button", { name: /Registrar recarga/ }).click();
  await expect(dlg.getByRole("status")).toContainText("Recarga Movistar de Bs 300,00 registrada");
  expect(st.recargas?.[0]).toMatchObject({ operadora: "MOVISTAR", numero: "0414-1234567", montoBs: 300, metodoCobro: "EFECTIVO_BS", montoCobrado: 330, tasa: 900 });
  await expect(dlg.locator(".rec-hist")).toContainText("ganancia Bs 30,00");

  // En dólares: Bs 330 a 900 = $0,37 (redondeado hacia arriba)
  await dlg.getByRole("radio", { name: "Digitel" }).click();
  await dlg.getByLabel("Número a recargar").fill("04121112233");
  await dlg.getByLabel("Monto de la recarga").fill("300");
  await dlg.getByRole("button", { name: "Efectivo $" }).click();
  await expect(dlg.locator(".mov-av")).toContainText("$ 0,37");
  await page.keyboard.press("Enter");
  await expect(dlg.locator(".rec-hist .movs-row")).toHaveCount(2);
  expect(st.recargas?.[1]).toMatchObject({ operadora: "DIGITEL", metodoCobro: "EFECTIVO_USD", montoCobrado: 0.37 });

  page.once("dialog", (d) => d.accept());
  await dlg.getByRole("button", { name: "Anular recarga 04121112233" }).click();
  await expect(dlg.locator(".rec-hist .movs-row.anulado")).toHaveCount(1);
});

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
