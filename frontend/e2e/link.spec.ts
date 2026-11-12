import { expect, test } from "@playwright/test";
import { preparar, sesionDueno, type Estado } from "./mock";

test("un enlace de emparejar caja lleva a configurar aunque ya haya sesión abierta", async ({ page }) => {
  const st: Estado = { turnoAbierto: false };
  await preparar(page, st, { "kioskpos.sesion": sesionDueno });
  await page.goto("/#caja=TOKEN123");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "Primera vez en este equipo" })).toBeVisible();
  await expect(page.getByLabel("Token de la caja")).toHaveValue("TOKEN123");
});
