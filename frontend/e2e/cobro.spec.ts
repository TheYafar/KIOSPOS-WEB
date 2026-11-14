import { expect, test, type Page } from "@playwright/test";
import { cfgServidor, ir, preparar, sesionCajero, sesionDueno, type Estado } from "./mock";

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

test("la referencia del pago móvil es opcional, pero si se escribe va completa", async ({ page }) => {
  const st: Estado = { turnoAbierto: true };
  await preparar(page, st, { "kioskpos.sesion": sesionCajero });
  await ir(page); await abrirCobro(page);
  await boton(page, "Pago móvil").click();
  await expect(page.locator(".cb3-go")).toBeEnabled(); // sin referencia también cobra
  await page.getByLabel("Referencia del pago móvil").fill("85");
  await expect(page.locator(".cb3-go")).toHaveText(/La referencia lleva 4 a 6 dígitos/);
  await page.getByLabel("Referencia del pago móvil").fill("");
  await page.locator(".cb3-go").click();
  await expect.poll(() => st.venta?.pagos?.[0]).toEqual({ metodo: "PAGO_MOVIL", moneda: "VES", montoOriginal: 2475 });
});

test("pago mixto: con bolívares de menos NO deja cobrar (el caso de Bs 800 por Bs 820,80)", async ({ page }) => {
  await preparar(page, { turnoAbierto: true }, { "kioskpos.sesion": sesionCajero });
  await ir(page); await abrirCobro(page); // $2,75 = Bs 2.475 a 900
  await page.getByLabel("Monto en Efectivo $").fill("2");      // Bs 1.800
  await page.getByLabel("Monto en Efectivo Bs").fill("650");   // faltan Bs 25
  await expect(page.locator(".cb3-go")).toBeDisabled();
  await expect(page.locator(".cb3-go")).toHaveText(/Faltan .*Bs 25,00/);
  await page.getByLabel("Monto en Efectivo Bs").fill("675");
  await expect(page.locator(".cb3-go")).toBeEnabled();
});

test("vuelto: se elige darlo en $, en Bs o parte y parte, y va al servidor", async ({ page }) => {
  const st: Estado = { turnoAbierto: true };
  await preparar(page, st, { "kioskpos.sesion": sesionCajero });
  await ir(page); await abrirCobro(page); // $2,75
  await page.getByLabel("Monto en Efectivo $").fill("5");   // sobran $2,25 = Bs 2.025
  const vz = page.locator(".vz");
  await expect(vz).toContainText("$ 2,25");
  // Por defecto: los dólares enteros en billetes y el resto en bolívares.
  await expect(vz.locator(".vz-ent")).toContainText("$ 2,00 + Bs 225,00");
  await vz.getByRole("radio", { name: "Todo en Bs" }).click();
  await expect(vz.locator(".vz-ent")).toContainText("Bs 2.025,00");
  await vz.getByRole("radio", { name: "Todo en $" }).click();
  await expect(vz.locator(".vz-ent")).toContainText("$ 2,25");
  await vz.getByRole("radio", { name: "$ y Bs" }).click();
  await vz.getByRole("button", { name: "Un dólar menos" }).click();
  await expect(vz.locator(".vz-ent")).toContainText("$ 1,00 + Bs 1.125,00");
  await page.locator(".cb3-go").click();
  await expect.poll(() => st.venta?.vueltoUsd).toBe(1);
});

test("formas de pago apagadas no salen y las monedas extra se cobran como OTRO", async ({ page }) => {
  // La config la manda el servidor (es del negocio, la comparten todas las cajas).
  const st: Estado = { turnoAbierto: true, cajaConfig: cfgServidor({ metodos: { EFECTIVO_USD: true, EFECTIVO_BS: true, PAGO_MOVIL: true, PUNTO: false, BIOPAGO: false },
    extras: [{ id: "eur", nombre: "Euros", tipo: "OTRA", simbolo: "€", tasaUsd: 1.1, activo: true }] }) };
  await preparar(page, st, { "kioskpos.sesion": sesionCajero });
  await ir(page); await abrirCobro(page);
  await expect(page.locator(".cb3-nm b")).toHaveText(["Efectivo $", "Efectivo Bs", "Pago móvil", "Euros", "Crédito"]);
  await boton(page, "Euros").click();
  await expect(page.getByLabel("Monto en Euros")).toHaveValue("2,50"); // 2,75 / 1,10
  await page.keyboard.press("Enter");
  await expect(page.getByText("Nueva venta")).toBeVisible();
  expect(st.venta.pagos).toEqual([{ metodo: "OTRO", moneda: "USD", montoOriginal: 2.75, referencia: "Euros € 2,50" }]);
});

test("el dueño sube la tasa y se guarda en el servidor", async ({ page }) => {
  const st: Estado = { turnoAbierto: false };
  await preparar(page, st, { "kioskpos.sesion": sesionDueno });
  await ir(page);
  await page.keyboard.press("Alt+7");
  await page.getByRole("button", { name: "BCV + aumento" }).click();
  await page.getByLabel("Aumento sobre la BCV").pressSequentially("2,5", { delay: 120 });
  await expect(page.getByLabel("Aumento sobre la BCV")).toHaveValue("2,5"); // la coma no se pierde al guardar
  await expect(page.locator(".cfg-prev")).toContainText("Bs 923,00"); // 900 + 2,5% = 922,5 -> 923
  await expect(page.locator(".cfg-head .pill")).toHaveText("Guardado ✓");
  expect(st.cajaConfig).toMatchObject({ tasaModo: "AJUSTE", ajusteTipo: "PCT", ajuste: 2.5 });
  expect(st.puts!.length).toBeLessThanOrEqual(3); // no manda una petición por tecla
});

test("la caja cobra con la tasa del negocio y el cajero no puede cambiarla", async ({ page }) => {
  const st: Estado = { turnoAbierto: true, cajaConfig: cfgServidor({ tasaModo: "ajuste", ajuste: 2 }) };
  await preparar(page, st, { "kioskpos.sesion": sesionCajero });
  await ir(page);
  await expect(page.locator(".hpill b.t")).toHaveText("Bs 918");
  await abrirCobro(page);
  await expect(page.locator(".co-tot small")).toHaveText("Bs 2.524,50"); // 2,75 × 918
  await page.keyboard.press("Escape");
  // El cajero solo ve Vender, Cierre y Ventas (Configuración y lo demás es del dueño).
  await expect(page.locator(".rail .rail-item[title]")).toHaveText(["Vender", "Cierre", "Ventas"]);
});
