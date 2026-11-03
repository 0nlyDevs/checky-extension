// The Checky bubble over TikTok videos on the web: a draggable disc at the edge of the playing
// video. A tap reads the caption and author (the page, else TikTok's public oEmbed), grabs the
// current frame when the browser allows it, checks the caption and opens a small card over the
// video. A long press puts the bubble away until the next browser session. The frame lives in
// this page's memory only; it goes to the side panel with « Voir tout » and nowhere else.
import { t } from "../i18n/fr.ts";
import { frenchDate } from "../lib/safety.ts";
import { mainClaim, tiktokVideoUrl, visibleText } from "../lib/watch.ts";
import type { KnownVerdict } from "../lib/watch.ts";
import { h, icon, mark, mount, toast, VERDICT_ICON } from "./ui.ts";

type Send = (message: object) => Promise<{ on?: boolean; caption?: string; author?: string; results?: { words: string[]; verdicts: KnownVerdict[] }[] } | null>;
type Reading = { caption: string; author: string; url: string; frame: string; words: string[]; verdicts: KnownVerdict[] };

const DESC = '[data-e2e="video-desc"], [data-e2e="browse-video-desc"]';
const AUTHOR = '[data-e2e="video-author-uniqueid"], [data-e2e="browse-username"], [data-e2e="video-author-nickname"]';
const SIZE = 52, INSET = 12;

function area(video: HTMLVideoElement): number {
  const r = video.getBoundingClientRect();
  const w = Math.min(r.right, innerWidth) - Math.max(r.left, 0), hgt = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0);
  return w > 0 && hgt > 0 ? w * hgt : 0;
}

/** The video in front of the journalist: playing first, then the most visible. */
function playing(): HTMLVideoElement | null {
  const videos = [...document.querySelectorAll("video")].filter((v) => area(v) > 120 * 120);
  videos.sort((a, b) => Number(a.paused) - Number(b.paused) || area(b) - area(a));
  return videos[0] || null;
}

/** The nearest caption, author and link around a video: climb until an ancestor holds a caption. */
function around(video: HTMLVideoElement): { desc: HTMLElement | null; author: HTMLElement | null; link: string } {
  let node: HTMLElement | null = video.parentElement;
  for (let depth = 0; node && depth < 12; depth++, node = node.parentElement) {
    const desc = node.querySelector<HTMLElement>(DESC);
    if (desc) {
      const anchor = node.querySelector<HTMLAnchorElement>('a[href*="/video/"]');
      return { desc, author: node.querySelector<HTMLElement>(AUTHOR), link: anchor?.href || "" };
    }
  }
  return { desc: null, author: document.querySelector<HTMLElement>(AUTHOR), link: "" };
}

/** The current frame as a small JPEG, or nothing when the video is cross-origin (tainted canvas). */
function grab(video: HTMLVideoElement): string {
  try {
    if (!video.videoWidth || !video.videoHeight) return "";
    const scale = Math.min(1, 480 / video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.72);
  } catch { return ""; }
}

export function startBubble(send: Send): () => void {
  const { host, root } = mount("checky-bubble");
  const bubble = h("button", { type: "button", class: "bubble", "aria-label": t.watch.bubble, title: t.watch.bubbleHint }, mark());
  root.append(bubble);
  document.documentElement.append(host);
  let video: HTMLVideoElement | null = null;
  let side: "left" | "right" = "right", fy = 0.3;
  let card: HTMLElement | null = null, cardFrame = "";
  let frameId = 0, alive = true;

  let picked = 0;
  function place(): void {
    // Finding the video in front costs a scan; follow the same one between scans.
    if (Date.now() - picked > 500 || !video?.isConnected) { video = playing(); picked = Date.now(); }
    host.style.display = video ? "" : "none";
    if (!video) return;
    const r = video.getBoundingClientRect();
    const x = side === "right" ? r.right - SIZE - INSET : r.left + INSET;
    const y = r.top + fy * Math.max(0, r.height - SIZE);
    bubble.style.left = `${Math.min(Math.max(x, 4), innerWidth - SIZE - 4)}px`;
    bubble.style.top = `${Math.min(Math.max(y, 4), innerHeight - SIZE - 4)}px`;
  }
  const tick = () => { if (!alive) return; if (!bubble.classList.contains("dragging")) place(); frameId = requestAnimationFrame(tick); };
  // Repositioning each frame is cheap (one rect read) and follows TikTok's own scrolling feed.
  frameId = requestAnimationFrame(tick);

  // Pointer: a tap opens the card, a drag moves the bubble to the other edge, a long press hides it.
  let down: { x: number; y: number; at: number } | null = null, press = 0, moved = false;
  bubble.addEventListener("pointerdown", (event) => {
    down = { x: event.clientX, y: event.clientY, at: Date.now() }; moved = false;
    bubble.setPointerCapture(event.pointerId); bubble.classList.add("pressing");
    press = window.setTimeout(() => {
      if (moved || !down) return;
      down = null; bubble.classList.remove("pressing");
      void send({ type: "checky-watch:hide-bubble" });
      closeCard(); host.remove(); alive = false; toast(t.watch.bubbleHidden);
    }, 650);
  });
  bubble.addEventListener("pointermove", (event) => {
    if (!down) return;
    if (!moved && Math.hypot(event.clientX - down.x, event.clientY - down.y) < 6) return;
    moved = true; clearTimeout(press); bubble.classList.remove("pressing"); bubble.classList.add("dragging");
    bubble.style.left = `${event.clientX - SIZE / 2}px`; bubble.style.top = `${event.clientY - SIZE / 2}px`;
  });
  const release = (event: PointerEvent) => {
    clearTimeout(press); bubble.classList.remove("pressing");
    if (!down) return;
    down = null;
    if (moved) {
      bubble.classList.remove("dragging");
      if (video) {
        const r = video.getBoundingClientRect();
        side = event.clientX < r.left + r.width / 2 ? "left" : "right";
        fy = Math.min(1, Math.max(0, (event.clientY - SIZE / 2 - r.top) / Math.max(1, r.height - SIZE)));
      }
      place();
      if (card) position(card);
      return;
    }
    if (card) closeCard(); else void check();
  };
  bubble.addEventListener("pointerup", release);
  bubble.addEventListener("pointercancel", () => { clearTimeout(press); down = null; bubble.classList.remove("pressing", "dragging"); });
  bubble.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); if (card) closeCard(); else void check(); } });

  function position(node: HTMLElement): void {
    const b = bubble.getBoundingClientRect();
    const width = Math.min(304, innerWidth - 24);
    const left = side === "right" ? b.left - width - 8 : b.right + 8;
    node.style.left = `${Math.min(Math.max(left, 12), innerWidth - width - 12)}px`;
    node.style.top = `${Math.min(Math.max(b.top - 8, 12), Math.max(12, innerHeight - node.offsetHeight - 12))}px`;
  }

  function closeCard(): void {
    card?.remove(); card = null; cardFrame = ""; // the capture is dropped with the card
    bubble.setAttribute("aria-expanded", "false");
  }

  function line(states: ("done" | "waiting")[]): HTMLElement {
    return h("ol", { class: "line", "aria-label": t.watch.bubble }, ...t.watch.steps.map((label, i) =>
      h("li", { class: states[i] || "waiting" }, h("span", { class: "n" }, states[i] === "done" ? icon("check") : null, String(i + 1).padStart(2, "0")), h("span", {}, label))));
  }

  function showCard(body: (Node | null)[]): HTMLElement {
    card?.remove();
    const close = h("button", { type: "button", class: "close", "aria-label": t.watch.close }, icon("x"));
    close.addEventListener("click", closeCard);
    const panel = h("section", { class: "card", role: "dialog", "aria-label": t.watch.bubble },
      h("header", {}, h("span", { class: "mark" }, mark()), h("span", {}, "Checky"), close), ...body.filter((n): n is Node => !!n));
    root.append(panel);
    card = panel;
    bubble.setAttribute("aria-expanded", "true");
    position(panel);
    return panel;
  }

  async function read(target: HTMLVideoElement): Promise<Omit<Reading, "words" | "verdicts">> {
    const near = around(target);
    let caption = near.desc ? visibleText(near.desc.innerText, 2200) : "";
    let author = near.author ? visibleText(near.author.innerText, 120) : "";
    const url = tiktokVideoUrl(near.link) || tiktokVideoUrl(location.href) || "";
    if (!caption && url) {
      const embed = await send({ type: "checky-watch:oembed", url });
      caption = visibleText(embed?.caption || "", 2200);
      author ||= embed?.author || "";
    }
    if (author && !author.startsWith("@") && /^[\w.]+$/.test(author)) author = `@${author}`;
    return { caption, author, url, frame: grab(target) };
  }

  async function check(): Promise<void> {
    const target = video;
    if (!target) return;
    showCard([line(["waiting", "waiting", "waiting"]), h("p", { class: "reading", role: "status" }, t.watch.reading)]);
    const opened = card;
    const reading = await read(target);
    if (!alive || card !== opened) return;
    if (!reading.caption) {
      showCard([line(["waiting", "waiting", "waiting"]), h("p", { class: "muted" }, t.watch.noCaption)]);
      return;
    }
    const reply = await send({ type: "checky-watch:match", posts: [{ key: "bubble", text: reading.caption }] });
    if (!alive || card !== opened) return;
    const result = reply?.results?.[0];
    render({ ...reading, words: result?.words || [], verdicts: result?.verdicts || [] });
  }

  function render(r: Reading): void {
    const best = r.verdicts[0];
    cardFrame = r.frame;
    const see = h("button", { type: "button", class: "see" }, t.watch.seeAll);
    see.addEventListener("click", () => {
      // The same click opens the side panel; the frame goes with it, then leaves this page.
      void send({ type: "checky-watch:open", card: { text: r.caption, author: r.author, link: r.url, words: r.words, verdicts: r.verdicts, frame: cardFrame } });
      closeCard();
    });
    showCard([
      line(["done", "done", best ? "done" : "waiting"]),
      h("p", { class: "claim" }, mainClaim(r.caption)),
      r.author ? h("p", { class: "author" }, r.author) : null,
      best ? h("div", { class: `verdict ${best.verdict}` },
        h("p", { class: "k" }, t.watch.known),
        h("h3", {}, icon(VERDICT_ICON[best.verdict]), t.verdicts[best.verdict]),
        h("p", {}, t.watch.knownBy(best.newsroom, frenchDate(best.date))),
      ) : h("div", { class: "empty" }, h("h3", {}, icon("question"), t.watch.notSigned), h("p", {}, t.watch.notSignedHelp)),
      r.words.length ? h("div", { class: "chips" }, ...r.words.map((word) => h("span", { class: "chip" }, icon("eye"), t.watch.badgeWord(word)))) : null,
      r.frame ? h("img", { class: "frame", src: r.frame, alt: t.watch.frame }) : null,
      see,
    ]);
  }

  const onResize = () => { if (card) position(card); };
  addEventListener("resize", onResize);
  return () => {
    alive = false; cancelAnimationFrame(frameId); removeEventListener("resize", onResize);
    closeCard(); host.remove();
  };
}
