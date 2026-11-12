import { expect, test } from "@playwright/test";
import { ir, preparar, sesionCajero, sesionDueno, type Estado } from "./mock";

test.use({ viewport: { width: 1440, height: 900 } });

test("vender a crédito a un empleado: se elige en 'Trabajadores' y sale el N° de factura", async ({ page }) => {
  const st: Estado = { turnoAbierto: true };
  await preparar(page, st, { "kioskpos.sesion": sesionCajero });
  await ir(page);
  await page.keyboard.press("Alt+1");
  await page.locator(".pcard", { hasText: "Coca-Cola 2L" }).click();
  await page.locator(".pcard", { hasText: "Harina PAN" }).click();
  await page.keyboard.press("F9");
  const card = page.locator(".cb3-card", { has: page.locator('.cb3-nm b:text-is("Crédito")') });
  await card.getByRole("button", { name: "Elegir cliente o trabajador" }).click();
  await page.getByRole("tab", { name: /^Trabajadores/ }).click();
  await expect(page.locator(".cli-pick-row")).toHaveCount(1);
  await page.locator(".cli-pick-row", { hasText: "Luis" }).click();
  await page.keyboard.press("Enter");

  await expect(page.getByLabel("Número de factura")).toContainText("0001");
  await expect(page.locator(".fac-cred")).toContainText("del empleado");
  await expect(page.locator(".fac-cred")).toContainText("Luis (empleado)");
  await expect(page.locator(".receipt")).toContainText("FACTURA #: 000001");
  expect(st.venta.clienteId).toBe(3);
});

test("el dueño busca una factura por su número y ve productos, fecha y total", async ({ page }) => {
  await preparar(page, { turnoAbierto: false }, { "kioskpos.sesion": sesionDueno });
  await ir(page);
  await page.getByRole("button", { name: /^Crédito/ }).first().click();
  await page.getByRole("button", { name: "Buscar factura" }).click();
  await page.getByLabel("Número de factura").fill("4");
  await page.keyboard.press("Enter");
  const det = page.getByLabel("Detalle de la factura");
  await expect(page.getByRole("heading", { name: "Factura N° 0004" })).toBeVisible();
  await expect(det).toContainText("Arroz Mary");
  await expect(det).toContainText("$ 6,00");
  await expect(det).toContainText("Fecha");

  // Número que no existe
  await page.locator(".modal").getByRole("button", { name: "Cerrar" }).click();
  await page.getByRole("button", { name: "Buscar factura" }).click();
  await page.getByLabel("Número de factura").fill("999");
  await page.keyboard.press("Enter");
  await expect(page.getByText("No hay ninguna factura con el número 999.")).toBeVisible();
});

test("desde la cuenta del empleado se abre la factura de lo que se llevó", async ({ page }) => {
  await preparar(page, { turnoAbierto: false }, { "kioskpos.sesion": sesionDueno });
  await ir(page);
  await page.getByRole("button", { name: /^Crédito/ }).first().click();
  await page.getByRole("button", { name: "Trabajadores" }).click();
  await page.locator(".cli-row", { hasText: "Luis" }).click();
  await page.getByRole("button", { name: "Ver factura" }).click();
  await expect(page.getByRole("heading", { name: "Factura N° 0004" })).toBeVisible();
  await expect(page.getByLabel("Detalle de la factura")).toContainText("Arroz Mary");
});
