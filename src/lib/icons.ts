export const ICON_NAMES = [
  "check", "x", "warning", "question", "seal-check", "magnifying-glass", "link", "image", "file-text",
  "folder-open", "arrow-right", "arrow-counter-clockwise", "info", "wifi-slash", "sparkle", "arrow-square-out",
] as const;
export type IconName = (typeof ICON_NAMES)[number];

/** Markup for one Phosphor duotone icon, drawn from the sprite injected into sidepanel.html. */
export function icon(name: IconName, label?: string): string {
  const hidden = label ? `role="img" aria-label="${label.replace(/[&"<>]/g, "")}"` : 'aria-hidden="true"';
  return `<svg ${hidden} focusable="false"><use href="#ph-${name}"/></svg>`;
}
