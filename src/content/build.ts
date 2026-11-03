import { resolve } from "node:path";
import { build } from "vite";
import type { Plugin } from "vite";

/** Build-time only: the page reader is injected with `chrome.scripting.executeScript`, which
 * runs classic scripts, so it is bundled on its own as one self-contained IIFE next to the panel. */
export function contentScript(root: string, outDir: string): Plugin {
  return {
    name: "checky-content-script",
    apply: "build",
    async closeBundle() {
      await build({
        configFile: false, root, publicDir: false, logLevel: "warn",
        build: {
          outDir, emptyOutDir: false, target: "chrome116", minify: true,
          lib: { entry: resolve(root, "src/content/watch.ts"), formats: ["iife"], name: "checkyWatch", fileName: () => "watch.js" },
        },
      });
    },
  };
}
