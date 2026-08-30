import type { Message, MessageRole } from "../core/messages.ts";
import {
	classifyErrorChunk,
	createTimeoutController,
	isRecord,
	postAdapterRequest,
	toError,
	toWireMessages,
} from "./internal.ts";
import { createSseParser, type SseEvent } from "./sse-parse.ts";
import type { AdapterChunk, ChatAdapter } from "./types.ts";

export interface OpenAISseAdapterOptions {
	url: string;
	headers?: Record<string, string>;
	model?: string;
	timeoutMs?: number;
	fetchImpl?: typeof fetch;
}

interface OpenAiRequestBody {
	messages: Array<{ role: MessageRole; content: string }>;
	stream: true;
	model?: string;
}

function extractDelta(data: string): AdapterChunk | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(data);
	} catch (err) {
		return { type: "error", error: toError(err) };
	}
	if (
		!isRecord(parsed) ||
		!Array.isArray(parsed.choices) ||
		parsed.choices.length === 0
	) {
		return {
			type: "error",
			error: new Error("Missing choices in SSE payload"),
		};
	}
	const first = parsed.choices[0];
	if (!isRecord(first)) {
		return { type: "error", error: new Error("Invalid choice shape") };
	}
	const delta = isRecord(first.delta) ? first.delta.content : undefined;
	if (typeof delta !== "string" || delta.length === 0) return null;
	return { type: "text-delta", delta };
}

// Drains one batch of parsed SSE events. Returns true when the stream is
// finished (a [DONE] marker or an error chunk), so the streaming path and the
// end-of-stream flush share one copy of the event-handling rules.
function* drainEvents(
	events: readonly SseEvent[],
): Generator<AdapterChunk, boolean> {
	for (const evt of events) {
		if (evt.type === "done") {
			yield { type: "done" };
			return true;
		}
		const chunk = extractDelta(evt.data);
		if (!chunk) continue;
		yield chunk;
		if (chunk.type === "error") return true;
	}
	return false;
}

function buildBody(
	messages: readonly Message[],
	model: string | undefined,
): OpenAiRequestBody {
	const body: OpenAiRequestBody = {
		messages: toWireMessages(messages),
		stream: true,
	};
	if (model !== undefined) body.model = model;
	return body;
}

/**
 * Adapter for an endpoint that speaks the OpenAI-compatible SSE shape
 * (`choices[0].delta.content` deltas, terminated by `data: [DONE]`).
 *
 * `url` should point at **your own backend proxy**, not directly at a provider
 * such as api.openai.com — the browser must not hold the provider API key. The
 * proxy attaches the key server-side and relays the stream. See ARCHITECTURE.md
 * §Authentication and `examples/backend` for a reference implementation.
 */
export function createOpenAISseAdapter(
	options: OpenAISseAdapterOptions,
): ChatAdapter {
	const fetchImpl = options.fetchImpl ?? fetch;
	return {
		send(messages, signal) {
			return streamOpenAI(options, fetchImpl, messages, signal);
		},
	};
}

async function* streamOpenAI(
	options: OpenAISseAdapterOptions,
	fetchImpl: typeof fetch,
	messages: readonly Message[],
	signal: AbortSignal,
): AsyncIterable<AdapterChunk> {
	const body = buildBody(messages, options.model);
	const timeout = createTimeoutController(signal, options.timeoutMs);
	try {
		timeout.arm();
		const result = await postAdapterRequest(options, fetchImpl, body, timeout);
		if ("chunks" in result) {
			yield* result.chunks;
			return;
		}
		const { response } = result;

		if (!response.body) {
			yield { type: "error", error: new Error("Response has no body") };
			return;
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		const parser = createSseParser();
		try {
			while (true) {
				if (signal.aborted) return;
				let read: ReadableStreamReadResult<Uint8Array>;
				try {
					read = await reader.read();
				} catch (err) {
					yield* classifyErrorChunk(timeout, err);
					return;
				}

				if (read.done) {
					if (yield* drainEvents(parser.flush())) return;
					yield { type: "done" };
					return;
				}

				// Only re-arm for a genuine next read — arming right before a
				// `done` return above would just be cleared again by disarm().
				timeout.arm();
				const text = decoder.decode(read.value, { stream: true });
				if (yield* drainEvents(parser.feed(text))) return;
			}
		} finally {
			try {
				await reader.cancel();
			} catch {}
		}
	} finally {
		timeout.disarm();
	}
}
