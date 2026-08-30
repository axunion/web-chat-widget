import type { Message } from "../core/messages.ts";
import {
	createTimeoutController,
	isRecord,
	postAdapterRequest,
	toError,
	toWireMessages,
} from "./internal.ts";
import type { AdapterChunk, ChatAdapter } from "./types.ts";

export interface JsonAdapterOptions {
	url: string;
	headers?: Record<string, string>;
	extract?: (json: unknown) => string;
	timeoutMs?: number;
	fetchImpl?: typeof fetch;
}

const defaultExtract = (json: unknown): string => {
	if (!isRecord(json) || typeof json.reply !== "string") {
		throw new Error("Response JSON does not contain a string 'reply' field");
	}
	return json.reply;
};

/**
 * Adapter for a non-streaming endpoint that returns a single JSON reply
 * (`{ reply: string }` by default; override with `extract`).
 *
 * `url` should point at **your own backend proxy**, not directly at a provider —
 * the browser must not hold the provider API key. The proxy attaches the key
 * server-side. See ARCHITECTURE.md §Authentication and `examples/backend` for a reference.
 */
export function createJsonAdapter(options: JsonAdapterOptions): ChatAdapter {
	const fetchImpl = options.fetchImpl ?? fetch;
	const extract = options.extract ?? defaultExtract;
	return {
		send(messages, signal) {
			return streamJson(options, fetchImpl, extract, messages, signal);
		},
	};
}

async function* streamJson(
	options: JsonAdapterOptions,
	fetchImpl: typeof fetch,
	extract: (json: unknown) => string,
	messages: readonly Message[],
	signal: AbortSignal,
): AsyncIterable<AdapterChunk> {
	const body = { messages: toWireMessages(messages) };
	const timeout = createTimeoutController(signal, options.timeoutMs);
	try {
		timeout.arm();
		const result = await postAdapterRequest(options, fetchImpl, body, timeout);
		if ("chunks" in result) {
			yield* result.chunks;
			return;
		}

		let parsed: unknown;
		try {
			parsed = await result.response.json();
		} catch (err) {
			const chunk = timeout.classifyError(err);
			if (chunk) yield chunk;
			return;
		}

		let delta: string;
		try {
			const extracted = extract(parsed);
			if (typeof extracted !== "string") {
				throw new Error("extract did not return a string");
			}
			delta = extracted;
		} catch (err) {
			yield { type: "error", error: toError(err) };
			return;
		}

		yield { type: "text-delta", delta };
		yield { type: "done" };
	} finally {
		timeout.disarm();
	}
}
