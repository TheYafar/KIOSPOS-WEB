import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// PWA instalable: service worker con autoUpdate para que la caja siempre tenga la
// última versión, y precache del shell para que abra sin internet. La cola de envíos
// vive en IndexedDB (ver src/outbox.ts), no en el service worker.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "KioskPOS",
        short_name: "KioskPOS",
        description: "Punto de venta KioskPOS",
        lang: "es-VE",
        theme_color: "#161719",
        background_color: "#f6f5f2",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" }
        ]
      },
      workbox: {
        navigateFallback: "index.html"
      }
    })
  ],
  server: {
    port: 5173,
    proxy: {
      // En dev, /api va al backend Spring Boot.
      "/api": "http://localhost:8080"
    }
  }
});
