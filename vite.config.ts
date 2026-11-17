import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
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
  plugins: [react(), preloadHomeOnRoot()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
