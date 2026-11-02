/**
 * The answer placed on the page, built here as plain data and drawn by `page/inject.ts`.
 * Order: the local warning signs, then the facts, then signed verdicts or fact-checkers, and only
 * for a signed-in newsroom the reading (dashed). The public card never carries a reading.
 */
import { t } from "../i18n/fr.ts";
import { analyse, risk } from "./tone.ts";
import { httpUrl } from "./safety.ts";
import type { LinkResult, PublicMatch, PublishedVerdict, RegistryMatch, Verdict, VerifyResult } from "./types.ts";

export type CardItem = { text: string; detail?: string; url?: string; link?: string; verdict?: Verdict; word?: string };
export type CardSection = { kind: "tone" | "facts" | "signed" | "external" | "reading" | "watch"; title: string; items: CardItem[] };
export type CardReply = { label: string; text: string; done: string; noBox: string; noAnchor: string };
export type CardModel = { state: "pending" | "done" | "error"; status: string; sections: CardSection[]; reply?: CardReply; labels: { name: string; close: string } };

const VERDICTS: readonly Verdict[] = ["true", "misleading", "false", "unverifiable"];
export const asVerdict = (value: unknown): Verdict | null => VERDICTS.includes(value as Verdict) ? value as Verdict : null;
const dateFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const day = (iso?: string | null) => { const time = Date.parse(iso || ""); return Number.isNaN(time) ? "" : dateFormat.format(time); };
const labels = { name: t.card.name, close: t.card.close };

/** The tone and the danger, read on this device. Null when nothing stands out. */
export function toneSection(text: string): CardSection | null {
  const tone = analyse(text), danger = risk(text);
  const items: CardItem[] = tone.signals.map((s) => ({ text: t.tone.kinds[s.kind], detail: `« ${s.quote} »` }));
  if (danger.level !== "low") items.push({ text: t.tone.risk[danger.level], detail: danger.reasons.map((r) => `${t.tone.riskKinds[r.kind]} : « ${r.quote} »`).join(" · ") });
  if (!items.length) return null;
  return { kind: "tone", title: `${t.tone.levels[tone.level]} · ${t.tone.local}`, items };
}

export function verdictLink(id: string, webUrl: string): string {
  return `${webUrl}/verifies/${encodeURIComponent(id)}`;
}

function signedItem(v: PublishedVerdict, webUrl: string): CardItem | null {
  const verdict = asVerdict(v.verdict);
  if (!verdict) return null;
  const when = day(v.signed_at || v.published_at);
  return { verdict, word: t.verdicts[verdict], text: v.title, detail: [v.reason, t.signedBy(v.newsroom.name, when)].filter(Boolean).join(" — "), url: verdictLink(v.id, webUrl), link: t.card.readMore };
}

/** The démenti posted under a post: the newsroom's own post when it wrote one, else its verdict
 * in a sentence, always with the link to the signed verdict. Only ever built from a signed one. */
export function replyText(v: PublishedVerdict, webUrl: string): string {
  const verdict = asVerdict(v.verdict);
  const link = verdictLink(v.id, webUrl);
  const body = v.post?.trim() || `${v.newsroom.name} a vérifié ce message : ${verdict ? t.verdicts[verdict] : v.verdict}.${v.reason ? ` ${v.reason}` : ""}`;
  return `${body.slice(0, 900)}\n${link}`;
}

export function replyFor(v: PublishedVerdict | null | undefined, webUrl: string, pageUrl: string): CardReply | undefined {
  if (!v || !asVerdict(v.verdict) || !isFacebook(pageUrl)) return undefined;
  return { label: t.place.reply, text: replyText(v, webUrl), done: t.place.replyDone, noBox: t.place.replyNoBox, noAnchor: t.place.replyNoAnchor };
}

export function isFacebook(url: string): boolean {
  try { return /(^|\.)facebook\.com$/.test(new URL(url).hostname); } catch { return false; }
}

export function isTikTok(url: string): boolean {
  try { return /(^|\.)tiktok\.com$/.test(new URL(url).hostname); } catch { return false; }
}

export function pendingCard(text: string, running = false): CardModel {
  const tone = toneSection(text);
  return { state: "pending", status: running ? t.card.running : t.card.pending, sections: tone ? [tone] : [], labels };
}

export function failedCard(text: string): CardModel {
  const tone = toneSection(text);
  return { state: "error", status: t.card.failed, sections: tone ? [tone] : [], labels };
}

/** Signed out: `/public/verify`, facts and signed verdicts or fact-checkers, never a reading. */
export function publicCard(text: string, verify: VerifyResult, webUrl: string, pageUrl: string): CardModel {
  const sections: CardSection[] = [];
  const tone = toneSection(text);
  if (tone) sections.push(tone);
  // The tone is already read above, on this device; the server's copy would say it twice.
  const facts = (verify.known || []).filter((f) => f.kind !== "tone").map((f) => ({ text: f.text, detail: [f.source, day(f.date)].filter(Boolean).join(" · "), url: f.url && httpUrl(f.url) || undefined, link: f.url ? t.card.open : undefined }));
  if (facts.length) sections.push({ kind: "facts", title: t.card.facts, items: facts });
  const signed = verify.signed ? signedItem(verify.signed, webUrl) : null;
  if (signed) sections.push({ kind: "signed", title: t.card.signed, items: [signed] });
  const reviews = (verify.external || []).flatMap((r) => { const url = httpUrl(r.url); return url ? [{ text: t.card.rating(r.publisher, r.rating), detail: [r.title, day(r.date)].filter(Boolean).join(" · "), url, link: t.card.open }] : []; });
  if (!signed && reviews.length) sections.push({ kind: "external", title: t.card.external, items: reviews.slice(0, 3) });
  const status = verify.followed_by ? t.card.followed(verify.followed_by) : !signed && !reviews.length ? t.card.noneFound : "";
  const reply = replyFor(verify.signed, webUrl, pageUrl);
  return { state: "done", status, sections, labels, ...(reply ? { reply } : {}) };
}

/** Signed in: the link check's reading (dashed), the registry fact and the fact-checkers found. */
export function newsroomCard(text: string, result: LinkResult, registry: RegistryMatch | null): CardModel {
  const sections: CardSection[] = [];
  const tone = toneSection(text);
  if (tone) sections.push(tone);
  if (registry && registry.status !== "none" && registry.summary) sections.push({ kind: "facts", title: t.card.facts, items: [{ text: registry.summary, detail: [registry.issuer, registry.number && `N° ${registry.number}`].filter(Boolean).join(" · ") }] });
  const checks = (result.results || []).filter((r) => r.kind === "fact-check").flatMap((r) => { const url = httpUrl(r.url); return url ? [{ text: r.title, detail: r.snippet, url, link: t.card.open }] : []; });
  if (checks.length) sections.push({ kind: "external", title: t.card.external, items: checks.slice(0, 3) });
  const verdict = asVerdict(result.analysis?.verdict);
  if (verdict && result.analysis) sections.push({ kind: "reading", title: t.card.reading, items: [{ verdict, word: t.verdicts[verdict], text: result.analysis.reason }] });
  return { state: "done", status: result.tracked ? t.card.tracked : !checks.length && !verdict ? t.card.noneFound : "", sections, labels };
}

/** A post the watch flagged: the watched words it names, the signed verdict it matches, its tone. */
export function watchCard(text: string, words: string[], match: PublicMatch | null, webUrl: string, pageUrl: string): CardModel {
  const sections: CardSection[] = [];
  if (words.length) sections.push({ kind: "watch", title: t.card.watch, items: words.map((word) => ({ text: word })) });
  const signed = match ? signedItem(match.verdict, webUrl) : null;
  if (signed) sections.push({ kind: "signed", title: t.card.signed, items: [signed] });
  const tone = toneSection(text);
  if (tone) sections.push(tone);
  const reply = replyFor(match?.verdict, webUrl, pageUrl);
  return { state: "done", status: "", sections, labels, ...(reply ? { reply } : {}) };
}
