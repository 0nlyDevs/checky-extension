export const ICON_NAMES = [
  "check", "x", "warning", "question", "seal-check", "magnifying-glass", "link", "image", "file-text",
  "folder-open", "arrow-right", "arrow-counter-clockwise", "info", "wifi-slash", "sparkle", "arrow-square-out",
] as const;
export type IconName = (typeof ICON_NAMES)[number];
