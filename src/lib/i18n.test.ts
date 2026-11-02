import assert from "node:assert/strict";
import { test } from "node:test";
import { t } from "../i18n/fr.ts";

test("an AI-suggested conclusion is labelled as awaiting a journalist's signature", () => {
  assert.equal(t.suggestion, "Lecture de Checky, à signer par un journaliste");
});

test("a published verdict names who signed it and when", () => {
  assert.equal(t.signedBy("Rédaction", "2026-11-02"), "Signé par Rédaction le 2026-11-02");
});
