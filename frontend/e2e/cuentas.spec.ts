import { expect, test } from "@playwright/test";
import { ir, preparar, sesionDueno, type Estado } from "./mock";

test.use({ viewport: { width: 1366, height: 900 } });

test("lo anotado a mano en Cuentas se guarda en el servidor", async ({ page }) => {
  const st: Estado = { turnoAbierto: false };
  await preparar(page, st, { "kioskpos.sesion": sesionDueno });
  await ir(page);
  await page.getByRole("button", { name: /^Cuentas/ }).first().click();
  await page.getByRole("button", { name: "A mano" }).click();
  await expect(page.locator(".cb-sync").first()).toHaveText("Guardado en tu cuenta ✓");
  await page.getByRole("button", { name: "+ Anotar" }).click();
  await page.getByPlaceholder("Ej: Cierre de la tarde").fill("Cierre de la noche");
  await page.locator(".cb-fld", { hasText: "¿Cuánto vendiste?" }).locator("input").fill("120");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.locator(".cb-sync").first()).toHaveText("Guardado en tu cuenta ✓");
  await expect.poll(() => st.contab?.libro?.contenido ?? "").toContain("Cierre de la noche");
  expect(st.contab?.libro?.version).toBeGreaterThanOrEqual(2);
});

test("otro equipo abre Cuentas y ve lo que se guardó en el servidor", async ({ page }) => {
  const hojas = [{ id: "h1", name: "Cuentas de Cocoa", cols: [{ name: "Concepto", money: false }, { name: "Monto", money: true }], rows: [["Luz", "15"]] }];
  const st: Estado = { turnoAbierto: false, contab: { hojas: { contenido: JSON.stringify(hojas), version: 4 } } };
  await preparar(page, st, { "kioskpos.sesion": sesionDueno });
  await ir(page);
  await page.getByRole("button", { name: /^Cuentas/ }).first().click();
  await page.getByRole("button", { name: "A mano" }).click();
  await page.getByRole("button", { name: "Hoja libre" }).click();
  await expect(page.getByLabel("Nombre de la hoja")).toHaveValue("Cuentas de Cocoa");
  await expect(page.locator(".cb-sync")).toHaveText("Guardado en tu cuenta ✓");
  expect(st.contabPuts ?? 0).toBe(1); // solo subió la libreta vacía (primera vez); las hojas se tomaron del servidor
});
