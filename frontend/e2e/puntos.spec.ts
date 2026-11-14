import { expect, test } from "@playwright/test";
import { ir, preparar, sesionCajero, sesionDueno, type Estado } from "./mock";

test.use({ viewport: { width: 1440, height: 900 } });

test("al cerrar, el cajero copia el ticket de cierre del punto y llena 'Contaste' de Punto", async ({ page }) => {
  const st: Estado = { turnoAbierto: true };
  await preparar(page, st, { "kioskpos.sesion": sesionCajero, "kioskpos.turno": "7" });
  await ir(page);
  await page.keyboard.press("Alt+2");
  await page.getByRole("button", { name: "Anotar ticket del punto" }).click();
  await page.getByLabel("Comercio").fill("epn diego hernandez cre");
  await expect(page.getByLabel("Comercio")).toHaveValue("EPN DIEGO HERNANDEZ CRE");
  await page.getByLabel("Afiliado").fill("0078847603");
  await page.getByLabel("Lote crédito").fill("000407");
  await expect(page.getByLabel("Lote débito")).toHaveValue("000407");
  await expect(page.getByLabel("Lote Master/Visa")).toHaveValue("000407");
  await page.getByLabel("Tarjeta débito: cantidad de compras").fill("6");
  await page.getByLabel("Tarjeta débito: monto de compras").fill("29983");
  await page.getByLabel("Debit Master/Visa: cantidad de compras").fill("6");
  await page.getByLabel("Debit Master/Visa: monto de compras").fill("6934");
  await expect(page.locator(".cp-total")).toContainText("Bs 36.917,00");
  await page.getByRole("button", { name: "Guardar ticket" }).click();

  await expect(page.locator(".cp-fila")).toContainText("EPN DIEGO HERNANDEZ CRE");
  await expect(page.getByLabel("Contado en Punto de venta")).toHaveValue("36.917,00");
  expect(st.puntos![0]._body).toMatchObject({ tipo: "PUNTO", titular: "EPN DIEGO HERNANDEZ CRE", afiliado: "0078847603",
    loteCredito: "000407", loteDebito: "000407", loteMasterVisa: "000407",
    debito: { comprasN: 6, compras: 29983, anulN: 0, anul: 0 }, masterVisa: { comprasN: 6, compras: 6934, anulN: 0, anul: 0 } });

  // Ver el ticket como el papel
  await page.locator(".cp-fila-tx").click();
  await expect(page.getByLabel("Ticket del punto", { exact: true })).toContainText("29,983.00");
  await expect(page.getByLabel("Ticket del punto", { exact: true })).toContainText("LOTE MASTER/VISA:");
});

test("no deja cerrar sin el ticket del punto si se vendió por punto (salvo confirmando)", async ({ page }) => {
  const st: Estado = { turnoAbierto: true };
  await preparar(page, st, { "kioskpos.sesion": sesionCajero, "kioskpos.turno": "7" });
  await ir(page);
  await page.keyboard.press("Alt+2");
  await page.getByRole("button", { name: /Cerrar turno/ }).click();
  await expect(page.getByText(/Falta anotar el ticket de cierre de Punto de venta/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Cerrar sin ticket/ })).toBeVisible();
  expect(st.cierre).toBeUndefined();
});

test("el dueño ve los tickets del punto por día, con hora, caja y comparación con el sistema", async ({ page }) => {
  const hoy = new Date(); hoy.setHours(18, 33, 20, 0);
  const st: Estado = { turnoAbierto: false, puntos: [{ id: 1, turnoId: 7, cajaId: 1, usuarioId: 2, tipo: "PUNTO", titular: "EPN DIEGO HERNANDEZ CRE", afiliado: "0078847603",
    loteCredito: "000403", loteDebito: "000403", loteMasterVisa: "000403", fechaHora: hoy.toISOString(),
    credComprasN: 0, credCompras: 0, credAnulN: 0, credAnul: 0, debComprasN: 8, debCompras: 13199, debAnulN: 0, debAnul: 0,
    mvComprasN: 13, mvCompras: 16407, mvAnulN: 0, mvAnul: 0, totalBs: 29606, nota: null, createdAt: hoy.toISOString() }] };
  await preparar(page, st, { "kioskpos.sesion": sesionDueno });
  await ir(page);
  await page.getByRole("button", { name: /^Puntos/ }).first().click();
  await expect(page.getByRole("heading", { name: "Cierres", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Hoy" }).click();
  const card = page.locator(".cp-card", { hasText: "EPN DIEGO HERNANDEZ CRE" });
  await expect(card).toContainText("Bs 29.606,00");
  await expect(card).toContainText("Punto de venta · Caja 1");
  await expect(card).toContainText("Ana Pérez");
  await expect(card).toContainText("Ticket +Bs 16.106,00 vs sistema");
  await card.locator(".cp-card-h").click();
  await expect(card.getByLabel("Ticket del punto", { exact: true })).toContainText("13,199.00");
  await expect(card).toContainText("Hora del ticket");
  await expect(page).toHaveURL(/#\/puntos$/);
});

test("en Puntos también salen los cierres de caja, con caja, cajero, horas y cuadre", async ({ page }) => {
  const abre = new Date(); abre.setHours(8, 5, 0, 0);
  const cierra = new Date(); cierra.setHours(18, 40, 0, 0);
  const tk = new Date(); tk.setHours(18, 33, 0, 0);
  const st: Estado = { turnoAbierto: false,
    puntos: [{ id: 1, turnoId: 7, cajaId: 1, usuarioId: 2, tipo: "PUNTO", titular: "EPN DIEGO", afiliado: null, loteCredito: null, loteDebito: null, loteMasterVisa: null,
      fechaHora: tk.toISOString(), credComprasN: 0, credCompras: 0, credAnulN: 0, credAnul: 0, debComprasN: 2, debCompras: 4500, debAnulN: 0, debAnul: 0,
      mvComprasN: 0, mvCompras: 0, mvAnulN: 0, mvAnul: 0, totalBs: 4500, nota: null, createdAt: tk.toISOString() }],
    cierresCaja: [{ turnoId: 7, cajaId: 1, caja: "Caja 1", cajero: "Ana Pérez", fechaApertura: abre.toISOString(), fechaCierre: cierra.toISOString(),
      cantidadVentas: 23, vendidoUsd: 142.5, vendidoBs: 129960, observaciones: "Faltó sencillo",
      cuadre: { turnoId: 7, estado: "CERRADO", fondoUsd: 20, fondoBs: 2000, efectivoUsd: 60, efectivoBs: 9000, vueltoUsd: 3, vueltoBs: 456,
        esperadoUsd: 77, esperadoBs: 10544, declaradoUsd: 75, declaradoBs: 10544, diferenciaUsd: -2, diferenciaBs: 0,
        metodos: [{ metodo: "PUNTO", moneda: "VES", esperado: 4500, digital: true }, { metodo: "PAGO_MOVIL", moneda: "VES", esperado: 3100, digital: true }],
        movimientos: [{ tipo: "GASTO", moneda: "USD", total: 5, cantidad: 1 }] } }] };
  await preparar(page, st, { "kioskpos.sesion": sesionDueno });
  await ir(page);
  await page.getByRole("button", { name: /^Puntos/ }).first().click();
  await page.getByRole("tab", { name: "Hoy" }).click();
  const caja = page.locator(".cp-card", { hasText: "Cierre de caja · Caja 1" });
  await expect(caja).toContainText("Ana Pérez");
  await expect(caja).toContainText("$ 142,50");
  await expect(caja).toContainText("Faltan $ 2,00");
  // Ordenados por hora: el cierre de caja (6:40 p. m.) va antes que el ticket de punto (6:33 p. m.).
  await expect(page.locator(".cp-card").first()).toContainText("Cierre de caja");
  await caja.locator(".cp-card-h").click();
  await expect(caja.getByRole("table", { name: "Cuadre de la gaveta" })).toContainText("Efectivo $");
  await expect(caja).toContainText("Pago móvil");
  await expect(caja).toContainText("Tickets de punto de este turno");
  await expect(caja).toContainText("Nota del cierre: Faltó sencillo");
  // Filtros: solo caja / solo punto.
  await page.getByRole("tab", { name: "Tickets de punto" }).click();
  await expect(page.locator(".cp-card", { hasText: "Cierre de caja" })).toHaveCount(0);
  await expect(page.locator(".cp-card", { hasText: "EPN DIEGO" })).toBeVisible();
  await page.getByRole("tab", { name: "Cierres de caja" }).click();
  await expect(page.locator(".cp-card", { hasText: "EPN DIEGO" })).toHaveCount(0);
  if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + "/cierres.png" });
});
