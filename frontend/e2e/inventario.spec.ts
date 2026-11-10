import { expect, test } from "@playwright/test";
import { ir, preparar, sesionDueno, type Estado } from "./mock";

test.use({ viewport: { width: 1366, height: 900 } });

test("crear producto por kilo con una categoría nueva", async ({ page }) => {
  const st: Estado = { turnoAbierto: false };
  await preparar(page, st, { "kioskpos.sesion": sesionDueno });
  await ir(page);
  await page.keyboard.press("Alt+3");
  await expect(page.locator(".inv-cats .chip")).toContainText(["Todas · 4", "Bebidas · 1", "Charcutería · 1", "Víveres · 2"]);
  await page.locator(".inv-cats .chip", { hasText: "Charcutería" }).click();
  await expect(page.locator(".irow")).toHaveCount(1);
  await page.getByRole("button", { name: "Nuevo", exact: true }).click();
  await page.getByLabel("Código de barras").fill("2000099");
  await page.getByLabel("Nombre del producto").fill("Jamón de pierna");
  await page.getByLabel("Categoría", { exact: true }).selectOption("__nueva");
  await page.getByLabel("Nombre de la categoría nueva").fill("Fiambrería");
  await page.getByRole("switch", { name: /Se vende por peso o medida/ }).click();
  await page.getByRole("button", { name: "Kilo" }).click();
  await expect(page.getByText("Precio $ por kilo")).toBeVisible();
  await page.getByLabel("Precio", { exact: true }).fill("8,5");
  await page.getByLabel("Stock inicial").fill("4,2");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.locator(".pill.ok")).toContainText("Producto creado");
  expect(st.producto).toMatchObject({ metodo: "POST", nombre: "Jamón de pierna", categoria: "Fiambrería", esPesable: true, unidadMedida: "KG", precioUsd: 8.5, stockInicial: 4.2 });
});

test("administrar categorías y editar un producto existente", async ({ page }) => {
  const st: Estado = { turnoAbierto: false };
  await preparar(page, st, { "kioskpos.sesion": sesionDueno });
  await ir(page);
  await page.keyboard.press("Alt+3");
  await page.getByRole("button", { name: "Categorías" }).click();
  await page.getByLabel("Nueva categoría", { exact: true }).fill("Limpieza");
  await page.keyboard.press("Enter");
  await expect.poll(() => st.categoria).toMatchObject({ metodo: "POST", nombre: "Limpieza" });
  await page.getByRole("button", { name: "Cerrar" }).click();
  await page.locator(".irow", { hasText: "Harina PAN" }).click();
  await page.getByRole("button", { name: "Editar datos" }).click();
  await page.getByLabel("Categoría", { exact: true }).selectOption("Bebidas");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.locator(".pill.ok")).toContainText("Producto actualizado");
  expect(st.producto).toMatchObject({ metodo: "PUT", nombre: "Harina PAN", categoria: "Bebidas", esPesable: false });
});
