import { expect, test } from "@playwright/test";
import { ir, preparar, sesionDueno, type Estado } from "./mock";

test.use({ viewport: { width: 1366, height: 900 } });

test("eliminar un producto del inventario", async ({ page }) => {
  const st: Estado = { turnoAbierto: false };
  await preparar(page, st, { "kioskpos.sesion": sesionDueno });
  await ir(page);
  await page.keyboard.press("Alt+3");
  await page.locator(".irow", { hasText: "Harina PAN" }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Eliminar producto" }).click();
  await expect.poll(() => st.productoBorrado).toBe(1);
  await expect(page.locator(".pill.ok")).toContainText("Producto eliminado");
});

test("importar CSV desde un archivo", async ({ page }) => {
  const st: Estado = { turnoAbierto: false };
  await preparar(page, st, { "kioskpos.sesion": sesionDueno });
  await ir(page);
  await page.keyboard.press("Alt+3");
  await page.getByRole("button", { name: "Importar CSV" }).click();
  const csv = "codigo_barras,nombre,precio_usd,costo_usd,categoria,stock,stock_minimo\n111,Café,2,1,Viveres,10,2\n222,Azúcar,1.5,1,Viveres,5,1\n";
  await page.getByLabel("Archivo CSV").setInputFiles({ name: "inv.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect(page.locator(".csv-arch")).toContainText("inv.csv");
  await page.getByRole("button", { name: /Importar 2 producto/ }).click();
  await expect(page.locator(".pill.ok")).toContainText("2 nuevos, 1 actualizados");
  expect(st.csvImport).toContain("Café");
});

test("exportar inventario descarga un CSV", async ({ page }) => {
  await preparar(page, { turnoAbierto: false }, { "kioskpos.sesion": sesionDueno });
  await ir(page);
  await page.keyboard.press("Alt+3");
  const [dl] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exportar" }).click(),
  ]);
  expect(dl.suggestedFilename()).toMatch(/inventario-.*\.csv/);
});
