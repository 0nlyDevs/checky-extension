import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { api, ApiError, forgetToken } from "./api.ts";

const originalFetch = globalThis.fetch;
const session: Record<string, unknown> = {};
const originalChrome = globalThis.chrome;
const value = `${btoa('{}')}.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 900 }))}.test`;
let calls: { url: string; init: RequestInit }[] = [];

beforeEach(async () => {
  globalThis.chrome = { storage: { session: {
    get: async (key: string) => ({ [key]: session[key] }),
    set: async (entries: Record<string, unknown>) => { Object.assign(session, entries); },
    remove: async (key: string) => { delete session[key]; },
  } } } as unknown as typeof chrome;
  await forgetToken(); calls = [];
});
afterEach(() => { globalThis.fetch = originalFetch; globalThis.chrome = originalChrome; });

test("website cookies only reach the token endpoint and API calls use the session JWT", async () => {
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return String(url).endsWith("/api/auth/token") ? Response.json({ token: value }) : Response.json({ ok: true });
  };
  assert.deepEqual(await api("/me"), { ok: true });
  await api("/me");
  assert.equal(calls.filter((call) => call.url.endsWith("/api/auth/token")).length, 1);
  assert.equal(calls[0]?.init.credentials, "include");
  assert.equal(calls[1]?.init.credentials, "omit");
  assert.equal((calls[1]?.init.headers as Record<string, string>).Authorization, `Bearer ${value}`);
  assert.ok(session["fanilo-auth"]);
});

test("a 401 clears the token and never automatically repeats a write", async () => {
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return String(url).endsWith("/api/auth/token") ? Response.json({ token: value }) : Response.json({}, { status: 401 });
  };
  await assert.rejects(api("/workspaces/test/copilot/act", { kind: "create_claim" }), (error: unknown) => error instanceof ApiError && error.status === 401);
  assert.equal(calls.filter((call) => call.init.method === "POST").length, 1);
  assert.equal(session["fanilo-auth"], undefined);
});

test("missing or expired website tokens do not reach the API", async () => {
  globalThis.fetch = async (url, init = {}) => { calls.push({ url: String(url), init }); return Response.json({ token: "invalid" }); };
  await assert.rejects(api("/me"), (error: unknown) => error instanceof ApiError && error.status === 401);
  assert.equal(calls.length, 1);
});

test("a network error never retries a dossier creation", async () => {
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith("/api/auth/token")) return Response.json({ token: value });
    throw new TypeError("network interrupted");
  };
  await assert.rejects(api("/workspaces/test/copilot/act", { kind: "create_claim" }), (error: unknown) => error instanceof ApiError && error.status === 0);
  assert.equal(calls.filter((call) => call.init.method === "POST").length, 1);
});
