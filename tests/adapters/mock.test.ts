import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockAdapter } from "../../src/adapters/index.ts";
import type { AdapterChunk } from "../../src/index.ts";

// ARCHITECTURE.md §Adapter Contract — Built-in mock adapter
// API.md §4.4 — createMockAdapter: canned streaming, abort handling, delays

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

const instant = { initialDelayMs: 0, chunkDelayMs: 0 };

describe("createMockAdapter", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("streams the default reply as text-deltas ending with a single done", async () => {
		const adapter = createMockAdapter(instant);
		const chunks = await collectChunks(
			adapter.send([], new AbortController().signal),
		);

		const doneChunks = chunks.filter((c) => c.type === "done");
		expect(doneChunks).toHaveLength(1);
		expect(chunks[chunks.length - 1].type).toBe("done");
		const text = chunks
			.filter((c) => c.type === "text-delta")
			.map((c) => c.delta)
			.join("");
		expect(text.length).toBeGreaterThan(0);
	});

	it("streams a custom reply verbatim, one character per chunk", async () => {
		const adapter = createMockAdapter({ ...instant, reply: "Hi!" });
		const chunks = await collectChunks(
			adapter.send([], new AbortController().signal),
		);

		expect(chunks).toEqual([
			{ type: "text-delta", delta: "H" },
			{ type: "text-delta", delta: "i" },
			{ type: "text-delta", delta: "!" },
			{ type: "done" },
		]);
	});

	it("stops without done when the signal aborts mid-stream", async () => {
		const adapter = createMockAdapter({ ...instant, reply: "Hi!" });
		const controller = new AbortController();
		const received: AdapterChunk[] = [];

		for await (const chunk of adapter.send([], controller.signal)) {
			received.push(chunk);
			controller.abort();
		}

		expect(received).toEqual([{ type: "text-delta", delta: "H" }]);
	});

	it("yields nothing when the signal is already aborted", async () => {
		const adapter = createMockAdapter(instant);
		const controller = new AbortController();
		controller.abort();

		const chunks = await collectChunks(adapter.send([], controller.signal));

		expect(chunks).toEqual([]);
	});

	it("waits initialDelayMs before the first chunk and chunkDelayMs between chunks", async () => {
		vi.useFakeTimers();
		const adapter = createMockAdapter({ reply: "Hi" });
		const iterator = adapter
			.send([], new AbortController().signal)
			[Symbol.asyncIterator]();

		let first: AdapterChunk | undefined;
		const firstPending = iterator.next().then((r) => {
			first = r.value;
		});
		await vi.advanceTimersByTimeAsync(299);
		expect(first).toBeUndefined();
		await vi.advanceTimersByTimeAsync(1);
		await firstPending;
		expect(first).toEqual({ type: "text-delta", delta: "H" });

		let second: AdapterChunk | undefined;
		const secondPending = iterator.next().then((r) => {
			second = r.value;
		});
		await vi.advanceTimersByTimeAsync(11);
		expect(second).toBeUndefined();
		await vi.advanceTimersByTimeAsync(1);
		await secondPending;
		expect(second).toEqual({ type: "text-delta", delta: "i" });
	});
});
