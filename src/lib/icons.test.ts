import assert from "node:assert/strict";
import { test } from "node:test";
import { icon, ICON_NAMES } from "./icons.ts";
import { buildSprite } from "./sprite.ts";

test("icon references its sprite symbol and is hidden from assistive tech", () => {
  const markup = icon("check");
  assert.match(markup, /#ph-check/);
  assert.match(markup, /aria-hidden="true"/);
});

test("a labelled icon is exposed instead of hidden", () => {
  const markup = icon("check", "Fait");
  assert.match(markup, /aria-label="Fait"/);
  assert.doesNotMatch(markup, /aria-hidden/);
});

test("the sprite holds a symbol for every icon name", () => {
  const sprite = buildSprite(process.cwd());
  for (const name of ICON_NAMES) assert.match(sprite, new RegExp(`<symbol id="ph-${name}"`));
});
