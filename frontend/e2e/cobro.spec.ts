import { expect, test, type Page } from "@playwright/test";
import { ir, preparar, sesionCajero, type Estado } from "./mock";

test.use({ viewport: { width: 1440, height: 900 } });

const abrirCobro = async (page: Page) => {
  await page.keyboard.press("Alt+1");
  await page.getByText("Arroz Mary").count(); // catálogo cargado
  await page.locator(".pcard", { hasText: "Coca-Cola 2L" }).click(); // $1,75
  await page.locator(".pcard", { hasText: "Harina PAN" }).click();   // $1,00 -> total $2,75
  await page.keyboard.press("F9");
  await expect(page.locator(".cb3-card").first()).toBeVisible();
};
const boton = (page: Page, n: string) => page.locator(".cb3-card", { has: page.locator(`.cb3-nm b:text-is("${n}")`) }).locator(".cb3-rest");

test("'Resto aquí' siempre hace algo y lo dice en el botón", async ({ page }) => {
  await preparar(page, { turnoAbierto: true }, { "kioskpos.sesion": sesionCajero });
  await ir(page); await abrirCobro(page);

  // Pagan de más en efectivo: 'Todo aquí' en Bs pasa el cobro completo a Bs.
  await page.getByLabel("Monto en Efectivo $").fill("5");
  await expect(boton(page, "Efectivo Bs")).toContainText("Todo aquí · Bs 2.475,00");
  await boton(page, "Efectivo Bs").click();
  await expect(page.getByLabel("Monto en Efectivo $")).toHaveValue("");
  await expect(page.getByLabel("Monto en Efectivo Bs")).toHaveValue("2475,00");

  // Pago repartido: $1 + resto en Bs
  await page.getByRole("button", { name: "Limpiar" }).click();
  await page.getByLabel("Monto en Efectivo $").fill("1");
  await expect(boton(page, "Efectivo Bs")).toContainText("Resto aquí · Bs 1.575,00");
  await boton(page, "Efectivo Bs").click();
  await expect(boton(page, "Efectivo Bs")).toContainText("Completo");
  await expect(page.locator(".cb3-go")).toBeEnabled();
});

test("el botón explica por qué no deja cobrar (referencia del pago móvil)", async ({ page }) => {
  await preparar(page, { turnoAbierto: true }, { "kioskpos.sesion": sesionCajero });
  await ir(page); await abrirCobro(page);
  await boton(page, "Pago móvil").click();
  await page.getByLabel("Referencia del pago móvil").fill("85");
  await expect(page.locator(".cb3-go")).toHaveText(/Falta la referencia del pago móvil/);
  await page.getByLabel("Referencia del pago móvil").fill("8521");
  await expect(page.locator(".cb3-go")).toBeEnabled();
});

test("formas de pago apagadas no salen y las monedas extra se cobran como OTRO", async ({ page }) => {
  const st: Estado = { turnoAbierto: true };
  const config = { metodos: { EFECTIVO_USD: true, EFECTIVO_BS: true, PAGO_MOVIL: true, PUNTO: false, BIOPAGO: false },
    extras: [{ id: "eur", nombre: "Euros", tipo: "OTRA", simbolo: "€", tasaUsd: 1.1, activo: true }], tasaModo: "bcv", ajusteTipo: "pct", ajuste: 0, tasaManual: 0 };
  await preparar(page, st, { "kioskpos.sesion": sesionCajero, kp_config: config });
  await ir(page); await abrirCobro(page);
  await expect(page.locator(".cb3-nm b")).toHaveText(["Efectivo $", "Efectivo Bs", "Pago móvil", "Euros"]);
  await boton(page, "Euros").click();
  await expect(page.getByLabel("Monto en Euros")).toHaveValue("2,50"); // 2,75 / 1,10
  await page.keyboard.press("Enter");
  await expect(page.getByText("Nueva venta")).toBeVisible();
  expect(st.venta.pagos).toEqual([{ metodo: "OTRO", moneda: "USD", montoOriginal: 2.75, referencia: "Euros € 2,50" }]);
});

test("el aumento de la tasa en Configuración se usa al cobrar", async ({ page }) => {
  await preparar(page, { turnoAbierto: true }, { "kioskpos.sesion": sesionCajero });
  await ir(page);
  await page.keyboard.press("Alt+3");
  await page.getByRole("button", { name: "BCV + aumento" }).click();
  await page.getByLabel("Aumento sobre la BCV").fill("2");
  await expect(page.locator(".cfg-prev")).toContainText("Bs 918,00");
  await abrirCobro(page);
  await expect(page.locator(".co-tot small")).toHaveText("Bs 2.524,50"); // 2,75 × 918
});
