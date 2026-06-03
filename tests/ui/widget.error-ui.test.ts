/**
 * ARCHITECTURE.md §Error and retry — error chunk / retry UI.
 *
 * On an adapter error chunk the assistant message bubble must show an
 * error indicator (part="message-error") with the localized errorGeneric
 * text and a "retry" button labelled with errorRetry. Clicking the button
 * invokes retry() — same direct user message replayed through the adapter.
 *
 * After a successful retry the error block must disappear and the bubble
 * reverts to normal streaming/done rendering.
 */

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { AdapterChunk, ChatAdapter, Message } from "../../src/index.ts";
import {
	cleanupWidgets,
	mountWidget,
	registerChatWidget,
} from "../helpers/dom-helpers.ts";
import { scriptedAdapter } from "../helpers/fake-adapters.ts";

beforeAll(registerChatWidget);
afterEach(cleanupWidgets);

function findErrorPart(messageNode: Element): HTMLElement | null {
	const candidates = messageNode.querySelectorAll("[part]");
	for (const el of Array.from(candidates)) {
		const tokens = (el.getAttribute("part") ?? "").split(/\s+/);
		if (tokens.includes("message-error")) return el as HTMLElement;
	}
	return null;
}

function findMessageNode(
	widget: { shadowRoot: ShadowRoot | null },
	role: "assistant" | "user",
): Element | null {
	const all = widget.shadowRoot?.querySelectorAll(".message");
	if (!all) return null;
	for (const el of Array.from(all)) {
		if (el.classList.contains(`message-${role}`)) return el;
	}
	return null;
}

function findRetryButton(messageNode: Element): HTMLButtonElement | null {
	const buttons = messageNode.querySelectorAll("button");
	if (buttons.length === 0) return null;
	return buttons[0] as HTMLButtonElement;
}

describe("ChatWidget assistant error UI", () => {
	it("renders a message-error part inside the assistant bubble when the adapter errors", async () => {
		const widget = mountWidget({
			adapter: scriptedAdapter([
				{ type: "error", error: new Error("network failure") },
			]),
			locale: "ja",
		});

		await widget.sendMessage("hi");

		const assistantNode = findMessageNode(widget, "assistant");
		expect(assistantNode).not.toBeNull();
		const errorPart = findErrorPart(assistantNode as Element);
		expect(errorPart).not.toBeNull();
		expect(errorPart?.textContent).toContain("応答を取得できませんでした");
	});

	it("includes a retry button labelled with errorRetry", async () => {
		const widget = mountWidget({
			adapter: scriptedAdapter([
				{ type: "error", error: new Error("network failure") },
			]),
			locale: "ja",
		});

		await widget.sendMessage("hi");

		const assistantNode = findMessageNode(widget, "assistant");
		const retry = findRetryButton(assistantNode as Element);
		expect(retry).not.toBeNull();
		expect(retry?.textContent?.trim()).toBe("再試行");
	});

	it("localizes labels for locale=en", async () => {
		const widget = mountWidget({
			adapter: scriptedAdapter([
				{ type: "error", error: new Error("network failure") },
			]),
			locale: "en",
		});

		await widget.sendMessage("hi");

		const assistantNode = findMessageNode(widget, "assistant");
		const errorPart = findErrorPart(assistantNode as Element);
		const retry = findRetryButton(assistantNode as Element);
		expect(errorPart?.textContent).toContain("Failed to fetch a response");
		expect(retry?.textContent?.trim()).toBe("Retry");
	});

	it("does not render the error UI for a successful done response", async () => {
		const widget = mountWidget({
			adapter: scriptedAdapter([
				{ type: "text-delta", delta: "ok" },
				{ type: "done" },
			]),
		});

		await widget.sendMessage("hi");

		const assistantNode = findMessageNode(widget, "assistant");
		expect(findErrorPart(assistantNode as Element)).toBeNull();
		expect(findRetryButton(assistantNode as Element)).toBeNull();
	});

	it("invokes the adapter again when the retry button is clicked", async () => {
		const calls: Message[][] = [];
		let callIdx = 0;
		const adapter: ChatAdapter = {
			async *send(messages): AsyncGenerator<AdapterChunk> {
				calls.push([...messages]);
				const idx = callIdx++;
				await Promise.resolve();
				if (idx === 0) {
					yield { type: "error", error: new Error("fail") };
					return;
				}
				yield { type: "text-delta", delta: "ok now" };
				yield { type: "done" };
			},
		};

		const widget = mountWidget({ adapter });
		await widget.sendMessage("hi");
		expect(calls.length).toBe(1);

		const assistantNode = findMessageNode(widget, "assistant");
		const retry = findRetryButton(assistantNode as Element);
		expect(retry).not.toBeNull();

		retry?.click();
		// Allow async retry to flush.
		await new Promise<void>((r) => setTimeout(r, 0));
		await new Promise<void>((r) => setTimeout(r, 0));
		await new Promise<void>((r) => setTimeout(r, 0));

		expect(calls.length).toBe(2);
		// The second call still carries the same single user message.
		expect(calls[1].length).toBe(1);
		expect(calls[1][0].role).toBe("user");
		expect(calls[1][0].content).toBe("hi");
	});

	it("clears the error UI once the retry succeeds", async () => {
		let callIdx = 0;
		const adapter: ChatAdapter = {
			async *send(): AsyncGenerator<AdapterChunk> {
				const idx = callIdx++;
				await Promise.resolve();
				if (idx === 0) {
					yield { type: "error", error: new Error("fail") };
					return;
				}
				yield { type: "text-delta", delta: "ok" };
				yield { type: "done" };
			},
		};

		const widget = mountWidget({ adapter });
		await widget.sendMessage("hi");

		const retry = findRetryButton(findMessageNode(widget, "assistant") as Element);
		retry?.click();
		await new Promise<void>((r) => setTimeout(r, 0));
		await new Promise<void>((r) => setTimeout(r, 0));
		await new Promise<void>((r) => setTimeout(r, 0));

		const assistantNode = findMessageNode(widget, "assistant");
		expect(findErrorPart(assistantNode as Element)).toBeNull();
		expect(findRetryButton(assistantNode as Element)).toBeNull();
	});
});
