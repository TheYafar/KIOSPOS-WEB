import { expect, test } from "@playwright/test";
import { ir, preparar, sesionDueno, type Estado } from "./mock";

test.use({ viewport: { width: 1366, height: 900 } });

const SIN_CAJA = { "kioskpos.cajaToken": '""' };

test("la entrada tiene ayuda por WhatsApp con el número de soporte", async ({ page }) => {
  await preparar(page, { turnoAbierto: false }, SIN_CAJA);
  await ir(page);
  const ws = page.locator(".ws-link").first();
  await expect(ws).toBeVisible();
  await expect(ws).toHaveAttribute("href", /^https:\/\/wa\.me\/584124682180\?text=/);
});

test("olvidé mi contraseña: con correo + código pone una nueva y recibe un código nuevo", async ({ page }) => {
  const st: Estado = { turnoAbierto: false };
  await preparar(page, st, SIN_CAJA);
  await ir(page);
  await page.getByRole("button", { name: "¿Olvidaste tu contraseña?" }).click();
  await page.locator("#rec-email").fill("maria@ejemplo.com");
  await page.locator("#rec-codigo").fill("abcd-efgh-jk23");
  await page.locator("#rec-pass").fill("clave-nueva-1");
  await page.locator("#rec-pass2").fill("clave-nueva-1");
  // Sin el código, el botón de WhatsApp lleva el correo ya escrito.
  await expect(page.locator(".rec-sin a")).toHaveAttribute("href", /maria%40ejemplo\.com/);
  await page.getByRole("button", { name: "Poner contraseña nueva" }).click();
  await expect.poll(() => st.recuperacion?.codigo).toBe("ABCD-EFGH-JK23");
  expect(st.recuperacion).toMatchObject({ email: "maria@ejemplo.com", password: "clave-nueva-1" });
  await expect(page.locator(".rec-code")).toHaveText("NUEV-OCOD-IGO2");
});

test("olvidé mi contraseña: código equivocado muestra el error", async ({ page }) => {
  const st: Estado = { turnoAbierto: false, recuperacionFalla: "Correo o código incorrectos. Te quedan 4 intentos." };
  await preparar(page, st, SIN_CAJA);
  await ir(page);
  await page.getByRole("button", { name: "¿Olvidaste tu contraseña?" }).click();
  await page.locator("#rec-email").fill("maria@ejemplo.com");
  await page.locator("#rec-codigo").fill("AAAA-BBBB-CCCC");
  await page.locator("#rec-pass").fill("clave-nueva-1");
  await page.locator("#rec-pass2").fill("clave-nueva-1");
  await page.getByRole("button", { name: "Poner contraseña nueva" }).click();
  await expect(page.getByRole("alert")).toContainText("Correo o código incorrectos");
});

test("ver la demo: entra a una bodega de muestra, cambia a cajera y sale", async ({ page }) => {
  const st: Estado = { turnoAbierto: true };
  await preparar(page, st, SIN_CAJA);
  await ir(page);
  await page.getByRole("button", { name: "Ver la demo" }).click();
  await expect.poll(() => st.demoCreada).toBe(true);
  const barra = page.locator(".demo-bar");
  await expect(barra).toContainText("Estás probando la DEMO");
  await expect(barra).toContainText("como su dueño");

  await barra.getByRole("button", { name: "Vender como cajera" }).click();
  await expect(page.locator(".demo-bar")).toContainText("cajera Ana");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("kioskpos.sesion") || "{}").token)).toBe("demo-c");

  await page.locator(".demo-bar").getByRole("button", { name: "Salir de la demo" }).click();
  await expect(page.locator(".demo-bar")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("kp_demo"))).toBeNull();
});

test("si la demo está apagada no se ofrece", async ({ page }) => {
  await preparar(page, { turnoAbierto: false, opciones: { registro: true, demo: false, correo: false } }, SIN_CAJA);
  await ir(page);
  await expect(page.getByRole("button", { name: "Crear mi cuenta" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ver la demo" })).toHaveCount(0);
});

test("en Más el dueño crea su código de recuperación", async ({ page }) => {
  const st: Estado = { turnoAbierto: false };
  await preparar(page, st, { ...SIN_CAJA, "kioskpos.sesion": sesionDueno });
  await ir(page);
  await page.keyboard.press("Alt+9");
  await page.getByRole("button", { name: "Crear mi código" }).click();
  await expect.poll(() => st.codigoGenerado).toBe(true);
  await expect(page.locator(".seg-card .rec-code")).toHaveText("MASS-CODE-2345");
});
