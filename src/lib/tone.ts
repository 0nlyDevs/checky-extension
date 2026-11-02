/**
 * How a message is written, read on this device before anything is sent (port of the desk's
 * `apps/api/app/core/tone.py`; keep the two lexicons in step).
 *
 * - `analyse(text)`: the tone (shouting capitals, piled-up exclamation marks, urgency, appeals to
 *   share, emotive words, alarm emoji, « ils ne veulent pas que vous sachiez »). A sensational tone
 *   is a reason to look closer, never a verdict.
 * - `risk(text)`: the danger if the message keeps circulating (violence, accusation, panic, a fake
 *   official order). A heuristic the journalist adjusts.
 *
 * Every quote is a slice of the original text, so it is found verbatim by construction. The
 * Malagasy words are a first list, to be reviewed by a native speaker.
 */

export type ToneKind = "caps" | "exclamations" | "urgency" | "share" | "emotive" | "hidden" | "emoji";
export type ToneLevel = "sensationnaliste" | "marqué" | "neutre";
export type Tone = { level: ToneLevel; signals: { kind: ToneKind; quote: string }[]; caps_ratio: number; exclamations: number };
export type RiskKind = "violence" | "accusation" | "panic" | "fake_order";
export type Risk = { level: "high" | "medium" | "low"; reasons: { kind: RiskKind; quote: string }[]; by: "code" };

// Shouting is measured on words of 4+ letters written in capitals; acronyms are not shouting.
const ACRONYM_MAX = 6;
const CAPS_RATIO = 0.3;

export const URGENCY = [
  "urgent", "urgence", "alerte", "dernière minute", "derniere minute", "flash info", "immédiatement",
  "tout de suite", "avant qu'il ne soit trop tard", "maika", "vaovao mafana", "tandremo", "breaking",
  "breaking news", "act now",
];
export const SHARE = [
  "partagez", "partager", "faites tourner", "faites passer", "transférez", "transferez", "diffusez",
  "à tous vos contacts", "a tous vos contacts", "zarao", "zarazarao", "ampitao", "share", "forward",
  "pass it on",
];
export const EMOTIVE = [
  "choquant", "scandale", "scandaleux", "honte", "terrifiant", "horrible", "incroyable", "effrayant",
  "catastrophe", "catastrophique", "hallucinant", "inadmissible", "mampatahotra", "mahatsiravina",
  "henatra", "shocking", "outrageous", "terrifying", "unbelievable",
];
export const HIDDEN = [
  "ils ne veulent pas que vous sachiez", "on vous cache", "on nous cache", "les médias ne disent pas",
  "les medias ne disent pas", "la vérité cachée", "avant que ce soit supprimé", "avant suppression",
  "censuré", "they don't want you to know", "they do not want you to know", "before it gets deleted",
  "miafina aminareo",
];
export const ALARM_EMOJI = ["⚠️", "⚠", "🚨", "‼️", "‼", "❗", "🔴", "📢", "🆘"];

export const PANIC = [
  "épidémie", "epidemie", "peste", "choléra", "cholera", "variole", "mpox", "cyclone", "inondation",
  "séisme", "tsunami", "pénurie", "penurie", "rupture de stock", "délestage", "delestage",
  "coupure de courant", "coupures de courant", "enlèvement", "enlevement", "kidnapping", "explosion",
  "aretina", "areti-mandoza", "tsy misy jiro", "outbreak", "shortage", "blackout",
];
export const ORDER = [
  "communiqué", "communique", "décret", "decret", "arrêté ministériel", "arrêté préfectoral",
  "arrêté municipal", "note de service", "circulaire", "sur ordre du", "ordonnance", "fanambarana",
  "didim-pitondrana", "official statement", "decree",
];
export const VIOLENCE = [
  "tuez", "tuer", "brûlez", "brulez", "lynchez", "vengeance", "attaquez", "chassez", "à mort", "vonoy",
  "dorao", "kill them", "burn them",
];
export const ACCUSATION = [
  "voleur", "voleurs", "escroc", "corrompu", "assassin", "violeur", "sorcier", "mpangalatra",
  "mpamosavy", "thief", "corrupt",
];

const LANG_WORDS: Record<"mg" | "en" | "fr", Set<string>> = {
  mg: new Set(["ny", "sy", "amin", "izay", "dia", "fa", "ary", "tsy", "ho", "nanao", "olona", "manao"]),
  en: new Set(["the", "and", "is", "are", "with", "this", "that", "from", "will", "have"]),
  fr: new Set(["le", "la", "les", "des", "est", "une", "dans", "pour", "avec", "sur", "qui", "que"]),
};

// Python's `\w` in a lookaround: letters, digits and the underscore.
const WORD = "[\\p{L}\\p{N}_]";

/** Lower case, accents removed (NFKD, combining marks dropped), as `_fold` in tone.py. */
export function fold(text: string): string {
  return text.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "");
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Each phrase found in `text` (whole words, case and accents ignored), as written there. */
export function find(text: string, phrases: readonly string[]): string[] {
  const found: string[] = [];
  const folded = fold(text);
  for (const phrase of phrases) {
    let match = new RegExp(`(?<!${WORD})${escape(phrase)}(?!${WORD})`, "iu").exec(text);
    // « delestage » typed without accents still finds « délestage », and the reverse.
    if (!match && folded.length === text.length) match = new RegExp(`(?<!${WORD})${escape(fold(phrase))}(?!${WORD})`, "u").exec(folded);
    if (match) {
      const quote = text.slice(match.index, match.index + match[0].length);
      if (!found.some((q) => q.toLowerCase() === quote.toLowerCase())) found.push(quote);
    }
  }
  return found;
}

const isUpper = (word: string) => word === word.toUpperCase() && word !== word.toLowerCase();
const length = (word: string) => [...word].length;

/** JIRAMA, INSTAT, BNGRC are not words of the lexicon; URGENT and ALERTE are shouting. */
function looksLikeAcronym(word: string): boolean {
  const key = fold(word);
  return ![...URGENCY, ...SHARE, ...EMOTIVE].some((phrase) => fold(phrase) === key);
}

/** Share of letters inside words written in capitals, and those words. A short word alone in
 * capitals is taken for an acronym; in a run of capitals it is shouting. */
function shouted(text: string): [number, string[]] {
  const letters = (text.match(/\p{L}/gu) || []).length;
  const tokens = text.match(/\p{L}+/gu) || [];
  const caps = tokens.map((w) => length(w) >= 2 && isUpper(w));
  const loud: string[] = [];
  tokens.forEach((w, i) => {
    if (length(w) < 4 || !caps[i]) return;
    const inRun = (i > 0 && caps[i - 1]) || (i + 1 < tokens.length && caps[i + 1]);
    if (length(w) > ACRONYM_MAX || inRun || !looksLikeAcronym(w)) loud.push(w);
  });
  return [letters ? loud.reduce((sum, w) => sum + length(w), 0) / letters : 0, loud];
}

const longest = (items: string[]) => items.reduce((best, item) => (length(item) > length(best) ? item : best));
const round2 = (value: number) => Math.round(value * 100) / 100;

/** Kinds: caps, exclamations, urgency, share, emotive, hidden, emoji. Sensational = three kinds or
 * more, or urgency with an appeal to share. */
export function analyse(input: string): Tone {
  const text = input || "";
  const signals: Tone["signals"] = [];
  const [ratio, loud] = shouted(text);
  for (const [kind, words] of [["urgency", URGENCY], ["share", SHARE], ["emotive", EMOTIVE], ["hidden", HIDDEN]] as const) {
    for (const quote of find(text, words)) signals.push({ kind, quote });
  }
  if (ratio >= CAPS_RATIO && loud.length) signals.push({ kind: "caps", quote: longest(loud) });
  const bangs = text.match(/[!！]{2,}|[?!]{3,}/gu);
  if (bangs?.length) signals.push({ kind: "exclamations", quote: longest(bangs) });
  const emoji = ALARM_EMOJI.find((e) => text.includes(e));
  if (emoji) signals.push({ kind: "emoji", quote: emoji });
  const kinds = new Set(signals.map((s) => s.kind));
  const level: ToneLevel = kinds.size >= 3 || (kinds.has("urgency") && kinds.has("share")) ? "sensationnaliste" : kinds.size ? "marqué" : "neutre";
  return { level, signals: signals.slice(0, 10), caps_ratio: round2(ratio), exclamations: (text.match(/!/g) || []).length };
}

/** High: a call to violence, an accusation, or panic presented as an official order or
 * communiqué. Medium: one kind. Low: none. A heuristic, never a verdict. */
export function risk(input: string): Risk {
  const text = input || "";
  const reasons: Risk["reasons"] = [];
  for (const [kind, words] of [["violence", VIOLENCE], ["accusation", ACCUSATION], ["panic", PANIC], ["fake_order", ORDER]] as const) {
    for (const quote of find(text, words).slice(0, 2)) reasons.push({ kind, quote });
  }
  const kinds = new Set(reasons.map((r) => r.kind));
  const level = kinds.has("violence") || kinds.has("accusation") || (kinds.has("panic") && kinds.has("fake_order")) ? "high" : kinds.size ? "medium" : "low";
  return { level, reasons: reasons.slice(0, 6), by: "code" };
}

/** fr, mg, en or "other", by counting common short words. */
export function language(text: string): "fr" | "mg" | "en" | "other" {
  const seen = fold(text || "").match(/[a-z']+/g) || [];
  let best: "fr" | "mg" | "en" = "mg", top = -1;
  for (const lang of ["mg", "en", "fr"] as const) {
    const count = seen.filter((w) => LANG_WORDS[lang].has(w)).length;
    if (count > top) { best = lang; top = count; }
  }
  return top >= 2 ? best : "other";
}

/** A watched word in `text`: whole words, accents and case ignored, a plural s/x allowed, as
 * `veille.mentions` on the desk. */
export function mentions(word: string, text: string): boolean {
  const key = fold(word.trim());
  return !!key && new RegExp(`(?<![a-z0-9])${escape(key)}(?:s|x)?(?![a-z0-9])`).test(fold(text));
}
