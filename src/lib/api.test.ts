import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { api, ApiError, forgetToken, publicApi, publicStream } from "./api.ts";

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

test("public checks never read session storage or call the token endpoint", async () => {
  globalThis.chrome = undefined as unknown as typeof chrome;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return Response.json({ published: [], results: [] });
  };
  assert.deepEqual(await publicApi("/public/check", { text: "Une affirmation" }), { published: [], results: [] });
  assert.equal(calls.length, 1);
  assert.ok(calls[0]?.url.endsWith("/api/v1/public/check"));
  assert.equal(calls[0]?.init.credentials, "omit");
  assert.equal((calls[0]?.init.headers as Record<string, string>).Authorization, undefined);
  await assert.rejects(publicApi("/workspaces/private/copilot/act", {}), /invalid_public_path/);
});

test("anonymous errors never trigger an authenticated fallback or clear a private token", async () => {
  session["fanilo-auth"] = { value, expiresAt: Date.now() + 100_000 };
  globalThis.fetch = async (url, init = {}) => { calls.push({ url: String(url), init }); return Response.json({}, { status: 401 }); };
  await assert.rejects(publicApi("/public/check", { text: "Une affirmation" }), (error: unknown) => error instanceof ApiError && error.status === 401);
  assert.equal(calls.length, 1);
  assert.ok(session["fanilo-auth"]);
});

test("public streams preserve stage events without consulting authentication", async () => {
  globalThis.chrome = undefined as unknown as typeof chrome;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return new Response('event: preparation\ndata: {"queries":["MAZAVALOHA PARC 2026"]}\n\nevent: done\ndata: {}\n\n', { headers: { "Content-Type": "text/event-stream" } });
  };
  const received: string[] = [];
  await publicStream("/public/check/stream", { text: "MAZAVALOHA PARC 2026" }, (event) => { received.push(event.event); }, new AbortController().signal);
  assert.deepEqual(received, ["preparation", "done"]);
  assert.equal(calls.length, 1);
  assert.equal((calls[0]?.init.headers as Record<string, string>).Authorization, undefined);
});

test("an image file goes as its own bytes, anonymously or with the session JWT", async () => {
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return String(url).endsWith("/api/auth/token") ? Response.json({ token: value }) : Response.json({ source: "file" });
  };
  const file = new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });
  assert.deepEqual(await publicApi("/public/image-check/file", file), { source: "file" });
  assert.equal(calls[0]?.init.body, file);
  assert.equal((calls[0]?.init.headers as Record<string, string>)["Content-Type"], "image/png");
  assert.equal((calls[0]?.init.headers as Record<string, string>).Authorization, undefined);
  await api("/workspaces/test/image-check/file", file);
  const sent = calls.at(-1)!;
  assert.equal(sent.init.body, file);
  assert.equal((sent.init.headers as Record<string, string>)["Content-Type"], "image/png");
  assert.equal((sent.init.headers as Record<string, string>).Authorization, `Bearer ${value}`);
});
