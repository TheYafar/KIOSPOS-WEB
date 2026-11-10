import { expect, test } from "@playwright/test";
import { ir, preparar, sesionCajero, sesionDueno, type Estado } from "./mock";

test.use({ viewport: { width: 1366, height: 900 } });

test("una venta rechazada por el servidor no se pierde en silencio: se ve, se reintenta o se descarta", async ({ page }) => {
  const st: Estado = { turnoAbierto: true, ventaFalla: "Los pagos no cubren el total" };
  await preparar(page, st, { "kioskpos.sesion": sesionCajero, "kioskpos.turno": "7" });
  await ir(page);
  await page.locator(".pcard", { hasText: "Harina PAN" }).click();
  await page.keyboard.press("F9");
  await page.keyboard.press("F8");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Nueva venta")).toBeVisible();
  await page.keyboard.press("Enter");

  const pill = page.locator(".cola-pill");
  await expect(pill).toHaveText(/1 con error/);
  await pill.click();
  const modal = page.getByRole("dialog", { name: "Ventas sin enviar" });
  await expect(modal).toContainText("Harina PAN");
  await expect(modal).toContainText("Los pagos no cubren el total");

  // Ya se arregló en el servidor: reintentar la envía.
  st.ventaFalla = undefined;
  await modal.getByRole("button", { name: "Reintentar" }).click();
  await expect(modal).toContainText("1 venta(s) enviada(s)");
  await expect(pill).toHaveCount(0);
  expect(st.venta.items[0]).toMatchObject({ productoId: 1, precioUsd: 1 });
});

test("descartar una venta rechazada pide confirmación", async ({ page }) => {
  const st: Estado = { turnoAbierto: true, ventaFalla: "Producto inactivo" };
  await preparar(page, st, { "kioskpos.sesion": sesionCajero, "kioskpos.turno": "7" });
  await ir(page);
  await page.locator(".pcard", { hasText: "Coca-Cola 2L" }).click();
  await page.keyboard.press("F9"); await page.keyboard.press("F8"); await page.keyboard.press("Enter");
  await expect(page.getByText("Nueva venta")).toBeVisible();
  await page.keyboard.press("Enter");
  await page.locator(".cola-pill").click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("dialog", { name: "Ventas sin enviar" }).getByRole("button", { name: "Descartar" }).click();
  await expect(page.locator(".cola-pill")).toHaveCount(0);
});

test("un turno abierto desde otro día avisa que hay que cerrarlo", async ({ page }) => {
  const st: Estado = { turnoAbierto: true, turnoDesde: new Date(Date.now() - 2 * 86400000).toISOString() };
  await preparar(page, st, { "kioskpos.sesion": sesionCajero, "kioskpos.turno": "7" });
  await ir(page);
  await expect(page.locator(".tb-viejo")).toHaveText(/Abierto desde hace 2 días/);
  await page.locator(".tb-viejo").click();
  await expect(page.locator(".cz-viejo")).toContainText("Este turno está abierto desde");
});

test("un turno de hoy no muestra el aviso", async ({ page }) => {
  await preparar(page, { turnoAbierto: true }, { "kioskpos.sesion": sesionCajero, "kioskpos.turno": "7" });
  await ir(page);
  await expect(page.locator(".turno-bar.ab")).toBeVisible();
  await expect(page.locator(".tb-viejo")).toHaveCount(0);
});

test("el dueño anula un pago de nómina con motivo y el fiado vuelve a la cuenta", async ({ page }) => {
  const st: Estado = { turnoAbierto: false, nominaHist: [{ trabajador: "Luis (empleado)", pago: { id: 5, trabajadorId: 3, periodo: "1ra quincena nov", sueldoUsd: 15, bonosUsd: 0,
    otrosDescuentosUsd: 0, conceptoDescuentos: null, fiadoDescontadoUsd: 12, netoUsd: 3, metodo: "EFECTIVO_USD", moneda: "USD", montoPagado: 3, tasa: null, referencia: null,
    nota: null, createdAt: "2026-11-10T15:00:00Z", estado: "PAGADO", motivoAnulacion: null } }] };
  await preparar(page, st, { "kioskpos.sesion": sesionDueno });
  await ir(page);
  await page.getByRole("button", { name: /^Nómina/ }).first().click();
  await page.getByRole("button", { name: "Pagos hechos" }).click();
  await page.locator(".vt-row", { hasText: "Luis" }).click();
  await page.getByRole("button", { name: "Anular", exact: true }).click();
  await expect(page.getByText("vuelve a la cuenta del trabajador")).toBeVisible();
  await page.getByLabel("Motivo de la anulación").fill("monto equivocado");
  await page.getByRole("button", { name: "Anular pago" }).click();
  await expect(page.getByRole("heading", { name: "Pago anulado" })).toBeVisible();
  expect(st.nominaAnulada).toMatchObject({ id: 5, motivo: "monto equivocado" });
  await page.getByRole("button", { name: "Listo" }).click();
  await expect(page.locator(".vt-row", { hasText: "Luis" })).toContainText("Anulado");
});
