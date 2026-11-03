// The panel's « Réglages »: interface language.
import { dictionary, lang, LANGS, saveLang, t } from "./i18n/index.ts";
import type { Lang } from "./i18n/index.ts";
import { el } from "./lib/dom.ts";

let open = false;

export function settingsSection(onLanguage: () => void): HTMLElement {
  const select = el("select", { id: "ui-lang" });
  for (const which of LANGS) {
    // Each language is named in itself, so it can be found whatever the current one is.
    const option = el("option", { value: which, lang: which }, dictionary(which).settings.languages[which]);
    option.selected = which === lang;
    select.append(option);
  }
  select.addEventListener("change", () => { void saveLang(select.value as Lang).then(onLanguage); });

  const node = el("details", { class: "settings" },
    el("summary", {}, t.settings.title),
    el("label", { for: "ui-lang" }, t.settings.language), select,
  );
  node.open = open;
  node.addEventListener("toggle", () => { open = node.open; });
  return node;
}
