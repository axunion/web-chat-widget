import type { ChatAdapter } from "./types.ts";

export interface MockAdapterOptions {
	/** Markdown reply to stream. Defaults to a short canned reply. */
	reply?: string;
	/** Latency before the first chunk, in milliseconds. Defaults to 300. */
	initialDelayMs?: number;
	/** Delay between character chunks, in milliseconds. Defaults to 12. */
	chunkDelayMs?: number;
}

const DEFAULT_REPLY =
	"Hello! I am a **mock adapter** streaming a canned reply.\n\n" +
	"Wire `createOpenAISseAdapter` or `createJsonAdapter` to your backend proxy to get real answers.";

function sleep(ms: number): Promise<void> {
	if (ms <= 0) return Promise.resolve();
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Backend-free adapter that streams a canned reply with realistic latency.
 * For demos, playgrounds, and evaluation — not for automated tests that
 * need chunk-level scripting.
 */
export function createMockAdapter(
	options: MockAdapterOptions = {},
): ChatAdapter {
	const reply = options.reply ?? DEFAULT_REPLY;
	const initialDelayMs = options.initialDelayMs ?? 300;
	const chunkDelayMs = options.chunkDelayMs ?? 12;
	return {
		async *send(_messages, signal) {
			await sleep(initialDelayMs);
			if (signal.aborted) return;
			for (const char of reply) {
				yield { type: "text-delta", delta: char };
				await sleep(chunkDelayMs);
				if (signal.aborted) return;
			}
			yield { type: "done" };
		},
	};
}
