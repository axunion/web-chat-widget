import type { LabelDictionary } from "../core/i18n.ts";
import { markdownToNodes } from "../core/markdown.ts";
import type { Message } from "../core/messages.ts";
import { el } from "./dom.ts";
import { PART } from "./parts.ts";

const ROLE_PART: Record<Message["role"], string> = {
	user: PART.messageUser,
	assistant: PART.messageAssistant,
	system: PART.messageSystem,
};

export interface LogHandle {
	root: HTMLDivElement;
	render(messages: readonly Message[]): void;
	applyLabels(labels: LabelDictionary): void;
}

interface CachedEntry {
	node: HTMLDivElement;
	content: string;
	status: string;
}

export function buildLog(labels: LabelDictionary): LogHandle {
	const streamingHost = el("div", {
		class: "log-streaming",
		attrs: { "aria-live": "off" },
	});
	const liveHost = el("div", {
		class: "log-live sr-only",
		attrs: { "aria-live": "polite", "aria-atomic": "false" },
	});
	const root = el("div", { class: "log", part: PART.log, role: "log" }, [
		streamingHost,
		liveHost,
	]);

	function applyLabels(next: LabelDictionary): void {
		root.setAttribute("aria-label", next.panelTitle);
	}
	applyLabels(labels);

	const cache = new Map<string, CachedEntry>();

	function render(messages: readonly Message[]): void {
		const seenIds = new Set<string>();
		const ordered: HTMLDivElement[] = [];
		for (const message of messages) {
			seenIds.add(message.id);
			const status = message.status ?? "done";
			const existing = cache.get(message.id);
			if (!existing) {
				const node = createMessageNode(message);
				cache.set(message.id, {
					node,
					content: message.content,
					status,
				});
				ordered.push(node);
				continue;
			}
			if (existing.content !== message.content || existing.status !== status) {
				updateMessageNode(existing.node, message);
				existing.content = message.content;
				existing.status = status;
			}
			ordered.push(existing.node);
		}
		for (const id of cache.keys()) {
			if (!seenIds.has(id)) cache.delete(id);
		}
		streamingHost.replaceChildren(...ordered);
	}

	return { root, render, applyLabels };
}

function createMessageNode(message: Message): HTMLDivElement {
	const rolePart = ROLE_PART[message.role];
	const node = el("div", {
		class: `message message-${message.role}`,
		part: `${PART.message} ${rolePart}`,
		attrs: { "data-message-id": message.id },
	});
	updateMessageNode(node, message);
	return node;
}

// Assistant and system roles go through the sanitising Markdown pipeline.
// User content is rendered as plain text per SPEC §6.2.
function updateMessageNode(node: HTMLDivElement, message: Message): void {
	node.setAttribute("data-status", message.status ?? "done");
	if (message.role === "user") {
		node.textContent = message.content;
		return;
	}
	node.replaceChildren(...markdownToNodes(message.content));
}
