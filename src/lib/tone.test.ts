import assert from "node:assert/strict";
import { test } from "node:test";
import { analyse, language, mentions, risk } from "./tone.ts";

// The pitch rumour, as `demo.DEMO_RUMOUR_TEXT` on the desk (fictional).
const RUMOUR = "URGENT ⚠️ COMMUNIQUÉ N° 2026-118 de la JIRAMA : délestage de 72 heures à partir du 3 novembre "
  + "sur tout Antananarivo, hausse de 40 % du tarif en décembre. Partagez à tous vos contacts !!!";

test("the pitch rumour is sensational, every quote copied from the text", () => {
  const out = analyse(RUMOUR);
  assert.equal(out.level, "sensationnaliste");
  const kinds = new Set(out.signals.map((s) => s.kind));
  for (const kind of ["urgency", "share", "exclamations", "emoji"] as const) assert.ok(kinds.has(kind), kind);
  assert.ok(out.signals.every((s) => RUMOUR.includes(s.quote)));
  const quotes = new Set(out.signals.map((s) => s.quote));
  assert.ok(quotes.has("URGENT") && quotes.has("Partagez"));
  // JIRAMA and COMMUNIQUÉ are not enough capitals to call the whole text shouting.
  assert.ok(!kinds.has("caps"));
});

test("a neutral text with acronyms is not shouting", () => {
  assert.deepEqual(analyse("La JIRAMA et l'INSTAT publient leurs chiffres du mois de septembre."), { level: "neutre", signals: [], caps_ratio: 0, exclamations: 0 });
});

test("shouting, Malagasy and English words are found", () => {
  const out = analyse("VAOVAO MAFANA !!! Zarao aminareo rehetra fa MAIKA");
  const kinds = new Set(out.signals.map((s) => s.kind));
  for (const kind of ["urgency", "share", "exclamations", "caps"] as const) assert.ok(kinds.has(kind), kind);
  assert.equal(out.level, "sensationnaliste");
  const english = new Set(analyse("Breaking: they don't want you to know this. Share it.").signals.map((s) => s.kind));
  for (const kind of ["urgency", "hidden", "share"] as const) assert.ok(english.has(kind), kind);
});

test("one emotive word is marked, not sensational", () => {
  const out = analyse("Un rapport scandaleux sur la gestion des déchets.");
  assert.equal(out.level, "marqué");
  assert.deepEqual(out.signals, [{ kind: "emotive", quote: "scandaleux" }]);
});

test("accents typed or not are found and quoted as written", () => {
  assert.deepEqual(risk("Delestage annonce sur tout le quartier").reasons, [{ kind: "panic", quote: "Delestage" }]);
  assert.deepEqual(analyse("URGENCE à Toliara").signals[0], { kind: "urgency", quote: "URGENCE" });
});

test("danger levels", () => {
  const pitch = risk(RUMOUR);
  assert.equal(pitch.level, "high"); // a power cut presented as a JIRAMA communiqué
  assert.deepEqual(new Set(pitch.reasons.map((r) => r.kind)), new Set(["panic", "fake_order"]));
  assert.ok(pitch.reasons.every((r) => RUMOUR.includes(r.quote)));
  assert.equal(risk("Il faut lynchez ce sorcier").level, "high");
  assert.equal(risk("Une pénurie de riz annoncée").level, "medium");
  assert.deepEqual(risk("Le marché rouvre lundi"), { level: "low", reasons: [], by: "code" });
  // « a été arrêté » (arrested) is not an official order.
  assert.equal(risk("Le suspect a été arrêté hier").level, "low");
});

test("language by common short words", () => {
  assert.equal(language(RUMOUR), "fr");
  assert.equal(language("Tsy misy jiro ny tanàna sy ny manodidina, hoy izay nanao"), "mg");
  assert.equal(language("The bridge is closed and the road will stay shut"), "en");
  assert.equal(language("12 34"), "other");
});

test("watched words match whole words, accents, case and a plural", () => {
  assert.ok(mentions("délestage", "Encore des DELESTAGES ce soir"));
  assert.ok(mentions("JIRAMA", "selon la jirama."));
  assert.ok(!mentions("jirama", "jiramabe"));
  assert.ok(!mentions("  ", "texte"));
});
