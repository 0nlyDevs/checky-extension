// Checky colour tokens. Keys are the CSS variable names without the leading "--".
// style.css mirrors these values; tokens.test.ts pins contrast on every text/fill pair.
export type Tokens = Record<string, string>;

export const light: Tokens = {
  ground: "#f3f2ee", paper: "#fbfaf7", soft: "#e9e8e2",
  ink: "#0a0a0b", muted: "#55544e", rule: "#dcdbd5", edge: "#8f8e88",
  action: "#0a0a0b", "action-foreground": "#f3f2ee", "action-hover": "#1f1f22",
  "true-ink": "#0b6b3a", "true-soft": "#e1f3e8",
  "false-ink": "#b3231a", "false-soft": "#fbe3e0",
  "misleading-ink": "#8a5700", "misleading-soft": "#f9ecd2",
  "unknown-ink": "#1d58c4", "unknown-soft": "#e0eafb",
};

export const dark: Tokens = {
  ground: "#0a0a0b", paper: "#111113", soft: "#19191c",
  ink: "#f3f2ee", muted: "#a6a5a0", rule: "#2a2a2d", edge: "#6d6c68",
  action: "#f3f2ee", "action-foreground": "#0a0a0b", "action-hover": "#e2e1da",
  "true-ink": "#3ddc84", "true-soft": "#0f2219",
  "false-ink": "#ff6a5f", "false-soft": "#2a1311",
  "misleading-ink": "#ffb224", "misleading-soft": "#29200c",
  "unknown-ink": "#6aa8ff", "unknown-soft": "#101a2b",
};

/** [foreground token, background token] pairs that must reach 4.5:1 in both themes. */
export const PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["ink", "ground"], ["ink", "paper"], ["ink", "soft"],
  ["muted", "ground"], ["muted", "paper"], ["muted", "soft"],
  ["action-foreground", "action"], ["action-foreground", "action-hover"],
  ...["true", "false", "misleading", "unknown"].flatMap((v) => [
    [`${v}-ink`, `${v}-soft`], [`${v}-ink`, "paper"],
  ] as const),
];

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`Expected a #rrggbb colour, got ${hex}`);
  const n = parseInt(m[1] ?? "", 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

/** WCAG contrast ratio between two #rrggbb colours. */
export function contrast(a: string, b: string): number {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
