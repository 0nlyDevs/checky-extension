// « Veille sur la page »: pure helpers shared by the background, the content script and the panel.
// Nothing here touches the DOM or the network, so `node --test` covers it.

export type WatchSite = "facebook" | "tiktok";
export type Scope = "tab" | "site";
/** What the journalist switched on, kept in `storage.session` (gone when the browser closes). */
export type WatchState = { tabs: number[]; sites: WatchSite[] };
export const STATE_KEY = "watch:state";
export const WORDS_KEY = "watch:words";
export const BUBBLE_KEY = "watch:bubble-hidden";
export const CARD_KEY = (windowId: number) => `watch-card:${windowId}`;
export const SCRIPT = "watch.js";

/** Only these hosts, asked through `optional_host_permissions` when the journalist turns it on. */
export const WATCH_ORIGINS: Record<WatchSite, string[]> = {
  facebook: ["https://*.facebook.com/*"],
  tiktok: ["https://*.tiktok.com/*"],
};
export const ALL_WATCH_ORIGINS = [...WATCH_ORIGINS.facebook, ...WATCH_ORIGINS.tiktok];

export function emptyState(): WatchState { return { tabs: [], sites: [] }; }

export function validState(value: unknown): WatchState {
  const v = (value && typeof value === "object" ? value : {}) as Partial<WatchState>;
  return {
    tabs: Array.isArray(v.tabs) ? [...new Set(v.tabs.filter((id) => Number.isInteger(id) && id >= 0))] : [],
    sites: Array.isArray(v.sites) ? [...new Set(v.sites.filter((s): s is WatchSite => s === "facebook" || s === "tiktok"))] : [],
  };
}

/** The watched site a page belongs to, from its URL; HTTPS only. */
export function siteOf(raw: string | undefined): WatchSite | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    const host = url.hostname;
    if (host === "facebook.com" || host.endsWith(".facebook.com")) return "facebook";
    if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return "tiktok";
  } catch { /* not a URL */ }
  return null;
}

export function watching(state: WatchState, tabId: number | undefined, url: string | undefined): boolean {
  const site = siteOf(url);
  return !!site && tabId !== undefined && (state.sites.includes(site) || state.tabs.includes(tabId));
}

/** Lower case, accents removed: the same folding as the API's `fold`. */
export function fold(text: string): string {
  return (text || "").normalize("NFKD").toLowerCase().replace(/\p{M}/gu, "").trim();
}

function escape(text: string): string { return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

/** Whole words, accents and case ignored, a plural s/x allowed: the API's `mentions`. */
export function mentions(word: string, text: string): boolean {
  const folded = fold(word);
  if (folded.length < 2) return false;
  return new RegExp(`(?<![a-z0-9])${escape(folded)}(?:s|x)?(?![a-z0-9])`).test(fold(text));
}

export function watchedIn(words: readonly string[], text: string): string[] {
  return words.filter((word) => mentions(word, text));
}

/** Collapse whitespace and keep a bounded, readable passage of what is on screen. */
export function visibleText(raw: string, max = 1500): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, max);
}

/** Enough words to compare with published verdicts; one-liners like « Trop fort 😂 » are skipped. */
export function worthMatching(text: string): boolean {
  return text.length >= 25 && (fold(text).match(/[a-z0-9]{3,}/g) || []).length >= 4;
}

/** A short, stable key for caching a passage's result (FNV-1a over the folded text). */
export function textKey(text: string): string {
  let hash = 0x811c9dc5;
  for (const char of fold(text)) { hash ^= char.codePointAt(0)!; hash = Math.imul(hash, 0x01000193) >>> 0; }
  return hash.toString(36);
}

export type KnownVerdict = {
  id: string; ref: string | null; title: string; verdict: "true" | "misleading" | "false" | "unverifiable";
  reason: string | null; newsroom: string; date: string; score: number;
};
type Match = { score: number; verdict: { id: string; ref: string | null; title: string; verdict: string; reason: string | null; newsroom: { name: string }; published_at: string; signed_at?: string | null } };
const VERDICTS = ["true", "misleading", "false", "unverifiable"] as const;

/** The published verdicts close enough to badge a post: stricter than `/public/match`'s own 0.4. */
export function knownVerdicts(matches: unknown, threshold = 0.5): KnownVerdict[] {
  if (!Array.isArray(matches)) return [];
  return (matches as Match[]).filter((m) => m && typeof m.score === "number" && m.score >= threshold && m.verdict
    && (VERDICTS as readonly string[]).includes(m.verdict.verdict) && typeof m.verdict.id === "string")
    .map((m) => ({
      id: m.verdict.id, ref: m.verdict.ref ?? null, title: String(m.verdict.title || ""),
      verdict: m.verdict.verdict as KnownVerdict["verdict"], reason: m.verdict.reason ?? null,
      newsroom: String(m.verdict.newsroom?.name || ""), date: m.verdict.signed_at || m.verdict.published_at, score: m.score,
    }));
}

/** At most `limit` calls in any `windowMs`: a page that scrolls forever cannot flood the API. */
export class Budget {
  private calls: number[] = [];
  private readonly limit: number;
  private readonly windowMs: number;
  constructor(limit: number, windowMs: number) { this.limit = limit; this.windowMs = windowMs; }
  take(now = Date.now()): boolean {
    this.calls = this.calls.filter((time) => now - time < this.windowMs);
    if (this.calls.length >= this.limit) return false;
    this.calls.push(now);
    return true;
  }
}

/** A small least-recently-used map, so a post seen twice is matched once. */
export class Lru<V> {
  private map = new Map<string, V>();
  private readonly size: number;
  constructor(size: number) { this.size = size; }
  get(key: string): V | undefined {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key)!;
    this.map.delete(key); this.map.set(key, value);
    return value;
  }
  has(key: string): boolean { return this.map.has(key); }
  set(key: string, value: V): void {
    this.map.delete(key); this.map.set(key, value);
    while (this.map.size > this.size) this.map.delete(this.map.keys().next().value!);
  }
}

/** A TikTok video page, the only kind of URL sent to TikTok's public oEmbed. */
export function tiktokVideoUrl(raw: string | undefined | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || !(url.hostname === "tiktok.com" || url.hostname.endsWith(".tiktok.com"))) return null;
    const path = /^\/@[\w.-]{1,40}\/(video|photo)\/\d{5,25}\/?$/.exec(url.pathname);
    return path ? `https://www.tiktok.com${url.pathname}` : null;
  } catch { return null; }
}

export function oembedUrl(video: string): string {
  return `https://www.tiktok.com/oembed?url=${encodeURIComponent(video)}`;
}

/** The caption's first sentence, without hashtags or mentions: what the reel claims, in short. */
export function mainClaim(caption: string, max = 180): string {
  const clean = caption.replace(/(^|\s)[#@][\p{L}\p{N}_.]+/gu, " ").replace(/\s+/g, " ").trim();
  const sentence = /^(.{20,}?[.!?…])(\s|$)/u.exec(clean)?.[1] || clean;
  return sentence.length > max ? `${sentence.slice(0, max - 1).trimEnd()}…` : sentence;
}

/** What goes from a badge or the bubble to the side panel. The frame never leaves the browser. */
export type WatchCard = {
  id: string; createdAt: number; site: WatchSite; text: string; pageUrl: string; author: string;
  words: string[]; verdicts: KnownVerdict[]; frame: string;
};
const CARD_TTL = 15 * 60 * 1000;

export function validCard(value: unknown, now = Date.now()): value is WatchCard {
  if (!value || typeof value !== "object") return false;
  const c = value as Partial<WatchCard>;
  return typeof c.id === "string" && typeof c.createdAt === "number" && now >= c.createdAt && now - c.createdAt < CARD_TTL
    && (c.site === "facebook" || c.site === "tiktok") && typeof c.text === "string" && c.text.length <= 6000
    && typeof c.pageUrl === "string" && typeof c.author === "string" && c.author.length <= 120
    && Array.isArray(c.words) && c.words.every((w) => typeof w === "string")
    && Array.isArray(c.verdicts) && typeof c.frame === "string"
    && (!c.frame || (c.frame.startsWith("data:image/jpeg;base64,") && c.frame.length < 1_500_000));
}
