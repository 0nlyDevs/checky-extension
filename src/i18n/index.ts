import { t as fr } from "./fr.ts";
import { en } from "./en.ts";
import { mg } from "./mg.ts";

/**
 * The interface language. French is the source (`fr.ts`); `mg.ts` and `en.ts` override the keys
 * they know and French fills the rest. The choice is a preference kept in `storage.local` under
 * `checky-lang` (never content), read by the panel, the background menus and the page answer.
 */
export type Lang = "fr" | "mg" | "en";
export const LANGS: readonly Lang[] = ["fr", "mg", "en"];
export const LANG_KEY = "checky-lang";
export const LOCALES: Record<Lang, string> = { fr: "fr-FR", mg: "mg-MG", en: "en-GB" };

/** The French dictionary with every literal widened to `string`; tuples keep their length. */
type Widen<T> = T extends (...args: infer A) => unknown
  ? (...args: A) => string
  : T extends string
    ? string
    : T extends readonly unknown[]
      ? { readonly [K in keyof T]: Widen<T[K]> }
      : T extends object
        ? { readonly [K in keyof T]: Widen<T[K]> }
        : T;
export type Dict = Widen<typeof fr>;
type DeepPartial<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly unknown[]
    ? T
    : T extends object
      ? { [K in keyof T]?: DeepPartial<T[K]> }
      : T;
/** What a translation file may hold: any subset of the French keys. */
export type Overrides = DeepPartial<Dict>;

const plain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export function merge<T>(base: T, over: unknown): T {
  if (!plain(base) || !plain(over)) return (over ?? base) as T;
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(over)) {
    if (value === undefined) continue;
    out[key] = plain(base[key]) && plain(value) ? merge(base[key], value) : value;
  }
  return out as T;
}

const dicts: Record<Lang, Dict> = { fr, mg: merge<Dict>(fr, mg), en: merge<Dict>(fr, en) };

export const isLang = (v: unknown): v is Lang => typeof v === "string" && (LANGS as readonly string[]).includes(v);

/** The current dictionary. A live binding: importers see the new language after `setLang`. */
export let t: Dict = fr;
export let lang: Lang = "fr";

export function dictionary(which: Lang): Dict { return dicts[which]; }

export function setLang(which: Lang): void {
  lang = which;
  t = dicts[which];
}

/** Reads the stored preference (French when none or unreadable) and applies it. */
export async function loadLang(): Promise<Lang> {
  try {
    const stored: unknown = (await chrome.storage.local.get(LANG_KEY))[LANG_KEY];
    setLang(isLang(stored) ? stored : "fr");
  } catch { setLang("fr"); }
  return lang;
}

export async function saveLang(which: Lang): Promise<void> {
  setLang(which);
  await chrome.storage.local.set({ [LANG_KEY]: which });
}
