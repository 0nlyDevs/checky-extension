import assert from "node:assert/strict";
import { test } from "node:test";
import { t as fr } from "../i18n/fr.ts";
import { dictionary, merge, setLang } from "../i18n/index.ts";

/** Every leaf path of a dictionary, functions included. */
function paths(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => paths(child, prefix ? `${prefix}.${key}` : key));
}

test("English and Malagasy fill every French key, French filling the gaps", () => {
  for (const which of ["en", "mg"] as const) assert.deepEqual(paths(dictionary(which)).sort(), paths(fr).sort(), which);
  assert.equal(dictionary("en").menuText, "Verify this text with Checky");
  assert.equal(dictionary("mg").verdicts.false, "Diso");
  assert.equal(dictionary("mg").logTitle, fr.logTitle);
});

test("switching language changes the live dictionary", async () => {
  const live = await import("../i18n/index.ts");
  setLang("en");
  assert.equal(live.t.analyze, "Verify this content");
  setLang("fr");
  assert.equal(live.t.analyze, "Vérifier ce contenu");
});

test("a translation overrides nested keys without dropping their siblings", () => {
  assert.deepEqual(merge({ a: { b: 1, c: 2 }, d: [1] }, { a: { b: 3 } }), { a: { b: 3, c: 2 }, d: [1] });
});
