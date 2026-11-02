import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { defineConfig, loadEnv } from "vite";
import { buildSprite } from "./src/lib/sprite.ts";

function origin(value: string): string {
  const url = new URL(value);
  if (url.username || url.password || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))) {
    throw new Error("FANILO URLs must use HTTPS, or HTTP on localhost for development");
  }
  return url.origin;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const local = mode === "development";
  const webUrl = origin(env.VITE_FANILO_WEB_URL || (local ? "http://localhost:3000" : "https://fanilo-mg.vercel.app"));
  const apiUrl = origin(env.VITE_FANILO_API_URL || (local ? "http://localhost:8000" : "https://fanilo-api.onrender.com"));
  return {
    base: "./",
    define: { __FANILO_CONFIG__: JSON.stringify({ webUrl, apiUrl }) },
    plugins: [{
      name: "fanilo-sprite",
      transformIndexHtml: (html: string) => html.replace("<!-- icon-sprite -->", buildSprite(import.meta.dirname)),
    }, {
      name: "fanilo-manifest",
      generateBundle() {
        for (const [scope, family] of [["@fontsource-variable", "bricolage-grotesque"], ["@fontsource", "cormorant-garamond"]]) {
          this.emitFile({ type: "asset", fileName: `licenses/${family}-OFL.txt`, source: readFileSync(resolve(import.meta.dirname, `node_modules/${scope}/${family}/LICENSE`), "utf8") });
        }
        this.emitFile({ type: "asset", fileName: "manifest.json", source: JSON.stringify({
          manifest_version: 3,
          name: "Checky — Vérifier ici",
          version: (JSON.parse(readFileSync(resolve(import.meta.dirname, "package.json"), "utf8")) as { version: string }).version,
          description: "Vérifiez un texte, un lien ou les indices de génération d’une image sans quitter la page.",
          minimum_chrome_version: "116",
          permissions: ["activeTab", "contextMenus", "scripting", "sidePanel", "storage"],
          host_permissions: [...new Set([`${webUrl}/*`, `${apiUrl}/*`])],
          background: { service_worker: "background.js", type: "module" },
          action: { default_title: "Ouvrir Checky" },
          side_panel: { default_path: "sidepanel.html" },
          icons: { "16": "icons/16.png", "32": "icons/32.png", "48": "icons/48.png", "128": "icons/128.png" },
          content_security_policy: { extension_pages: "script-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'" },
        }, null, 2) });
      },
    }],
    build: {
      outDir: local ? "dist-local" : "dist",
      target: "chrome116",
      rolldownOptions: {
        input: { panel: resolve(import.meta.dirname, "sidepanel.html"), background: resolve(import.meta.dirname, "src/background.ts") },
        output: { entryFileNames: "[name].js", chunkFileNames: "assets/[name]-[hash].js" },
      },
    },
  };
});
