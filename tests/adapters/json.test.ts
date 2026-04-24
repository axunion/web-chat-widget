import { describe, expect, it } from "vitest";
import type { AdapterChunk, ChatAdapter } from "../../src/index.ts";
import { createJsonAdapter } from "../../src/adapters/index.ts";

// SPEC §8.1  — ChatAdapter contract
// SPEC §8.2.2 — createJsonAdapter: request shape, default extract, custom extract,
//               error handling, AbortSignal propagation

// ---------------------------------------------------------------------------
// Fake fetch helpers
// ---------------------------------------------------------------------------

/**
 * Build a recording fake fetch that responds with a JSON body.
 * Captures the URL and RequestInit so tests can inspect them.
 */
function recordingFakeFetch(
	responseBody: unknown,
	options?: { status?: number; throwOn?: "network" },
): {
	fetchImpl: typeof fetch;
	calls: Array<{ url: string; init: RequestInit | undefined }>;
} {
	const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
	const fetchImpl: typeof fetch = async (url, init) => {
		calls.push({ url: url as string, init });
		if (options?.throwOn === "network") throw new TypeError("network fail");
		return new Response(JSON.stringify(responseBody), {
			status: options?.status ?? 200,
			headers: { "content-type": "application/json" },
		});
	};
	return { fetchImpl, calls };
}

/** Simple fake fetch that responds with a JSON body — no call recording. */
function fakeFetch(
	responseBody: unknown,
	options?: { status?: number; throwOn?: "network"; rawBody?: string },
): typeof fetch {
	return async (_url, _init) => {
		if (options?.throwOn === "network") throw new TypeError("network fail");
		const raw =
			options?.rawBody !== undefined
				? options.rawBody
				: JSON.stringify(responseBody);
		return new Response(raw, {
			status: options?.status ?? 200,
			headers: { "content-type": "application/json" },
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

/** Message with internal fields that must NOT appear in the request body. */
const messagesWithInternalFields = [
	{
		id: "msg-1",
		role: "user" as const,
		content: "hello",
		createdAt: 1_700_000_000_000,
		status: "done" as const,
	},
];

/** Minimal messages array for tests that do not care about message fields. */
const minimalMessages = [
	{ id: "m1", role: "user" as const, content: "hi", createdAt: 0 },
];

// ---------------------------------------------------------------------------
// §8.2.2 — Request shape (tests 1-4)
// ---------------------------------------------------------------------------

describe("createJsonAdapter — request shape", () => {
	it("POSTs to the URL provided in options", async () => {
		const { fetchImpl, calls } = recordingFakeFetch({ reply: "hi" });
		const adapter = createJsonAdapter({
			url: "https://example.com/api/chat",
			fetchImpl,
		});
		const ctrl = new AbortController();
		await collectChunks(adapter.send(minimalMessages, ctrl.signal));

		expect(calls).toHaveLength(1);
		expect(calls[0].url).toBe("https://example.com/api/chat");
	});

	it("uses HTTP method POST and sets Content-Type: application/json", async () => {
		const { fetchImpl, calls } = recordingFakeFetch({ reply: "hi" });
		const adapter = createJsonAdapter({
			url: "https://example.com/api/chat",
			fetchImpl,
		});
		const ctrl = new AbortController();
		await collectChunks(adapter.send(minimalMessages, ctrl.signal));

		expect((calls[0].init?.method ?? "").toUpperCase()).toBe("POST");

		const headers = calls[0].init?.headers as Record<string, string> | undefined;
		const contentType =
			headers?.["content-type"] ??
			headers?.["Content-Type"] ??
			headers?.["CONTENT-TYPE"] ??
			"";
		expect(contentType.toLowerCase()).toContain("application/json");
	});

	it("sends body as JSON with messages containing only role and content — no id/createdAt/status", async () => {
		const { fetchImpl, calls } = recordingFakeFetch({ reply: "hi" });
		const adapter = createJsonAdapter({
			url: "https://example.com/api/chat",
			fetchImpl,
		});
		const ctrl = new AbortController();
		await collectChunks(
			adapter.send(messagesWithInternalFields, ctrl.signal),
		);

		const rawBody = calls[0].init?.body as string;
		const parsed = JSON.parse(rawBody) as { messages: unknown[] };

		expect(Array.isArray(parsed.messages)).toBe(true);
		expect(parsed.messages).toHaveLength(1);

		const firstMsg = parsed.messages[0] as Record<string, unknown>;
		expect(firstMsg.role).toBe("user");
		expect(firstMsg.content).toBe("hello");
		// Internal fields must NOT leak into the request
		expect("id" in firstMsg).toBe(false);
		expect("createdAt" in firstMsg).toBe(false);
		expect("status" in firstMsg).toBe(false);
	});

	it("merges additional headers from options into the request", async () => {
		const { fetchImpl, calls } = recordingFakeFetch({ reply: "hi" });
		const adapter = createJsonAdapter({
			url: "https://example.com/api/chat",
			headers: { Authorization: "Bearer token", "X-Custom": "value" },
			fetchImpl,
		});
		const ctrl = new AbortController();
		await collectChunks(adapter.send(minimalMessages, ctrl.signal));

		const headers = calls[0].init?.headers as Record<string, string> | undefined;
		const normalize = (h: Record<string, string> | undefined, key: string) =>
			h?.[key] ?? h?.[key.toLowerCase()] ?? h?.[key.toUpperCase()];

		expect(normalize(headers, "Authorization")).toBe("Bearer token");
		expect(normalize(headers, "X-Custom")).toBe("value");
	});
});

// ---------------------------------------------------------------------------
// §8.2.2 — Response handling with default extract (tests 5-7)
// ---------------------------------------------------------------------------

describe("createJsonAdapter — default extract (json.reply)", () => {
	it("with body { reply: 'hello' } yields one text-delta 'hello' then done", async () => {
		const adapter = createJsonAdapter({
			url: "https://example.com/api/chat",
			fetchImpl: fakeFetch({ reply: "hello" }),
		});
		const ctrl = new AbortController();
		const chunks = await collectChunks(
			adapter.send(minimalMessages, ctrl.signal),
		);

		const textDeltas = chunks.filter((c) => c.type === "text-delta");
		expect(textDeltas).toHaveLength(1);
		expect(textDeltas[0]).toEqual({ type: "text-delta", delta: "hello" });

		const doneChunks = chunks.filter((c) => c.type === "done");
		expect(doneChunks).toHaveLength(1);
	});

	it("yields the text-delta chunk before the done chunk", async () => {
		const adapter = createJsonAdapter({
			url: "https://example.com/api/chat",
			fetchImpl: fakeFetch({ reply: "hello" }),
		});
		const ctrl = new AbortController();
		const chunks = await collectChunks(
			adapter.send(minimalMessages, ctrl.signal),
		);

		const textDeltaIndex = chunks.findIndex((c) => c.type === "text-delta");
		const doneIndex = chunks.findIndex((c) => c.type === "done");

		expect(textDeltaIndex).toBeGreaterThanOrEqual(0);
		expect(doneIndex).toBeGreaterThanOrEqual(0);
		expect(textDeltaIndex).toBeLessThan(doneIndex);
	});

	it("iterator ends after done — no further chunks are emitted", async () => {
		const adapter = createJsonAdapter({
			url: "https://example.com/api/chat",
			fetchImpl: fakeFetch({ reply: "hello" }),
		});
		const ctrl = new AbortController();
		const chunks = await collectChunks(
			adapter.send(minimalMessages, ctrl.signal),
		);

		const doneIndex = chunks.findIndex((c) => c.type === "done");
		expect(doneIndex).toBeGreaterThanOrEqual(0);
		// done must be the last chunk
		expect(chunks.length - 1).toBe(doneIndex);
	});
});

// ---------------------------------------------------------------------------
// §8.2.2 — Custom extract function (tests 8-10)
// ---------------------------------------------------------------------------

describe("createJsonAdapter — custom extract", () => {
	it("uses extract option to read from a nested path like json.data.message", async () => {
		const adapter = createJsonAdapter({
			url: "https://example.com/api/chat",
			extract: (json) => (json as { data: { message: string } }).data.message,
			fetchImpl: fakeFetch({ data: { message: "hi" } }),
		});
		const ctrl = new AbortController();
		const chunks = await collectChunks(
			adapter.send(minimalMessages, ctrl.signal),
		);

		const textDeltas = chunks.filter((c) => c.type === "text-delta");
		expect(textDeltas).toHaveLength(1);
		expect(textDeltas[0]).toEqual({ type: "text-delta", delta: "hi" });
	});

	it("calls extract with the raw parsed JSON object — sentinel key survives round-trip", async () => {
		const sentinel = { __sentinel__: true, reply: "sentinel-value" };
		let receivedJson: unknown = undefined;

		const adapter = createJsonAdapter({
			url: "https://example.com/api/chat",
			extract: (json) => {
				receivedJson = json;
				return (json as { reply: string }).reply;
			},
			fetchImpl: fakeFetch(sentinel),
		});
		const ctrl = new AbortController();
		await collectChunks(adapter.send(minimalMessages, ctrl.signal));

		expect(receivedJson).toMatchObject({ __sentinel__: true, reply: "sentinel-value" });
	});

	it("yields an error chunk when extract throws", async () => {
		const adapter = createJsonAdapter({
			url: "https://example.com/api/chat",
			extract: () => {
				throw new Error("extraction failure");
			},
			fetchImpl: fakeFetch({ reply: "hello" }),
		});
		const ctrl = new AbortController();
		const chunks = await collectChunks(
			adapter.send(minimalMessages, ctrl.signal),
		);

		const errorChunks = chunks.filter((c) => c.type === "error");
		expect(errorChunks.length).toBeGreaterThanOrEqual(1);
		expect(
			(errorChunks[0] as Extract<AdapterChunk, { type: "error" }>).error,
		).toBeInstanceOf(Error);
	});
});

// ---------------------------------------------------------------------------
// §8.2.2 — Error handling (tests 11-14)
// ---------------------------------------------------------------------------

describe("createJsonAdapter — error handling", () => {
	it("yields error then ends on HTTP 500 response", async () => {
		const adapter = createJsonAdapter({
			url: "https://example.com/api/chat",
			fetchImpl: fakeFetch({ error: "server error" }, { status: 500 }),
		});
		const ctrl = new AbortController();
		const chunks = await collectChunks(
			adapter.send(minimalMessages, ctrl.signal),
		);

		expect(chunks).toHaveLength(1);
		expect(chunks[0].type).toBe("error");
		expect(
			(chunks[0] as Extract<AdapterChunk, { type: "error" }>).error,
		).toBeInstanceOf(Error);
	});

	it("yields error then ends on HTTP 400 response", async () => {
		const adapter = createJsonAdapter({
			url: "https://example.com/api/chat",
			fetchImpl: fakeFetch({ error: "bad request" }, { status: 400 }),
		});
		const ctrl = new AbortController();
		const chunks = await collectChunks(
			adapter.send(minimalMessages, ctrl.signal),
		);

		expect(chunks).toHaveLength(1);
		expect(chunks[0].type).toBe("error");
	});

	it("yields error then ends when response body is malformed JSON", async () => {
		const adapter = createJsonAdapter({
			url: "https://example.com/api/chat",
			fetchImpl: fakeFetch(null, { rawBody: "{ not valid json !!!" }),
		});
		const ctrl = new AbortController();
		const chunks = await collectChunks(
			adapter.send(minimalMessages, ctrl.signal),
		);

		const errorChunks = chunks.filter((c) => c.type === "error");
		expect(errorChunks.length).toBeGreaterThanOrEqual(1);
		// error must be the last chunk — nothing follows it
		const errorIndex = chunks.findIndex((c) => c.type === "error");
		expect(chunks.length - 1).toBe(errorIndex);
	});

	it("yields error when extract returns a non-string value (number, null, object)", async () => {
		// SPEC §8.2.2: extract must return string; non-string → error chunk
		for (const badReturn of [42, null, { obj: true }]) {
			const adapter = createJsonAdapter({
				url: "https://example.com/api/chat",
				// biome-ignore lint/suspicious/noExplicitAny: intentional bad return for testing
				extract: () => badReturn as any,
				fetchImpl: fakeFetch({ reply: "ignored" }),
			});
			const ctrl = new AbortController();
			const chunks = await collectChunks(
				adapter.send(minimalMessages, ctrl.signal),
			);

			const errorChunks = chunks.filter((c) => c.type === "error");
			expect(errorChunks.length).toBeGreaterThanOrEqual(1);
		}
	});
});

// ---------------------------------------------------------------------------
// §8.1 — Network / abort (tests 15-16)
// ---------------------------------------------------------------------------

describe("createJsonAdapter — network and abort", () => {
	it("yields error and does NOT throw synchronously on network failure", async () => {
		// adapters.md invariant: never throw — always yield error chunks
		const adapter = createJsonAdapter({
			url: "https://example.com/api/chat",
			fetchImpl: fakeFetch(null, { throwOn: "network" }),
		});
		const ctrl = new AbortController();

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
		expect(
			(chunks[0] as Extract<AdapterChunk, { type: "error" }>).error,
		).toBeInstanceOf(Error);
	});

	it("passes the AbortSignal through to the fetch call", async () => {
		const { fetchImpl, calls } = recordingFakeFetch({ reply: "hi" });
		const adapter = createJsonAdapter({
			url: "https://example.com/api/chat",
			fetchImpl,
		});
		const ctrl = new AbortController();
		await collectChunks(adapter.send(minimalMessages, ctrl.signal));

		// The signal delivered to fetch must be the same object given to send()
		expect(calls[0].init?.signal).toBe(ctrl.signal);
	});
});

// ---------------------------------------------------------------------------
// §8.1 — ChatAdapter contract (test 17)
// ---------------------------------------------------------------------------

describe("createJsonAdapter — ChatAdapter contract", () => {
	it("returns an object with a send method that returns an AsyncIterable", () => {
		const adapter: ChatAdapter = createJsonAdapter({
			url: "https://example.com/api/chat",
			fetchImpl: fakeFetch({ reply: "hi" }),
		});

		expect(typeof adapter.send).toBe("function");

		const ctrl = new AbortController();
		const iterable = adapter.send(minimalMessages, ctrl.signal);

		// Must be async-iterable
		expect(Symbol.asyncIterator in iterable).toBe(true);
	});
});
