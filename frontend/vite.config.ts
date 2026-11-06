import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// L'app Mac (Tauri) charge le même build ; TAURI_ENV_PLATFORM est défini par la CLI Tauri.
const pourTauri = !!process.env.TAURI_ENV_PLATFORM;

// Préférence de thème commune à la suite (copie verbatim de la marque) : insérée telle quelle
// en script bloquant au début de <head>, pour poser data-theme et la classe « dark » avant l'affichage.
function themeAtelier(): Plugin {
  const source = new URL("./src/styles/atelier-brand/atelier-theme.js", import.meta.url);
  return {
    name: "atelier-theme",
    transformIndexHtml: {
      order: "pre",
      handler: () => [
        { tag: "script", children: readFileSync(source, "utf8"), injectTo: "head-prepend" },
      ],
    },
  };
}

export default defineConfig({
  plugins: [
    themeAtelier(),
    react(),
    VitePWA({
      disable: pourTauri,
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      injectRegister: false,
      registerType: "autoUpdate",
      includeAssets: ["icone.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Atelier Cuisine",
        short_name: "Cuisine",
        description: "Stock, planning des repas, courses, tickets de caisse et budget du foyer.",
        lang: "fr",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#f6f5fc",
        theme_color: "#f6f5fc",
        icons: [
          { src: "icone-192.png", sizes: "192x192", type: "image/png" },
          { src: "icone-512.png", sizes: "512x512", type: "image/png" },
          { src: "icone-512-masquable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
      },
    }),
  ],
  // Réglages recommandés par Tauri
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: {
    target: pourTauri ? "safari15" : "es2022",
    sourcemap: false,
    chunkSizeWarningLimit: 800,
  },
});
