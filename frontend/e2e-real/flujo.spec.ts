import { expect, test, type APIRequestContext, type APIResponse } from "@playwright/test";

// Flujo completo contra el SERVIDOR REAL (Spring Boot + Postgres), sin API simulada.
// Lo corre el CI (job "e2e-real"); detecta lo que el mock no ve (fechas, permisos, JSON).
const API = process.env.KP_API || "http://127.0.0.1:8080";
const ADMIN = { email: process.env.KP_ADMIN_EMAIL || "admin@e2e.local", password: process.env.KP_ADMIN_PASSWORD || "clave-admin-e2e-123" };

async function json(r: APIResponse) {
  expect(r.ok(), `${r.status()} ${r.url()}: ${await r.text()}`).toBeTruthy();
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}
const H = (token: string) => ({ Authorization: "Bearer " + token });

async function montarNegocio(request: APIRequestContext) {
  const admin = await json(await request.post(API + "/api/admin/login", { data: ADMIN }));
  const email = `dueno${Date.now()}@e2e.local`;
  await json(await request.post(API + "/api/admin/negocios", { headers: H(admin.token),
    data: { nombreNegocio: "Bodega E2E", nombreDueno: "Ana E2E", email, password: "clave-e2e-123", plan: "BASICO", cajasContratadas: 1 } }));
  const dueno = await json(await request.post(API + "/api/auth/login-dueno", { data: { email, password: "clave-e2e-123" } }));
  const hd = H(dueno.token);
  await json(await request.put(API + "/api/mi-negocio/caja-config", { headers: hd, data: { tasaModo: "MANUAL", ajusteTipo: "PCT", ajuste: 0, tasaManual: 900, metodosPago: null } }));
  const prod = await json(await request.post(API + "/api/inventario/productos", { headers: hd,
    data: { codigoBarras: "E2E-" + Date.now(), nombre: "Harina E2E", precioUsd: 2, costoUsd: 1.5, categoria: "Víveres", stockInicial: 10, esPesable: false, unidadMedida: "UND" } }));
  const caja = await json(await request.post(API + "/api/cajas", { headers: hd, data: { nombre: "Caja E2E" } }));
  await json(await request.post(API + "/api/usuarios", { headers: hd, data: { rol: "CAJERO", nombreCompleto: "Pedro E2E", pin: "4321" } }));
  return { email, dueno, hd, prod, caja };
}

test("alta del negocio, caja con PIN, abrir, vender, reporte y cierre — servidor real", async ({ page, request }) => {
  const n = await montarNegocio(request);
  await page.addInitScript(([tok]) => {
    if (sessionStorage.getItem("__init")) return;
    sessionStorage.setItem("__init", "1");
    localStorage.clear();
    localStorage.setItem("kioskpos.cajaToken", JSON.stringify(tok));
    localStorage.setItem("kioskpos.tasa", JSON.stringify("900"));
  }, [n.caja.cajaToken]);
  await page.goto("/");

  // Entrar con PIN.
  await page.locator(".persona", { hasText: "Pedro" }).click(); // la pantalla muestra solo el primer nombre
  for (const d of "4321") await page.keyboard.press(d);
  await expect(page.locator(".caja-est")).toContainText("Caja cerrada");

  // Abrir la caja con $20.
  await page.keyboard.press("Alt+2");
  await page.locator(".cz-cerrar").click();
  await expect(page.locator(".caja-est")).toContainText("Caja abierta");

  // Vender 1 Harina ($2) en efectivo $.
  await page.keyboard.press("Alt+1");
  await page.locator(".pcard", { hasText: "Harina E2E" }).click();
  await page.keyboard.press("F9");
  await page.keyboard.press("F8");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Nueva venta")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".cola-pill")).toHaveCount(0); // llegó al servidor, nada en cola

  // El servidor la registró: reporte del día, stock y ganancia.
  const rep = await json(await request.get(API + "/api/reportes/dia", { headers: n.hd }));
  expect(rep.cantidadVentas).toBe(1);
  expect(Number(rep.totalUsd)).toBeCloseTo(2, 2);
  expect(Number(rep.gananciaUsd)).toBeCloseTo(0.5, 2);
  const prods = await json(await request.get(API + "/api/inventario/productos", { headers: n.hd }));
  expect(Number(prods.find((p: { id: number }) => p.id === n.prod.id).stockActual)).toBeCloseTo(9, 3);

  // Historial de ventas del día (el bug de la fecha).
  await page.keyboard.press("Alt+3");
  await expect(page.locator(".vt-row").first()).toContainText("$ 2,00");

  // Cerrar el turno contando $22 (fondo 20 + venta 2).
  await page.keyboard.press("Alt+2");
  await page.getByLabel("Contado en Efectivo $").fill("22");
  await page.keyboard.press("Control+Enter");
  const cerrarIgual = page.getByRole("button", { name: /Cerrar igual/ });
  if (await cerrarIgual.isVisible().catch(() => false)) await cerrarIgual.click();
  await expect(page.getByText("Detalle del cierre")).toBeVisible();
  const cierres = await json(await request.get(API + "/api/reportes/cierres", { headers: n.hd }));
  expect(cierres).toHaveLength(1);
  expect(Number(cierres[0].diferenciaUsd)).toBeCloseTo(0, 2);
});

test("el dueño entra con correo y clave y ve su reporte", async ({ page, request }) => {
  const n = await montarNegocio(request);
  await page.goto("/");
  await page.getByLabel(/Correo/i).first().fill(n.email);
  await page.getByLabel(/Contraseña|Clave/i).first().fill("clave-e2e-123");
  await page.keyboard.press("Enter");
  await expect(page.getByText(/Vendido hoy/)).toBeVisible();
  await page.getByRole("tab", { name: "Semana" }).click();
  await expect(page.locator(".rep-col")).toHaveCount(7);
});
