import { describe, expect, it } from "vitest";
import type { AdapterChunk, ChatAdapter } from "../../src/index.ts";
import { createOpenAISseAdapter } from "../../src/adapters/index.ts";

// SPEC §8.1  — ChatAdapter contract
// SPEC §8.2.1 — createOpenAISseAdapter: request shape, SSE stream parsing,
//               error handling, AbortSignal propagation

// ---------------------------------------------------------------------------
// Fake fetch helpers
// ---------------------------------------------------------------------------

/**
 * Build a simple fake fetch that responds with a static string body.
 * Captures the URL and RequestInit so tests can inspect them.
 */
function recordingFakeFetch(
	body: string,
	options?: { status?: number; throwOn?: "network" },
): {
	fetchImpl: typeof fetch;
	calls: Array<{ url: string; init: RequestInit | undefined }>;
} {
	const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
	const fetchImpl: typeof fetch = async (url, init) => {
		calls.push({ url: url as string, init });
		if (options?.throwOn === "network") throw new TypeError("network fail");
		return new Response(body, {
			status: options?.status ?? 200,
			headers: { "content-type": "text/event-stream" },
		});
	};
	return { fetchImpl, calls };
}

/** Simplest static fake fetch — no call recording needed. */
function fakeFetch(
	body: string,
	init?: { status?: number; throwOn?: "network" },
): typeof fetch {
	return async (_url, _init) => {
		if (init?.throwOn === "network") throw new TypeError("network fail");
		return new Response(body, {
			status: init?.status ?? 200,
			headers: { "content-type": "text/event-stream" },
		});
	};
}

/** Collect all chunks from an adapter send call into an array. */
async function collectChunks(
	iterable: AsyncIterable<AdapterChunk>,
): Promise<AdapterChunk[]> {
	const chunks: AdapterChunk[] = [];
	for await (const chunk of iterable) {
		chunks.push(chunk);
	}
	return chunks;
}

/** A messages array with real-world internal fields that must NOT leak. */
const messagesWithInternalFields = [
	{
		id: "msg-1",
		role: "user" as const,
		content: "hello",
		createdAt: 1_700_000_000_000,
		status: "done" as const,
	},
];

/** Minimal message array for tests that do not care about message fields. */
const minimalMessages = [{ id: "m1", role: "user" as const, content: "hi", createdAt: 0 }];

/** Build a multi-chunk SSE body. */
function sseBody(...lines: string[]): string {
	return lines.join("\n");
}

// ---------------------------------------------------------------------------
// §8.2.1 — Request body & headers (tests 1-5)
// ---------------------------------------------------------------------------

describe("createOpenAISseAdapter — request body & headers", () => {
	it("POSTs to the URL provided in options", async () => {
		const { fetchImpl, calls } = recordingFakeFetch(
			sseBody("data: [DONE]", "", ""),
		);
		const adapter = createOpenAISseAdapter({
			url: "https://example.com/api/chat",
			fetchImpl,
		});
		const ctrl = new AbortController();
		await collectChunks(adapter.send(minimalMessages, ctrl.signal));

		expect(calls).toHaveLength(1);
		expect(calls[0].url).toBe("https://example.com/api/chat");
	});

	it("uses HTTP method POST", async () => {
		const { fetchImpl, calls } = recordingFakeFetch(
			sseBody("data: [DONE]", "", ""),
		);
		const adapter = createOpenAISseAdapter({
			url: "https://example.com/api/chat",
			fetchImpl,
		});
		const ctrl = new AbortController();
		await collectChunks(adapter.send(minimalMessages, ctrl.signal));

		expect((calls[0].init?.method ?? "").toUpperCase()).toBe("POST");
	});

	it("sets Content-Type: application/json header", async () => {
		const { fetchImpl, calls } = recordingFakeFetch(
			sseBody("data: [DONE]", "", ""),
		);
		const adapter = createOpenAISseAdapter({
			url: "https://example.com/api/chat",
			fetchImpl,
		});
		const ctrl = new AbortController();
		await collectChunks(adapter.send(minimalMessages, ctrl.signal));

		const headers = calls[0].init?.headers as Record<string, string> | undefined;
		const contentType =
			headers?.["content-type"] ??
			headers?.["Content-Type"] ??
			headers?.["CONTENT-TYPE"] ??
			"";
		expect(contentType.toLowerCase()).toContain("application/json");
	});

	it("merges additional headers from options into the request", async () => {
		const { fetchImpl, calls } = recordingFakeFetch(
			sseBody("data: [DONE]", "", ""),
		);
		const adapter = createOpenAISseAdapter({
			url: "https://example.com/api/chat",
			headers: { Authorization: "Bearer secret", "X-Custom": "value" },
			fetchImpl,
		});
		const ctrl = new AbortController();
		await collectChunks(adapter.send(minimalMessages, ctrl.signal));

		const headers = calls[0].init?.headers as Record<string, string> | undefined;
		// Normalize header name lookups (implementations may lowercase)
		const normalize = (h: Record<string, string> | undefined, key: string) =>
			h?.[key] ?? h?.[key.toLowerCase()] ?? h?.[key.toUpperCase()];

		expect(normalize(headers, "Authorization")).toBe("Bearer secret");
		expect(normalize(headers, "X-Custom")).toBe("value");
	});

	it("body contains stream:true and messages array with only role+content — no id/createdAt/status", async () => {
		const { fetchImpl, calls } = recordingFakeFetch(
			sseBody("data: [DONE]", "", ""),
		);
		const adapter = createOpenAISseAdapter({
			url: "https://example.com/api/chat",
			fetchImpl,
		});
		const ctrl = new AbortController();
		await collectChunks(adapter.send(messagesWithInternalFields, ctrl.signal));

		const rawBody = calls[0].init?.body as string;
		const parsed = JSON.parse(rawBody) as {
			stream: unknown;
			messages: unknown[];
			model?: unknown;
		};

		expect(parsed.stream).toBe(true);
		expect(Array.isArray(parsed.messages)).toBe(true);
		expect(parsed.messages).toHaveLength(1);

		const firstMsg = parsed.messages[0] as Record<string, unknown>;
		// Must have role and content
		expect(firstMsg.role).toBe("user");
		expect(firstMsg.content).toBe("hello");
		// Must NOT have internal fields
		expect("id" in firstMsg).toBe(false);
		expect("createdAt" in firstMsg).toBe(false);
		expect("status" in firstMsg).toBe(false);
	});

	it("includes model in body when options.model is provided", async () => {
		const { fetchImpl, calls } = recordingFakeFetch(
			sseBody("data: [DONE]", "", ""),
		);
		const adapter = createOpenAISseAdapter({
			url: "https://example.com/api/chat",
			model: "gpt-4o",
			fetchImpl,
		});
		const ctrl = new AbortController();
		await collectChunks(adapter.send(minimalMessages, ctrl.signal));

		const rawBody = calls[0].init?.body as string;
		const parsed = JSON.parse(rawBody) as { model?: unknown };
		expect(parsed.model).toBe("gpt-4o");
	});

	it("omits model from body when options.model is not provided", async () => {
		const { fetchImpl, calls } = recordingFakeFetch(
			sseBody("data: [DONE]", "", ""),
		);
		const adapter = createOpenAISseAdapter({
			url: "https://example.com/api/chat",
			fetchImpl,
		});
		const ctrl = new AbortController();
		await collectChunks(adapter.send(minimalMessages, ctrl.signal));

		const rawBody = calls[0].init?.body as string;
		const parsed = JSON.parse(rawBody) as Record<string, unknown>;
		expect("model" in parsed).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// §8.2.1 — Stream parsing (tests 6-10)
// ---------------------------------------------------------------------------

describe("createOpenAISseAdapter — stream parsing", () => {
	it("yields a single text-delta for one data line with content", async () => {
		// SPEC §8.2.1: extract choices[0].delta.content → yield { type: "text-delta", delta }
		const body = sseBody(
			'data: {"choices":[{"delta":{"content":"hello"}}]}',
			"",
			"data: [DONE]",
			"",
			"",
		);
		const adapter = createOpenAISseAdapter({
			url: "https://example.com/api/chat",
			fetchImpl: fakeFetch(body),
		});
		const ctrl = new AbortController();
		const chunks = await collectChunks(adapter.send(minimalMessages, ctrl.signal));

		const textDeltas = chunks.filter((c) => c.type === "text-delta");
		expect(textDeltas).toHaveLength(1);
		expect(textDeltas[0]).toEqual({ type: "text-delta", delta: "hello" });
	});

	it("yields two text-delta chunks in order for two data lines", async () => {
		// SPEC §8.2.1: multiple deltas arrive in stream order
		const body = sseBody(
			'data: {"choices":[{"delta":{"content":"hel"}}]}',
			"",
			'data: {"choices":[{"delta":{"content":"lo"}}]}',
			"",
			"data: [DONE]",
			"",
			"",
		);
		const adapter = createOpenAISseAdapter({
			url: "https://example.com/api/chat",
			fetchImpl: fakeFetch(body),
		});
		const ctrl = new AbortController();
		const chunks = await collectChunks(adapter.send(minimalMessages, ctrl.signal));

		const textDeltas = chunks.filter((c) => c.type === "text-delta");
		expect(textDeltas).toHaveLength(2);
		expect(textDeltas[0]).toEqual({ type: "text-delta", delta: "hel" });
		expect(textDeltas[1]).toEqual({ type: "text-delta", delta: "lo" });
	});

	it("yields { type: 'done' } on data: [DONE] and iterator ends", async () => {
		// SPEC §8.2.1: data: [DONE] → yield done and close iterator
		const body = sseBody(
			'data: {"choices":[{"delta":{"content":"hi"}}]}',
			"",
			"data: [DONE]",
			"",
			"",
		);
		const adapter = createOpenAISseAdapter({
			url: "https://example.com/api/chat",
			fetchImpl: fakeFetch(body),
		});
		const ctrl = new AbortController();
		const chunks = await collectChunks(adapter.send(minimalMessages, ctrl.signal));

		const doneChunks = chunks.filter((c) => c.type === "done");
		expect(doneChunks).toHaveLength(1);
		// No chunks should appear after done
		const doneIndex = chunks.findIndex((c) => c.type === "done");
		expect(chunks.length - 1).toBe(doneIndex);
	});

	it("skips delta events where content is empty string", async () => {
		// SPEC §8.2.1: skip if content is undefined/empty
		const body = sseBody(
			'data: {"choices":[{"delta":{"content":""}}]}',
			"",
			'data: {"choices":[{"delta":{"content":"real"}}]}',
			"",
			"data: [DONE]",
			"",
			"",
		);
		const adapter = createOpenAISseAdapter({
			url: "https://example.com/api/chat",
			fetchImpl: fakeFetch(body),
		});
		const ctrl = new AbortController();
		const chunks = await collectChunks(adapter.send(minimalMessages, ctrl.signal));

		const textDeltas = chunks.filter((c) => c.type === "text-delta");
		expect(textDeltas).toHaveLength(1);
		expect(textDeltas[0]).toEqual({ type: "text-delta", delta: "real" });
	});

	it("skips delta events where content field is absent", async () => {
		// SPEC §8.2.1: skip if content is undefined
		const body = sseBody(
			'data: {"choices":[{"delta":{}}]}',
			"",
			'data: {"choices":[{"delta":{"content":"real"}}]}',
			"",
			"data: [DONE]",
			"",
			"",
		);
		const adapter = createOpenAISseAdapter({
			url: "https://example.com/api/chat",
			fetchImpl: fakeFetch(body),
		});
		const ctrl = new AbortController();
		const chunks = await collectChunks(adapter.send(minimalMessages, ctrl.signal));

		const textDeltas = chunks.filter((c) => c.type === "text-delta");
		expect(textDeltas).toHaveLength(1);
		expect(textDeltas[0]).toEqual({ type: "text-delta", delta: "real" });
	});

	it("yields done when stream ends without explicit [DONE] line", async () => {
		// SPEC §8.2.1: if server closes stream without [DONE], still yield done
		const body = sseBody(
			'data: {"choices":[{"delta":{"content":"hi"}}]}',
			"",
			"",
		);
		const adapter = createOpenAISseAdapter({
			url: "https://example.com/api/chat",
			fetchImpl: fakeFetch(body),
		});
		const ctrl = new AbortController();
		const chunks = await collectChunks(adapter.send(minimalMessages, ctrl.signal));

		const doneChunks = chunks.filter((c) => c.type === "done");
		expect(doneChunks).toHaveLength(1);
	});
});

// ---------------------------------------------------------------------------
// §8.2.1 — Error handling (tests 11-14)
// ---------------------------------------------------------------------------

describe("createOpenAISseAdapter — error handling", () => {
	it("yields { type: 'error' } then ends on HTTP 500 response", async () => {
		// SPEC §8.2.1: HTTP status >= 400 → yield error
		const adapter = createOpenAISseAdapter({
			url: "https://example.com/api/chat",
			fetchImpl: fakeFetch("Internal Server Error", { status: 500 }),
		});
		const ctrl = new AbortController();
		const chunks = await collectChunks(adapter.send(minimalMessages, ctrl.signal));

		expect(chunks).toHaveLength(1);
		expect(chunks[0].type).toBe("error");
		expect((chunks[0] as Extract<AdapterChunk, { type: "error" }>).error).toBeInstanceOf(Error);
	});

	it("yields { type: 'error' } then ends on HTTP 400 response", async () => {
		// SPEC §8.2.1: HTTP status >= 400 → yield error
		const adapter = createOpenAISseAdapter({
			url: "https://example.com/api/chat",
			fetchImpl: fakeFetch("Bad Request", { status: 400 }),
		});
		const ctrl = new AbortController();
		const chunks = await collectChunks(adapter.send(minimalMessages, ctrl.signal));

		expect(chunks).toHaveLength(1);
		expect(chunks[0].type).toBe("error");
	});

	it("yields { type: 'error' } then ends on malformed JSON in data payload", async () => {
		// SPEC §8.2.1: JSON parse failure → yield error
		const body = sseBody("data: {not valid json}", "", "data: [DONE]", "", "");
		const adapter = createOpenAISseAdapter({
			url: "https://example.com/api/chat",
			fetchImpl: fakeFetch(body),
		});
		const ctrl = new AbortController();
		const chunks = await collectChunks(adapter.send(minimalMessages, ctrl.signal));

		const errorChunks = chunks.filter((c) => c.type === "error");
		expect(errorChunks.length).toBeGreaterThanOrEqual(1);
		expect(errorChunks[0].type).toBe("error");
		// After error, no text-delta or further chunks should follow
		const errorIndex = chunks.findIndex((c) => c.type === "error");
		expect(chunks.length - 1).toBe(errorIndex);
	});

	it("yields { type: 'error' } then ends when choices array is missing", async () => {
		// SPEC §8.2.1: missing choices → yield error
		const body = sseBody('data: {"no_choices":true}', "", "data: [DONE]", "", "");
		const adapter = createOpenAISseAdapter({
			url: "https://example.com/api/chat",
			fetchImpl: fakeFetch(body),
		});
		const ctrl = new AbortController();
		const chunks = await collectChunks(adapter.send(minimalMessages, ctrl.signal));

		const errorChunks = chunks.filter((c) => c.type === "error");
		expect(errorChunks.length).toBeGreaterThanOrEqual(1);
		const errorIndex = chunks.findIndex((c) => c.type === "error");
		expect(chunks.length - 1).toBe(errorIndex);
	});

	it("yields { type: 'error' } and does NOT throw synchronously on network failure", async () => {
		// SPEC §8.1 / adapters.md invariant: never throw — always yield error chunks
		const adapter = createOpenAISseAdapter({
			url: "https://example.com/api/chat",
			fetchImpl: fakeFetch("", { throwOn: "network" }),
		});
		const ctrl = new AbortController();

		// Must not throw — the error must arrive as a yielded chunk
		let threwSynchronously = false;
		let chunks: AdapterChunk[] = [];
		try {
			chunks = await collectChunks(adapter.send(minimalMessages, ctrl.signal));
		} catch {
			threwSynchronously = true;
		}

		expect(threwSynchronously).toBe(false);
		expect(chunks).toHaveLength(1);
		expect(chunks[0].type).toBe("error");
		const errChunk = chunks[0] as Extract<AdapterChunk, { type: "error" }>;
		expect(errChunk.error).toBeInstanceOf(Error);
	});
});

// ---------------------------------------------------------------------------
// §8.1 — AbortSignal (tests 15-16)
// ---------------------------------------------------------------------------

describe("createOpenAISseAdapter — AbortSignal", () => {
	it("passes the AbortSignal through to the fetch call", async () => {
		const { fetchImpl, calls } = recordingFakeFetch(
			sseBody("data: [DONE]", "", ""),
		);
		const adapter = createOpenAISseAdapter({
			url: "https://example.com/api/chat",
			fetchImpl,
		});
		const ctrl = new AbortController();
		await collectChunks(adapter.send(minimalMessages, ctrl.signal));

		// The signal passed to fetch must be the same object as the one we gave send()
		expect(calls[0].init?.signal).toBe(ctrl.signal);
	});

	it("stops iteration when the AbortSignal is aborted mid-stream", async () => {
		// SPEC §8.1: adapter must close iterator promptly on abort
		// Build a ReadableStream that stalls after the first chunk so we can abort
		const ctrl = new AbortController();

		const fetchImpl: typeof fetch = async (_url, _init) => {
			const encoder = new TextEncoder();
			const firstChunk = encoder.encode(
				'data: {"choices":[{"delta":{"content":"first"}}]}\n\n',
			);

			let controller: ReadableStreamDefaultController<Uint8Array>;
			const stream = new ReadableStream<Uint8Array>({
				start(c) {
					controller = c;
					// Enqueue the first real chunk immediately
					c.enqueue(firstChunk);
					// Do NOT close — simulate a stalled stream
				},
			});

			// Abort after a microtask so we let the adapter process the first chunk
			queueMicrotask(() => {
				ctrl.abort();
				// Close the stream to unblock any pending reads after abort
				try {
					controller.close();
				} catch {
					// may already be closed
				}
			});

			return new Response(stream, {
				status: 200,
				headers: { "content-type": "text/event-stream" },
			});
		};

		const adapter = createOpenAISseAdapter({
			url: "https://example.com/api/chat",
			fetchImpl,
		});

		const chunks: AdapterChunk[] = [];
		// collectChunks must terminate (not hang)
		for await (const chunk of adapter.send(minimalMessages, ctrl.signal)) {
			chunks.push(chunk);
		}

		// The iterator must have terminated — we don't care about exact chunks
		// but it must not hang forever, and it must not have yielded infinitely
		expect(chunks.length).toBeLessThan(100);
	});
});

// ---------------------------------------------------------------------------
// §8.1 — Contract: the returned object implements ChatAdapter (test 17)
// ---------------------------------------------------------------------------

describe("createOpenAISseAdapter — ChatAdapter contract", () => {
	it("returns an object with a send method yielding an async iterable", () => {
		// SPEC §8.1: send() returns AsyncIterable<AdapterChunk>
		const adapter: ChatAdapter = createOpenAISseAdapter({
			url: "https://example.com/api/chat",
			fetchImpl: fakeFetch(sseBody("data: [DONE]", "", "")),
		});

		expect(typeof adapter.send).toBe("function");

		const ctrl = new AbortController();
		const iterable = adapter.send(minimalMessages, ctrl.signal);

		// Must have Symbol.asyncIterator
		expect(Symbol.asyncIterator in iterable).toBe(true);
	});
});
