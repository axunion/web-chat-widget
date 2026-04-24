import type { Message, MessageRole } from "../core/messages.ts";

export function toError(err: unknown): Error {
	if (err instanceof Error) return err;
	return new Error(String(err));
}

export function toWireMessages(
	messages: readonly Message[],
): Array<{ role: MessageRole; content: string }> {
	return messages.map((m) => ({ role: m.role, content: m.content }));
}
