# Checky redesign: browser extension — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the « Vérifier ici » side panel to the Checky identity (tokens, fonts, name, Phosphor duotone icons, verdict and step components), light and dark, single reading column kept, with real data and no display bug.

**Architecture:** Colour values move into a pure `src/lib/tokens.ts` tested by the existing `node --test` runner; `src/style.css` keeps its variable names (`--ground --ink --paper --soft --muted --rule --edge --action --*-soft --*-ink`) with new values, so `panel.ts` changes only for icons, name and the primary action. One branch and one squash-merged PR on `main` per task.

**Tech Stack:** Vite + TypeScript MV3 side panel, `@fontsource-variable/bricolage-grotesque`, `@fontsource/cormorant-garamond`, Phosphor duotone as inline SVG symbols, Node 26 `node --test`.

**Spec:** `../fanilo-base/docs/superpowers/specs/2026-11-02-checky-redesign-design.md` (§4.2–4.5, §4.8, §4.9, §4.10, verification gate).

## Global Constraints

- Token values exactly as spec §4.2. `--action` becomes the ink primary (`#0a0a0b` light / `#f3f2ee` dark) with its own `--action-foreground` (`#f3f2ee` / `#0a0a0b`); no citron left.
- Every filled surface uses its paired foreground variable (spec §4.10); disabled text keeps 4.5:1.
- Fonts bundled locally (no font network call): Bricolage Grotesque everywhere, Cormorant Garamond italic 500 only for verbatim passages (`.passage` / quoted source text). Archivo and Atkinson removed.
- Icons: Phosphor duotone inline SVG `<symbol>`s from `@phosphor-icons/core` (MIT) built into one sprite; `currentColor`.
- On-screen name « Checky » (panel title, context-menu titles « Vérifier ce texte avec Checky », manifest `name`/`action.default_title`); keep the extension id, storage keys and API names.
- Panel width 360–480 px: nothing overflows horizontally; long URLs break or truncate in the middle with the full URL in `title`.
- Git (user's global rules): branch from up-to-date `main`; `type: message`, no scope, subject only, author Mathieu-bot, no AI attribution; PR same title, short plain body; review comment, `gh pr merge --squash --delete-branch` (body = squashed commit subjects); `git switch main && git pull`.
- Checks before every PR: `npm test && npm run build`, `python -I tests/e2e.py` as documented in `README.md`, and the screenshot gate.

## Review Focus

1. Dark mode (`prefers-color-scheme`) on the primary button and inverted tags: paper fill with ink label. Pinned by `tokens.test.ts` (Task 1).
2. A 2 000-character selected passage and a 300-character link at 360 px: no horizontal scroll, captured text area scrolls. Pinned by the gate fixture (Task 1 step 6).
3. Search failure, partial coverage and empty results remain three visibly different states in the new look. Pinned by the gate on the e2e states.
4. Image examination results never borrow verdict colours (spec: provenance is not a verdict). Pinned by a grep in Task 2 step 3.
5. The numbered line 01/02/03 keeps its waiting/active/done states with the ink disc instead of citron. Pinned by gate screenshots during a running check.

### Screenshot gate

Build (`npm run build:local`), open `dist/sidepanel.html` in Playwright (cached Chromium) at 360×800 and 480×800, light and dark, with the API reachable locally: idle, text captured (fixture passage), running (mid-stream), result with related published verdicts, search failure, image examination, save confirmation. Save screenshots and check every text is readable.

---

### Task 1: Tokens, fonts, name

**Files:**
- Create: `src/lib/tokens.ts`, `src/lib/tokens.test.ts`
- Modify: `src/style.css` (`:root` lines 1–7, the dark block at 127–130, font-family rules), `src/panel.ts` (font imports lines 1–2, title strings), `src/background.ts` (context-menu titles), `public/manifest.json` (or the manifest source used by Vite), `src/i18n/fr.ts`, `DESIGN.md`, `README.md` title, `package.json` dependencies

**Interfaces:**
- Produces: `export const light`, `export const dark` keyed by the CSS variable names without `--`, `export const PAIRS`, `export function contrast(a: string, b: string): number`.

- [ ] **Step 1: Write the failing test** `src/lib/tokens.test.ts`: `contrast("#0a0a0b","#f3f2ee")` ≈ 17.67 (±0.05); every `PAIRS` entry ≥ 4.5 in both themes (ink on ground/paper/soft, muted on ground/paper/soft, action-foreground on action, each `*-ink` on its `*-soft` and on paper); `light.action === "#0a0a0b"`, `dark.action === "#f3f2ee"`.
- [ ] **Step 2:** `npm test` → FAIL. **Step 3:** implement (`ground` #f3f2ee/#0a0a0b, `paper` = surface #fbfaf7/#111113, `soft` = raised #e9e8e2/#19191c, `ink` = text, `muted` #55544e/#a6a5a0, `rule` and `edge` as solid hex: light #dcdbd5 / #8f8e88, dark #2a2a2d / #6d6c68; verdict `true/false/misleading/unknown` = vrai/faux/trompeur/invérifiable ink+wash from spec). **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Copy the values into `style.css`; add `--action-foreground`; replace every `color` used on `var(--action)` backgrounds with `var(--action-foreground)`; radius: controls 999px, cards 20px, tags 6px (spec §4.2).
- [ ] **Step 6:** `npm i @fontsource-variable/bricolage-grotesque@5.3.0 @fontsource/cormorant-garamond@5.3.0`, `npm uninstall @fontsource-variable/archivo @fontsource-variable/atkinson-hyperlegible-next`; imports in `panel.ts`; `font-family` rules in `style.css`; quotes in Cormorant.
- [ ] **Step 7:** Name: user-facing « FANILO » → « Checky » (panel, context menus, manifest name/title, `DESIGN.md`, `README.md` heading); keep ids and keys.
- [ ] **Step 8:** Checks + gate. PR `style: apply checky tokens, fonts and name to the extension panel`, squash-merge.

### Task 2: Icons and components

**Files:** Create `src/lib/icons.ts` (sprite string + `icon(name: IconName, label?: string): string` returning `<svg aria-hidden="true"><use href="#ph-…"/></svg>`); modify `src/panel.ts` (verdict chips, step discs, buttons, status lines), `sidepanel.html` (sprite injection point), `src/style.css`

- [ ] **Step 1:** `npm i -D @phosphor-icons/core@2.1.1`; build the sprite at build time from `@phosphor-icons/core/assets/duotone/*.svg` for the names used (check, x, warning, question, seal-check, magnifying-glass, link, image, file-text, folder-open, arrow-right, arrow-counter-clockwise, info, wifi-slash, sparkle); `node --test` case: `icon("check")` contains `#ph-check` and `aria-hidden`.
- [ ] **Step 2:** Verdict chips = icon + word, dashed while suggested, solid once published (spec §4.5); step discs waiting (outlined) / active (ink, pulse, reduced-motion off) / done (ink); buttons fully round, primary ink, ripple on press (`pointerdown`, WAAPI, reduced-motion off).
- [ ] **Step 3:** `grep -n "true-\|false-\|misleading-" src/panel.ts` inside the image-examination renderer → no verdict colour classes used there.
- [ ] **Step 4:** Checks + gate. PR `feat: restyle the extension verdicts, steps and buttons for checky`, squash-merge.
