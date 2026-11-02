/** Run Checky's page function in one tab, under the `activeTab` grant the person gave it. */
import { checkyPage } from "../page/inject.ts";
import type { Glyphs, PageCommand, PageResult } from "../page/inject.ts";

export async function inTab(tabId: number, command: PageCommand, frameId?: number): Promise<PageResult> {
  try {
    const [done] = await chrome.scripting.executeScript({ target: { tabId, ...(frameId ? { frameIds: [frameId] } : {}) }, func: checkyPage, args: [command] });
    return (done?.result as PageResult | undefined) || { ok: false, reason: "no_result" };
  } catch {
    // No grant on this tab (another tab, a navigation, a browser page): never retried silently.
    return { ok: false, reason: "no_access" };
  }
}

const GLYPHS: Record<keyof Glyphs, string> = { check: "check", x: "x", warning: "warning", question: "question", eye: "eye", seal: "seal-check" };

/** The panel's own sprite symbols as path data, so the page draws the same icons without
 * fetching anything or exposing an extension resource to the page. */
export function glyphs(doc: Document = document): Glyphs {
  const out = {} as Glyphs;
  for (const [key, name] of Object.entries(GLYPHS) as [keyof Glyphs, string][]) {
    out[key] = [...doc.querySelectorAll(`#ph-${name} path`)].map((path) => ({ d: path.getAttribute("d") || "", ...(path.getAttribute("opacity") ? { opacity: path.getAttribute("opacity")! } : {}) }));
  }
  return out;
}
