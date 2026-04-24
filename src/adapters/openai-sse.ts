import type { Message, MessageRole } from "../core/messages.ts";
import { toError, toWireMessages } from "./internal.ts";
import { createSseParser } from "./sse-parse.ts";
import type { AdapterChunk, ChatAdapter } from "./types.ts";

export interface OpenAISseAdapterOptions {
	url: string;
	headers?: Record<string, string>;
	model?: string;
	fetchImpl?: typeof fetch;
}

interface OpenAiRequestBody {
	messages: Array<{ role: MessageRole; content: string }>;
	stream: true;
	model?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
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
		yield {
			type: "error",
			error: new Error(`HTTP ${response.status}`),
		};
		return;
	}

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
			let result: ReadableStreamReadResult<Uint8Array>;
			try {
				result = await reader.read();
			} catch (err) {
				if (signal.aborted) return;
				yield { type: "error", error: toError(err) };
				return;
			}

			if (result.done) {
				for (const evt of parser.flush()) {
					if (evt.type === "done") {
						yield { type: "done" };
						return;
					}
					const chunk = extractDelta(evt.data);
					if (!chunk) continue;
					yield chunk;
					if (chunk.type === "error") return;
				}
				yield { type: "done" };
				return;
			}

			const text = decoder.decode(result.value, { stream: true });
			for (const evt of parser.feed(text)) {
				if (evt.type === "done") {
					yield { type: "done" };
					return;
				}
				const chunk = extractDelta(evt.data);
				if (!chunk) continue;
				yield chunk;
				if (chunk.type === "error") return;
			}
		}
	} finally {
		try {
			await reader.cancel();
		} catch {}
	}
}
