import type { components } from "./api-schema.d.ts";

export type Me = components["schemas"]["MeOut"];
export type Membership = components["schemas"]["MembershipOut"];
export type ImageResult = components["schemas"]["ImageOut"];
export type PublicResult = components["schemas"]["PublicCheckOut"];
export type Preparation = components["schemas"]["Preparation"];
export type Verdict = "true" | "misleading" | "false" | "unverifiable";
export type StepKey = "read" | "claims" | "search" | "verdict";
export type Step = { key: StepKey; status: "waiting" | "running" | "done" | "failed"; summary: string; count?: number };
export type Found = { n: number; kind: string; title: string; url: string; snippet: string; date?: string; read_status?: string; passages?: string[]; wording_overlap?: boolean; similar_to?: number[]; older_than_claim?: boolean };
export type LinkResult = {
  url?: string | null;
  kind?: string;
  title?: string;
  summary?: string;
  excerpt?: string;
  claims?: string[];
  signals?: { type: string; quote: string; why: string }[];
  results?: Found[];
  analysis?: { verdict: Verdict; reason: string; evidence: { result: number; stance: "supports" | "contradicts" | "context"; quote: string }[]; missing: string };
  published_at?: string | null;
  days_old?: number | null;
  needs_text?: boolean;
  image?: { ai_markers?: string[]; content_credentials?: boolean; width?: number; height?: number; format?: string };
  reverse_search?: { name: string; url: string }[];
  tracked?: { item_id: string; ref: string | null; title: string } | null;
};

/** A verdict a newsroom signed and published (`/public/verdicts`, `/public/match`, `/public/verify`). */
export type PublishedVerdict = {
  id: string; ref: string | null; title: string; verdict: string; reason: string | null; post: string | null;
  sources: string[]; published_at: string; newsroom: { name: string; slug: string }; signed_at?: string | null;
};
export type PublicMatch = { score: number; verdict: PublishedVerdict };
export type DiffOp = { op: "equal" | "insert" | "delete" | "replace"; a?: string; b?: string };
export type KnownFact = { kind: "registry" | "figure" | "provenance" | "tone" | "credibility"; text: string; source?: string | null; date?: string | null; url?: string | null; diff?: DiffOp[] };
export type Review = { publisher: string; url: string; rating: string | null; date: string | null; title: string };
/** `/public/verify`: a signed verdict, else fact-checkers' reviews, else facts stated by code. */
export type VerifyResult = {
  status: "signed" | "external" | "facts" | "none";
  signed?: PublishedVerdict | null; external?: Review[]; known?: KnownFact[];
  followed_since?: string | null; followed_by?: string | null; search_status?: string;
};
/** `registry.match_text`: which registered original a circulating text quotes, and how it differs. */
export type RegistryMatch = {
  status: "authentic" | "modified" | "not_found" | "inconsistent" | "none";
  issuer: string | null; number: string | null; summary: string;
  communique?: { title?: string; issued_on?: string | null; url?: string | null; newsroom?: { name?: string } | null } | null;
  diff?: DiffOp[]; changed_numbers?: { original: string; submitted: string }[];
};
/** Slice M's reading of a communiqué image: editable until the journalist confirms. */
export type RegistryFields = { issuer?: string | null; number?: string | null; date?: string | null; signatory?: string | null; text?: string | null };
/** Slice G's `gestures` fact for a page: `{kind, status, text, proof}`. */
export type GestureFact = { kind?: string; status?: string; text: string; proof?: string | { url?: string } | null };
export type WatchedWord = { id: string; word: string; active: boolean };
