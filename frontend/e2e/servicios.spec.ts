import { expect, test } from "@playwright/test";
import { ir, preparar, sesionCajero, sesionDueno, type Estado } from "./mock";

test.use({ viewport: { width: 1440, height: 900 } });

test("recarga y avance se agregan a la venta y el cliente paga todo junto (Bs exactos)", async ({ page }) => {
  const st: Estado = { turnoAbierto: true };
  await preparar(page, st, { "kioskpos.sesion": sesionCajero, "kioskpos.turno": "7" });
  await ir(page);
  await page.keyboard.press("Alt+1");
  await page.locator(".pcard", { hasText: "Harina PAN" }).click(); // $1 = Bs 900

  // Recarga: sin "cómo paga"; la comisión viene de Configuración (20%)
  await page.keyboard.press("F4");
  const rec = page.getByRole("dialog", { name: "Recargas" });
  await expect(rec.getByText("¿Cómo te paga el cliente?")).toHaveCount(0);
  await rec.getByRole("radio", { name: "Movistar" }).click();
  await rec.getByLabel("Número a recargar").fill("0414-1234567");
  await rec.getByRole("button", { name: "Bs 500" }).click();
  await expect(rec.getByLabel("Comisión de la recarga")).toHaveValue("20");
  await expect(rec.locator(".mov-av")).toContainText("Bs 600,00");
  await rec.getByRole("button", { name: /Agregar a la venta · Bs 600,00/ }).click();
  await expect(rec).toHaveCount(0);

  // Avance: Bs 1.000 con 10% = Bs 1.100
  await page.keyboard.press("F6");
  const av = page.getByRole("dialog", { name: "Avance de efectivo" });
  await av.getByLabel("Efectivo del avance").fill("1000");
  await expect(av.getByLabel("Comisión del avance")).toHaveValue("10");
  await expect(av.locator(".mov-av")).toContainText("Bs 1.100,00");
  await page.keyboard.press("Enter");

  await expect(page.locator(".srv-ln")).toHaveCount(2);
  await expect(page.locator(".srv-ln").first()).toContainText("Recarga Movistar 0414-1234567");
  // Total: 900 + 600 + 1.100 = Bs 2.600 exactos
  await page.keyboard.press("F9");
  await expect(page.locator(".cb3-cell.tot")).toContainText("Bs 2.600,00");
  const punto = page.locator(".cb3-card", { has: page.locator('.cb3-nm b:text-is("Punto")') });
  await punto.locator(".cb3-rest").click();
  await expect(page.getByLabel("Monto en Punto")).toHaveValue("2600,00");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Nueva venta")).toBeVisible();

  expect(st.venta.items).toEqual([{ productoId: 1, cantidad: 1, precioUsd: 1 }]);
  expect(st.venta.servicios).toEqual([
    { tipo: "RECARGA", operadora: "MOVISTAR", numero: "0414-1234567", montoBs: 500, cobradoBs: 600 },
    { tipo: "AVANCE", entregaMoneda: "VES", entregaMonto: 1000, cobradoBs: 1100 },
  ]);
  expect(st.venta.pagos).toEqual([{ metodo: "PUNTO", moneda: "VES", montoOriginal: 2600 }]);
  await expect(page.locator(".receipt")).toContainText("RECARGA MOVISTAR 0414-1234567");
  await expect(page.locator(".receipt")).toContainText("Bs. 600,00");
});

test("una recarga se puede quitar de la venta antes de cobrar", async ({ page }) => {
  await preparar(page, { turnoAbierto: true }, { "kioskpos.sesion": sesionCajero, "kioskpos.turno": "7" });
  await ir(page);
  await page.keyboard.press("Alt+1");
  await page.keyboard.press("F6");
  await page.getByLabel("Efectivo del avance").fill("200");
  await page.keyboard.press("Enter");
  await expect(page.locator(".srv-ln")).toHaveCount(1);
  await page.getByRole("button", { name: "Quitar Avance de efectivo" }).first().click();
  await expect(page.locator(".srv-ln")).toHaveCount(0);
});

test("el dueño cambia las comisiones de recargas y avances en Configuración", async ({ page }) => {
  const st: Estado = { turnoAbierto: false };
  await preparar(page, st, { "kioskpos.sesion": sesionDueno });
  await ir(page);
  await page.getByRole("button", { name: /^Config/ }).first().click();
  await page.getByLabel("Comisión de avances").fill("8");
  await page.getByLabel("Comisión de recargas").fill("15");
  await expect(page.getByText("Avance Bs 1.000 → cobras Bs 1.080,00")).toBeVisible();
  await expect.poll(() => st.cajaConfig?.comisionRecargaPct).toBe(15);
  expect(st.cajaConfig?.comisionAvancePct).toBe(8);
});
