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
  await page.getByRole("button", { name: "Devolver $ 4,00" }).click();
  await expect(page.locator(".pinmsg.ok")).toHaveText("Devolución registrada ✓");
  expect(st.devuelta).toEqual({ id: 12, items: [{ detalleId: 201, cantidad: 2 }], metodoReembolso: "EFECTIVO_BS" });
});

test("buscar por factura y devolver toda la venta como pagó (mitad $ y mitad pago móvil)", async ({ page }) => {
  const st: Estado = { turnoAbierto: true };
  await preparar(page, st, { "kioskpos.sesion": sesionCajero });
  await page.route("**/api/ventas/buscar*", (r) => r.fulfill({ json: [{ id: 14, numeroFactura: 9, fechaHora: "2026-11-08T14:05:00Z", cajaId: 1, totalUsd: 6, totalBs: 5400, estado: "COMPLETADA", clienteId: null, pagos: "EFECTIVO_USD,PAGO_MOVIL", items: 2, devueltoUsd: 0, productos: "Harina PAN, Coca-Cola 2L" }] }));
  await page.route("**/api/ventas/14/detalle", (r) => r.fulfill({ json: {
    id: 14, numeroFactura: 9, fechaHora: "2026-11-08T14:05:00Z", estado: "COMPLETADA", cajaId: 1, turnoId: 3, turnoAbierto: false, tasa: 900, totalUsd: 6, totalBs: 5400,
    vueltoUsd: 1, vueltoBs: 0, clienteId: null, motivoAnulacion: null,
    lineas: [{ detalleId: 301, productoId: 1, nombre: "Harina PAN", cantidad: 2, precioUsd: 1, subtotalUsd: 2, devuelto: 0 }, { detalleId: 302, productoId: 2, nombre: "Coca-Cola 2L", cantidad: 2, precioUsd: 2, subtotalUsd: 4, devuelto: 0 }],
    pagos: [{ metodo: "EFECTIVO_USD", moneda: "USD", monto: 4, referencia: null }, { metodo: "PAGO_MOVIL", moneda: "VES", monto: 2700, referencia: "1111" }], devoluciones: [], devueltoUsd: 0 } }));
  await ir(page);
  await page.keyboard.press("Alt+3");
  await page.getByLabel("Buscar por número de factura").fill("9");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Venta #9" })).toBeVisible(); // un solo resultado: se abre sola
  await page.getByRole("button", { name: "Devolver productos" }).click();
  // Solo un producto: la Coca-Cola ($4) → como pagó: $2 efectivo (pagó $4 − $1 de vuelto = $3) y Bs 1.800 de pago móvil
  await page.getByRole("button", { name: "Más Coca-Cola 2L" }).click();
  await page.getByRole("button", { name: "Más Coca-Cola 2L" }).click();
  await expect(page.locator(".vt-parte")).toHaveText(["Efectivo $$ 2,00", "Pago móvilBs 1.800,00"]);
  // Toda la venta: $6 → $3 + Bs 2.700
  await page.getByRole("button", { name: "Devolver toda la venta" }).click();
  await expect(page.locator(".vt-parte")).toHaveText(["Efectivo $$ 3,00", "Pago móvilBs 2.700,00"]);
  await page.getByLabel("Referencia del reembolso").fill("4455");
  await page.getByRole("button", { name: "Devolver $ 6,00" }).click();
  await expect(page.locator(".pinmsg.ok")).toHaveText("Devolución registrada ✓");
  expect(st.devuelta).toEqual({ id: 14, items: [{ detalleId: 301, cantidad: 2 }, { detalleId: 302, cantidad: 2 }], metodoReembolso: "COMO_PAGO", referencia: "4455" });
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

test("devolución fuera de caja: el dueño anota cómo se la dio (pago móvil en Bs con referencia)", async ({ page }) => {
  const st: Estado = { turnoAbierto: true };
  await preparar(page, st, { "kioskpos.sesion": sesionDueno, "kioskpos.cajaToken": '""' });
  await ir(page);
  await page.evaluate(() => { location.hash = "#/ventas"; });
  await page.locator(".vt-row", { hasText: "#4" }).click();
  await page.getByRole("button", { name: "Devolver productos" }).click();
  await page.getByRole("button", { name: "Más Arroz Mary" }).click();
  await page.getByRole("button", { name: "Fuera de caja" }).click();
  await expect(page.getByRole("button", { name: "Elige cómo se lo diste" })).toBeDisabled();
  const formas = page.getByRole("group", { name: "Cómo se le dio el dinero" });
  await formas.getByRole("button", { name: "Pago móvil" }).click();
  await expect(page.locator(".cli-saldo")).toContainText("Pago móvil (fuera de caja)");
  await expect(page.locator(".cli-saldo")).toContainText("Bs 1.800,00");
  await expect(page.locator(".cli-saldo")).toContainText("no toca el cierre de caja");
  await page.getByLabel("Referencia del reembolso").fill("7788");
  await page.getByRole("button", { name: "Devolver $ 2,00" }).click();
  await expect(page.locator(".pinmsg.ok")).toHaveText("Devolución registrada ✓");
  expect(st.devuelta).toEqual({ id: 12, items: [{ detalleId: 201, cantidad: 1 }], metodoReembolso: "FUERA_DE_CAJA", referencia: "7788", formaFuera: "PAGO_MOVIL" });
});
