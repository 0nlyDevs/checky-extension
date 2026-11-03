// Right-click menu titles follow the interface language chosen in the panel (French by default).
import { dictionary, isLang, LANG_KEY } from "./i18n/index.ts";
import type { Lang } from "./i18n/index.ts";

async function storedLang(): Promise<Lang> {
  try {
    const value: unknown = (await chrome.storage.local.get(LANG_KEY))[LANG_KEY];
    return isLang(value) ? value : "fr";
  } catch { return "fr"; }
}

/** Retitles every entry; an entry that does not exist is skipped. */
export async function localizeMenus(): Promise<void> {
  const t = dictionary(await storedLang());
  const titles: Record<string, string> = {
    "fanilo-text": t.menuText, "fanilo-image": t.menuImage, "fanilo-link": t.menuLink,
    "fanilo-communique": t.menuCommunique, "fanilo-page": t.menuPage, "fanilo-reply": t.menuReply,
  };
  await Promise.all(Object.entries(titles).map(([id, title]) => chrome.contextMenus.update(id, { title }).catch(() => undefined)));
}

export function watchMenuLanguage(): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[LANG_KEY]) void localizeMenus();
  });
}
