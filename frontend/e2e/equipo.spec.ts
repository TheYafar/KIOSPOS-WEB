import { expect, test } from "@playwright/test";
import { ir, preparar, sesionDueno, type Estado } from "./mock";

test.use({ viewport: { width: 1366, height: 900 } });

test("el dueño edita y elimina usuarios y cajas", async ({ page }) => {
  const st: Estado = { turnoAbierto: false };
  await preparar(page, st, { "kioskpos.sesion": sesionDueno });
  await ir(page);
  await page.getByRole("button", { name: /^Más/ }).first().click();
  await expect(page.getByText("cajero1")).toBeVisible();

  // Editar el cajero: nombre + PIN nuevo
  const fila = page.locator(".eq-row", { hasText: "cajero1" });
  await fila.getByRole("button", { name: "Editar" }).click();
  await page.getByLabel("Nombre completo").fill("Pedro Caja");
  await page.locator(".modal").getByLabel(/Cambiar PIN/).fill("4321");
  await page.locator(".modal").getByRole("button", { name: "Guardar" }).click();
  await expect.poll(() => st.usuarioEditado).toMatchObject({ id: 2, nombreCompleto: "Pedro Caja", pin: "4321" });

  // Editar la caja (renombrar)
  const cajaFila = page.locator(".eq-row", { hasText: "Caja 1" });
  await cajaFila.getByRole("button", { name: "Editar" }).click();
  await page.getByLabel("Nombre de la caja").fill("Caja Mostrador");
  await page.locator(".modal").getByRole("button", { name: "Guardar" }).click();
  await expect.poll(() => st.cajaEditada).toMatchObject({ id: 1, nombre: "Caja Mostrador" });

  // Eliminar la caja
  page.once("dialog", (d) => d.accept());
  await page.locator(".eq-row", { hasText: "Caja Mostrador" }).getByRole("button", { name: /Eliminar/ }).click();
  await expect.poll(() => st.cajaBorrada).toBe(1);

  // El dueño no tiene botones de editar/eliminar (ni a sí mismo)
  await expect(page.locator(".eq-row", { hasText: "Diego" }).getByRole("button")).toHaveCount(0);
});
