import type { Message } from "../core/messages.ts";
import { toError, toWireMessages } from "./internal.ts";
import type { AdapterChunk, ChatAdapter } from "./types.ts";

export interface JsonAdapterOptions {
	url: string;
	headers?: Record<string, string>;
	extract?: (json: unknown) => string;
	fetchImpl?: typeof fetch;
}

const defaultExtract = (json: unknown): string => {
	if (
		typeof json !== "object" ||
		json === null ||
		!("reply" in json) ||
		typeof (json as { reply: unknown }).reply !== "string"
	) {
		throw new Error("Response JSON does not contain a string 'reply' field");
	}
	return (json as { reply: string }).reply;
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

	let response: Response;
	try {
		response = await fetchImpl(options.url, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				...options.headers,
			},
			body: JSON.stringify(body),
			signal,
		});
	} catch (err) {
		yield { type: "error", error: toError(err) };
		return;
	}

	if (!response.ok) {
		yield { type: "error", error: new Error(`HTTP ${response.status}`) };
		return;
	}

	let parsed: unknown;
	try {
		parsed = await response.json();
	} catch (err) {
		yield { type: "error", error: toError(err) };
		return;
	}

	let delta: string;
	try {
		const result = extract(parsed);
		if (typeof result !== "string") {
			throw new Error("extract did not return a string");
		}
		delta = result;
	} catch (err) {
		yield { type: "error", error: toError(err) };
		return;
	}

	yield { type: "text-delta", delta };
	yield { type: "done" };
}
