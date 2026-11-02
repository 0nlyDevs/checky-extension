import assert from "node:assert/strict";
import { test } from "node:test";
import { ICON_NAMES } from "./icons.ts";
import { buildSprite } from "./sprite.ts";

test("the sprite holds a symbol for every icon name", () => {
  const sprite = buildSprite(process.cwd());
  for (const name of ICON_NAMES) assert.match(sprite, new RegExp(`<symbol id="ph-${name}"`));
});
