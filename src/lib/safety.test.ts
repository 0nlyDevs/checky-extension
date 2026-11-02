import assert from "node:assert/strict";
import { test } from "node:test";
import { CAPTURE_TTL, captureFromMenu, checkBody, httpUrl, MAX_TEXT, validCapture } from "./safety.ts";

test("reject unsafe links, credentials and browser internal schemes", () => {
  for (const url of ["javascript:alert(1)", "data:image/png,a", "file:///etc/passwd", "chrome://settings", "blob:https://site/a", "https://user:secret@example.com/a", "https://" + "a".repeat(2100)]) assert.equal(httpUrl(url), null);
  assert.equal(httpUrl("https://news.example/a?b=c#part"), "https://news.example/a?b=c");
});

test("context capture is bounded and only contains the explicit selection", () => {
  const value = captureFromMenu({ menuItemId: "fanilo-text", selectionText: "a".repeat(MAX_TEXT + 100), pageUrl: "https://news.example/article" });
  assert.ok(value && validCapture(value));
  assert.equal(value.text.length, MAX_TEXT);
  assert.equal(value.truncated, true);
  assert.equal(validCapture(value, value.createdAt + CAPTURE_TTL + 1), false);
  assert.equal(validCapture(value, value.createdAt - 1), false);
  assert.equal(captureFromMenu({ menuItemId: "other", selectionText: "private" }), null);
});

test("image captures reject private browser resources", () => {
  assert.equal(captureFromMenu({ menuItemId: "fanilo-image", srcUrl: "blob:https://news.example/secret" }), null);
  assert.equal(captureFromMenu({ menuItemId: "fanilo-image", srcUrl: "https://images.example/photo.jpg" })?.kind, "image");
});

test("selected text never makes FANILO fetch and analyze the surrounding page", () => {
  assert.deepEqual(checkBody("text", "  Madagascar quitte l’OMS  ", "https://page.example/other-claims"), { text: "Madagascar quitte l’OMS" });
  assert.deepEqual(checkBody("link", "", "https://page.example/a"), { url: "https://page.example/a" });
  assert.throws(() => checkBody("text", " ", ""));
  assert.throws(() => checkBody("text", "a".repeat(MAX_TEXT + 1), ""));
  assert.throws(() => checkBody("image", "", "javascript:alert(1)"));
});
