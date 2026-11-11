import { expect, test } from "@playwright/test";
import { ir, preparar, sesionDueno, type Estado } from "./mock";

test.use({ viewport: { width: 1366, height: 900 } });

test("el botón Atrás vuelve a la pestaña anterior y la pestaña queda en la URL", async ({ page }) => {
  const st: Estado = { turnoAbierto: false };
  await preparar(page, st, { "kioskpos.sesion": sesionDueno });
  await ir(page);
  await expect(page).toHaveURL(/#\/reportes$/);
  await page.getByRole("button", { name: /^Nómina/ }).first().click();
  await expect(page).toHaveURL(/#\/nomina$/);
  await page.getByRole("button", { name: /^Crédito/ }).first().click();
  await expect(page).toHaveURL(/#\/fiado$/);
  await expect(page.getByRole("heading", { name: "Crédito" })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/#\/nomina$/);
  await expect(page.getByRole("heading", { name: "Nómina" })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/#\/reportes$/);
});

test("Atrás cierra la ventana abierta sin cambiar de pestaña", async ({ page }) => {
  const st: Estado = { turnoAbierto: false };
  await preparar(page, st, { "kioskpos.sesion": sesionDueno });
  await ir(page);
  await page.getByRole("button", { name: /^Nómina/ }).first().click();
  const card = page.locator(".nom-card", { hasText: "Luis" });
  await card.getByRole("button", { name: "Pagar nómina" }).click();
  await expect(page.locator(".modal")).toHaveCount(1);

  await page.goBack();
  await expect(page.locator(".modal")).toHaveCount(0);
  await expect(page).toHaveURL(/#\/nomina$/);
  await expect(page.getByRole("heading", { name: "Nómina" })).toBeVisible();
});

test("cerrar una ventana con su botón no deja una entrada de más en el historial", async ({ page }) => {
  const st: Estado = { turnoAbierto: false };
  await preparar(page, st, { "kioskpos.sesion": sesionDueno });
  await ir(page);
  await page.getByRole("button", { name: /^Nómina/ }).first().click();
  await page.locator(".nom-card", { hasText: "Luis" }).getByRole("button", { name: "Pagar nómina" }).click();
  await expect(page.locator(".modal")).toHaveCount(1);
  await page.locator(".modal").getByRole("button", { name: "Cerrar" }).click();
  await expect(page.locator(".modal")).toHaveCount(0);

  // Un solo Atrás debe llevar a la pestaña anterior (no "gastarse" en la ventana ya cerrada).
  await page.goBack();
  await expect(page).toHaveURL(/#\/reportes$/);
});
