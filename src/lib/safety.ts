export const MAX_TEXT = 6000;
export const CAPTURE_TTL = 15 * 60 * 1000;
/** The API's limits for an image sent as a file, checked here so a refused file never leaves. */
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export type Mode = "text" | "link" | "image";
/** What the right-click asked for: a check, a communiqué against the registry, whether a page is
 * an institution's declared one, or the signed démenti to answer a Facebook post with. */
export type Intent = "check" | "communique" | "page" | "reply";
export const INTENTS: readonly Intent[] = ["check", "communique", "page", "reply"];
export type Capture = {
  id: string;
  kind: Mode;
  intent?: Intent;
  /** The tab and frame the right-click happened in, to place the answer there under `activeTab`. */
  tabId?: number;
  frameId?: number;
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

/** True for http(s) URLs and bare domain-plus-path strings; titles and queries are not. */
export function isUrlLabel(text: string): boolean {
  return /^https?:\/\/\S+$/i.test(text) || /^(www\.)?([a-z0-9-]+\.)+[a-z]{2,}\/\S*$/i.test(text);
}

const dateFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
/** An ISO timestamp as a French date, or the input untouched when it is not a date. */
export function frenchDate(iso: string): string {
  const time = Date.parse(iso);
  return Number.isNaN(time) ? iso : dateFormat.format(time);
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

const MENUS: Record<string, { intent: Intent; kind?: Mode }> = {
  "fanilo-text": { intent: "check", kind: "text" },
  "fanilo-image": { intent: "check", kind: "image" },
  "fanilo-link": { intent: "check", kind: "link" },
  "fanilo-communique": { intent: "communique" },
  "fanilo-page": { intent: "page", kind: "link" },
  "fanilo-reply": { intent: "reply", kind: "text" },
};

type MenuInfo = { menuItemId: string | number; selectionText?: string; srcUrl?: string; linkUrl?: string; pageUrl?: string; frameId?: number };

export function captureFromMenu(info: MenuInfo, tabId?: number): Capture | null {
  const menu = MENUS[String(info.menuItemId)];
  if (!menu) return null;
  // « Vérifier ce communiqué » takes a selection or an image, whichever was right-clicked.
  const kind: Mode = menu.kind || (info.selectionText?.trim() ? "text" : "image");
  const text = kind === "text" ? (info.selectionText || "").trim() : "";
  const url = kind === "image" ? httpUrl(info.srcUrl || "") : kind === "link" ? httpUrl(info.linkUrl || "") : "";
  if ((kind === "text" && !text) || (kind !== "text" && !url)) return null;
  return {
    id: crypto.randomUUID(), kind, intent: menu.intent, text: text.slice(0, MAX_TEXT), url: url || "", pageUrl: httpUrl(info.pageUrl || "") || "", createdAt: Date.now(), truncated: text.length > MAX_TEXT,
    ...(Number.isInteger(tabId) && tabId! >= 0 ? { tabId, frameId: Number.isInteger(info.frameId) && info.frameId! >= 0 ? info.frameId : 0 } : {}),
  };
}

const optionalId = (value: unknown) => value === undefined || (Number.isInteger(value) && (value as number) >= 0);

export function validCapture(value: unknown, now = Date.now()): value is Capture {
  if (!value || typeof value !== "object") return false;
  const c = value as Partial<Capture>;
  return typeof c.id === "string" && ["text", "link", "image"].includes(c.kind || "")
    && typeof c.text === "string" && c.text.length <= MAX_TEXT && typeof c.url === "string"
    && typeof c.pageUrl === "string" && typeof c.truncated === "boolean"
    && (c.intent === undefined || INTENTS.includes(c.intent)) && optionalId(c.tabId) && optionalId(c.frameId)
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
