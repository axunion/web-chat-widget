import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { AdapterChunk, ChatAdapter } from "../../src/index.ts";
import {
	cleanupWidgets,
	mountWidget,
	registerChatWidget,
} from "../helpers/dom-helpers.ts";
import { capturingAdapter } from "../helpers/fake-adapters.ts";

beforeAll(registerChatWidget);
afterEach(cleanupWidgets);

const flushMacrotasks = (): Promise<void> =>
	new Promise((r) => setTimeout(r, 10));

// ---------------------------------------------------------------------------
// Case 1: adapter.send is called a second time after retry()
// ---------------------------------------------------------------------------

describe("ChatWidget.retry — adapter is called a second time", () => {
	it("after sendMessage then retry(), capturingAdapter.captured has length 2 and both calls contain the same user content", async () => {
		// capturingAdapter with a done chunk so each call resolves cleanly.
		const adapter = capturingAdapter([{ type: "done" }]);
		const widget = mountWidget({ adapter });

		await widget.sendMessage("hello retry");

		// retry() is not yet implemented on ChatWidget — this call must fail until added
		await widget.retry();

		expect(adapter.captured).toHaveLength(2);

		const firstCallUser = adapter.captured[0].find((m) => m.role === "user");
		const secondCallUser = adapter.captured[1].find((m) => m.role === "user");
		expect(firstCallUser?.content).toBe("hello retry");
		expect(secondCallUser?.content).toBe("hello retry");
	});
});

// ---------------------------------------------------------------------------
// Case 2: previous assistant reply is replaced by the retry response
// ---------------------------------------------------------------------------

describe("ChatWidget.retry — previous assistant reply is dropped and replaced", () => {
	it("after sendMessage then retry(), the messages array contains exactly one assistant message whose content is the second-call delta", async () => {
		// Scripted adapter: first call yields "first", second call yields "second".
		let callCount = 0;
		const twoCallAdapter: ChatAdapter = {
			async *send(): AsyncGenerator<AdapterChunk> {
				callCount += 1;
				await Promise.resolve();
				if (callCount === 1) {
					yield { type: "text-delta", delta: "first" };
					yield { type: "done" };
				} else {
					yield { type: "text-delta", delta: "second" };
					yield { type: "done" };
				}
			},
		};

		const widget = mountWidget({ adapter: twoCallAdapter });

		await widget.sendMessage("hi");
		await widget.retry();

		const messages = widget.getMessages();
		const assistantMessages = messages.filter((m) => m.role === "assistant");

		// Exactly one assistant message should remain — the retry result.
		expect(assistantMessages).toHaveLength(1);
		expect(assistantMessages[0].content).toBe("second");

		// The first reply ("first") must not appear anywhere in the message list.
		const hasFirst = messages.some((m) => m.content.includes("first"));
		expect(hasFirst).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Case 3: retry() is a no-op when there is no prior user message
// ---------------------------------------------------------------------------

describe("ChatWidget.retry — no-op when there is no prior user message", () => {
	it("adapter.captured remains empty after retry() on a freshly mounted widget", async () => {
		const adapter = capturingAdapter([{ type: "done" }]);
		const widget = mountWidget({ adapter });

		// No sendMessage call — no prior user message exists.
		await widget.retry();

		expect(adapter.captured).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// Case 4: new streaming assistant message from retry() appears in the log DOM
// ---------------------------------------------------------------------------

describe("ChatWidget.retry — new assistant message from retry appears in the shadow DOM", () => {
	it("after sendMessage then retry(), at least one [data-message-id] node contains the second-call delta text", async () => {
		let callCount = 0;
		const twoCallAdapter: ChatAdapter = {
			async *send(): AsyncGenerator<AdapterChunk> {
				callCount += 1;
				await Promise.resolve();
				if (callCount === 1) {
					yield { type: "text-delta", delta: "first-response" };
					yield { type: "done" };
				} else {
					yield { type: "text-delta", delta: "second-response" };
					yield { type: "done" };
				}
			},
		};

		const widget = mountWidget({ adapter: twoCallAdapter });

		await widget.sendMessage("hi");
		await widget.retry();
		await flushMacrotasks();

		const nodes = Array.from(
			widget.shadowRoot?.querySelectorAll("[data-message-id]") ?? [],
		);

		const hasSecondResponse = nodes.some((node) =>
			node.textContent?.includes("second-response"),
		);
		expect(hasSecondResponse).toBe(true);
	});
});
