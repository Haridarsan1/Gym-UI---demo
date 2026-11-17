import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath, URL } from "node:url";

/**
 * The home page is loaded lazily so that the app routes (/m, /t, /desk…) and the login and signup pages don’t download
 * it. On "/" itself that would add a second step to the download, so this starts fetching the home page at the same time
 * as the main script, on "/" only.
 */
function preloadHomeOnRoot(): Plugin {
  return {
    name: "preload-home-on-root",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(_html, ctx) {
        const bundle = ctx.bundle ?? {};
        const home = Object.values(bundle).find((c) => c.type === "chunk" && c.facadeModuleId?.endsWith("/src/pages/home/HomePage.tsx"));
        if (!home || home.type !== "chunk") return;
        // The home chunk and every chunk it needs, so none of them waits for another to arrive first. The main script is already loading.
        const files = new Set<string>();
        const visit = (name: string) => {
          const c = bundle[name];
          if (!c || c.type !== "chunk" || c.isEntry || files.has(name)) return;
          files.add(name);
          c.imports.forEach(visit);
        };
        visit(home.fileName);
        const hrefs = JSON.stringify([...files].map((f) => `/${f}`));
        const script = `if(location.pathname==="/"){${hrefs}.forEach(function(h){var l=document.createElement("link");l.rel="modulepreload";l.href=h;document.head.appendChild(l)})}`;
        return [{ tag: "script", children: script, injectTo: "head-prepend" }];
      },
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    preloadHomeOnRoot(),
    VitePWA({
      // The new service worker takes over as soon as it is ready. We register it ourselves (src/app/pwa.ts), only when the
      // app opens, so the marketing pages never install it. The page is not reloaded for you: a toast offers that.
      registerType: "autoUpdate",
      injectRegister: false,
      manifestFilename: "manifest.webmanifest",
      manifest: {
        name: "Ember",
        short_name: "Ember",
        description: "Gym management for owners, front desk, trainers and members.",
        lang: "en-IN",
        start_url: "/app",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#FBF8F4",
        theme_color: "#FFF6EF",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        shortcuts: [{ name: "Check-in pass", url: "/m/pass", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] }],
      },
      workbox: {
        // Cache only static files: scripts, styles, the two fonts we use (Latin only) and icons. index.html is never
        // precached, so a new deploy is picked up on the next load.
        globPatterns: ["assets/*.{js,css}", "assets/*-latin-*.woff", "icons/*.png", "apple-touch-icon.png", "favicon.svg"],
        globIgnores: ["assets/*latin-ext*", "assets/HomePage-*", "assets/TrialSignupPage-*", "assets/LegalPage-*"],
        navigateFallback: null,
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            // The app shell: page loads try the network first and fall back to the last copy when offline.
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: { cacheName: "pages", networkTimeoutSeconds: 3, expiration: { maxEntries: 12 } },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
