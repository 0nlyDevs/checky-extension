import assert from "node:assert/strict";
import { test } from "node:test";
import { Budget, knownVerdicts, Lru, mainClaim, mentions, siteOf, textKey, tiktokVideoUrl, validCard, validState, watchedIn, watching, worthMatching } from "./watch.ts";

test("watched words match whole words, without accents or case, plural allowed", () => {
  assert.ok(mentions("délestage", "DELESTAGES prévus ce soir"));
  assert.ok(mentions("JIRAMA", "selon la jirama, rien"));
  assert.ok(!mentions("vote", "le dévoté du quartier"));
  assert.ok(!mentions("a", "a b c"));
  assert.deepEqual(watchedIn(["cyclone", "enlèvement", "Rajoelina"], "Un ENLEVEMENT signalé avant le cyclone"), ["cyclone", "enlèvement"]);
});

test("only Facebook and TikTok over HTTPS are watched sites", () => {
  assert.equal(siteOf("https://www.facebook.com/groups/1"), "facebook");
  assert.equal(siteOf("https://m.facebook.com/"), "facebook");
  assert.equal(siteOf("https://www.tiktok.com/@a/video/1"), "tiktok");
  assert.equal(siteOf("http://www.facebook.com/"), null);
  assert.equal(siteOf("https://facebook.com.evil.example/"), null);
  assert.equal(siteOf("https://notfacebook.com/"), null);
  assert.equal(siteOf(undefined), null);
});

test("a tab is read only when its own tab or its site is switched on", () => {
  const state = validState({ tabs: [4, 4, -1, "x"], sites: ["tiktok", "youtube"] });
  assert.deepEqual(state, { tabs: [4], sites: ["tiktok"] });
  assert.ok(watching(state, 4, "https://www.facebook.com/"));
  assert.ok(!watching(state, 5, "https://www.facebook.com/"));
  assert.ok(watching(state, 5, "https://www.tiktok.com/foryou"));
  assert.ok(!watching(state, 4, "https://example.com/"));
});

test("short reactions are not sent for matching", () => {
  assert.ok(!worthMatching("Trop fort 😂"));
  assert.ok(worthMatching("La JIRAMA annonce 72 heures de délestage à Antananarivo"));
  assert.equal(textKey("Délestage À Tana"), textKey("delestage à tana"));
});

test("only close, well-formed published verdicts become badges", () => {
  const verdict = { id: "1", ref: "FAN-1", title: "T", verdict: "misleading", reason: null, newsroom: { name: "Journal" }, published_at: "2026-11-03T00:00:00Z", signed_at: null };
  const found = knownVerdicts([{ score: 0.8, verdict }, { score: 0.4, verdict }, { score: 0.9, verdict: { ...verdict, verdict: "fake" } }]);
  assert.equal(found.length, 1);
  assert.equal(found[0]?.newsroom, "Journal");
  assert.equal(found[0]?.date, "2026-11-03T00:00:00Z");
  assert.deepEqual(knownVerdicts({ nope: true }), []);
});

test("the budget refuses calls beyond its window", () => {
  const budget = new Budget(2, 1000);
  assert.ok(budget.take(0)); assert.ok(budget.take(10)); assert.ok(!budget.take(20));
  assert.ok(budget.take(1500));
  const lru = new Lru<number>(2);
  lru.set("a", 1); lru.set("b", 2); lru.get("a"); lru.set("c", 3);
  assert.ok(lru.has("a")); assert.ok(!lru.has("b"));
});

test("only TikTok video pages go to the oEmbed endpoint", () => {
  assert.equal(tiktokVideoUrl("https://www.tiktok.com/@radio.tana/video/7430000000000000001?lang=fr"), "https://www.tiktok.com/@radio.tana/video/7430000000000000001");
  assert.equal(tiktokVideoUrl("https://www.tiktok.com/foryou"), null);
  assert.equal(tiktokVideoUrl("https://evil.example/@a/video/123456"), null);
  assert.equal(tiktokVideoUrl("javascript:alert(1)"), null);
});

test("the reel's main claim drops hashtags and keeps the first sentence", () => {
  assert.equal(mainClaim("72 heures de délestage dès demain sur tout Tana ! Partagez vite #jirama #mada @radio"), "72 heures de délestage dès demain sur tout Tana !");
  assert.ok(mainClaim("x".repeat(400)).length <= 180);
});

test("a card from the page is checked before the panel shows it", () => {
  const card = { id: "1", createdAt: 1000, site: "tiktok", text: "Texte", pageUrl: "", author: "@a", words: [], verdicts: [], frame: "" };
  assert.ok(validCard(card, 2000));
  assert.ok(!validCard({ ...card, frame: "javascript:alert(1)" }, 2000));
  assert.ok(!validCard({ ...card, site: "youtube" }, 2000));
  assert.ok(!validCard(card, 1000 + 16 * 60 * 1000));
});
