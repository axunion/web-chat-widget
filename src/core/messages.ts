export type MessageRole = "user" | "assistant" | "system";

export type MessageStatus = "streaming" | "done" | "error";

export interface Message {
	id: string;
	role: MessageRole;
	content: string;
	createdAt: number;
	status?: MessageStatus;
}

export interface CreateMessageOverrides {
	id?: string;
	createdAt?: number;
	status?: MessageStatus;
}

let idCounter = 0;

function newMessageId(): string {
	idCounter += 1;
	const rand = Math.random().toString(36).slice(2, 10);
	return `msg_${Date.now().toString(36)}_${idCounter.toString(36)}_${rand}`;
}

export function createMessage(
	role: MessageRole,
	content: string,
	overrides?: CreateMessageOverrides,
): Message {
	const msg: Message = {
		id: overrides?.id ?? newMessageId(),
		role,
		content,
		createdAt: overrides?.createdAt ?? Date.now(),
	};
	if (overrides?.status !== undefined) {
		msg.status = overrides.status;
	}
	return msg;
}
