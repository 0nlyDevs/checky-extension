import { t } from "./i18n/fr.ts";
import { captureFromMenu } from "./lib/safety.ts";

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
    chrome.contextMenus.create({ id: "fanilo-text", title: t.menuText, contexts: ["selection"], documentUrlPatterns: ["http://*/*", "https://*/*"] });
    chrome.contextMenus.create({ id: "fanilo-image", title: t.menuImage, contexts: ["image"], targetUrlPatterns: ["http://*/*", "https://*/*"], documentUrlPatterns: ["http://*/*", "https://*/*"] });
    chrome.contextMenus.create({ id: "fanilo-link", title: t.menuLink, contexts: ["link"], targetUrlPatterns: ["http://*/*", "https://*/*"], documentUrlPatterns: ["http://*/*", "https://*/*"] });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const capture = captureFromMenu(info);
  if (!capture || !tab) return;
  const opening = openPanel(tab);
  void chrome.storage.session.set({ [`capture:${tab.windowId}`]: capture });
  void opening;
});

chrome.action.onClicked.addListener((tab) => { void openPanel(tab); });
