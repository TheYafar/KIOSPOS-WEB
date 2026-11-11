import { expect, test, type Page } from "@playwright/test";
import { ir, preparar, sesionCajero, sesionDueno, type Estado } from "./mock";

test.use({ viewport: { width: 1440, height: 900 } });

const abrirCobro = async (page: Page) => {
  await page.keyboard.press("Alt+1");
  await page.getByText("Arroz Mary").count();
  await page.locator(".pcard", { hasText: "Coca-Cola 2L" }).click();
  await page.locator(".pcard", { hasText: "Harina PAN" }).click(); // total $2,75
  await page.keyboard.press("F9");
  await expect(page.locator(".cb3-card").first()).toBeVisible();
};

test("gasto con la tecla G y avance de efectivo desde el cierre", async ({ page }) => {
  const st: Estado = { turnoAbierto: true };
  await preparar(page, st, { "kioskpos.sesion": sesionCajero, "kioskpos.turno": "7" });
  await ir(page);
  await page.keyboard.press("Alt+2");
  await expect(page.locator(".movs")).toBeVisible();
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("g");
  await page.getByLabel("Monto del movimiento").fill("5");
  await page.getByRole("button", { name: "Hielo" }).click();
  await page.keyboard.press("Enter");
  await expect(page.locator(".movs-row")).toContainText("Hielo");
  expect(st.movs![0]).toMatchObject({ tipo: "GASTO", moneda: "USD", monto: 5, concepto: "Hielo" });

  await page.getByRole("button", { name: /Avance/ }).click();
  await page.getByLabel("Monto del movimiento").fill("1000");
  await expect(page.locator(".mov-av")).toContainText("Bs 1.100,00");
  await expect(page.locator(".mov-av .ok")).toContainText("Bs 100,00");
  await page.getByRole("button", { name: "Pago móvil" }).click();
  await page.getByRole("button", { name: /Registrar avance/ }).click();
  await expect(page.locator(".movs-row").nth(1)).toContainText("ganancia Bs 100,00");
  expect(st.movs![1]).toMatchObject({ tipo: "AVANCE", moneda: "VES", monto: 1000, metodoCobro: "PAGO_MOVIL", montoCobrado: 1100 });
});

test("cobrar fiado: elegir cliente con el teclado y la venta lleva clienteId", async ({ page }) => {
  const st: Estado = { turnoAbierto: true };
  await preparar(page, st, { "kioskpos.sesion": sesionCajero });
  await ir(page); await abrirCobro(page);
  const card = page.locator(".cb3-card", { has: page.locator('.cb3-nm b:text-is("Crédito")') });
  await card.getByRole("button", { name: "Elegir cliente" }).click();
  await expect(page.getByLabel("Buscar cliente para crédito")).toBeFocused();
  await expect(page.locator(".cli-pick-row")).toHaveCount(3);
  await page.keyboard.type("josé");
  await expect(page.locator(".cli-pick-row")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(card).toContainText("José Rojas");
  await expect(page.getByLabel("Monto en Crédito")).toHaveValue("2,75");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Nueva venta")).toBeVisible();
  expect(st.venta.clienteId).toBe(2);
  expect(st.venta.pagos).toEqual([{ metodo: "FIADO", moneda: "USD", montoOriginal: 2.75 }]);
});

test("no deja fiar por encima del límite del cliente", async ({ page }) => {
  await preparar(page, { turnoAbierto: true }, { "kioskpos.sesion": sesionCajero });
  await ir(page); await abrirCobro(page);
  const card = page.locator(".cb3-card", { has: page.locator('.cb3-nm b:text-is("Crédito")') });
  await card.getByRole("button", { name: "Elegir cliente" }).click();
  await page.locator(".cli-pick-row", { hasText: "María Pérez" }).click(); // debe $8, límite $10
  await expect(page.locator(".cb3-go")).toHaveText(/Pasa el límite de crédito de María Pérez/);
  await page.getByLabel("Monto en Crédito").fill("1");
  await page.getByLabel("Monto en Efectivo $").fill("1,75");
  await expect(page.locator(".cb3-go")).toBeEnabled();
});

test("pantalla Fiado: ver quién debe y registrar un abono en Bs", async ({ page }) => {
  const st: Estado = { turnoAbierto: true };
  await preparar(page, st, { "kioskpos.sesion": sesionDueno });
  await ir(page);
  await page.keyboard.press("Alt+5");
  await expect(page.locator(".cli-row").first()).toContainText("María Pérez");
  await expect(page.locator(".inv-stat").first()).toContainText("$ 8,00");
  await page.locator(".cli-row", { hasText: "María Pérez" }).click();
  await expect(page.locator(".cli-saldo")).toContainText("$ 8,00");
  await page.getByRole("button", { name: "Efectivo Bs" }).click();
  await page.getByRole("button", { name: /^Todo/ }).click();
  await expect(page.getByLabel("Monto del abono")).toHaveValue("7.200,00"); // 8 × 900
  await page.getByRole("button", { name: "Registrar abono" }).click();
  await expect(page.locator(".pinmsg.ok")).toContainText("Abono de Bs 7.200,00");
  expect(st.abonos![0]).toEqual({ metodo: "EFECTIVO_BS", monto: 7200, tasa: 900 });
});

test("trabajadores: el fiado no pasa del sueldo y el dueño lo descuenta de la nómina", async ({ page }) => {
  const st: Estado = { turnoAbierto: true };
  await preparar(page, st, { "kioskpos.sesion": sesionDueno });
  await ir(page);
  await page.keyboard.press("Alt+5");
  await expect(page.locator(".cli-row")).toHaveCount(2); // clientes, no el trabajador
  await page.getByRole("button", { name: "Trabajadores" }).click();
  await expect(page.locator(".cli-row")).toHaveCount(1);
  await expect(page.locator(".cli-row")).toContainText("sueldo $ 15,00");
  await page.locator(".cli-row", { hasText: "Luis" }).click();
  await expect(page.locator(".cli-saldo")).toContainText("le quedaría $ 3,00");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Descontar $ 12,00" }).click();
  await expect(page.locator(".pinmsg.ok")).toContainText("Descontado del sueldo");
  expect(st.descuento).toEqual({ id: 3, montoUsd: 12, nota: null });
});

test("al cobrar, a un trabajador no se le fía más que su sueldo", async ({ page }) => {
  const st: Estado = { turnoAbierto: true, clientes: [{ id: 3, nombre: "Luis (empleado)", cedula: null, telefono: null, limiteUsd: 0, activo: true, saldoUsd: 13, ultimoMovimiento: null, tipo: "TRABAJADOR", sueldoUsd: 15 }] };
  await preparar(page, st, { "kioskpos.sesion": sesionCajero });
  await ir(page); await abrirCobro(page);
  const card = page.locator(".cb3-card", { has: page.locator('.cb3-nm b:text-is("Crédito")') });
  await card.getByRole("button", { name: "Elegir cliente" }).click();
  await expect(page.locator(".cli-pick-row .cli-badge")).toHaveText("Empleado");
  await page.locator(".cli-pick-row", { hasText: "Luis" }).click(); // debe $13 + $2,75 > sueldo $15
  await expect(page.locator(".cb3-go")).toHaveText(/Pasa el límite de crédito de Luis \(empleado\) \(\$ 15,00\)/);
  await page.getByLabel("Monto en Crédito").fill("2");
  await page.getByLabel("Monto en Efectivo $").fill("0,75");
  await expect(page.locator(".cb3-go")).toBeEnabled();
});
