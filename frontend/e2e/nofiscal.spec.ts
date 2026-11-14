import { expect, test } from "@playwright/test";
import { ir, preparar, sesionCajero, type Estado } from "./mock";

test.use({ viewport: { width: 1440, height: 900 } });

test("el ticket es NO FISCAL y lleva el nombre y la cédula/RIF del cliente si se anotan", async ({ page }) => {
  const st: Estado = { turnoAbierto: true };
  await preparar(page, st, { "kioskpos.sesion": sesionCajero });
  await ir(page);
  await page.keyboard.press("Alt+1");
  await page.locator(".pcard", { hasText: "Coca-Cola 2L" }).click();
  await page.keyboard.press("F9");
  await page.getByRole("button", { name: /Datos del cliente en el ticket/ }).click();
  const datos = page.getByLabel("Datos del cliente para el ticket");
  await datos.getByPlaceholder("Ej. Pedro Pérez").fill("Pedro Pérez");
  await datos.getByPlaceholder("V-12345678").fill("v-12345678");
  await page.locator(".cb3-card").first().locator("input").first().fill("10");
  await page.locator(".cb3-go").click();

  const r = page.locator(".receipt");
  await expect(r).toContainText("DOCUMENTO NO FISCAL");
  await expect(r).toContainText("NRO. CONTROL INTERNO:");
  await expect(r).toContainText("CLIENTE: Pedro Pérez");
  await expect(r).toContainText("C.I./RIF: V-12345678");
  await expect(r).toContainText("ESTE DOCUMENTO NO ES UNA FACTURA");
  await expect(r).not.toContainText("FACTURA #");
  expect(st.venta.comprador).toEqual({ nombre: "Pedro Pérez", doc: "V-12345678" });
});

test("sin datos del cliente: Consumidor Final y no se manda comprador", async ({ page }) => {
  const st: Estado = { turnoAbierto: true };
  await preparar(page, st, { "kioskpos.sesion": sesionCajero });
  await ir(page);
  await page.keyboard.press("Alt+1");
  await page.locator(".pcard", { hasText: "Coca-Cola 2L" }).click();
  await page.keyboard.press("F9");
  await page.locator(".cb3-card").first().locator("input").first().fill("10");
  await page.locator(".cb3-go").click();
  await expect(page.locator(".receipt")).toContainText("CLIENTE: Consumidor Final");
  await expect(page.locator(".receipt")).not.toContainText("C.I./RIF");
  expect(st.venta.comprador).toBeUndefined();
});
