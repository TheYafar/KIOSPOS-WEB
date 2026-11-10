import { expect, test } from "@playwright/test";
import { ir, preparar, sesionCajero, sesionDueno, type Estado } from "./mock";

test.use({ viewport: { width: 1366, height: 900 } });

test("anular una venta del turno abierto pide el motivo", async ({ page }) => {
  const st: Estado = { turnoAbierto: true };
  await preparar(page, st, { "kioskpos.sesion": sesionCajero });
  await ir(page);
  await page.keyboard.press("Alt+3");
  await expect(page.locator(".vt-row")).toHaveCount(2);
  await page.locator(".vt-row", { hasText: "#5" }).click();
  await page.getByRole("button", { name: "Anular venta" }).click();
  await expect(page.getByRole("button", { name: "Confirmar anulación" })).toBeDisabled();
  await page.getByLabel("Motivo de la anulación").fill("Cobré dos veces");
  await page.keyboard.press("Enter");
  await expect(page.locator(".pinmsg.ok")).toHaveText("Venta anulada ✓");
  expect(st.anulada).toEqual({ id: 11, motivo: "Cobré dos veces" });
});

test("devolución parcial: no deja pasar de lo que queda y reembolsa en efectivo", async ({ page }) => {
  const st: Estado = { turnoAbierto: true };
  await preparar(page, st, { "kioskpos.sesion": sesionCajero });
  await ir(page);
  await page.keyboard.press("Alt+3");
  await page.locator(".vt-row", { hasText: "#4" }).click();
  await expect(page.getByText("Ya tiene devoluciones")).toBeVisible();
  await expect(page.getByRole("button", { name: "Anular venta" })).toHaveCount(0);
  await page.getByRole("button", { name: "Devolver productos" }).click();
  const mas = page.getByRole("button", { name: "Más Arroz Mary" });
  await mas.click(); await mas.click(); await mas.click(); // quedan 2 (ya se devolvió 1)
  await expect(page.getByLabel("Devolver de Arroz Mary")).toHaveValue("2");
  await expect(page.locator(".cli-saldo")).toContainText("$ 4,00");
  await page.getByRole("button", { name: "Efectivo Bs" }).click();
  await expect(page.locator(".cli-saldo")).toContainText("Bs 3.600,00"); // a la tasa de la venta (900)
  await page.getByRole("button", { name: /^Devolver Bs/ }).click();
  await expect(page.locator(".pinmsg.ok")).toHaveText("Devolución registrada ✓");
  expect(st.devuelta).toEqual({ id: 12, items: [{ detalleId: 201, cantidad: 2 }], metodoReembolso: "EFECTIVO_BS" });
});

test("registrar una compra: busca el producto, calcula el costo promedio y la manda", async ({ page }) => {
  const st: Estado = { turnoAbierto: false };
  await preparar(page, st, { "kioskpos.sesion": sesionDueno });
  await ir(page);
  await page.keyboard.press("Alt+3");
  await page.getByRole("button", { name: "Compras", exact: true }).click();
  await expect(page.locator(".inv-stat").nth(1)).toContainText("$ 40,00");
  await page.getByRole("button", { name: "Registrar compra" }).click();
  await expect(page.getByLabel("Proveedor")).toHaveValue("3");
  await page.getByLabel("Buscar producto para la compra").fill("harina");
  await page.keyboard.press("Enter");
  await page.getByLabel("Cantidad de Harina PAN").fill("20");
  await page.getByLabel("Costo de Harina PAN").fill("0,80");
  await expect(page.locator(".cmp-nm small")).toContainText("Costo nuevo $ 0,75"); // (20 × 0,70 + 20 × 0,80) / 40
  await page.getByLabel("Número de factura").fill("B-12");
  await page.getByRole("switch", { name: /Ya está pagada/ }).click();
  await page.getByRole("button", { name: /Registrar compra · \$ 16,00/ }).click();
  await expect(page.locator(".pill.ok")).toContainText("Compra registrada");
  expect(st.compra).toMatchObject({ proveedorId: 3, numeroFactura: "B-12", pagada: false, items: [{ productoId: 1, cantidad: 20, costoUsd: 0.8 }] });
});
