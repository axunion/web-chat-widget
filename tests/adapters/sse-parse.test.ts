import { describe, expect, it } from "vitest";
import { createSseParser, type SseEvent } from "../../src/adapters/sse-parse.ts";

// SPEC §8.2.1 — SSE line parser used internally by createOpenAISseAdapter
// The parser must be stateful: partial chunks buffer until a blank-line
// terminator arrives. `data: [DONE]` terminates the stream.

// ---------------------------------------------------------------------------
// Single event
// ---------------------------------------------------------------------------

describe("createSseParser — single event", () => {
  it("parses a single complete event as a data event", () => {
    const parser = createSseParser();
    const events = parser.feed("data: hello\n\n");
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual<SseEvent>({ type: "data", data: "hello" });
  });

  it("parses data: [DONE] as a done event, not a data event", () => {
    const parser = createSseParser();
    const events = parser.feed("data: [DONE]\n\n");
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual<SseEvent>({ type: "done" });
  });

  it("strips the optional leading space after the colon (data:hello with no space)", () => {
    // Per SSE spec the space after ':' is optional and must be stripped
    const parser = createSseParser();
    const events = parser.feed("data:hello\n\n");
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual<SseEvent>({ type: "data", data: "hello" });
  });

  it("preserves interior whitespace in the data value", () => {
    const parser = createSseParser();
    const events = parser.feed("data: a b c\n\n");
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual<SseEvent>({ type: "data", data: "a b c" });
  });
});

// ---------------------------------------------------------------------------
// Multiple events in one feed call
// ---------------------------------------------------------------------------

describe("createSseParser — multi-event in one feed", () => {
  it("parses two data events delivered in a single feed call", () => {
    const parser = createSseParser();
    const events = parser.feed("data: a\n\ndata: b\n\n");
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual<SseEvent>({ type: "data", data: "a" });
    expect(events[1]).toEqual<SseEvent>({ type: "data", data: "b" });
  });

  it("parses a normal data event followed by a [DONE] event in one feed", () => {
    const parser = createSseParser();
    const events = parser.feed("data: a\n\ndata: [DONE]\n\n");
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual<SseEvent>({ type: "data", data: "a" });
    expect(events[1]).toEqual<SseEvent>({ type: "done" });
  });
});

// ---------------------------------------------------------------------------
// Buffering across multiple feed calls
// ---------------------------------------------------------------------------

describe("createSseParser — buffering across feeds", () => {
  it("buffers a partial chunk and emits nothing until the blank-line terminator arrives", () => {
    const parser = createSseParser();
    const first = parser.feed("data: par");
    expect(first).toHaveLength(0);
    const second = parser.feed("tial\n\n");
    expect(second).toHaveLength(1);
    expect(second[0]).toEqual<SseEvent>({ type: "data", data: "partial" });
  });

  it("handles a chunk split at the blank-line boundary and yields both events in order", () => {
    // First chunk ends after the newline of the first event but before the blank line
    const parser = createSseParser();
    const first = parser.feed("data: x\n");
    // The blank line that terminates the first event has not arrived yet
    expect(first).toHaveLength(0);
    const second = parser.feed("\ndata: y\n\n");
    expect(second).toHaveLength(2);
    expect(second[0]).toEqual<SseEvent>({ type: "data", data: "x" });
    expect(second[1]).toEqual<SseEvent>({ type: "data", data: "y" });
  });

  it("flush drains a trailing event that lacks a final blank line", () => {
    // Some servers omit the trailing \\n\\n; flush() covers the WHATWG SSE edge case
    const parser = createSseParser();
    const during = parser.feed("data: last");
    expect(during).toHaveLength(0);
    const trailing = parser.flush();
    expect(trailing).toHaveLength(1);
    expect(trailing[0]).toEqual<SseEvent>({ type: "data", data: "last" });
  });

  it("flush returns an empty array when nothing is buffered", () => {
    const parser = createSseParser();
    parser.feed("data: complete\n\n");
    const trailing = parser.flush();
    expect(trailing).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Multi-line data fields
// ---------------------------------------------------------------------------

describe("createSseParser — multi-line data", () => {
  it("joins two consecutive data: lines with a newline character", () => {
    // Per WHATWG SSE spec, multiple data: lines are joined with \n
    const parser = createSseParser();
    const events = parser.feed("data: line1\ndata: line2\n\n");
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual<SseEvent>({ type: "data", data: "line1\nline2" });
  });

  it("emits an event with empty string data for a bare data: line", () => {
    // `data:` with nothing after the colon → data value is ""
    const parser = createSseParser();
    const events = parser.feed("data:\n\n");
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual<SseEvent>({ type: "data", data: "" });
  });
});

// ---------------------------------------------------------------------------
// Comments and unknown fields
// ---------------------------------------------------------------------------

describe("createSseParser — comments and unknown fields", () => {
  it("does not emit an event for a pure comment line with no data: field", () => {
    // Comment-only events produce no data — skip them silently
    const parser = createSseParser();
    const events = parser.feed(": heartbeat\n\n");
    expect(events).toHaveLength(0);
  });

  it("ignores the event: field and still emits the data: payload", () => {
    const parser = createSseParser();
    const events = parser.feed("event: foo\ndata: bar\n\n");
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual<SseEvent>({ type: "data", data: "bar" });
  });

  it("ignores the id: field and still emits the data: payload", () => {
    const parser = createSseParser();
    const events = parser.feed("id: 1\ndata: x\n\n");
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual<SseEvent>({ type: "data", data: "x" });
  });
});
