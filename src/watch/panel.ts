// « Veille sur la page », side-panel side: the switch (this tab, or Facebook and TikTok in every
// tab), the newsroom's watched words handed to the background, and the card a badge or the TikTok
// bubble opens. The passage itself arrives in the form as an ordinary capture.
import "./panel.css";
import { t } from "../i18n/fr.ts";
import { api } from "../lib/api.ts";
import { config } from "../lib/config.ts";
import { button, el, icon } from "../lib/dom.ts";
import type { Icon } from "../lib/dom.ts";
import { frenchDate, hostname, httpUrl } from "../lib/safety.ts";
import { ALL_WATCH_ORIGINS, CARD_KEY, emptyState, siteOf, STATE_KEY, validCard, validState, WATCH_ORIGINS, WORDS_KEY } from "../lib/watch.ts";
import type { Scope, WatchCard, WatchState } from "../lib/watch.ts";

type Options = { examine: (file: File) => void };
const VERDICT_ICONS: Record<string, Icon> = { true: "check", false: "cross", misleading: "alert", unverifiable: "help" };

export function mountWatch(container: HTMLElement, options: Options): { update: (ws: string) => void } {
  const toggle = el("section", { class: "watch", "aria-labelledby": "watch-title" });
  const cardArea = el("div");
  container.append(cardArea, toggle);
  let current: WatchState = emptyState();
  let scope: Scope = "tab";
  let front: chrome.tabs.Tab | undefined;
  let windowId = -1, ws = "", words: number | null = null, notice = "", busy = false;
  let card: WatchCard | null = null;

  /** The page beside the panel: the active tab, or the last one used when the panel is itself a tab. */
  async function frontTab(): Promise<chrome.tabs.Tab | undefined> {
    const self = await chrome.tabs.getCurrent();
    const tabs = (await chrome.tabs.query({ windowId })).filter((tab) => tab.id !== self?.id);
    return tabs.find((tab) => tab.active) || tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0];
  }

  const active = () => current.sites.length > 0 || current.tabs.length > 0;

  async function loadWords(): Promise<void> {
    if (!ws || !active()) return;
    const requestedWs = ws;
    try {
      const rows = await api<{ word: string; active: boolean }[]>(`/workspaces/${encodeURIComponent(requestedWs)}/signals`);
      if (requestedWs !== ws) return;
      const list = rows.filter((row) => row.active && typeof row.word === "string").map((row) => row.word);
      await chrome.storage.session.set({ [WORDS_KEY]: { ws: requestedWs, words: list } });
      words = list.length;
    } catch {
      if (requestedWs !== ws) return;
      words = null;
      await chrome.storage.session.remove(WORDS_KEY);
    }
    render();
  }

  function turnOn(): void {
    if (busy) return;
    const site = siteOf(front?.url);
    if (scope === "tab" && (front?.id === undefined || !site)) {
      notice = t.watch.notThere;
      render();
      return;
    }
    busy = true; notice = ""; render();
    // Ask for the active site's host in tab mode. Site mode asks for both hosts.
    // The request stays inside the click so Chrome can show its permission prompt.
    const origins = scope === "site" ? ALL_WATCH_ORIGINS : WATCH_ORIGINS[site!];
    void chrome.permissions.request({ origins }).then(async (granted) => {
      if (!granted) { notice = t.watch.denied; return; }
      const next = validState(current);
      if (scope === "site") next.sites = ["facebook", "tiktok"];
      else next.tabs = [...next.tabs, front!.id!];
      await chrome.storage.session.set({ [STATE_KEY]: next });
      current = validState(next);
      await loadWords();
    }).catch(() => { notice = t.watch.denied; }).finally(() => { busy = false; render(); });
  }

  function turnOff(): void {
    // Off means off everywhere: the background stops every reader it started.
    current = emptyState(); notice = "";
    void chrome.storage.session.set({ [STATE_KEY]: current }).then(render);
  }

  function status(): string {
    if (current.sites.length) return t.watch.onSites;
    if (front?.id !== undefined && current.tabs.includes(front.id)) return t.watch.onTab(hostname(front.url || ""));
    return active() ? t.watch.onOther : t.watch.off;
  }

  function render(): void {
    const on = active();
    const fields = el("fieldset", { class: "watch-scope", disabled: on || busy }, el("legend", {}, t.watch.scope));
    for (const value of ["tab", "site"] as const) {
      const radio = el("input", { type: "radio", name: "watch-scope", value });
      radio.checked = scope === value;
      radio.addEventListener("change", () => { scope = value; });
      fields.append(el("label", {}, radio, value === "tab" ? t.watch.scopeTab : t.watch.scopeSite));
    }
    toggle.replaceChildren(...[
      el("div", { class: "watch-head" },
        el("h2", { id: "watch-title" }, t.watch.title),
        el("span", { class: on ? "watch-state on" : "watch-state" }, on ? icon("check") : null, on ? t.watch.stateOn : t.watch.stateOff),
      ),
      el("p", { class: "muted", role: "status" }, status()),
      el("details", { class: "watch-help" }, el("summary", {}, t.privacyTitle), el("p", {}, t.watch.help), el("p", {}, t.watch.privacy), !on && el("p", {}, t.watch.permission)),
      on ? null : fields,
      button(on ? t.watch.turnOff : t.watch.turnOn, on ? turnOff : turnOn, { class: on ? "" : "ink", disabled: busy, "aria-pressed": String(on) }),
      on && el("p", { class: "privacy" }, ws ? (words === null ? "" : t.watch.words(words)) : t.watch.wordsSignedOut),
      notice && el("p", { class: "notice", role: "alert" }, notice),
    ].filter((node): node is Exclude<typeof node, false | "" | null> => !!node));
  }

  function frameFile(dataUrl: string): File {
    const bytes = Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(",") + 1)), (c) => c.charCodeAt(0));
    return new File([bytes], t.watch.frameName, { type: "image/jpeg" });
  }

  function renderCard(): void {
    if (!card) { cardArea.replaceChildren(); return; }
    const c = card;
    const node = el("section", { class: "watch-card", "aria-labelledby": "watch-card-title" },
      el("h2", { id: "watch-card-title" }, icon("search"), t.watch.cardTitle(hostname(c.pageUrl) || c.site)),
      c.author && el("p", { class: "muted" }, t.watch.cardAuthor(c.author)),
      el("p", { class: "watch-passage" }, c.text),
    );
    const verdicts = c.verdicts.filter((v) => v && Object.hasOwn(t.verdicts, v.verdict));
    if (verdicts.length) {
      node.append(el("p", { class: "notice" }, t.publicMatchHelp));
      for (const v of verdicts) node.append(el("article", { class: `verdict published-verdict ${v.verdict}` },
        el("h3", {}, String(v.title)),
        el("p", { class: "published-word" }, icon(VERDICT_ICONS[v.verdict] || "help"), t.verdicts[v.verdict]),
        v.reason && el("p", {}, String(v.reason)),
        el("p", { class: "suggestion" }, t.signedBy(String(v.newsroom), frenchDate(String(v.date)))),
        el("a", { href: httpUrl(`${config.webUrl}/verifies/${encodeURIComponent(v.id)}`) || "#", target: "_blank", rel: "noopener noreferrer", referrerpolicy: "no-referrer" }, t.readPublished, icon("external")),
      ));
    } else node.append(el("div", { class: "no-conclusion" }, el("h3", {}, icon("help"), t.watch.notSigned), el("p", {}, t.watch.notSignedHelp)));
    if (c.words.length) node.append(el("h3", {}, t.watch.cardWords), el("p", { class: "watch-chips" }, ...c.words.map((w) => el("span", { class: "watch-chip" }, t.watch.badgeWord(w)))));
    if (c.frame) node.append(
      el("h3", {}, t.watch.frame), el("img", { class: "watch-frame", src: c.frame, alt: t.watch.frame }),
      el("p", { class: "privacy" }, t.watch.cardFrame),
      button(t.watch.examineFrame, () => { options.examine(frameFile(c.frame)); }),
    );
    node.append(el("p", { class: "privacy" }, t.watch.cardNext), button(t.watch.dismiss, () => { card = null; renderCard(); }, { class: "quiet" }));
    cardArea.replaceChildren(node);
  }

  function takeCard(value: unknown): void {
    // Read once, then gone from storage: the frame stays only in this panel's memory.
    void chrome.storage.session.remove(CARD_KEY(windowId));
    if (!validCard(value)) return;
    card = value; renderCard();
    cardArea.scrollIntoView({ block: "start" });
  }

  void (async () => {
    windowId = (await chrome.windows.getCurrent()).id ?? -1;
    current = validState((await chrome.storage.session.get(STATE_KEY))[STATE_KEY]);
    front = await frontTab();
    render();
    const stored: unknown = (await chrome.storage.session.get(CARD_KEY(windowId)))[CARD_KEY(windowId)];
    if (stored) takeCard(stored);
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "session") return;
      if (changes[STATE_KEY]) { current = validState(changes[STATE_KEY].newValue); render(); }
      const value: unknown = changes[CARD_KEY(windowId)]?.newValue;
      if (value) takeCard(value);
    });
    const refresh = () => { void frontTab().then((tab) => { front = tab; render(); }); };
    chrome.tabs.onActivated.addListener(refresh);
    chrome.tabs.onUpdated.addListener((_id, info) => { if (info.url || info.status === "complete") refresh(); });
  })();

  return {
    update(next: string) {
      if (next === ws) return;
      ws = next; words = null;
      // A newsroom switch must never leave the previous newsroom’s words in the page reader.
      void chrome.storage.session.remove(WORDS_KEY).then(loadWords);
      render();
    },
  };
}
