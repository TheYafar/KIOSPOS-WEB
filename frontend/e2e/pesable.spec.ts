import { expect, test } from "@playwright/test";
import { ir, preparar, sesionCajero, sesionDueno, type Estado } from "./mock";

test.use({ viewport: { width: 1440, height: 900 } });

test("vender por peso: escribe los kilos y el sistema calcula el precio", async ({ page }) => {
  const st: Estado = { turnoAbierto: true };
  await preparar(page, st, { "kioskpos.sesion": sesionCajero });
  await ir(page);
  await page.keyboard.press("Alt+1");
  await page.locator(".pcard", { hasText: "Queso blanco" }).click();
  await expect(page.getByRole("heading", { name: "Queso blanco" })).toBeVisible();
  await page.getByLabel("Cantidad en kilos").fill("0,5");
  await expect(page.locator(".pes-res")).toContainText("$ 3,00");
  await page.keyboard.press("Enter");
  await expect(page.locator(".tkp-txt, .ln-s").first()).toContainText("0,5 kg");
  // Por monto en Bs: Bs 1.800 a tasa 900 = $2 → 0,333 kg
  await page.locator(".pcard", { hasText: "Queso blanco" }).click();
  await page.getByRole("button", { name: "Por monto Bs" }).click();
  await page.getByLabel("Monto a llevar").fill("1800");
  await expect(page.locator(".pes-res b")).toHaveText("0,333 kg");
  await page.keyboard.press("Enter");
  await page.keyboard.press("F9");
  await expect(page.locator(".co-tot b")).toHaveText("$ 2,00");
  await page.getByLabel("Monto en Efectivo $").fill("2");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Nueva venta")).toBeVisible();
  expect(st.venta.items).toEqual([{ productoId: 4, cantidad: 0.333 }]);
});

test("fiar desde el perfil: pestaña Fiar productos con un producto normal y uno por peso", async ({ page }) => {
  const st: Estado = { turnoAbierto: false };
  await preparar(page, st, { "kioskpos.sesion": sesionDueno });
  await ir(page);
  await page.keyboard.press("Alt+5");
  await page.locator(".cli-row", { hasText: "José Rojas" }).click();
  await page.getByRole("tab", { name: "Fiar productos" }).click();
  await page.getByLabel("Buscar producto para fiar").fill("harina");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Más Harina PAN" }).click(); // 2 × $1
  await page.getByLabel("Buscar producto para fiar").fill("queso");
  await page.keyboard.press("Enter");
  await page.getByLabel("Cantidad en kilos").fill("0,25");
  await page.keyboard.press("Enter"); // 0,25 × $6 = $1,50
  await expect(page.locator(".cli-saldo b")).toHaveText("$ 3,50");
  await page.getByRole("button", { name: "Fiar $ 3,50" }).click();
  await expect(page.locator(".pinmsg.ok")).toContainText("Fiado $ 3,50 a José Rojas");
  expect(st.fiado).toMatchObject({ id: 2, items: [{ productoId: 1, cantidad: 2 }, { productoId: 4, cantidad: 0.25 }] });
});

test("si el plan está vencido, Fiar avisa que no es por el cliente y no deja", async ({ page }) => {
  await preparar(page, { turnoAbierto: false }, { "kioskpos.sesion": sesionDueno });
  await page.route("**/api/mi-negocio/suscripcion", (r) => r.fulfill({ json: { negocioId: 1, nombre: "Bodega", plan: "BASICO", estadoEfectivo: "SUSPENDIDA", puedeCobrar: false, pagoHasta: null, diasVencido: 0, mesesPendientes: 1, deuda: 25, mensaje: "Suspendida por falta de pago" } }));
  await ir(page);
  await page.keyboard.press("Alt+5");
  await page.locator(".cli-row", { hasText: "José Rojas" }).click();
  await page.getByRole("tab", { name: "Fiar productos" }).click();
  await page.getByLabel("Buscar producto para fiar").fill("harina");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alert")).toContainText("No es por José Rojas");
  await expect(page.getByRole("button", { name: /^Fiar/ })).toBeDisabled();
});
