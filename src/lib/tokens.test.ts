import assert from "node:assert/strict";
import test from "node:test";
import { PAIRS, contrast, dark, light } from "./tokens.ts";

test("contrast of ink on ground matches the reference ratio", () => {
  assert.ok(Math.abs(contrast("#0a0a0b", "#f3f2ee") - 17.67) <= 0.05);
});

for (const [name, theme] of [["light", light], ["dark", dark]] as const) {
  test(`every text/fill pair reaches 4.5:1 in ${name}`, () => {
    for (const [fg, bg] of PAIRS) {
      assert.ok(theme[fg] && theme[bg], `${fg}/${bg} defined`);
      const ratio = contrast(theme[fg], theme[bg]);
      assert.ok(ratio >= 4.5, `${name} ${fg} on ${bg} is ${ratio.toFixed(2)}`);
    }
  });
}

test("the action is ink in light and paper in dark", () => {
  assert.equal(light.action, "#0a0a0b");
  assert.equal(dark.action, "#f3f2ee");
  assert.equal(light["action-foreground"], "#f3f2ee");
  assert.equal(dark["action-foreground"], "#0a0a0b");
});
