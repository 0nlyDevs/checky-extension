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
