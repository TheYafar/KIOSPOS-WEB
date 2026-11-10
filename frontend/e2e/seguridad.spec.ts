import { expect, test } from "@playwright/test";
import { ir, preparar, type Estado } from "./mock";

test.use({ viewport: { width: 1280, height: 860 } });

test("el PIN equivocado muestra cuántos intentos quedan (lo dice el servidor)", async ({ page }) => {
  await preparar(page, { turnoAbierto: false });
  await page.route("**/api/auth/login-cajero", (r) => r.fulfill({ status: 401, json: { error: "PIN incorrecto. Te quedan 3 intentos." } }));
  await ir(page);
  await page.locator(".persona", { hasText: "test1" }).click();
  await page.keyboard.type("9999");
  await expect(page.locator(".pinmsg.err")).toHaveText("PIN incorrecto. Te quedan 3 intentos.");
});

test("olvidé mi contraseña pide el enlace por correo", async ({ page }) => {
  let pedido: any = null;
  await preparar(page, { turnoAbierto: false }, { "kioskpos.cajaToken": "" });
  await page.route("**/api/auth/olvide-clave", (r) => { pedido = JSON.parse(r.request().postData() || "{}"); return r.fulfill({ json: { mensaje: "Si ese correo está registrado, te llegará un enlace." } }); });
  await ir(page);
  await page.getByRole("button", { name: "¿Olvidaste tu contraseña?" }).click();
  await page.getByLabel("Correo con el que entras").fill("dueno@bodega.com");
  await page.keyboard.press("Enter");
  await expect(page.locator(".pinmsg.ok")).toContainText("te llegará un enlace");
  expect(pedido).toEqual({ email: "dueno@bodega.com" });
});

test("el enlace #reset pone la contraseña nueva y deja listo para entrar", async ({ page }) => {
  let body: any = null;
  await preparar(page, { turnoAbierto: false }, { "kioskpos.cajaToken": "" });
  await page.route("**/api/auth/restablecer-clave", (r) => { body = JSON.parse(r.request().postData() || "{}"); return r.fulfill({ json: { email: "dueno@bodega.com" } }); });
  await page.goto("/#reset=TOK123");
  await expect(page.getByRole("heading", { name: "Contraseña nueva" })).toBeVisible();
  await page.getByLabel("Contraseña nueva").fill("clave-nueva-1");
  await page.getByLabel("Repítela").fill("otra-cosa-22");
  await page.getByRole("button", { name: "Guardar contraseña" }).click();
  await expect(page.locator(".pinmsg.err")).toHaveText("Las dos contraseñas no coinciden");
  await page.getByLabel("Repítela").fill("clave-nueva-1");
  await page.keyboard.press("Enter");
  await expect(page.locator(".pinmsg.ok")).toContainText("Ya puedes entrar");
  await expect(page.getByLabel("Correo")).toHaveValue("dueno@bodega.com");
  expect(body).toEqual({ token: "TOK123", password: "clave-nueva-1" });
  expect(page.url()).not.toContain("reset=");
});

test("super admin: pide el código 2FA, entra y activa la 2FA con QR", async ({ page }) => {
  const st: Estado = { turnoAbierto: false };
  let activo = false;
  const logins: any[] = [];
  await preparar(page, st, { "kioskpos.cajaToken": "" });
  await page.route("**/api/admin/**", (r) => {
    const u = r.request().url();
    if (u.endsWith("/api/admin/login")) {
      const b = JSON.parse(r.request().postData() || "{}"); logins.push(b);
      return b.codigo === "123456" ? r.fulfill({ json: { token: "adm" } }) : r.fulfill({ status: 401, json: { error: "Escribe el código", requiere2fa: true } });
    }
    if (u.endsWith("/2fa")) return r.fulfill({ json: { activo } });
    if (u.endsWith("/2fa/iniciar")) return r.fulfill({ json: { secreto: "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP", uri: "otpauth://totp/KioskPOS:u@k.com?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP" } });
    if (u.endsWith("/2fa/activar")) { activo = true; return r.fulfill({ json: { activo: true } }); }
    if (u.includes("/enlace-clave")) return r.fulfill({ json: { enlace: "https://app.kioskpos.app/#reset=ABC" } });
    if (u.includes("/api/admin/negocios")) return r.fulfill({ json: [{ situacion: { negocioId: 4, nombre: "Bodega Cocoa", plan: "BASICO", estadoEfectivo: "ACTIVA", puedeCobrar: true, pagoHasta: "2026-12-10", diasVencido: 0, mesesPendientes: 0, deuda: 0, mensaje: "" }, cajas: 1, ultimaVezEnLinea: null, ultimoPago: null }] });
    return r.fulfill({ json: [] });
  });
  await ir(page);
  await page.getByRole("button", { name: "Soy el administrador" }).click();
  await page.getByLabel("Correo").fill("u@k.com");
  await page.getByLabel("Contraseña").fill("clave-super");
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Código de 6 dígitos")).toBeVisible();
  await page.getByLabel("Código de 6 dígitos").fill("123456");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Administración" })).toBeVisible();
  expect(logins.at(-1)).toMatchObject({ email: "u@k.com", codigo: "123456" });

  await expect(page.locator(".sec-aviso")).toBeVisible();
  await page.locator(".sec-aviso").click();
  await page.getByRole("button", { name: "Empezar" }).click();
  await expect(page.locator(".qr2fa svg")).toBeVisible();
  await expect(page.locator(".sec-man code")).toContainText("JBSW Y3DP");
  await page.getByLabel("Código de 6 dígitos").fill("654321");
  await page.getByRole("button", { name: "Activar" }).click();
  await expect(page.locator(".sec-ok")).toContainText("Activada");
  await page.getByRole("button", { name: "Cerrar" }).click();
  await expect(page.locator(".sec-aviso")).toHaveCount(0);

  // Enlace para que el dueño ponga clave nueva.
  await page.getByRole("button", { name: "Clave" }).click();
  await expect(page.getByLabel("Enlace para cambiar la clave")).toHaveValue("https://app.kioskpos.app/#reset=ABC");
  await expect(page.getByRole("link", { name: "Enviar por WhatsApp" })).toHaveAttribute("href", /wa\.me\/\?text=.*reset%3DABC/);
});
