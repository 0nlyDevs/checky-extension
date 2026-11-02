import type { IconName } from "./icons.ts";

type Child = Node | string | false | null | undefined;

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string | boolean> = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (typeof value === "boolean") { if (value) node.setAttribute(key, ""); }
    else node.setAttribute(key, value);
  }
  for (const child of children) if (child !== null && child !== undefined && child !== false) node.append(child);
  return node;
}

export function button(text: string, action: () => void, attrs: Record<string, string | boolean> = {}): HTMLButtonElement {
  const node = el("button", { type: "button", ...attrs }, text);
  node.addEventListener("click", action);
  node.addEventListener("pointerdown", ripple);
  return node;
}

export type Icon = "check" | "help" | "alert" | "cross" | "external" | "image";
const names: Record<Icon, IconName> = { check: "check", help: "question", alert: "warning", cross: "x", external: "arrow-square-out", image: "image" };

export function icon(name: Icon): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const node = document.createElementNS(ns, "svg");
  node.setAttribute("aria-hidden", "true");
  node.setAttribute("focusable", "false");
  const use = document.createElementNS(ns, "use");
  use.setAttribute("href", `#ph-${names[name]}`);
  node.append(use);
  return node;
}

/** Press feedback: a circle grows from the pointer. Skipped when the user prefers reduced motion. */
export function ripple(event: PointerEvent): void {
  const target = event.currentTarget;
  if (!(target instanceof HTMLElement) || target.matches(":disabled") || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const box = target.getBoundingClientRect();
  const size = Math.max(box.width, box.height) * 2;
  const wave = el("span", { class: "ripple", "aria-hidden": "true" });
  wave.style.cssText = `width:${size}px;height:${size}px;left:${event.clientX - box.left - size / 2}px;top:${event.clientY - box.top - size / 2}px`;
  target.append(wave);
  wave.animate([{ transform: "scale(0)", opacity: 0.25 }, { transform: "scale(1)", opacity: 0 }], { duration: 450, easing: "ease-out" }).finished.then(() => wave.remove(), () => wave.remove());
}
