export const MAX_TEXT = 6000;
export const CAPTURE_TTL = 15 * 60 * 1000;
/** The API's limits for an image sent as a file, checked here so a refused file never leaves. */
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export type Mode = "text" | "link" | "image";
export type Capture = {
  id: string;
  kind: Mode;
  text: string;
  url: string;
  pageUrl: string;
  createdAt: number;
  truncated: boolean;
};

/** Keeps both ends of a long string (a URL's host and tail) and elides the middle. */
export function middleTruncate(text: string, max = 48): string {
  if (text.length <= max) return text;
  const head = Math.ceil((max - 1) * 0.6), tail = max - 1 - head;
  return `${text.slice(0, head)}…${text.slice(text.length - tail)}`;
}

/** Never launch browser-internal URLs, data URLs or credentials from page/model content. */
export function httpUrl(raw: string): string | null {
  if (raw.length > 2000) return null;
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

export function captureFromMenu(info: { menuItemId: string | number; selectionText?: string; srcUrl?: string; linkUrl?: string; pageUrl?: string }): Capture | null {
  const kind = info.menuItemId === "fanilo-text" ? "text" : info.menuItemId === "fanilo-image" ? "image" : info.menuItemId === "fanilo-link" ? "link" : null;
  if (!kind) return null;
  const text = kind === "text" ? (info.selectionText || "").trim() : "";
  const url = kind === "image" ? httpUrl(info.srcUrl || "") : kind === "link" ? httpUrl(info.linkUrl || "") : "";
  if ((kind === "text" && !text) || (kind !== "text" && !url)) return null;
  return { id: crypto.randomUUID(), kind, text: text.slice(0, MAX_TEXT), url: url || "", pageUrl: httpUrl(info.pageUrl || "") || "", createdAt: Date.now(), truncated: text.length > MAX_TEXT };
}

export function validCapture(value: unknown, now = Date.now()): value is Capture {
  if (!value || typeof value !== "object") return false;
  const c = value as Partial<Capture>;
  return typeof c.id === "string" && ["text", "link", "image"].includes(c.kind || "")
    && typeof c.text === "string" && c.text.length <= MAX_TEXT && typeof c.url === "string"
    && typeof c.pageUrl === "string" && typeof c.truncated === "boolean"
    && typeof c.createdAt === "number" && now >= c.createdAt && now - c.createdAt < CAPTURE_TTL
    && (!c.pageUrl || !!httpUrl(c.pageUrl))
    && (c.kind === "text" ? !!c.text.trim() : !!httpUrl(c.url));
}

/** Keep the selected passage separate: fetching the whole page would analyze other claims. */
export function checkBody(mode: Mode, text: string, url: string): { text?: string; url?: string } {
  if (mode === "text") {
    const selected = text.trim();
    if (!selected || selected.length > MAX_TEXT) throw new Error("invalid");
    return { text: selected };
  }
  const safe = httpUrl(url.trim());
  if (!safe) throw new Error("invalid");
  return { url: safe };
}

export function hostname(raw: string): string {
  try { return new URL(raw).hostname.replace(/^www\./, ""); } catch { return raw; }
}

export function imageFileProblem(file: { type: string; size: number }): "type" | "empty" | "size" | null {
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) return "type";
  if (!file.size) return "empty";
  if (file.size > MAX_IMAGE_BYTES) return "size";
  return null;
}
