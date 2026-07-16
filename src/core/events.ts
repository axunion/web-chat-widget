import type { MessageRole } from "./messages.ts";

export interface ChatEventMap {
	ready: undefined;
	open: undefined;
	close: undefined;
	message: { role: Exclude<MessageRole, "system">; content: string };
	error: { error: Error };
	busy: { busy: boolean };
}

export type ChatEventType = keyof ChatEventMap;

export function createChatEvent<K extends ChatEventType>(
	type: K,
	detail: ChatEventMap[K],
): CustomEvent<ChatEventMap[K]> {
	return new CustomEvent<ChatEventMap[K]>(type, {
		detail,
		bubbles: false,
		cancelable: false,
		composed: false,
	});
}
