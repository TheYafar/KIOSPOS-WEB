import { expect, test } from "@playwright/test";
import { ir, preparar, sesionDueno, type Estado } from "./mock";

test.use({ viewport: { width: 1366, height: 900 } });

// Equipo nuevo, sin caja configurada todavía.
const SIN_CAJA = { "kioskpos.cajaToken": '""' };

async function llenarRegistro(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Crear mi cuenta" }).click();
  await page.locator("#reg-negocio").fill("Bodega La Esquina");
  await page.locator("#reg-nombre").fill("María Pérez");
  await page.locator("#reg-tel").fill("0412-1234567");
  await page.locator("#reg-email").fill("maria@ejemplo.com");
  await page.locator("#reg-pass").fill("clave-segura");
}

test("el dueño se registra solo, recibe la bienvenida y usa este equipo como caja", async ({ page }) => {
  const st: Estado = { turnoAbierto: false };
  await preparar(page, st, SIN_CAJA);
  await ir(page);
  await llenarRegistro(page);
  const crear = page.getByRole("button", { name: "Crear mi cuenta gratis" });
  await expect(crear).toBeDisabled(); // falta repetir la contraseña
  await page.locator("#reg-pass2").fill("clave-segura");
  await crear.click();

  await expect.poll(() => st.registro?.negocio).toBe("Bodega La Esquina");
  expect(st.registro).toMatchObject({ nombre: "María Pérez", email: "maria@ejemplo.com", telefono: "0412-1234567", password: "clave-segura" });

  const bienv = page.getByRole("dialog", { name: "Bienvenida a KioskPOS" });
  await expect(bienv).toContainText("¡Bienvenido a KioskPOS, María!");
  await expect(bienv).toContainText("7 días gratis");

  await bienv.getByRole("button", { name: "Usar este equipo" }).click();
  await expect.poll(() => st.cajaCreada?.nombre).toBe("Caja 1");
  await expect(bienv).toContainText("Este equipo ya es tu caja");
  const token = await page.evaluate(() => localStorage.getItem("kioskpos.cajaToken"));
  expect(token).toContain("tok-nuevo");

  // El código de recuperación sale una vez y hay que confirmar que se guardó.
  await expect(bienv.locator(".rec-code")).toHaveText("ABCD-EFGH-JK23");
  const empezar = bienv.getByRole("button", { name: "Empezar a usar KioskPOS" });
  await expect(empezar).toBeDisabled();
  await bienv.getByLabel("Ya lo guardé").check();
  await empezar.click();
  await expect(bienv).toHaveCount(0);
  // La bienvenida no vuelve a salir.
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("dialog", { name: "Bienvenida a KioskPOS" })).toHaveCount(0);
});

test("el registro muestra el error del servidor (correo ya usado)", async ({ page }) => {
  const st: Estado = { turnoAbierto: false, registroFalla: "Ya hay una cuenta con ese correo." };
  await preparar(page, st, SIN_CAJA);
  await ir(page);
  await llenarRegistro(page);
  await page.locator("#reg-pass2").fill("otra-cosa");
  await expect(page.getByText("Las dos contraseñas no coinciden")).toBeVisible();
  await page.locator("#reg-pass2").fill("clave-segura");
  await page.getByRole("button", { name: "Crear mi cuenta gratis" }).click();
  await expect(page.getByRole("alert")).toContainText("Ya hay una cuenta con ese correo");
});

test("en Equipo y cajas se crea una caja en este mismo equipo, sin token", async ({ page }) => {
  const st: Estado = { turnoAbierto: false };
  await preparar(page, st, { ...SIN_CAJA, "kioskpos.sesion": sesionDueno });
  await ir(page);
  await page.keyboard.press("Alt+9");
  await page.getByRole("button", { name: "+ Caja" }).click();
  await expect(page.getByRole("radio", { name: /En este equipo/ })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Crear y usar este equipo" }).click();
  await expect.poll(() => st.cajaCreada?.nombre).toBe("Caja 2");
  await expect(page.locator(".eq-aqui")).toContainText("Este equipo");
  const token = await page.evaluate(() => localStorage.getItem("kioskpos.cajaToken"));
  expect(token).toContain("tok-nuevo");
});
