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
  await expect(page.getByRole("heading", { name: "Cierres de punto" })).toBeVisible();
  await page.getByRole("tab", { name: "Hoy" }).click();
  const card = page.locator(".cp-card", { hasText: "EPN DIEGO HERNANDEZ CRE" });
  await expect(card).toContainText("Bs 29.606,00");
  await expect(card).toContainText("Caja 1 · Ana Pérez");
  await expect(card).toContainText("Ticket +Bs 16.106,00 vs sistema");
  await card.locator(".cp-card-h").click();
  await expect(card.getByLabel("Ticket del punto", { exact: true })).toContainText("13,199.00");
  await expect(card).toContainText("Hora del ticket");
  await expect(page).toHaveURL(/#\/puntos$/);
});
