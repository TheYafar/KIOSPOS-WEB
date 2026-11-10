import { expect, test } from "@playwright/test";
import { ir, preparar, sesionCajero, sesionDueno } from "./mock";

test.use({ viewport: { width: 1366, height: 900 } });
const suspendido = { negocioId: 1, nombre: "Bodega", plan: "BASICO", estadoEfectivo: "SUSPENDIDA", puedeCobrar: false, soloConsulta: true,
  pagoHasta: "2026-10-01", diasVencido: 40, mesesPendientes: 2, deuda: 50, mensaje: "Suspendida por falta de pago (40 días) — solo consulta" };

test("cajero: aviso grande de servicio suspendido y no deja cobrar", async ({ page }) => {
  await preparar(page, { turnoAbierto: true }, { "kioskpos.sesion": sesionCajero });
  await page.route("**/api/mi-negocio/suscripcion", (r) => r.fulfill({ json: suspendido }));
  await ir(page);
  const modal = page.getByRole("alertdialog", { name: "Servicio suspendido" });
  await expect(modal).toBeVisible();
  await expect(modal).toContainText("$ 50,00");
  await expect(modal).toContainText("Avísale al dueño");
  await page.getByRole("button", { name: "Entendido" }).click();
  await expect(page.locator(".plan-susp")).toContainText("Servicio suspendido");
  await page.keyboard.press("Alt+1");
  await page.locator(".pcard", { hasText: "Harina PAN" }).click();
  await page.keyboard.press("F9");
  await expect(page.getByText("no se puede cobrar hasta pagar")).toBeVisible();
  await expect(page.locator(".cb3-card")).toHaveCount(0);
});

test("dueño: 'Reportar mi pago' lo lleva a Mi plan", async ({ page }) => {
  await preparar(page, { turnoAbierto: false }, { "kioskpos.sesion": sesionDueno });
  await page.route("**/api/mi-negocio/suscripcion", (r) => r.fulfill({ json: suspendido }));
  await ir(page);
  await page.getByRole("button", { name: "Reportar mi pago" }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page.locator(".plan-susp .plan-susp-btn")).toHaveText("Pagar y reactivar");
  await expect(page.locator(".plan")).toBeVisible(); // tarjeta Mi plan en "Más"
});

test("al día no sale ningún aviso", async ({ page }) => {
  await preparar(page, { turnoAbierto: true }, { "kioskpos.sesion": sesionCajero });
  await ir(page);
  await expect(page.locator(".plan-susp, .plan-aviso")).toHaveCount(0);
});
