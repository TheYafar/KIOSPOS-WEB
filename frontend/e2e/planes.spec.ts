import { expect, test } from "@playwright/test";
import { ir, preparar, sesionDueno, type Estado } from "./mock";

test.use({ viewport: { width: 1366, height: 900 } });

test("en prueba gratis el dueño ve los días que le quedan y elige plan y cajas", async ({ page }) => {
  const st: Estado = { turnoAbierto: false, prueba: true };
  await preparar(page, st, { "kioskpos.sesion": sesionDueno });
  await ir(page);
  await expect(page.locator(".plan-prueba")).toContainText("Prueba gratis: te quedan 5 días");
  await page.locator(".plan-prueba").getByRole("button", { name: "Ver planes" }).click();
  await expect(page.locator(".plan .cb-pill")).toHaveText("PRUEBA GRATIS");
  await expect(page.locator(".plan-sub")).toContainText("$ 25,00/mes · 1 caja");
  await page.getByRole("button", { name: "Cambiar plan o cajas" }).click();
  await page.getByRole("radio", { name: /Bodega Pro/ }).click();
  await page.getByRole("button", { name: "Una caja más" }).click(); // 1 -> 2 (incluidas)
  await page.getByRole("button", { name: "Una caja más" }).click(); // 3: una extra
  await expect(page.locator(".eplan-total")).toContainText("$ 48,00");
  await page.getByRole("button", { name: "Guardar plan" }).click();
  expect(st.planCambio).toEqual({ plan: "PRO", cajas: 3 });
  await expect(page.locator(".plan-name")).toHaveText("Plan Bodega Pro");
  await expect(page.locator(".plan-sub")).toContainText("$ 48,00/mes · 3 cajas");
});

test("el plan Bodega no deja pasar de 3 cajas", async ({ page }) => {
  await preparar(page, { turnoAbierto: false }, { "kioskpos.sesion": sesionDueno });
  await ir(page);
  await page.getByRole("button", { name: /^Más/ }).first().click();
  await page.getByRole("button", { name: "Cambiar plan o cajas" }).click();
  const mas = page.getByRole("button", { name: "Una caja más" });
  await mas.click(); await mas.click();
  await expect(page.getByLabel("Cajas")).toHaveText("3");
  await expect(mas).toBeDisabled();
  await expect(page.locator(".eplan-total")).toContainText("$ 45,00");
});
