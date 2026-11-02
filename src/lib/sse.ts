export type StreamEvent = { event: string; data: unknown };

export class SSEParser {
  private buffer = "";
  private name = "message";
  private data: string[] = [];
  private size = 0;
  private readonly emit: (event: StreamEvent) => void;

  constructor(emit: (event: StreamEvent) => void) { this.emit = emit; }

  push(chunk: string): void {
    this.buffer += chunk;
    if (this.buffer.length + this.size > 512_000) throw new Error("oversized_stream");
    while (true) {
      const end = this.buffer.search(/[\r\n]/);
      if (end < 0 || (this.buffer[end] === "\r" && end === this.buffer.length - 1)) break;
      const line = this.buffer.slice(0, end);
      const length = this.buffer[end] === "\r" && this.buffer[end + 1] === "\n" ? 2 : 1;
      this.buffer = this.buffer.slice(end + length);
      if (line === "") {
        if (this.data.length) this.emit({ event: this.name, data: JSON.parse(this.data.join("\n")) });
        this.name = "message";
        this.data = [];
        this.size = 0;
      } else if (!line.startsWith(":")) {
        const split = line.indexOf(":");
        const field = split < 0 ? line : line.slice(0, split);
        const value = split < 0 ? "" : line.slice(split + 1).replace(/^ /, "");
        if (field === "event") this.name = value;
        if (field === "data") { this.data.push(value); this.size += value.length; }
      }
    }
  }
}

/** Require the terminal event: never treat an interrupted result as a finished verification. */
export async function consumeSSE(response: Response, onEvent: (event: StreamEvent) => void, signal?: AbortSignal): Promise<void> {
  if (!response.body || !response.headers.get("content-type")?.includes("text/event-stream")) throw new Error("incomplete");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let done = false;
  const parser = new SSEParser((event) => { onEvent(event); if (event.event === "done") done = true; });
  try {
    while (!done) {
      signal?.throwIfAborted();
      const value = await reader.read();
      if (value.done) { parser.push(decoder.decode()); break; }
      parser.push(decoder.decode(value.value, { stream: true }));
    }
    if (!done) throw new Error("incomplete");
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
