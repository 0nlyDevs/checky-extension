// « Veille sur la page »: injected only into a Facebook or TikTok tab the journalist switched on.
// It reads the visible text of the posts on screen, asks the background (batched, cached,
// rate-limited) whether they match a published verdict or a watched word, and badges them.
// Built as one classic script (see `build.ts`); it stops as soon as the journalist turns it off.
import { t } from "../i18n/fr.ts";
import { siteOf, textKey, visibleText } from "../lib/watch.ts";
import type { KnownVerdict, WatchSite } from "../lib/watch.ts";
import { startBubble } from "./bubble.ts";
import { badges, mount, toast } from "./ui.ts";

declare global { var __checkyWatch: (() => void) | undefined; }

type Reply = { on?: boolean; bubble?: boolean; paused?: boolean; results?: { key: string; words: string[]; verdicts: KnownVerdict[] }[] } | null;
type Seen = { key: string; host: HTMLElement | null; words: string[]; verdicts: KnownVerdict[]; text: string };

const POSTS: Record<WatchSite, string> = {
  facebook: '[role="article"], div[aria-posinset]',
  tiktok: '[data-e2e="recommend-list-item-container"], [data-e2e="browse-video-desc"], [data-e2e="video-desc"], [data-e2e="search_top-item"]',
};
// Where the post's own words are: Facebook's message block, TikTok's caption.
const MESSAGE: Record<WatchSite, string> = {
  facebook: '[data-ad-rendering-role="story_message"], [data-ad-preview="message"], [data-ad-comet-preview="message"]',
  tiktok: '[data-e2e="video-desc"], [data-e2e="browse-video-desc"]',
};

async function send(message: object): Promise<Reply> {
  try { return await chrome.runtime.sendMessage(message) as Reply; }
  catch { globalThis.__checkyWatch?.(); return null; } // The extension was reloaded or removed: stop quietly.
}

function start(site: WatchSite, bubble: boolean): () => void {
  const seen = new WeakMap<HTMLElement, Seen>();
  const tracked = new Set<HTMLElement>();
  const visible = new Set<HTMLElement>();
  const due = new Set<HTMLElement>();
  let timer = 0, scan = 0, pausedShown = false, stopped = false;

  const textOf = (post: HTMLElement): { text: string; anchor: HTMLElement | null } => {
    const message = post.matches(MESSAGE[site]) ? post : post.querySelector<HTMLElement>(MESSAGE[site]);
    if (message) return { text: visibleText(message.innerText), anchor: message };
    // No message block: the post's visible text, without the comments nested inside it.
    let text = post.innerText;
    for (const nested of post.querySelectorAll<HTMLElement>('[role="article"]')) text = text.replace(nested.innerText, " ");
    return { text: visibleText(text), anchor: null };
  };

  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const post = entry.target as HTMLElement;
      if (entry.isIntersecting) { visible.add(post); due.add(post); } else visible.delete(post);
    }
    schedule();
  }, { rootMargin: "200px 0px" });

  function schedule(): void {
    clearTimeout(timer);
    timer = window.setTimeout(() => { void flush(); }, 700);
  }

  function rescan(): void {
    for (const post of document.querySelectorAll<HTMLElement>(POSTS[site])) {
      // Keep the outermost post: comments are articles inside articles.
      if (post.parentElement?.closest(POSTS[site])) continue;
      if (!tracked.has(post)) { tracked.add(post); io.observe(post); }
      else if (visible.has(post)) due.add(post); // « Voir plus » or a lazy caption may have changed its text.
    }
    for (const post of tracked) if (!post.isConnected) { tracked.delete(post); visible.delete(post); io.unobserve(post); }
    if (due.size) schedule();
  }

  async function flush(): Promise<void> {
    const batch: { post: HTMLElement; key: string; text: string; anchor: HTMLElement | null }[] = [];
    for (const post of due) {
      due.delete(post);
      if (!post.isConnected || !visible.has(post)) continue;
      const { text, anchor } = textOf(post);
      const key = textKey(text);
      if (!text || seen.get(post)?.key === key) continue;
      batch.push({ post, key, text, anchor });
      if (batch.length === 12) break;
    }
    if (due.size) schedule();
    if (!batch.length) return;
    const reply = await send({ type: "checky-watch:match", posts: batch.map(({ key, text }) => ({ key, text })) });
    if (stopped || !reply?.on) { if (reply && !reply.on) stop(); return; }
    if (reply.paused && !pausedShown) { pausedShown = true; toast(t.watch.paused); }
    for (const { post, key, text, anchor } of batch) {
      const result = reply.results?.find((r) => r.key === key);
      const previous = seen.get(post);
      previous?.host?.remove();
      const entry: Seen = { key, host: null, words: result?.words || [], verdicts: result?.verdicts || [], text };
      // A paused match is retried later, when the budget allows.
      if (reply.paused && !result?.verdicts.length) entry.key = "";
      if (entry.words.length || entry.verdicts.length) {
        const { host, root } = mount("checky-badge");
        host.style.display = "block";
        root.append(badges(entry.verdicts, entry.words, () => {
          void send({ type: "checky-watch:open", card: { text: entry.text, author: "", words: entry.words, verdicts: entry.verdicts, frame: "" } });
        }));
        if (anchor && anchor !== post) anchor.before(host); else post.prepend(host);
        entry.host = host;
      }
      seen.set(post, entry);
    }
  }

  const mo = new MutationObserver((records) => {
    // Our own badges do not count as page changes.
    if (records.every((r) => [...r.addedNodes, ...r.removedNodes].every((n) => n instanceof HTMLElement && n.hasAttribute("data-checky")))) return;
    cancelAnimationFrame(scan);
    scan = requestAnimationFrame(() => { clearTimeout(scanTimer); scanTimer = window.setTimeout(rescan, 400); });
  });
  let scanTimer = 0;
  mo.observe(document.body, { childList: true, subtree: true, characterData: true });
  rescan();

  const stopBubble = site === "tiktok" && bubble ? startBubble(send) : () => {};

  function stop(): void {
    if (stopped) return;
    stopped = true;
    mo.disconnect(); io.disconnect(); clearTimeout(timer); clearTimeout(scanTimer); cancelAnimationFrame(scan);
    stopBubble();
    document.querySelectorAll("checky-badge, checky-bubble, checky-card").forEach((node) => node.remove());
    chrome.runtime.onMessage.removeListener(listener);
    globalThis.__checkyWatch = undefined;
  }
  const listener = (message: unknown) => { if ((message as { type?: string })?.type === "checky-watch:stop") stop(); };
  chrome.runtime.onMessage.addListener(listener);
  return stop;
}

if (!globalThis.__checkyWatch) {
  const site = siteOf(location.href);
  if (site) {
    globalThis.__checkyWatch = () => {}; // claimed at once: a second injection while asking does nothing
    void send({ type: "checky-watch:hello" }).then((reply) => {
      if (reply?.on) globalThis.__checkyWatch = start(site, !!reply.bubble);
      else globalThis.__checkyWatch = undefined;
    });
  }
}
