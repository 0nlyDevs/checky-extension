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
  return node;
}

export type Icon = "check" | "help" | "alert" | "cross" | "external" | "image";
const shapes: Record<Icon, string[]> = {
  check: ["M20 12a8 8 0 1 1-5-7.4", "m8 11 3 3 9-9"],
  help: ["M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0", "M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4", "M12 16h.01"],
  alert: ["m12 3 10 18H2L12 3Z", "M12 9v5", "M12 17h.01"],
  cross: ["M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0", "m9 9 6 6m0-6-6 6"],
  external: ["M14 3h7v7m0-7L10 14", "M10 3H4v17h17v-7"],
  image: ["M3 3h18v18H3Z", "m3 17 6-6 5 5 3-3 4 4", "M16 7h.01"],
};

export function icon(name: Icon): SVGSVGElement {
  const node = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  for (const [key, value] of Object.entries({ viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.8", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", focusable: "false" })) node.setAttribute(key, value);
  for (const d of shapes[name]) { const path = document.createElementNS(node.namespaceURI, "path"); path.setAttribute("d", d); node.append(path); }
  return node;
}
