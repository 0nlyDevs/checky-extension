import assert from "node:assert/strict";
import { test } from "node:test";
import { CAPTURE_TTL, captureFromMenu, checkBody, httpUrl, imageFileProblem, MAX_IMAGE_BYTES, MAX_TEXT, frenchDate, isUrlLabel, middleTruncate, validCapture } from "./safety.ts";

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

test("image files are checked against the API's limits before anything is sent", () => {
  assert.equal(imageFileProblem({ type: "image/png", size: 1200 }), null);
  assert.equal(imageFileProblem({ type: "image/jpeg", size: MAX_IMAGE_BYTES }), null);
  assert.equal(imageFileProblem({ type: "image/jpeg", size: MAX_IMAGE_BYTES + 1 }), "size");
  assert.equal(imageFileProblem({ type: "image/webp", size: 0 }), "empty");
  for (const type of ["image/svg+xml", "image/heic", "application/pdf", ""]) assert.equal(imageFileProblem({ type, size: 10 }), "type");
});

test("long URLs are elided in the middle, short ones are kept", () => {
  const url = "https://news.example/" + "a".repeat(200) + "/article-final";
  const short = middleTruncate(url);
  assert.equal(short.length, 48);
  assert.ok(short.startsWith("https://news.example/") && short.endsWith("article-final") && short.includes("…"));
  assert.equal(middleTruncate("https://a.example/x"), "https://a.example/x");
});

test("only URL-shaped labels are middle-truncated", () => {
  const url = "https://www.example.org/une/très/longue/adresse/d-article-sur-madagascar-et-l-oms?x=1";
  const title = "Le gouvernement malgache dément officiellement le retrait de Madagascar de l’OMS";
  assert.equal(isUrlLabel(url), true);
  assert.equal(isUrlLabel("example.org/article/long"), true);
  assert.equal(isUrlLabel(title), false);
  assert.equal(isUrlLabel("site:example.org retrait OMS"), false);
  assert.ok(middleTruncate(url).includes("…") && middleTruncate(url).length <= 48);
  assert.equal(isUrlLabel(title) ? middleTruncate(title) : title, title);
});

test("dates read in French, odd input is left as is", () => {
  assert.equal(frenchDate("2026-11-02T08:30:00Z").replace(/ | /g, " "), "2 nov. 2026");
  assert.equal(frenchDate("n/a"), "n/a");
});
