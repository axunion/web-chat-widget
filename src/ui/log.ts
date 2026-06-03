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

const FOLLOW_THRESHOLD_PX = 48;
const ERROR_PART_SELECTOR = `[part~="${PART.messageError}"]`;

interface ErrorBlockRefs {
	text: HTMLElement;
	button: HTMLButtonElement;
}

export interface LogHandle {
	root: HTMLDivElement;
	render(messages: readonly Message[]): void;
	applyLabels(labels: LabelDictionary): void;
}

interface CachedEntry {
	node: HTMLDivElement;
	content: string;
	status: string;
	announced: boolean;
}

export function buildLog(
	labels: LabelDictionary,
	onRetry: () => void,
): LogHandle {
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

	let currentLabels = labels;
	const cache = new Map<string, CachedEntry>();
	const errorBlocks = new WeakMap<HTMLDivElement, ErrorBlockRefs>();

	function applyLabels(next: LabelDictionary): void {
		currentLabels = next;
		root.setAttribute("aria-label", next.panelTitle);
		refreshErrorBlocks();
	}
	applyLabels(labels);

	function refreshErrorBlocks(): void {
		for (const entry of cache.values()) {
			const block = entry.node.querySelector(ERROR_PART_SELECTOR);
			if (!(block instanceof HTMLDivElement)) continue;
			const refs = errorBlocks.get(block);
			if (!refs) continue;
			refs.text.textContent = currentLabels.errorGeneric;
			refs.button.textContent = currentLabels.errorRetry;
			refs.button.setAttribute("aria-label", currentLabels.errorRetry);
		}
	}

	function render(messages: readonly Message[]): void {
		const distanceFromBottom =
			root.scrollHeight - root.clientHeight - root.scrollTop;
		const shouldFollow = distanceFromBottom <= FOLLOW_THRESHOLD_PX;
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
					announced: false,
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
		if (messages.length === 0) liveHost.replaceChildren();
		streamingHost.replaceChildren(...ordered);
		announceCompleted(messages);
		if (shouldFollow) {
			root.scrollTop = root.scrollHeight - root.clientHeight;
		}
	}

	// Walk newest-to-oldest: streaming deltas only mutate the trailing
	// assistant message, so once we hit an already-announced node the
	// rest of the history is guaranteed announced too.
	function announceCompleted(messages: readonly Message[]): void {
		for (let i = messages.length - 1; i >= 0; i--) {
			const message = messages[i];
			const entry = cache.get(message.id);
			if (!entry) continue;
			if (entry.announced) break;
			if (message.role !== "assistant" || message.status !== "done") continue;
			entry.announced = true;
			const block = document.createElement("div");
			block.textContent = message.content;
			liveHost.appendChild(block);
		}
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

	// User content stays plain text (XSS containment — see ARCHITECTURE.md §Sanitization).
	function updateMessageNode(node: HTMLDivElement, message: Message): void {
		node.setAttribute("data-status", message.status ?? "done");
		if (message.role === "user") {
			node.textContent = message.content;
			return;
		}
		node.replaceChildren(...markdownToNodes(message.content));
		if (message.role === "assistant" && message.status === "error") {
			node.appendChild(buildErrorBlock());
		}
	}

	function buildErrorBlock(): HTMLDivElement {
		const text = el("span", { class: "message-error-text" });
		text.textContent = currentLabels.errorGeneric;
		const retry = el("button", {
			class: "retry-button",
			attrs: {
				type: "button",
				"aria-label": currentLabels.errorRetry,
			},
		});
		retry.textContent = currentLabels.errorRetry;
		retry.addEventListener("click", () => onRetry());
		const block = el(
			"div",
			{ class: "message-error", part: PART.messageError },
			[text, retry],
		);
		errorBlocks.set(block, { text, button: retry });
		return block;
	}

	return { root, render, applyLabels };
}
