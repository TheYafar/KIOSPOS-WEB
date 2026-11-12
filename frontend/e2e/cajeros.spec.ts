import { expect, test } from "@playwright/test";
import { ir, preparar, sesionDueno, type Estado } from "./mock";

test.use({ viewport: { width: 1366, height: 900 } });

test("el dueño ve sus cajeros al entrar y puede agregar uno", async ({ page }) => {
  const st: Estado = { turnoAbierto: false, usuarios: [{ id: 1, nombreCompleto: "Diego", rol: "DUENO", activo: true, esSoporte: false }, { id: 2, nombreCompleto: "María", rol: "CAJERO", activo: true, esSoporte: false }] };
  await preparar(page, st, { "kioskpos.sesion": sesionDueno });
  await ir(page);
  // Aterriza en Reportes: la tarjeta de cajeros muestra a María
  const card = page.locator(".cj-card");
  await expect(card.getByText("Tus cajeros")).toBeVisible();
  await expect(card.locator(".cj-row")).toContainText("María");

  await card.getByRole("button", { name: "Agregar cajero" }).click();
  await page.getByLabel("Nombre del cajero").fill("Pedro");
  await page.getByLabel("PIN de 4 dígitos").fill("5678");
  await page.locator(".modal").getByRole("button", { name: "Guardar" }).click();
  await expect.poll(() => st.usuarioCreado).toMatchObject({ rol: "CAJERO", nombreCompleto: "Pedro", pin: "5678" });
});

test("sin cajeros muestra el estado vacío con botón para agregar", async ({ page }) => {
  const st: Estado = { turnoAbierto: false, usuarios: [{ id: 1, nombreCompleto: "Diego", rol: "DUENO", activo: true, esSoporte: false }] };
  await preparar(page, st, { "kioskpos.sesion": sesionDueno });
  await ir(page);
  await expect(page.locator(".cj-empty")).toContainText("Aún no tienes cajeros");
  await expect(page.locator(".cj-plan")).toContainText("Tu plan permite");
  await page.getByRole("button", { name: "Agregar mi primer cajero" }).click();
  await expect(page.getByRole("heading", { name: "Nuevo cajero" })).toBeVisible();
});
