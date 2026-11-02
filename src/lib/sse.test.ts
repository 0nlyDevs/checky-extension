import assert from "node:assert/strict";
import { test } from "node:test";
import { consumeSSE, SSEParser } from "./sse.ts";
import type { StreamEvent } from "./sse.ts";

test("parse comments, CRLF boundaries and multi-line JSON data", () => {
  const events: StreamEvent[] = [];
  const parser = new SSEParser((event) => events.push(event));
  for (const part of [": ping\r", "\nevent: step\r\ndata: {\r\n", 'data: "key": "read"}\r\n\r', "\nevent: done\ndata: {}\n\n"]) parser.push(part);
  assert.deepEqual(events, [{ event: "step", data: { key: "read" } }, { event: "done", data: {} }]);
});

test("reject malformed and oversized event data", () => {
  const parser = new SSEParser(() => undefined);
  assert.throws(() => parser.push("data: not-json\n\n"));
  assert.throws(() => new SSEParser(() => undefined).push("x".repeat(512_001)));
});

test("a result without the final done event is incomplete", async () => {
  const response = new Response('event: result\ndata: {"claims":[]}\n\n', { headers: { "Content-Type": "text/event-stream" } });
  await assert.rejects(consumeSSE(response, () => undefined), /incomplete/);
});

test("decode split UTF-8 characters and require a proper event stream", async () => {
  const bytes = new TextEncoder().encode('event: result\ndata: {"summary":"Vérifié"}\n\nevent: done\ndata: {}\n\n');
  const body = new ReadableStream<Uint8Array>({ start(controller) { for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); controller.close(); } });
  const events: StreamEvent[] = [];
  await consumeSSE(new Response(body, { headers: { "Content-Type": "text/event-stream" } }), (event) => events.push(event));
  assert.deepEqual(events[0]?.data, { summary: "Vérifié" });
  await assert.rejects(consumeSSE(new Response("<html>sign in</html>"), () => undefined), /incomplete/);
});
