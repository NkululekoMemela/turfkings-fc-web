// vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import manifest from "./public/manifest.json" with { type: "json" };

export default defineConfig(() => {
  const isNativeBuild =
    process.env.FANM_NATIVE_BUILD === "1";

  return {
    plugins: [
      react(),
      !isNativeBuild &&
        VitePWA({
          registerType: "autoUpdate",
          includeAssets: [
            "pwa/icon-192.png",
            "pwa/icon-512.png",
          ],
          manifest,
          workbox: {
            globPatterns: [
              "**/*.{js,css,html,ico,png,svg,webp,woff2}",
            ],
            maximumFileSizeToCacheInBytes:
              5 * 1024 * 1024,
          },
        }),
    ].filter(Boolean),
    base: "/",
  };
});
