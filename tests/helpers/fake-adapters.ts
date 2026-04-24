import type { AdapterChunk, ChatAdapter, Message } from "../../src/index.ts";

export function scriptedAdapter(chunks: AdapterChunk[]): ChatAdapter {
	return {
		async *send() {
			for (const c of chunks) {
				await Promise.resolve();
				yield c;
			}
		},
	};
}

// Shorthand for "just resolve, no content" — equivalent to
// scriptedAdapter([{ type: "done" }]).
export function stubAdapter(): ChatAdapter {
	return scriptedAdapter([{ type: "done" }]);
}

export interface CapturingAdapter extends ChatAdapter {
	captured: Message[][];
}

export function capturingAdapter(
	chunks: AdapterChunk[] = [{ type: "done" }],
): CapturingAdapter {
	const self: CapturingAdapter = {
		captured: [],
		async *send(messages: readonly Message[]) {
			self.captured.push([...messages]);
			for (const c of chunks) {
				await Promise.resolve();
				yield c;
			}
		},
	};
	return self;
}

// Separates each chunk with a macrotask gap so rAF batchers have time to
// flush a notification between deltas.
export function spacedAdapter(deltas: string[]): ChatAdapter {
	return {
		async *send() {
			for (const d of deltas) {
				await new Promise((r) => setTimeout(r, 4));
				yield { type: "text-delta", delta: d };
			}
			await new Promise((r) => setTimeout(r, 4));
			yield { type: "done" };
		},
	};
}
