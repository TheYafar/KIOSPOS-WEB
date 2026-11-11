import { expect, test } from "@playwright/test";
import { ir, preparar, sesionDueno, type Estado } from "./mock";

test.use({ viewport: { width: 1366, height: 900 } });

test("Nómina en el menú del dueño: paga el sueldo descontando el fiado y muestra el recibo", async ({ page }) => {
  const st: Estado = { turnoAbierto: false };
  await preparar(page, st, { "kioskpos.sesion": sesionDueno });
  await ir(page);
  await page.getByRole("button", { name: /^Nómina/ }).first().click();
  const card = page.locator(".nom-card", { hasText: "Luis" });
  await expect(card.locator(".nom-cuenta")).toContainText("$ 15,00");
  await expect(card.locator(".nom-cuenta .neto")).toContainText("$ 3,00"); // 15 − 12 de fiado
  await card.getByRole("button", { name: "Pagar nómina" }).click();
  await page.getByLabel("Bonos").fill("2");
  await expect(page.locator(".nom-calc .neto")).toContainText("$ 5,00"); // 15 + 2 − 12
  await page.getByRole("button", { name: "Pago móvil" }).click();
  await expect(page.locator(".nom-calc .neto")).toContainText("Bs 4.500,00");
  await page.getByLabel("Referencia del pago").fill("7788");
  await page.getByRole("button", { name: /^Pagar \$ 5,00/ }).click();
  await expect(page.getByRole("heading", { name: "Pago registrado ✓" })).toBeVisible();
  await expect(page.getByLabel("Recibo")).toContainText("- Credito");
  expect(st.nomina).toMatchObject({ trabajadorId: 3, sueldoUsd: 15, bonosUsd: 2, otrosDescuentosUsd: 0, fiadoDescontadoUsd: 12, metodo: "PAGO_MOVIL", tasa: 900, referencia: "7788" });
});
