import assert from "node:assert/strict";
import { test } from "node:test";
import { newsroomCard, pendingCard, publicCard, replyText, watchCard } from "./answer.ts";
import type { PublishedVerdict, VerifyResult } from "./types.ts";

const WEB = "https://checky.example";
const RUMOUR = "URGENT ⚠️ COMMUNIQUÉ N° 2026-118 de la JIRAMA : délestage de 72 heures. Partagez à tous vos contacts !!!";
const SIGNED: PublishedVerdict = {
  id: "11111111-1111-4111-8111-111111111111", ref: "FAN-0145", title: "72 heures de délestage (démo)", verdict: "false",
  reason: "Le communiqué original annonce 4 heures par jour.", post: null, sources: [], published_at: "2026-11-02T08:00:00Z",
  newsroom: { name: "Rédaction démo", slug: "demo" },
};

test("the pending card shows only what was read on this device", () => {
  const card = pendingCard(RUMOUR);
  assert.equal(card.state, "pending");
  assert.deepEqual(card.sections.map((s) => s.kind), ["tone"]);
  assert.ok(card.sections[0]!.items.some((i) => i.detail === "« URGENT »"));
  assert.equal(pendingCard("Le marché rouvre lundi.").sections.length, 0);
});

test("the public card puts facts first, then the signed verdict, and never a reading", () => {
  const verify: VerifyResult = {
    status: "signed", signed: SIGNED,
    external: [{ publisher: "AFP Factuel", url: "https://factuel.afp.com/x", rating: "Faux", date: null, title: "x" }],
    known: [{ kind: "registry", text: "Le communiqué 2026-118 de JIRAMA existe, mais son texte a été modifié.", source: "Registre des originaux · JIRAMA" }, { kind: "tone", text: "Ton sensationnaliste" }],
  };
  const card = publicCard(RUMOUR, verify, WEB, "https://news.example/a");
  assert.deepEqual(card.sections.map((s) => s.kind), ["tone", "facts", "signed"]);
  assert.equal(card.sections[2]!.items[0]!.word, "Faux");
  assert.equal(card.sections[2]!.items[0]!.url, `${WEB}/verifies/${SIGNED.id}`);
  assert.ok(!card.sections.some((s) => s.kind === "reading"));
  assert.equal(card.reply, undefined, "a démenti is only offered on Facebook");
  assert.ok(publicCard(RUMOUR, verify, WEB, "https://www.facebook.com/groups/1").reply);
});

test("without a signed verdict there is no démenti, and fact-checkers are relayed as theirs", () => {
  const card = publicCard("Un texte", { status: "external", external: [{ publisher: "Africa Check", url: "javascript:alert(1)", rating: "Faux", date: null, title: "x" }, { publisher: "AFP Factuel", url: "https://factuel.afp.com/y", rating: null, date: null, title: "y" }] }, WEB, "https://www.facebook.com/p");
  assert.equal(card.reply, undefined);
  assert.deepEqual(card.sections.find((s) => s.kind === "external")!.items.map((i) => i.text), ["AFP Factuel"]);
  assert.match(publicCard("Un texte", { status: "none" }, WEB, "").status, /ne rend pas le message vrai ou faux/);
});

test("the démenti carries the signed verdict and its link", () => {
  const text = replyText(SIGNED, WEB);
  assert.match(text, /Rédaction démo a vérifié ce message : Faux\. Le communiqué original/);
  assert.ok(text.endsWith(`${WEB}/verifies/${SIGNED.id}`));
  assert.ok(replyText({ ...SIGNED, post: "FAUX : la JIRAMA annonce 4 h par jour." }, WEB).startsWith("FAUX : la JIRAMA"));
});

test("the newsroom card shows the reading dashed after the registry fact", () => {
  const card = newsroomCard(RUMOUR, { analysis: { verdict: "false", reason: "Le registre dit 4 h.", evidence: [], missing: "" }, results: [] }, { status: "modified", issuer: "JIRAMA", number: "2026-118", summary: "Le texte diffère de l’original." });
  assert.deepEqual(card.sections.map((s) => s.kind), ["tone", "facts", "reading"]);
  assert.equal(card.sections[2]!.title, "Lecture de Checky, à signer par un journaliste");
});

test("a watched post names its words and its signed verdict", () => {
  const card = watchCard("Délestage à Antananarivo", ["délestage"], { score: 0.8, verdict: SIGNED }, WEB, "https://www.facebook.com/");
  assert.deepEqual(card.sections.map((s) => s.kind), ["watch", "signed", "tone"]);
  assert.ok(card.reply);
});
