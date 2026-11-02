import { config } from "./config.ts";
import { consumeSSE } from "./sse.ts";
import type { StreamEvent } from "./sse.ts";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code = "failed") { super(code); this.status = status; this.code = code; }
}

type Token = { value: string; expiresAt: number };
let cached: Token | null = null;
let pending: Promise<string> | null = null;
const AUTH_KEY = "fanilo-auth";

export async function forgetToken(): Promise<void> {
  cached = null;
  await chrome.storage.session.remove(AUTH_KEY);
}

export async function token(): Promise<string> {
  if (pending) return pending;
  pending = obtainToken().finally(() => { pending = null; });
  return pending;
}

async function obtainToken(): Promise<string> {
  cached ??= (await chrome.storage.session.get(AUTH_KEY))[AUTH_KEY] as Token | null;
  if (cached?.value && cached.expiresAt > Date.now() + 60_000) return cached.value;
  const response = await fetch(`${config.webUrl}/api/auth/token`, {
    credentials: "include", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) { await forgetToken(); throw new ApiError(response.status === 401 || response.status === 403 ? 401 : response.status); }
  const body = await response.json() as { token?: unknown };
  if (typeof body.token !== "string" || body.token.length > 16_000) { await forgetToken(); throw new ApiError(401); }
  try {
    const part = body.token.split(".")[1];
    if (!part) throw new Error("invalid_token");
    const claims = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: number };
    if (!Number.isFinite(claims.exp) || Number(claims.exp) * 1000 <= Date.now()) throw new Error("expired_token");
    cached = { value: body.token, expiresAt: Number(claims.exp) * 1000 };
  } catch { await forgetToken(); throw new ApiError(401); }
  await chrome.storage.session.set({ [AUTH_KEY]: cached });
  return cached.value;
}

export async function request(path: string, init: RequestInit = {}): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${config.apiUrl}/api/v1${path}`, {
      ...init,
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      headers: { "Content-Type": "application/json", ...init.headers, Authorization: `Bearer ${await token()}` },
    });
  } catch (error) {
    if (error instanceof ApiError || init.signal?.aborted) throw error;
    throw new ApiError(0, "network");
  }
  if (response.status === 401) await forgetToken();
  if (!response.ok) throw new ApiError(response.status);
  return response;
}

export async function api<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await request(path, { method: body === undefined ? "GET" : "POST", body: body === undefined ? undefined : JSON.stringify(body), signal: signal || AbortSignal.timeout(30_000) });
  return response.json() as Promise<T>;
}

export async function stream(path: string, body: unknown, onEvent: (event: StreamEvent) => void, signal: AbortSignal): Promise<void> {
  const response = await request(path, { method: "POST", body: JSON.stringify(body), signal });
  await consumeSSE(response, onEvent, signal);
}

/** Public checks must never obtain a session token, send credentials or retry privately. */
export async function publicApi<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  if (!path.startsWith("/public/")) throw new Error("invalid_public_path");
  let response: Response;
  try {
    response = await fetch(`${config.apiUrl}/api/v1${path}`, {
      method: "POST", body: JSON.stringify(body), credentials: "omit", cache: "no-store",
      redirect: "error", headers: { "Content-Type": "application/json" },
      signal: signal || AbortSignal.timeout(60_000),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError(0, "network");
  }
  if (!response.ok) throw new ApiError(response.status);
  return response.json() as Promise<T>;
}
