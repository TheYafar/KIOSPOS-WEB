import { expect, test } from "@playwright/test";
import { ir, preparar, sesionCajero, type Estado } from "./mock";

test.use({ viewport: { width: 1440, height: 900 } });

test("la caja completa se usa solo con teclado: entrar, vender, cobrar y cerrar", async ({ page }) => {
  const st: Estado = { turnoAbierto: true };
  await preparar(page, st, { "kioskpos.turno": "7" });
  await ir(page);
  const k = (key: string) => page.keyboard.press(key);

  // Entrada: → elige cajero, números = PIN
  await expect(page.locator(".persona").first()).toBeVisible();
  await k("ArrowRight"); await k("ArrowRight");
  await expect(page.locator(".persona[aria-pressed=true] .pnom")).toHaveText("test2");
  for (const d of "1234") await k(d);
  await expect(page.getByText("Venta actual")).toBeVisible();
  await expect(page.locator(".pcard").first()).toBeVisible(); // catálogo cargado

  // Vender: escribir busca, Enter agrega, lector de código, +, F9
  await page.keyboard.type("harina"); await k("Enter");
  await page.keyboard.type("7591002"); await k("Enter");
  await k("+");
  await expect(page.locator(".tkp-ln")).toHaveCount(2);
  await expect(page.locator(".tkp-ln").nth(1)).toContainText("2 ×");
  await k("F9");
  await expect(page.locator(".cb3-card").first()).toBeVisible();

  // Cobrar: F8 pone el resto en Efectivo $, Enter cobra
  await k("F8");
  await expect(page.getByLabel("Monto en Efectivo $")).toHaveValue("4,50");
  await k("Enter");
  await expect(page.getByText("Nueva venta")).toBeVisible();
  expect(st.venta.pagos).toEqual([{ metodo: "EFECTIVO_USD", moneda: "USD", montoOriginal: 4.5 }]);
  await k("Enter");

  // Cierre: Alt+2, contar con Enter, Ctrl+Enter cierra
  await k("Alt+2");
  await expect(page.getByLabel("Contado en Efectivo $")).toBeFocused();
  for (const v of ["60", "9000", "13500", "8070", "0"]) { await page.keyboard.type(v); await k("Enter"); }
  await expect(page.locator(".arq-alerta")).toContainText("Falta $ 2,00 en Efectivo $");
  await page.keyboard.type("Faltan $2");
  await k("Control+Enter");
  // Hubo ventas por punto y no se anotó su ticket de cierre: pide confirmar.
  await expect(page.getByText(/Falta anotar el ticket de cierre de Punto de venta/)).toBeVisible();
  await k("Control+Enter");
  await expect(page.getByText("Detalle del cierre")).toBeVisible();
  expect(st.cierre).toMatchObject({ declaradoUsd: 60, declaradoBs: 9000, observaciones: "Faltan $2" });
  const det = JSON.parse(st.cierre.arqueoDetalle);
  expect(det.map((f: { metodo: string; diferencia: number }) => [f.metodo, f.diferencia])).toEqual([
    ["EFECTIVO_USD", -2], ["EFECTIVO_BS", 0], ["PUNTO", 0], ["PAGO_MOVIL", 0], ["BIOPAGO", 0]]);
});

test("si el equipo olvidó el turno, se recupera del servidor", async ({ page }) => {
  await preparar(page, { turnoAbierto: true }, { "kioskpos.sesion": sesionCajero });
  await ir(page);
  await expect(page.locator(".caja-est")).toContainText("Caja abierta");
  await page.keyboard.press("Alt+2");
  await expect(page.locator(".arq-nm").first()).toBeVisible();
});

test("abrir la caja cuando ya estaba abierta no muestra error: la carga", async ({ page }) => {
  await preparar(page, { turnoAbierto: false, abrirFalla: true }, { "kioskpos.sesion": sesionCajero });
  await ir(page);
  await expect(page.locator(".caja-est")).toContainText("Caja cerrada");
  await page.keyboard.press("Alt+2");
  // el servidor dice "ya tiene un turno abierto" en el segundo intento
  await page.locator(".cz-cerrar").click();
  await expect(page.locator(".arq-nm").first()).toBeVisible();
  await expect(page.getByText("ya tiene un turno abierto")).toHaveCount(0);
});
