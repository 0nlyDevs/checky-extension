import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ICON_NAMES } from "./icons.ts";

/** Build-time only: one hidden SVG sprite holding the Phosphor duotone symbols the panel uses. */
export function buildSprite(root: string): string {
  const symbols = ICON_NAMES.map((name) => {
    const svg = readFileSync(resolve(root, `node_modules/@phosphor-icons/core/assets/duotone/${name}-duotone.svg`), "utf8");
    const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
    return `<symbol id="ph-${name}" viewBox="0 0 256 256" fill="currentColor">${inner}</symbol>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">${symbols.join("")}</svg>`;
}
