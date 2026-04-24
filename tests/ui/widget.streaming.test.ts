import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { ChatAdapter } from "../../src/index.ts";
import type { ChatWidget } from "../../src/ui/widget.ts";
import {
	cleanupWidgets,
	mountWidget,
	registerChatWidget,
} from "../helpers/dom-helpers.ts";
import { scriptedAdapter } from "../helpers/fake-adapters.ts";

beforeAll(registerChatWidget);
afterEach(cleanupWidgets);

function assistantNode(widget: ChatWidget): Element | null {
	const assistant = widget.getMessages().find((m) => m.role === "assistant");
	if (!assistant) return null;
	return (
		widget.shadowRoot?.querySelector(
			`[data-message-id="${assistant.id}"]`,
		) ?? null
	);
}

describe("ChatWidget — assistant content accumulates from text-delta chunks", () => {
	it("final assistant DOM content equals the concatenation of all deltas", async () => {
		const widget = mountWidget({
			adapter: scriptedAdapter([
				{ type: "text-delta", delta: "Hello " },
				{ type: "text-delta", delta: "world" },
				{ type: "done" },
			]),
		});
		await widget.sendMessage("hi");
		expect(assistantNode(widget)?.textContent).toBe("Hello world");
	});
});

describe("ChatWidget — assistant data-status transitions to 'done'", () => {
	it("the assistant node carries data-status='done' after completion", async () => {
		const widget = mountWidget({
			adapter: scriptedAdapter([
				{ type: "text-delta", delta: "x" },
				{ type: "done" },
			]),
		});
		await widget.sendMessage("hi");
		expect(assistantNode(widget)?.getAttribute("data-status")).toBe("done");
	});
});

describe("ChatWidget — assistant node survives across multiple sends", () => {
	it("the first assistant message remains in the log after a second send completes", async () => {
		const widget = mountWidget({
			adapter: scriptedAdapter([
				{ type: "text-delta", delta: "first-reply" },
				{ type: "done" },
			]),
		});
		await widget.sendMessage("first");
		const firstAssistant = widget
			.getMessages()
			.find((m) => m.role === "assistant");
		const firstId = firstAssistant?.id;
		await widget.sendMessage("second");
		const persistedFirst = widget.shadowRoot?.querySelector(
			`[data-message-id="${firstId}"]`,
		);
		expect(persistedFirst).toBeTruthy();
		expect(persistedFirst?.textContent).toBe("first-reply");
	});
});

describe("ChatWidget — second send keeps both user messages in the log", () => {
	it("after two sends the log contains both user message texts", async () => {
		const widget = mountWidget({
			adapter: scriptedAdapter([{ type: "done" }]),
		});
		await widget.sendMessage("first");
		await widget.sendMessage("second");
		const texts = Array.from(
			widget.shadowRoot?.querySelectorAll("[data-message-id]") ?? [],
		).map((n) => n.textContent ?? "");
		expect(texts).toContain("first");
		expect(texts).toContain("second");
	});
});

describe("ChatWidget — keyed reconcile reuses DOM nodes for the same id", () => {
	it("the DOM node identity for the assistant message id is stable across a streaming delta", async () => {
		let resolveFirstDelta: (() => void) | null = null;
		const firstDelta = new Promise<void>((resolve) => {
			resolveFirstDelta = resolve;
		});
		const adapter: ChatAdapter = {
			async *send() {
				await Promise.resolve();
				yield { type: "text-delta", delta: "alpha" };
				await firstDelta;
				yield { type: "text-delta", delta: "beta" };
				yield { type: "done" };
			},
		};

		const widget = mountWidget({ adapter });
		const sendPromise = widget.sendMessage("hi");

		for (let i = 0; i < 5; i++) {
			await new Promise((r) => setTimeout(r, 0));
		}
		const earlyNode = assistantNode(widget);
		expect(earlyNode).not.toBeNull();

		if (resolveFirstDelta) (resolveFirstDelta as () => void)();
		await sendPromise;

		const finalNode = assistantNode(widget);
		expect(finalNode).toBe(earlyNode);
		expect(finalNode?.textContent).toBe("alphabeta");
		expect(finalNode?.getAttribute("data-status")).toBe("done");
	});
});
