import { t } from "./i18n/fr.ts";
import { checkyPage } from "./page/inject.ts";
import { captureFromMenu, httpUrl, MAX_TEXT } from "./lib/safety.ts";
import type { Capture } from "./lib/safety.ts";

const WEB = ["http://*/*", "https://*/*"];
const FACEBOOK = ["https://*.facebook.com/*", "https://facebook.com/*"];

async function openPanel(tab?: chrome.tabs.Tab): Promise<void> {
  // Call before awaiting storage so the context-menu user gesture is retained.
  try {
    if (chrome.sidePanel?.open && tab?.windowId !== undefined) {
      await chrome.sidePanel.open({ windowId: tab.windowId });
      return;
    }
  } catch { /* Browsers without usable side panels fall back to an extension tab. */ }
  await chrome.tabs.create({ url: chrome.runtime.getURL("sidepanel.html"), ...(tab ? { windowId: tab.windowId } : {}) });
}

chrome.runtime.onInstalled.addListener(() => {
  void chrome.contextMenus.removeAll().then(() => {
    chrome.contextMenus.create({ id: "fanilo-text", title: t.menuText, contexts: ["selection"], documentUrlPatterns: WEB });
    chrome.contextMenus.create({ id: "fanilo-image", title: t.menuImage, contexts: ["image"], targetUrlPatterns: WEB, documentUrlPatterns: WEB });
    chrome.contextMenus.create({ id: "fanilo-link", title: t.menuLink, contexts: ["link"], targetUrlPatterns: WEB, documentUrlPatterns: WEB });
    chrome.contextMenus.create({ id: "fanilo-communique", title: t.menuCommunique, contexts: ["selection", "image"], documentUrlPatterns: WEB });
    chrome.contextMenus.create({ id: "fanilo-page", title: t.menuPage, contexts: ["link"], targetUrlPatterns: WEB, documentUrlPatterns: WEB });
    chrome.contextMenus.create({ id: "fanilo-reply", title: t.menuReply, contexts: ["selection"], documentUrlPatterns: FACEBOOK });
  });
});

/** Remember where the selection is, in that tab only, so the answer and the démenti land there. */
function anchor(capture: Capture): void {
  if (capture.kind !== "text" || capture.tabId === undefined) return;
  void chrome.scripting.executeScript({ target: { tabId: capture.tabId, frameIds: [capture.frameId || 0] }, func: checkyPage, args: [{ op: "anchor" }] }).catch(() => undefined);
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const capture = captureFromMenu(info, tab?.id);
  if (!capture || !tab) return;
  const opening = openPanel(tab);
  anchor(capture);
  void chrome.storage.session.set({ [`capture:${tab.windowId}`]: capture });
  void opening;
});

chrome.action.onClicked.addListener((tab) => { void openPanel(tab); });

// The optional selection dot, injected by the panel in one tab, hands its selection over here.
// Only this extension's own injected script in a web tab is heard; nothing else may send.
chrome.runtime.onMessage.addListener((message: unknown, sender) => {
  const value = message as { type?: unknown; text?: unknown } | null;
  if (sender.id !== chrome.runtime.id || !sender.tab?.id || sender.tab.windowId === undefined || value?.type !== "checky:selection" || typeof value.text !== "string") return;
  const text = value.text.trim();
  const pageUrl = httpUrl(sender.url || "");
  if (!text || !pageUrl) return;
  const capture: Capture = { id: crypto.randomUUID(), kind: "text", intent: "check", text: text.slice(0, MAX_TEXT), url: "", pageUrl, createdAt: Date.now(), truncated: text.length > MAX_TEXT, tabId: sender.tab.id, frameId: sender.frameId || 0 };
  void chrome.storage.session.set({ [`capture:${sender.tab.windowId}`]: capture });
});
