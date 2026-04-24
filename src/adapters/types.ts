import type { Message } from "../core/messages.ts";

export type AdapterChunk =
	| { type: "text-delta"; delta: string }
	| { type: "done" }
	| { type: "error"; error: Error };

export interface ChatAdapter {
	send(
		messages: readonly Message[],
		signal: AbortSignal,
	): AsyncIterable<AdapterChunk>;
}
