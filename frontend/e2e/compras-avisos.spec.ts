import { expect, test } from "@playwright/test";
import { ir, preparar, sesionDueno, type Estado } from "./mock";

test.use({ viewport: { width: 1366, height: 900 } });

// PNG 1x1 real para que prepararFoto (canvas) tenga algo que procesar.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

async function irCompras(page: import("@playwright/test").Page) {
  await page.keyboard.press("Alt+3");
  await page.getByRole("button", { name: "Compras", exact: true }).click();
}

test("vaciar todo el inventario pide confirmar escribiendo BORRAR", async ({ page }) => {
  const st: Estado = { turnoAbierto: false };
  await preparar(page, st, { "kioskpos.sesion": sesionDueno });
  await ir(page);
  await page.keyboard.press("Alt+3");
  await page.getByRole("button", { name: "Vaciar" }).click();
  const borrar = page.getByRole("button", { name: "Borrar todo el inventario" });
  await expect(borrar).toBeDisabled();
  await page.getByLabel("Escribe BORRAR para confirmar").fill("BORRAR");
  await borrar.click();
  await expect.poll(() => st.inventarioVaciado).toBe(true);
  await expect(page.locator(".pill.ok")).toContainText("Inventario vaciado");
});

test("abonar a una factura por pagar baja el saldo y la deja pagada", async ({ page }) => {
  const st: Estado = { turnoAbierto: false };
  await preparar(page, st, { "kioskpos.sesion": sesionDueno });
  await ir(page);
  await irCompras(page);
  await page.locator(".vt-row", { hasText: "A-77" }).click();
  await expect(page.locator(".cmp-saldo-r.big")).toContainText("40,00");
  // Abono parcial de $15.
  await page.getByLabel("Monto a abonar en dólares").fill("15");
  await page.getByRole("button", { name: "Abonar", exact: true }).click();
  await expect.poll(() => (st.compraAbonos ?? []).length).toBe(1);
  await expect(page.locator(".cmp-saldo-r.big")).toContainText("25,00");
  await expect(page.locator(".cmp-abono-r")).toContainText("15,00");
  // Pagar el resto (al contado).
  await page.getByRole("button", { name: /Pagué todo/ }).click();
  await expect(page.locator(".vt-res .pill.ok")).toContainText("Pagada");
});

test("tomarle una foto a la factura la guarda en la compra", async ({ page }) => {
  const st: Estado = { turnoAbierto: false };
  await preparar(page, st, { "kioskpos.sesion": sesionDueno });
  await ir(page);
  await irCompras(page);
  await page.locator(".vt-row", { hasText: "A-77" }).click();
  await page.locator(".modal input[type='file']").setInputFiles({ name: "factura.png", mimeType: "image/png", buffer: PNG });
  await expect.poll(() => (st.compraFotos ?? []).length).toBe(1);
  await expect(page.locator(".fac-foto img")).toBeVisible();
});

test("registrar una compra por pagar con fecha de pago y foto", async ({ page }) => {
  const st: Estado = { turnoAbierto: false };
  await preparar(page, st, { "kioskpos.sesion": sesionDueno });
  await ir(page);
  await irCompras(page);
  await page.getByRole("button", { name: "Registrar compra" }).click();
  await page.getByLabel("Buscar producto para la compra").fill("Harina");
  await page.locator(".cli-pick-row", { hasText: "Harina PAN" }).click();
  await page.getByLabel("Cantidad de Harina PAN").fill("10");
  await page.getByLabel("Costo de Harina PAN").fill("2");
  await page.getByRole("switch", { name: /pagada|pagar/ }).click(); // -> queda por pagar
  await page.getByLabel("Fecha de pago").fill("2026-11-25");
  await page.locator(".modal input[type='file']").setInputFiles({ name: "f.png", mimeType: "image/png", buffer: PNG });
  await expect(page.locator(".cmp-fotos .fac-foto img")).toBeVisible();
  await page.locator(".modal-foot button", { hasText: "Registrar compra" }).click();
  await expect.poll(() => st.compra?.vence).toBe("2026-11-25");
  await expect.poll(() => st.compra?.pagada).toBe(false);
  await expect.poll(() => (st.compraFotos ?? []).length).toBe(1);
});

test("la campanita muestra pagos pendientes y bajo stock, y se filtra", async ({ page }) => {
  const st: Estado = { turnoAbierto: false };
  await preparar(page, st, { "kioskpos.sesion": sesionDueno });
  await ir(page);
  await page.locator(".cmp-bell").click();
  await expect(page.locator(".avisos-pop")).toBeVisible();
  await expect(page.locator(".avisos-grupo", { hasText: "Pagos a proveedores" })).toContainText("Distribuidora Polar");
  await expect(page.locator(".avisos-grupo", { hasText: "Inventario bajo" })).toContainText("Harina PAN");
  // Filtrar solo Pagos: desaparece el grupo de stock.
  await page.getByRole("tab", { name: /Pagos/ }).click();
  await expect(page.locator(".avisos-grupo", { hasText: "Inventario bajo" })).toHaveCount(0);
  // Un aviso de stock lleva a Productos.
  await page.getByRole("tab", { name: /Stock/ }).click();
  await page.locator(".aviso", { hasText: "Harina PAN" }).click();
  await expect(page.locator(".avisos-pop")).toHaveCount(0);
  await expect(page.locator(".sub-tabs .on")).toContainText("Inventario");
});
