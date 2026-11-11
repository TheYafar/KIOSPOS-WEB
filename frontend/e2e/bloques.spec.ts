import { expect, test } from "@playwright/test";
import { ir, preparar, sesionCajero, sesionDueno, type Estado } from "./mock";

test.use({ viewport: { width: 1440, height: 900 } });

// Coca-Cola 2L ($1,75 suelta, 20 en existencia): Caja de 6 a $9,50 (código CAJA-COCA) y media caja de 3 a $5,00.
const bloques = [
  { id: 7, productoId: 2, nombre: "Caja", cantidad: 6, precioUsd: 9.5, codigoBarras: "CAJA-COCA" },
  { id: 8, productoId: 2, nombre: "Media caja", cantidad: 3, precioUsd: 5, codigoBarras: null },
];

test("el dueño le pone bloques a un producto (caja de 20) al editarlo", async ({ page }) => {
  const st: Estado = { turnoAbierto: false };
  await preparar(page, st, { "kioskpos.sesion": sesionDueno });
  await ir(page);
  await page.keyboard.press("Alt+3");
  await page.locator(".irow", { hasText: "Harina PAN" }).click();
  await page.getByRole("button", { name: "Editar datos" }).click();
  await page.getByRole("button", { name: "+ Caja (20)" }).click();
  await expect(page.getByLabel("Nombre del bloque 1")).toHaveValue("Caja");
  await expect(page.getByLabel("Cuántas trae el bloque 1")).toHaveValue("20");
  await page.getByLabel("Precio del bloque 1").fill("18");
  await expect(page.locator(".blq-nota")).toContainText("Ahorra $ 2,00 frente a 20 sueltos");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.locator(".pill.ok")).toContainText("Producto actualizado");
  expect(st.bloquesPut).toEqual({ productoId: 1, lista: [{ nombre: "Caja", cantidad: 20, precioUsd: 18, codigoBarras: null }] });
});

test("un bloque sin precio no se guarda y avisa", async ({ page }) => {
  const st: Estado = { turnoAbierto: false };
  await preparar(page, st, { "kioskpos.sesion": sesionDueno });
  await ir(page);
  await page.keyboard.press("Alt+3");
  await page.locator(".irow", { hasText: "Harina PAN" }).click();
  await page.getByRole("button", { name: "Editar datos" }).click();
  await page.getByRole("button", { name: "+ Media caja (10)" }).click();
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.locator(".modal .pinmsg.err")).toContainText('"Media caja": escribe el precio');
  expect(st.bloquesPut).toBeUndefined();
});

test("en la caja se vende suelto, por caja o media caja, y el código de la caja la agrega directo", async ({ page }) => {
  const st: Estado = { turnoAbierto: true, bloques };
  await preparar(page, st, { "kioskpos.sesion": sesionCajero });
  await ir(page);
  await page.keyboard.press("Alt+1");
  const coca = page.locator(".pcard", { hasText: "Coca-Cola 2L" });
  await expect(coca.locator(".blq-tag")).toContainText("Caja / Media caja");

  await coca.click();
  const ops = page.getByRole("listbox", { name: "Cómo se vende" });
  await expect(ops.getByRole("option")).toHaveCount(3);
  await expect(ops.getByRole("option").nth(1)).toContainText("Trae 6 · ahorra $ 1,00");
  await ops.getByRole("option", { name: /Caja/ }).first().click();          // 1 caja
  await coca.click();
  await page.keyboard.press("1");                                             // 1 suelta
  await coca.click();
  await page.keyboard.press("3");                                             // 1 media caja
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.type("CAJA-COCA");                                      // lector: otra caja
  await page.keyboard.press("Enter");

  await expect(page.getByText("Coca-Cola 2L (Caja x6)").first()).toBeVisible();
  await expect(page.getByText("Coca-Cola 2L (Media caja x3)").first()).toBeVisible();
  // 2 × 9,50 + 1,75 + 5,00 = 25,75
  await page.keyboard.press("F9");
  await page.getByLabel("Monto en Efectivo $").fill("25,75");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Nueva venta")).toBeVisible();
  expect(st.venta.items).toEqual(expect.arrayContaining([
    { productoId: 2, presentacionId: 7, cantidad: 2, precioUsd: 9.5 },
    { productoId: 2, cantidad: 1, precioUsd: 1.75 },
    { productoId: 2, presentacionId: 8, cantidad: 1, precioUsd: 5 },
  ]));
  expect(st.venta.items).toHaveLength(3);
});

test("no deja elegir un bloque si no alcanza la existencia", async ({ page }) => {
  const st: Estado = { turnoAbierto: true, bloques: [{ id: 9, productoId: 1, nombre: "Bulto", cantidad: 24, precioUsd: 20, codigoBarras: null }] };
  await preparar(page, st, { "kioskpos.sesion": sesionCajero });
  await ir(page);
  await page.keyboard.press("Alt+1");
  await page.locator(".pcard", { hasText: "Harina PAN" }).click(); // hay 20, el bulto trae 24
  const bulto = page.getByRole("option", { name: /Bulto/ });
  await expect(bulto).toBeDisabled();
  await expect(bulto).toContainText("no alcanza la existencia");
});
