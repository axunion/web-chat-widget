import { toError } from "../core/errors.ts";
import type { Message, MessageRole } from "../core/messages.ts";
import type { AdapterChunk } from "./types.ts";

export { toError };

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function toWireMessages(
	messages: readonly Message[],
): Array<{ role: MessageRole; content: string }> {
	return messages.map((m) => ({ role: m.role, content: m.content }));
}

export interface TimeoutController {
	readonly signal: AbortSignal;
	arm(): void;
	disarm(): void;
	// Turns a caught fetch/stream error into the AdapterChunk it should
	// produce: null when the outer signal caused it (caller just returns,
	// yielding nothing), a timeout chunk when the inactivity window fired,
	// otherwise the error as-is. Centralizes the 3-way branch every adapter
	// call site would otherwise have to repeat.
	classifyError(err: unknown): AdapterChunk | null;
}

// Composes an internal AbortController with the outer signal via an explicit
// listener (not AbortSignal.any, for happy-dom compatibility). arm()/disarm()
// bound the inactivity window; a timeout-triggered abort is distinguished from
// an outer-triggered one so classifyError can map each to the right
// AdapterChunk. timeoutMs undefined degenerates to a pass-through of `outer`
// — zero behavior change for callers that don't opt in.
export function createTimeoutController(
	outer: AbortSignal,
	timeoutMs: number | undefined,
): TimeoutController {
	if (timeoutMs === undefined) {
		return {
			signal: outer,
			arm() {},
			disarm() {},
			classifyError(err) {
				if (outer.aborted) return null;
				return { type: "error", error: toError(err) };
			},
		};
	}

	const internal = new AbortController();
	let timedOutFlag = false;
	let timer: ReturnType<typeof setTimeout> | null = null;

	const onOuterAbort = (): void => {
		internal.abort();
	};
	outer.addEventListener("abort", onOuterAbort);

	function arm(): void {
		if (timer !== null) clearTimeout(timer);
		timer = setTimeout(() => {
			timedOutFlag = true;
			internal.abort();
		}, timeoutMs);
	}

	function disarm(): void {
		if (timer !== null) {
			clearTimeout(timer);
			timer = null;
		}
		outer.removeEventListener("abort", onOuterAbort);
	}

	return {
		signal: internal.signal,
		arm,
		disarm,
		classifyError(err) {
			if (outer.aborted) return null;
			if (timedOutFlag) {
				return {
					type: "error",
					error: new Error(`Timed out after ${timeoutMs}ms`),
				};
			}
			return { type: "error", error: toError(err) };
		},
	};
}

// Shared by every adapter's stream-read catch blocks: `yield* classifyErrorChunk(...)`
// yields the classified chunk (if any); the caller follows with `return;`.
export function* classifyErrorChunk(
	timeout: TimeoutController,
	err: unknown,
): Generator<AdapterChunk> {
	const chunk = timeout.classifyError(err);
	if (chunk) yield chunk;
}

export interface AdapterRequestOptions {
	url: string;
	headers?: Record<string, string>;
}

// The request prologue every adapter shares: POST the JSON body under the
// timeout controller's signal, then normalize transport failures and non-2xx
// responses into AdapterChunks. Keeping the HTTP-error policy here means a new
// adapter inherits it instead of restating it.
export async function postAdapterRequest(
	options: AdapterRequestOptions,
	fetchImpl: typeof fetch,
	body: unknown,
	timeout: TimeoutController,
): Promise<{ response: Response } | { chunks: AdapterChunk[] }> {
	let response: Response;
	try {
		response = await fetchImpl(options.url, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				...options.headers,
			},
			body: JSON.stringify(body),
			signal: timeout.signal,
		});
	} catch (err) {
		const chunk = timeout.classifyError(err);
		return { chunks: chunk ? [chunk] : [] };
	}
	if (!response.ok) {
		// The body is never read on this path, so release it explicitly rather
		// than leaving the connection held open until GC.
		try {
			await response.body?.cancel();
		} catch {}
		return {
			chunks: [{ type: "error", error: new Error(`HTTP ${response.status}`) }],
		};
	}
	return { response };
}
