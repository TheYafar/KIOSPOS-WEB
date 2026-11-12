import { expect, test } from "@playwright/test";
import { ir, preparar, sesionDueno, type Estado } from "./mock";

test.use({ viewport: { width: 1366, height: 900 } });

// Conector simulado: responde /estado con dos impresoras y captura lo que se manda a /imprimir.
async function conector(page: import("@playwright/test").Page, capt: { imp?: string; body?: string }) {
  await page.route("http://127.0.0.1:9010/estado", (r) =>
    r.fulfill({ status: 200, contentType: "text/plain", body: "ok\ndefecto: EPSON TM-T20\nimpresoras:\n  - EPSON TM-T20\n  - PDF\n" }));
  await page.route("http://127.0.0.1:9010/imprimir", (r) => {
    capt.imp = r.request().headers()["x-impresora"]; capt.body = r.request().postData() || "";
    return r.fulfill({ status: 200, contentType: "text/plain", body: "impreso en: ok" });
  });
}

test("elegir impresora en Configuración y probar impresión", async ({ page }) => {
  const capt: { imp?: string; body?: string } = {};
  await conector(page, capt);
  await preparar(page, { turnoAbierto: false } as Estado, { "kioskpos.sesion": sesionDueno });
  await ir(page);
  await page.getByRole("button", { name: /^Config/ }).first().click();
  const sec = page.locator(".cfg-sec", { hasText: "Impresora" });
  await expect(sec.getByRole("radio")).toHaveCount(3); // "La del sistema" + 2
  await sec.locator(".imp-op", { has: page.locator("b", { hasText: "EPSON TM-T20" }) }).click();
  await expect(page.locator(".imp-msg")).toContainText("EPSON TM-T20");

  await sec.getByRole("button", { name: "Imprimir prueba" }).click();
  await expect(page.locator(".imp-msg")).toContainText("Prueba enviada");
  expect(capt.imp).toBe("EPSON TM-T20");
  expect(capt.body).toContain("KIOSKPOS — PRUEBA");

  // Se guarda en el equipo (se relee al recargar)
  await page.reload();
  await page.getByRole("button", { name: /^Config/ }).first().click();
  await expect(page.locator(".cfg-sec", { hasText: "Impresora" }).locator(".imp-op", { has: page.locator("b", { hasText: "EPSON TM-T20" }) })).toHaveAttribute("aria-checked", "true");
});

test("sin Conector muestra el aviso y botón para reintentar", async ({ page }) => {
  await page.route("http://127.0.0.1:9010/estado", (r) => r.abort());
  await preparar(page, { turnoAbierto: false } as Estado, { "kioskpos.sesion": sesionDueno });
  await ir(page);
  await page.getByRole("button", { name: /^Config/ }).first().click();
  await expect(page.locator(".imp-off")).toContainText("No se detecta el Conector");
  await expect(page.locator(".imp-off").getByRole("button", { name: "Buscar de nuevo" })).toBeVisible();
});
