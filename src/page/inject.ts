/**
 * Everything Checky does inside a web page, injected on demand with `chrome.scripting.executeScript`
 * under `activeTab` (the right-click or the toolbar click on that tab). There is no content script:
 * nothing runs on a page until the person acts on it, and only in that tab.
 *
 * `checkyPage` is serialised by Chrome, so it must stay self-contained: no imports, no outer
 * variables, no helpers defined outside it. Page text is only read as text (`innerText`) and every
 * node is built with DOM APIs inside a closed shadow root; no HTML from the page, a model or the API
 * is ever parsed. It never submits a form or presses a button except Facebook's « Commenter », to
 * open the comment box: the journalist always sends.
 */
import type { CardModel } from "../lib/answer.ts";

export type Glyph = { d: string; opacity?: string }[];
export type Glyphs = Record<"check" | "x" | "warning" | "question" | "eye" | "seal", Glyph>;
export type ScannedPost = { key: string; text: string };
export type PageCommand =
  | { op: "anchor" }
  | { op: "card"; card: CardModel; glyphs: Glyphs }
  | { op: "reply"; text: string }
  | { op: "scan" }
  | { op: "badges"; marks: { key: string; label: string; card: CardModel }[]; glyphs: Glyphs }
  | { op: "clear" }
  | { op: "dot"; on: boolean; label: string };
export type PageResult =
  | { ok: true; host?: "facebook" | "tiktok" | "other"; posts?: ScannedPost[]; reply?: "filled" | "no_box" | "no_anchor" }
  | { ok: false; reason: string };

export async function checkyPage(command: PageCommand): Promise<PageResult> {
  type State = { range?: Range; top?: number; left?: number; dot?: (event: MouseEvent) => void; next: number };
  const scope = globalThis as unknown as { __checky?: State };
  const state: State = scope.__checky || (scope.__checky = { next: 1 });
  const NS = "http://www.w3.org/2000/svg";
  const host = location.hostname.replace(/^www\.|^m\.|^web\./, "");
  const site = /(^|\.)facebook\.com$/.test(host) ? "facebook" : /(^|\.)tiktok\.com$/.test(host) ? "tiktok" : "other";

  const CSS = `
:host { all: initial; }
.c { --ground:#f3f2ee; --ink:#0a0a0b; --paper:#fbfaf7; --soft:#e9e8e2; --muted:#55544e; --rule:#dcdbd5; --edge:#8f8e88;
  --true-soft:#e1f3e8; --true-ink:#0b6b3a; --false-soft:#fbe3e0; --false-ink:#b3231a; --misleading-soft:#f9ecd2; --misleading-ink:#8a5700; --unverifiable-soft:#e0eafb; --unverifiable-ink:#1d58c4;
  box-sizing:border-box; font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; color:var(--ink); background:var(--paper);
  border:1px solid var(--ink); border-radius:16px; padding:12px 14px; max-width:380px; text-align:left; letter-spacing:normal; }
@media (prefers-color-scheme: dark) { .c { --ground:#0a0a0b; --ink:#f3f2ee; --paper:#111113; --soft:#19191c; --muted:#a6a5a0; --rule:#2a2a2d; --edge:#6d6c68;
  --true-soft:#0f2219; --true-ink:#3ddc84; --false-soft:#2a1311; --false-ink:#ff6a5f; --misleading-soft:#29200c; --misleading-ink:#ffb224; --unverifiable-soft:#101a2b; --unverifiable-ink:#6aa8ff; } }
.c * { box-sizing:border-box; }
header { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:6px; }
header strong { font-size:16px; font-weight:800; letter-spacing:-.02em; }
button { font:inherit; color:var(--ink); background:var(--paper); border:1px solid var(--edge); border-radius:999px; min-height:32px; padding:4px 12px; cursor:pointer; font-weight:650; display:inline-flex; align-items:center; gap:6px; }
button:hover { background:var(--soft); }
button:focus-visible, a:focus-visible { outline:2px solid var(--ink); outline-offset:2px; }
button.x { border-color:transparent; min-width:32px; padding:4px; justify-content:center; }
button.act { background:var(--ink); color:var(--ground); border-color:var(--ink); margin-top:8px; }
p { margin:0 0 8px; }
.status { color:var(--muted); font-size:13px; }
section { border-top:1px solid var(--rule); padding-top:8px; margin-top:8px; }
h3 { font-size:12px; text-transform:uppercase; letter-spacing:.04em; margin:0 0 6px; color:var(--muted); font-weight:700; }
ul { list-style:none; margin:0; padding:0; display:grid; gap:6px; }
li { display:grid; gap:2px; overflow-wrap:anywhere; }
small { color:var(--muted); font-size:12.5px; }
a { color:inherit; text-underline-offset:3px; font-weight:650; font-size:13px; }
svg { width:18px; height:18px; flex:0 0 auto; }
.chip { display:inline-flex; align-items:center; gap:6px; font-weight:800; font-size:15px; padding:2px 10px 2px 6px; border-radius:999px; justify-self:start; }
.v { padding:8px 10px; border-radius:12px; border:2px solid currentColor; }
.reading .v { border-style:dashed; }
.true { background:var(--true-soft); color:var(--true-ink); } .false { background:var(--false-soft); color:var(--false-ink); }
.misleading { background:var(--misleading-soft); color:var(--misleading-ink); } .unverifiable { background:var(--unverifiable-soft); color:var(--unverifiable-ink); }
.v small, .v span { color:var(--ink); }
.tone li span { font-weight:650; }
.note { margin-top:8px; font-size:13px; font-weight:650; }
.badge { min-height:28px; font-size:12.5px; padding:2px 10px 2px 6px; }
.dot { width:22px; height:22px; min-height:22px; padding:0; border-radius:50%; border:2px solid var(--ground); background:var(--ink); }
`;

  function glyph(paths: Glyph | undefined): SVGSVGElement {
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 256 256");
    svg.setAttribute("fill", "currentColor");
    svg.setAttribute("aria-hidden", "true");
    for (const part of paths || []) {
      const path = document.createElementNS(NS, "path");
      path.setAttribute("d", part.d);
      if (part.opacity) path.setAttribute("opacity", part.opacity);
      svg.append(path);
    }
    return svg;
  }
  function node<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text;
    return el;
  }
  function safeUrl(raw?: string): string | null {
    try { const url = new URL(raw || ""); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
  }
  function shadow(tag: string): [HTMLElement, ShadowRoot] {
    const el = document.createElement(tag);
    el.setAttribute("data-checky", "");
    const root = el.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = CSS;
    root.append(style);
    return [el, root];
  }
  const ICONS: Record<string, keyof Glyphs> = { true: "check", false: "x", misleading: "warning", unverifiable: "question" };

  function anchorElement(): Element | null {
    const container = state.range?.commonAncestorContainer;
    return container ? (container instanceof Element ? container : container.parentElement) : null;
  }

  async function fill(text: string): Promise<"filled" | "no_box" | "no_anchor"> {
    const isBox = (el: Element | null): el is HTMLElement => !!el && el instanceof HTMLElement && el.isContentEditable;
    let box: HTMLElement | null = isBox(document.activeElement) ? document.activeElement : null;
    if (!box) {
      const from = anchorElement();
      if (!from || !from.isConnected) return "no_anchor";
      const post = from.closest('[role="article"]') || from.closest('[data-pagelet*="FeedUnit"]') || from.parentElement;
      const find = () => [...(post?.querySelectorAll('[contenteditable="true"]') || [])].find(isBox) || null;
      box = find();
      if (!box && post) {
        const opener = [...post.querySelectorAll<HTMLElement>('[role="button"], button')].find((b) => /^(commenter|comment|écrire un commentaire|laisser un commentaire)/i.test((b.getAttribute("aria-label") || b.textContent || "").trim()));
        opener?.click();
        for (let i = 0; i < 30 && !box; i++) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          box = find() || (isBox(document.activeElement) ? document.activeElement : null);
        }
      }
    }
    if (!box) return "no_box";
    box.focus();
    const selection = getSelection();
    selection?.selectAllChildren(box);
    selection?.collapseToEnd();
    const before = box.textContent || "";
    // Facebook's editor follows the browser's own editing events; a paste is its fallback.
    document.execCommand("insertText", false, text);
    if ((box.textContent || "") === before) {
      const data = new DataTransfer();
      data.setData("text/plain", text);
      box.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    }
    return (box.textContent || "") !== before ? "filled" : "no_box";
  }

  function draw(root: ShadowRoot, card: CardModel, glyphs: Glyphs, onClose: () => void): void {
    root.querySelector(".c")?.remove();
    const wrap = node("div", "c");
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-label", card.labels.name);
    const close = node("button", "x");
    close.type = "button";
    close.setAttribute("aria-label", card.labels.close);
    close.append(glyph(glyphs.x));
    close.addEventListener("click", onClose);
    const title = node("strong", "", card.labels.name);
    const head = node("header");
    head.append(title, close);
    wrap.append(head);
    if (card.status) wrap.append(node("p", "status", card.status));
    for (const section of card.sections) {
      const block = node("section", section.kind);
      const list = node("ul");
      block.append(node("h3", "", section.title), list);
      for (const item of section.items) {
        const li = node("li");
        const target: HTMLElement = item.verdict ? node("div", `v ${item.verdict}`) : li;
        if (item.verdict) {
          const chip = node("span", `chip ${item.verdict}`);
          chip.append(glyph(glyphs[ICONS[item.verdict] || "question"]), document.createTextNode(item.word || ""));
          target.append(chip);
          li.append(target);
        } else if (section.kind === "tone") target.append(glyph(glyphs.warning));
        target.append(node("span", "", item.text));
        if (item.detail) target.append(node("small", "", item.detail));
        const url = safeUrl(item.url);
        if (url && item.link) {
          const a = node("a", "", item.link);
          a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer"; a.referrerPolicy = "no-referrer";
          target.append(a);
        }
        if (section.kind === "tone") { li.style.display = "flex"; li.style.flexWrap = "wrap"; li.style.gap = "4px 8px"; li.style.alignItems = "baseline"; }
        list.append(li);
      }
      wrap.append(block);
    }
    if (card.reply && site === "facebook") {
      const reply = card.reply;
      const act = node("button", "act", reply.label);
      act.type = "button";
      const note = node("p", "note");
      note.setAttribute("role", "status");
      act.addEventListener("click", () => { void fill(reply.text).then((r) => { note.textContent = r === "filled" ? reply.done : r === "no_box" ? reply.noBox : reply.noAnchor; }); });
      wrap.append(act, note);
    }
    root.append(wrap);
  }

  function visible(el: Element): boolean {
    const box = el.getBoundingClientRect();
    return box.height > 0 && box.bottom > 0 && box.top < innerHeight;
  }

  try {
    switch (command.op) {
      case "anchor": {
        const selection = getSelection();
        if (!selection || !selection.rangeCount || selection.isCollapsed) return { ok: false, reason: "no_selection" };
        state.range = selection.getRangeAt(0).cloneRange();
        const box = state.range.getBoundingClientRect();
        state.top = box.bottom + scrollY + 8;
        state.left = box.left + scrollX;
        return { ok: true, host: site };
      }
      case "card": {
        if (state.top === undefined || state.left === undefined) return { ok: false, reason: "no_anchor" };
        document.querySelector("checky-answer")?.remove();
        const [el, root] = shadow("checky-answer");
        const width = Math.min(380, document.documentElement.clientWidth - 16);
        el.style.cssText = `position:absolute;z-index:2147483646;display:block;width:${width}px;top:${state.top}px;left:${Math.max(8, Math.min(state.left, scrollX + document.documentElement.clientWidth - width - 8))}px`;
        draw(root, command.card, command.glyphs, () => el.remove());
        document.body.append(el);
        return { ok: true, host: site };
      }
      case "reply":
        return { ok: true, host: site, reply: site === "facebook" ? await fill(command.text) : "no_box" };
      case "scan": {
        if (site === "other") return { ok: true, host: site, posts: [] };
        const containers = site === "facebook"
          ? [...document.querySelectorAll('[role="article"]')].filter((a) => !a.parentElement?.closest('[role="article"]'))
          : [...new Set([...document.querySelectorAll('[data-e2e="browse-video-desc"], [data-e2e="video-desc"], [data-e2e="search-card-video-caption"], [data-e2e="user-post-item-desc"]')].map((d) => d.closest('article, [data-e2e="recommend-list-item-container"]') || d.parentElement || d))];
        const posts: ScannedPost[] = [];
        for (const el of containers) {
          if (!(el instanceof HTMLElement) || !visible(el)) continue;
          const text = (el.innerText || "").replace(/\s+/g, " ").trim().slice(0, 1500);
          if (text.length < 15) continue;
          el.dataset.checkyPost ||= String(state.next++);
          posts.push({ key: el.dataset.checkyPost, text });
          if (posts.length >= 20) break;
        }
        return { ok: true, host: site, posts };
      }
      case "badges": {
        for (const mark of command.marks) {
          const post = document.querySelector(`[data-checky-post="${keyOf(mark.key)}"]`);
          if (!post || post.querySelector(":scope > checky-badge")) continue;
          const [el, root] = shadow("checky-badge");
          el.style.cssText = "display:block;margin:6px 8px;position:relative;z-index:2";
          const badge = node("button", "badge");
          badge.type = "button";
          badge.setAttribute("aria-expanded", "false");
          badge.append(glyph(command.glyphs.eye), document.createTextNode(mark.label));
          const holder = node("div");
          const wrap = node("div", "c");
          wrap.style.cssText = "border:none;padding:0;background:transparent";
          wrap.append(badge, holder);
          root.append(wrap);
          const glyphs = command.glyphs;
          badge.addEventListener("click", (event) => {
            event.stopPropagation();
            const open = badge.getAttribute("aria-expanded") === "true";
            badge.setAttribute("aria-expanded", String(!open));
            if (open) { holder.replaceChildren(); return; }
            const sub = document.createElement("div");
            holder.replaceChildren(sub);
            const subRoot = sub.attachShadow({ mode: "closed" });
            const style = document.createElement("style");
            style.textContent = CSS;
            subRoot.append(style);
            draw(subRoot, mark.card, glyphs, () => { holder.replaceChildren(); badge.setAttribute("aria-expanded", "false"); });
            // The card's links and buttons are its own; the post underneath must not open.
            sub.addEventListener("click", (e) => e.stopPropagation());
          });
          post.prepend(el);
        }
        return { ok: true, host: site };
      }
      case "clear": {
        document.querySelectorAll("[data-checky]").forEach((el) => el.remove());
        document.querySelectorAll("[data-checky-post]").forEach((el) => el.removeAttribute("data-checky-post"));
        if (state.dot) document.removeEventListener("mouseup", state.dot, true);
        state.dot = undefined;
        return { ok: true, host: site };
      }
      case "dot": {
        if (state.dot) document.removeEventListener("mouseup", state.dot, true);
        state.dot = undefined;
        document.querySelector("checky-dot")?.remove();
        if (!command.on) return { ok: true, host: site };
        const label = command.label;
        state.dot = (event: MouseEvent) => {
          if ((event.target as Element | null)?.closest?.("checky-dot")) return;
          setTimeout(() => {
            document.querySelector("checky-dot")?.remove();
            const selection = getSelection();
            const text = selection?.toString().trim() || "";
            if (!selection || !selection.rangeCount || text.length < 12) return;
            const range = selection.getRangeAt(0).cloneRange();
            const box = range.getBoundingClientRect();
            const [el, root] = shadow("checky-dot");
            el.style.cssText = `position:absolute;z-index:2147483646;display:block;top:${box.bottom + scrollY + 4}px;left:${box.right + scrollX + 4}px`;
            const button = node("button", "dot");
            button.type = "button";
            button.title = label;
            button.setAttribute("aria-label", label);
            const wrap = node("div", "c");
            wrap.style.cssText = "border:none;padding:0;background:transparent";
            wrap.append(button);
            root.append(wrap);
            // Keep the selection: a press on the dot must not clear it.
            button.addEventListener("mousedown", (e) => e.preventDefault());
            button.addEventListener("click", () => {
              state.range = range;
              state.top = box.bottom + scrollY + 8;
              state.left = box.left + scrollX;
              el.remove();
              void chrome.runtime.sendMessage({ type: "checky:selection", text: text.slice(0, 6000) });
            });
            document.body.append(el);
          }, 10);
        };
        document.addEventListener("mouseup", state.dot, true);
        return { ok: true, host: site };
      }
    }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.name : "failed" };
  }
  function keyOf(value: string): string { return value.replace(/[^\w-]/g, ""); }
}
