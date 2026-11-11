import { defineConfig } from "@playwright/test";

// Pruebas de punta a punta contra el servidor REAL (sin mocks). Necesitan el backend
// corriendo (KP_API, por defecto http://127.0.0.1:8080) con un super admin de arranque.
// En CI: job "e2e-real". Local: arranca el backend y corre  npm run e2e:real
export default defineConfig({
  testDir: "e2e-real",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never", outputFolder: "playwright-report-real" }]] : "list",
  use: { baseURL: "http://127.0.0.1:4174", serviceWorkers: "block", trace: "off" },
  webServer: {
    command: "npx vite preview --port 4174 --strictPort --host 127.0.0.1",
    url: "http://127.0.0.1:4174",
    reuseExistingServer: !process.env.CI,
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
