import { expect, test } from "@playwright/test";
import { ir, preparar, sesionCajero, sesionDueno, type Estado } from "./mock";

test("la guía al lado de la pantalla explica cada módulo y lleva a él", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await preparar(page, { turnoAbierto: false }, { "kioskpos.sesion": sesionDueno });
  await ir(page);
  await page.locator(".guia-lado").click();
  const g = page.getByRole("dialog", { name: "Guía de módulos" });
  await expect(g.locator(".guia-aqui")).toContainText("Estás en");
  await expect(g.locator(".guia-aqui")).toContainText("Reportes");
  await expect(g.locator(".guia-item", { has: page.locator("b", { hasText: /^Crédito$/ }) })).toContainText("Abonar");
  await g.getByRole("button", { name: "Ir a Crédito" }).click();
  await expect(g).toHaveCount(0);
  await expect(page).toHaveURL(/#\/fiado$/);
});

test("en el teléfono la guía es un botón ? arriba", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await preparar(page, { turnoAbierto: true }, { "kioskpos.sesion": sesionCajero });
  await ir(page);
  await expect(page.locator(".guia-lado")).toBeHidden();
  await page.locator(".guia-hdr").click();
  const g = page.getByRole("dialog", { name: "Guía de módulos" });
  await expect(g.locator(".guia-aqui")).toContainText("Vender");
  await expect(g).toContainText("Cierre");
  await page.keyboard.press("Escape");
  await expect(g).toHaveCount(0);
});

test("crédito: botón Abonar en la lista y abono por pago móvil", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const st: Estado = { turnoAbierto: false };
  await preparar(page, st, { "kioskpos.sesion": sesionDueno });
  await ir(page);
  await page.getByRole("button", { name: /^Crédito/ }).first().click();
  await page.getByRole("button", { name: "Abonar a la cuenta de María Pérez" }).click();
  await expect(page.getByRole("heading", { name: "Abonar a la cuenta" })).toBeVisible();
  for (const n of ["Efectivo $", "Efectivo Bs", "Pago móvil", "Punto", "Biopago"]) await expect(page.locator(".cli-met").getByRole("button", { name: n, exact: true })).toBeVisible();
  await page.locator(".cli-met").getByRole("button", { name: "Pago móvil", exact: true }).click();
  await page.getByLabel("Monto del abono").fill("1800");   // $2 a 900
  await page.getByRole("button", { name: "Registrar abono" }).click();
  await expect.poll(() => st.abonos?.[0]).toMatchObject({ metodo: "PAGO_MOVIL", monto: 1800, tasa: 900 });
  await expect(page.locator(".pinmsg.ok")).toContainText("ahora debe $ 6,00");
});

test("el cierre del Biopago tiene su propio formato (terminal, lote, transacciones)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const st: Estado = { turnoAbierto: true };
  await preparar(page, st, { "kioskpos.sesion": sesionCajero, "kioskpos.turno": "7" });
  await ir(page);
  await page.keyboard.press("Alt+2");
  await page.getByRole("button", { name: "Anotar ticket del punto" }).click();
  await page.getByRole("radio", { name: /Biopago/ }).click();
  await expect(page.getByRole("heading", { name: "Cierre del Biopago" })).toBeVisible();
  await expect(page.getByLabel("Lote crédito")).toHaveCount(0); // sin las secciones de tarjetas
  await page.getByLabel("Terminal del Biopago").fill("12345678");
  await page.getByLabel("Lote del Biopago").fill("000088");
  await page.getByLabel("Biopago: cantidad de transacciones").fill("4");
  await page.getByLabel("Biopago: monto de transacciones").fill("2500");
  await page.getByLabel("Biopago: cantidad de anulaciones").fill("1");
  await page.getByLabel("Biopago: monto de anulaciones").fill("300");
  await expect(page.locator(".cp-total")).toContainText("Bs 2.200,00");
  await page.getByRole("button", { name: "Guardar ticket" }).click();
  await expect.poll(() => st.puntos?.[0]?._body?.tipo).toBe("BIOPAGO");
  expect(st.puntos![0]._body).toMatchObject({ afiliado: "12345678", loteDebito: "000088", debito: { comprasN: 4, compras: 2500, anulN: 1, anul: 300 } });
  await page.locator(".cp-fila-tx").click();
  await expect(page.getByLabel("Ticket del punto", { exact: true })).toContainText("CIERRE BIOPAGO");
  await expect(page.getByLabel("Ticket del punto", { exact: true })).toContainText("TERMINAL:");
});
