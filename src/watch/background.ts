// « Veille sur la page », service-worker side. The journalist's switch lives in `storage.session`;
// this module injects the reader into matching tabs, answers its batched match requests and opens
// the side panel on a badge or bubble click. Nothing runs on a tab the journalist did not choose.
import { ApiError, publicApi } from "../lib/api.ts";
import { httpUrl } from "../lib/safety.ts";
import type { Capture } from "../lib/safety.ts";
import {
  BUBBLE_KEY, Budget, CARD_KEY, knownVerdicts, Lru, oembedUrl, SCRIPT, siteOf, STATE_KEY, textKey, tiktokVideoUrl,
  validState, visibleText, watchedIn, watching, WORDS_KEY, worthMatching,
} from "../lib/watch.ts";
import type { KnownVerdict, WatchCard, WatchState } from "../lib/watch.ts";

type Post = { key: string; text: string };
type Message =
  | { type: "checky-watch:hello" }
  | { type: "checky-watch:match"; posts: Post[] }
  | { type: "checky-watch:open"; card: Omit<WatchCard, "id" | "createdAt" | "site" | "pageUrl"> & { link?: string } }
  | { type: "checky-watch:oembed"; url: string }
  | { type: "checky-watch:hide-bubble" };

const MAX_BATCH = 12;
// `/public/match` is cheap word overlap, but a feed never ends: 60 new passages per 5 minutes, two at a time.
const budget = new Budget(60, 5 * 60 * 1000);
const cache = new Lru<KnownVerdict[]>(400);
let inFlight = 0;
const waiting: (() => void)[] = [];

async function state(): Promise<WatchState> {
  return validState((await chrome.storage.session.get(STATE_KEY))[STATE_KEY]);
}

async function words(): Promise<string[]> {
  const stored = (await chrome.storage.session.get(WORDS_KEY))[WORDS_KEY] as { words?: unknown } | undefined;
  return Array.isArray(stored?.words) ? stored.words.filter((w): w is string => typeof w === "string").slice(0, 200) : [];
}

async function inject(tabId: number): Promise<void> {
  try { await chrome.scripting.executeScript({ target: { tabId }, files: [SCRIPT] }); }
  catch { /* No host permission yet, or a page the browser protects: nothing is read. */ }
}

async function stopIn(tabId: number): Promise<void> {
  try { await chrome.tabs.sendMessage(tabId, { type: "checky-watch:stop" }); } catch { /* not injected */ }
}

/** Bring every open tab in line with the switch: start where it is on, stop where it is off. */
async function sync(previous: WatchState, next: WatchState): Promise<void> {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id === undefined) continue;
    const was = watching(previous, tab.id, tab.url), now = watching(next, tab.id, tab.url);
    if (now && !was) await inject(tab.id);
    else if (was && !now) await stopIn(tab.id);
  }
}

async function limited<T>(task: () => Promise<T>): Promise<T> {
  if (inFlight >= 2) await new Promise<void>((resolve) => waiting.push(resolve));
  inFlight++;
  try { return await task(); } finally { inFlight--; waiting.shift()?.(); }
}

async function verdictsFor(text: string): Promise<KnownVerdict[] | "paused"> {
  const key = textKey(text);
  const known = cache.get(key);
  if (known) return known;
  if (!budget.take()) return "paused";
  try {
    const found = knownVerdicts(await limited(() => publicApi<unknown>("/public/match", { text: text.slice(0, 1200) }, AbortSignal.timeout(15_000))));
    cache.set(key, found);
    return found;
  } catch (error) {
    // A 422 (too short) is a real answer; a network or server failure is not cached.
    if (error instanceof ApiError && error.status === 422) cache.set(key, []);
    return [];
  }
}

async function match(posts: Post[]): Promise<{ results: { key: string; words: string[]; verdicts: KnownVerdict[] }[]; paused: boolean }> {
  const watched = await words();
  let paused = false;
  const results = await Promise.all(posts.slice(0, MAX_BATCH).map(async (post) => {
    const text = visibleText(String(post.text || ""));
    const found = worthMatching(text) ? await verdictsFor(text) : [];
    if (found === "paused") paused = true;
    return { key: String(post.key).slice(0, 40), words: watchedIn(watched, text), verdicts: found === "paused" ? [] : found };
  }));
  return { results, paused };
}

async function oembed(raw: string): Promise<{ caption: string; author: string } | null> {
  const video = tiktokVideoUrl(raw);
  if (!video) return null;
  try {
    const response = await fetch(oembedUrl(video), { credentials: "omit", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8_000) });
    if (!response.ok) return null;
    const body = await response.json() as { title?: unknown; author_unique_id?: unknown; author_name?: unknown };
    return {
      caption: typeof body.title === "string" ? body.title.slice(0, 2200) : "",
      author: typeof body.author_unique_id === "string" ? `@${body.author_unique_id}`.slice(0, 120) : typeof body.author_name === "string" ? body.author_name.slice(0, 120) : "",
    };
  } catch { return null; }
}

/** Open the panel first, while the click's user gesture still counts, then hand it the card. */
function open(tab: chrome.tabs.Tab, card: WatchCard): void {
  const opening = chrome.sidePanel?.open ? chrome.sidePanel.open({ windowId: tab.windowId }) : Promise.reject(new Error("no_side_panel"));
  opening.catch(() => chrome.tabs.create({ url: chrome.runtime.getURL("sidepanel.html"), windowId: tab.windowId }));
  // The passage also arrives in the form, so « Vérifier ce contenu » stays the explicit next step.
  const capture: Capture = {
    id: crypto.randomUUID(), kind: "text", text: card.text.slice(0, 6000), url: "", pageUrl: card.pageUrl,
    createdAt: card.createdAt, truncated: card.text.length > 6000,
  };
  void chrome.storage.session.set({ [CARD_KEY(tab.windowId)]: card, [`capture:${tab.windowId}`]: capture });
}

function cardFrom(message: Extract<Message, { type: "checky-watch:open" }>, tab: chrome.tabs.Tab): WatchCard | null {
  const site = siteOf(tab.url);
  const c = message.card;
  if (!site || !c || typeof c.text !== "string" || !c.text.trim()) return null;
  const frame = typeof c.frame === "string" && c.frame.startsWith("data:image/jpeg;base64,") && c.frame.length < 1_500_000 ? c.frame : "";
  return {
    id: crypto.randomUUID(), createdAt: Date.now(), site, text: c.text.trim().slice(0, 6000), pageUrl: tiktokVideoUrl(c.link) || httpUrl(tab.url || "") || "",
    author: typeof c.author === "string" ? c.author.slice(0, 120) : "",
    words: Array.isArray(c.words) ? c.words.filter((w) => typeof w === "string").slice(0, 10) : [],
    verdicts: Array.isArray(c.verdicts) ? knownVerdicts(c.verdicts.map((v) => ({ score: v.score, verdict: { ...v, newsroom: { name: v.newsroom }, published_at: v.date } }))) : [],
    frame,
  };
}

export function installWatch(): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "session" || !changes[STATE_KEY]) return;
    void sync(validState(changes[STATE_KEY].oldValue), validState(changes[STATE_KEY].newValue));
  });

  // A watched tab that loads a new page (Facebook and TikTok also navigate in place) gets the reader again.
  chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
    if (info.status !== "complete") return;
    void state().then((current) => { if (watching(current, tabId, tab.url)) void inject(tabId); });
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    void state().then((current) => {
      if (current.tabs.includes(tabId)) void chrome.storage.session.set({ [STATE_KEY]: { ...current, tabs: current.tabs.filter((id) => id !== tabId) } });
    });
  });

  chrome.runtime.onMessage.addListener((raw: unknown, sender, reply) => {
    const message = raw as Message;
    if (!message || typeof message.type !== "string" || !message.type.startsWith("checky-watch:")) return false;
    const tab = sender.tab;
    // Only our own reader, in the top frame of a Facebook or TikTok tab.
    if (sender.id !== chrome.runtime.id || !tab?.id || sender.frameId !== 0 || !siteOf(tab.url)) { reply(null); return false; }
    if (message.type === "checky-watch:open") {
      const card = cardFrom(message, tab);
      if (card) open(tab, card);
      reply({ ok: !!card });
      return false;
    }
    void (async () => {
      const current = await state();
      if (!watching(current, tab.id, tab.url)) return reply({ on: false });
      if (message.type === "checky-watch:hello") {
        const hidden = !!(await chrome.storage.session.get(BUBBLE_KEY))[BUBBLE_KEY];
        return reply({ on: true, bubble: !hidden });
      }
      if (message.type === "checky-watch:hide-bubble") { await chrome.storage.session.set({ [BUBBLE_KEY]: true }); return reply({ on: true }); }
      if (message.type === "checky-watch:oembed") return reply({ on: true, ...(await oembed(message.url)) });
      if (message.type === "checky-watch:match" && Array.isArray(message.posts)) return reply({ on: true, ...(await match(message.posts)) });
      reply({ on: true });
    })().catch(() => reply(null));
    return true;
  });
}
