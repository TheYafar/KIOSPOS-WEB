import { expect, test } from "@playwright/test";
import { ir, preparar, sesionDueno, type Estado } from "./mock";

test("si la sesión venció, la app vuelve a la entrada y lo dice", async ({ page }) => {
  const st: Estado = { turnoAbierto: false, sesionVencida: true };
  await preparar(page, st, { "kioskpos.sesion": sesionDueno });
  await ir(page);
  await expect(page.getByText("Tu sesión venció. Entra otra vez.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "¿Quién va a cobrar?" })).toBeVisible(); // equipo-caja: vuelve a los cajeros
  expect(await page.evaluate(() => localStorage.getItem("kioskpos.sesion"))).toBeNull();
});
