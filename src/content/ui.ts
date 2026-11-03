// What the reader draws inside Facebook and TikTok: closed shadow roots, our own text only
// (`textContent`), our own bundled icons, and styles that the page cannot reach or override.
import check from "@phosphor-icons/core/assets/duotone/check-duotone.svg?raw";
import x from "@phosphor-icons/core/assets/duotone/x-duotone.svg?raw";
import warning from "@phosphor-icons/core/assets/duotone/warning-duotone.svg?raw";
import question from "@phosphor-icons/core/assets/duotone/question-duotone.svg?raw";
import eye from "@phosphor-icons/core/assets/duotone/eye-duotone.svg?raw";
import { t } from "../i18n/fr.ts";
import type { KnownVerdict } from "../lib/watch.ts";

const SVG = { check, x, warning, question, eye } as const;
export type IconName = keyof typeof SVG;
export const VERDICT_ICON: Record<KnownVerdict["verdict"], IconName> = { true: "check", false: "x", misleading: "warning", unverifiable: "question" };

const CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.w { --ground:#f3f2ee; --paper:#fbfaf7; --soft:#e9e8e2; --ink:#0a0a0b; --muted:#55544e; --rule:#dcdbd5; --edge:#8f8e88;
  --true-ink:#0b6b3a; --true-soft:#e1f3e8; --false-ink:#b3231a; --false-soft:#fbe3e0;
  --misleading-ink:#8a5700; --misleading-soft:#f9ecd2; --unverifiable-ink:#1d58c4; --unverifiable-soft:#e0eafb;
  font: 600 13px/1.35 "Bricolage Grotesque Variable", "Bricolage Grotesque", system-ui, -apple-system, "Segoe UI", sans-serif;
  color: var(--ink); letter-spacing: 0; text-align: left; }
@media (prefers-color-scheme: dark) { .w { --ground:#0a0a0b; --paper:#111113; --soft:#19191c; --ink:#f3f2ee; --muted:#a6a5a0; --rule:#2a2a2d; --edge:#6d6c68;
  --true-ink:#3ddc84; --true-soft:#0f2219; --false-ink:#ff6a5f; --false-soft:#2a1311;
  --misleading-ink:#ffb224; --misleading-soft:#29200c; --unverifiable-ink:#6aa8ff; --unverifiable-soft:#101a2b; } }
svg { width: 16px; height: 16px; flex: 0 0 auto; }
button { font: inherit; color: inherit; cursor: pointer; }
:focus-visible { outline: 2px solid #f2c230; outline-offset: 2px; }
.mark { width: 20px; height: 20px; border-radius: 50%; background: #0a0a0b; display: inline-grid; place-items: center; flex: 0 0 auto; }
.mark svg { width: 14px; height: 14px; }
.badges { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 12px; }
.badge { display: inline-flex; align-items: center; gap: 6px; min-height: 32px; padding: 4px 12px 4px 6px; border-radius: 999px;
  border: 1px solid var(--edge); background: var(--paper); max-width: 100%; }
.badge span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.badge:hover { background: var(--soft); }
.badge.v { border-width: 1.5px; }
.true { color: var(--true-ink); background: var(--true-soft); border-color: var(--true-ink); }
.false { color: var(--false-ink); background: var(--false-soft); border-color: var(--false-ink); }
.misleading { color: var(--misleading-ink); background: var(--misleading-soft); border-color: var(--misleading-ink); }
.unverifiable { color: var(--unverifiable-ink); background: var(--unverifiable-soft); border-color: var(--unverifiable-ink); }
.badge.true:hover, .badge.false:hover, .badge.misleading:hover, .badge.unverifiable:hover { filter: brightness(.97); }
.bubble { position: fixed; z-index: 2147483646; width: 52px; height: 52px; border-radius: 50%; border: 2px solid #f3f2ee; background: #0a0a0b;
  display: grid; place-items: center; box-shadow: 0 2px 10px rgba(0,0,0,.35); touch-action: none; user-select: none; padding: 0; }
.bubble svg { width: 30px; height: 30px; pointer-events: none; }
.bubble.dragging { cursor: grabbing; transform: scale(1.06); }
.bubble.pressing { transform: scale(.94); transition: transform .5s; }
.toast { position: fixed; z-index: 2147483647; left: 50%; bottom: 24px; transform: translateX(-50%); background: #0a0a0b; color: #f3f2ee;
  padding: 10px 16px; border-radius: 999px; max-width: min(420px, calc(100vw - 32px)); }
.card { position: fixed; z-index: 2147483647; width: 304px; max-width: calc(100vw - 24px); max-height: calc(100vh - 24px); overflow: auto;
  background: var(--ground); border: 1px solid var(--rule); border-radius: 20px; padding: 14px; box-shadow: 0 8px 28px rgba(0,0,0,.35); font-weight: 500; }
.card header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; font-weight: 800; font-size: 15px; }
.card header .close { margin-left: auto; border: 0; background: transparent; min-width: 32px; min-height: 32px; border-radius: 999px; display: grid; place-items: center; }
.card header .close:hover { background: var(--soft); }
.line { list-style: none; display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; padding: 0; margin: 0 0 12px; font-size: 11px; font-weight: 650; color: var(--muted); }
.line li { display: flex; flex-direction: column; gap: 4px; border-top: 2px solid var(--rule); padding-top: 6px; }
.line li.done { color: var(--ink); border-color: var(--ink); }
.line .n { font-variant-numeric: tabular-nums; display: inline-flex; align-items: center; gap: 3px; }
.line svg { width: 12px; height: 12px; }
.claim { font-size: 15px; font-weight: 650; margin: 0 0 6px; }
.author, .muted { color: var(--muted); font-size: 12px; margin: 0 0 10px; }
.verdict { border: 1.5px solid; border-radius: 14px; padding: 10px 12px; margin: 0 0 10px; }
.verdict h3 { display: flex; align-items: center; gap: 6px; margin: 0 0 4px; font-size: 15px; font-weight: 800; }
.verdict p { margin: 0; color: var(--ink); font-size: 12px; }
.verdict .k { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: inherit; margin-bottom: 2px; }
.empty { border: 1px dashed var(--edge); border-radius: 14px; padding: 10px 12px; margin: 0 0 10px; }
.empty h3 { margin: 0 0 4px; font-size: 14px; display: flex; gap: 6px; align-items: center; }
.empty p { margin: 0; color: var(--muted); font-size: 12px; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 10px; }
.chip { display: inline-flex; gap: 4px; align-items: center; border: 1px solid var(--edge); border-radius: 6px; padding: 2px 8px; font-size: 12px; font-weight: 650; }
.frame { width: 100%; height: 160px; border-radius: 12px; display: block; margin: 0 0 4px; object-fit: cover; background: var(--soft); }
.see { width: 100%; min-height: 44px; border-radius: 999px; border: 1px solid #0a0a0b; background: #0a0a0b; color: #f3f2ee; font-weight: 700; margin-top: 4px; }
.see:hover { background: #1f1f22; }
@media (prefers-color-scheme: dark) { .see { background: #f3f2ee; color: #0a0a0b; border-color: #f3f2ee; } .see:hover { background: #e2e1da; } }
.reading { color: var(--muted); margin: 0 0 10px; }
`;

let sheet: CSSStyleSheet | null = null;

/** A host element with a closed shadow root carrying our styles. */
export function mount(tag: string): { host: HTMLElement; root: HTMLElement } {
  const host = document.createElement(tag);
  host.setAttribute("data-checky", "");
  const shadow = host.attachShadow({ mode: "closed" });
  if (!sheet) { sheet = new CSSStyleSheet(); sheet.replaceSync(CSS); }
  shadow.adoptedStyleSheets = [sheet];
  const root = document.createElement("div");
  root.className = "w";
  shadow.append(root);
  return { host, root };
}

type Child = Node | string | false | null | undefined;
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  for (const child of children) if (child) node.append(child);
  return node;
}

const parser = new DOMParser();
/** Our own bundled Phosphor icon, never page or server markup. */
export function icon(name: IconName): SVGSVGElement {
  const svg = parser.parseFromString(SVG[name], "image/svg+xml").documentElement as unknown as SVGSVGElement;
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  return document.importNode(svg, true);
}

/** The Checky mark: a light disc and two lines on ink, as in the extension icon. */
export function mark(): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 32 32");
  svg.setAttribute("aria-hidden", "true");
  const shapes: [string, Record<string, string>][] = [
    ["circle", { cx: "11", cy: "11", r: "5" }],
    ["rect", { x: "18", y: "8.5", width: "9", height: "3", rx: "1" }],
    ["rect", { x: "5", y: "18", width: "22", height: "3", rx: "1" }],
    ["rect", { x: "5", y: "23.5", width: "14", height: "3", rx: "1" }],
  ];
  for (const [tag, attrs] of shapes) {
    const shape = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attrs)) shape.setAttribute(key, value);
    shape.setAttribute("fill", "#f3f2ee");
    svg.append(shape);
  }
  return svg;
}

export function disc(): HTMLElement { return h("span", { class: "mark" }, mark()); }

/** One row of badges for a post: the signed verdict first (icon + word), then the watched words. */
export function badges(verdicts: KnownVerdict[], words: string[], open: () => void): HTMLElement {
  const row = h("div", { class: "badges" });
  const best = verdicts[0];
  if (best) {
    const label = t.watch.badgeKnown(t.verdicts[best.verdict]);
    const node = h("button", { type: "button", class: `badge v ${best.verdict}`, title: t.watch.badgeOpen, "aria-label": `${label}. ${t.watch.badgeOpen}` }, disc(), icon(VERDICT_ICON[best.verdict]), h("span", {}, label));
    node.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); open(); });
    row.append(node);
  }
  for (const word of words.slice(0, 3)) {
    const label = t.watch.badgeWord(word);
    const node = h("button", { type: "button", class: "badge", title: t.watch.badgeOpen, "aria-label": `${label}. ${t.watch.badgeOpen}` }, best ? icon("eye") : disc(), h("span", {}, label));
    node.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); open(); });
    row.append(node);
  }
  return row;
}

export function toast(text: string): void {
  const { host, root } = mount("checky-toast");
  root.append(h("div", { class: "toast", role: "status" }, text));
  document.documentElement.append(host);
  setTimeout(() => host.remove(), 3500);
}
