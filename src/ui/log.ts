import type { LabelDictionary } from "../core/i18n.ts";
import { markdownToNodes, markdownToPlainText } from "../core/markdown.ts";
import type { Message } from "../core/messages.ts";
import { el, setLabel } from "./dom.ts";
import { PART } from "./parts.ts";

const ROLE_PART: Record<Message["role"], string> = {
	user: PART.messageUser,
	assistant: PART.messageAssistant,
	system: PART.messageSystem,
};

const FOLLOW_THRESHOLD_PX = 48;
// Announcements are consumed the moment they are inserted, so only a short
// tail needs to stay in the DOM; without a cap this sr-only host grows for
// the whole life of the page.
const MAX_LIVE_ANNOUNCEMENTS = 5;

export interface LogHandle {
	root: HTMLDivElement;
	render(messages: readonly Message[]): void;
	applyLabels(labels: LabelDictionary): void;
}

// Labelled controls inside a rendered message can't re-derive their own text,
// so each one registers how to relabel itself. Refreshers hang off the cache
// entry that owns their DOM, so evicting a message drops them with it.
type LabelRefresher = (labels: LabelDictionary) => void;

interface CachedEntry {
	node: HTMLDivElement;
	content: string;
	status: string;
	announced: boolean;
	refreshers: LabelRefresher[];
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
	// Node identity and order of the last committed render, so an unchanged
	// message list doesn't detach and re-insert every message node.
	let lastOrdered: readonly HTMLDivElement[] = [];

	function applyLabels(next: LabelDictionary): void {
		currentLabels = next;
		root.setAttribute("aria-label", next.panelTitle);
		for (const entry of cache.values()) {
			for (const refresh of entry.refreshers) refresh(next);
		}
	}
	applyLabels(labels);

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
				const entry: CachedEntry = {
					node: createMessageNode(message),
					content: message.content,
					status,
					announced: false,
					refreshers: [],
				};
				updateMessageNode(entry, message);
				cache.set(message.id, entry);
				ordered.push(entry.node);
				continue;
			}
			if (existing.content !== message.content || existing.status !== status) {
				updateMessageNode(existing, message);
				existing.content = message.content;
				existing.status = status;
			}
			ordered.push(existing.node);
		}
		for (const id of cache.keys()) {
			if (!seenIds.has(id)) cache.delete(id);
		}
		if (messages.length === 0) liveHost.replaceChildren();
		if (!sameNodes(ordered, lastOrdered)) {
			streamingHost.replaceChildren(...ordered);
			lastOrdered = ordered;
		}
		announceCompleted(messages);
		if (shouldFollow) {
			root.scrollTop = root.scrollHeight - root.clientHeight;
		}
	}

	function sameNodes(
		a: readonly HTMLDivElement[],
		b: readonly HTMLDivElement[],
	): boolean {
		if (a.length !== b.length) return false;
		for (let i = 0; i < a.length; i++) {
			if (a[i] !== b[i]) return false;
		}
		return true;
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
			block.textContent = markdownToPlainText(message.content);
			liveHost.appendChild(block);
			while (liveHost.childElementCount > MAX_LIVE_ANNOUNCEMENTS) {
				liveHost.firstElementChild?.remove();
			}
		}
	}

	function createMessageNode(message: Message): HTMLDivElement {
		return el("div", {
			class: `message message-${message.role}`,
			part: `${PART.message} ${ROLE_PART[message.role]}`,
			attrs: { "data-message-id": message.id },
		});
	}

	// User content stays plain text (XSS containment — see ARCHITECTURE.md §Sanitization).
	function updateMessageNode(entry: CachedEntry, message: Message): void {
		const { node } = entry;
		// The node's children are rebuilt below, so any refresher registered by
		// the previous pass now points at discarded DOM.
		entry.refreshers = [];
		node.setAttribute("data-status", message.status ?? "done");
		if (message.role === "user") {
			node.textContent = message.content;
			return;
		}
		node.replaceChildren(...markdownToNodes(message.content));
		if (message.role === "assistant" && message.status === "error") {
			node.appendChild(buildErrorBlock(entry));
		}
		if (message.role === "assistant" && message.status === "done") {
			attachCopyButtons(entry);
		}
	}

	// Copy buttons only matter once a message has settled, so this is
	// skipped for in-progress streaming updates (see the "done" guard above).
	// Omitted entirely without a Clipboard API.
	function attachCopyButtons(entry: CachedEntry): void {
		if (!navigator.clipboard?.writeText) return;
		for (const pre of Array.from(entry.node.querySelectorAll("pre"))) {
			const codeEl = pre.querySelector("code") ?? pre;
			const button = el("button", {
				class: "copy-button",
				part: PART.copyButton,
				attrs: { type: "button" },
			});
			let showingCopied = false;
			setLabel(button, currentLabels.copyCode);
			entry.refreshers.push((next) => {
				setLabel(button, showingCopied ? next.copyCodeDone : next.copyCode);
			});
			let revertHandle: ReturnType<typeof setTimeout> | null = null;
			button.addEventListener("click", async () => {
				try {
					await navigator.clipboard.writeText(codeEl.textContent ?? "");
				} catch (err) {
					console.warn("[web-chat-widget] clipboard write failed", err);
					return;
				}
				if (revertHandle !== null) clearTimeout(revertHandle);
				showingCopied = true;
				setLabel(button, currentLabels.copyCodeDone);
				revertHandle = setTimeout(() => {
					showingCopied = false;
					setLabel(button, currentLabels.copyCode);
					revertHandle = null;
				}, 2000);
			});
			pre.appendChild(button);
		}
	}

	function buildErrorBlock(entry: CachedEntry): HTMLDivElement {
		const text = el("span", { class: "message-error-text" });
		text.textContent = currentLabels.errorGeneric;
		const retry = el("button", {
			class: "retry-button",
			attrs: { type: "button" },
		});
		setLabel(retry, currentLabels.errorRetry);
		retry.addEventListener("click", () => onRetry());
		entry.refreshers.push((next) => {
			text.textContent = next.errorGeneric;
			setLabel(retry, next.errorRetry);
		});
		return el("div", { class: "message-error", part: PART.messageError }, [
			text,
			retry,
		]);
	}

	return { root, render, applyLabels };
}
