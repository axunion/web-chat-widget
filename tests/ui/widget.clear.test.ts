import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { AdapterChunk, ChatAdapter } from "../../src/index.ts";
import { ChatWidget } from "../../src/index.ts";
import {
	cleanupWidgets,
	mountWidget,
	registerChatWidget,
} from "../helpers/dom-helpers.ts";
import { stubAdapter } from "../helpers/fake-adapters.ts";

beforeAll(registerChatWidget);
afterEach(cleanupWidgets);

const flushMacrotasks = (): Promise<void> =>
	new Promise((r) => setTimeout(r, 10));

// ---------------------------------------------------------------------------
// Case 1: engine state is emptied after clear()
// ---------------------------------------------------------------------------

describe("ChatWidget.clear — engine state becomes empty after a prior send", () => {
	it("getMessages() returns length 0 after sendMessage then clear()", async () => {
		const widget = mountWidget({ adapter: stubAdapter() });
		await widget.sendMessage("hello");
		expect(widget.getMessages().length).toBeGreaterThan(0);

		// clear() is not yet implemented on ChatWidget — this call must fail until added
		widget.clear();

		expect(widget.getMessages()).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// Case 2: DOM nodes are removed from shadow root after clear()
// ---------------------------------------------------------------------------

describe("ChatWidget.clear — shadow DOM has no message nodes after a prior send", () => {
	it("no [data-message-id] nodes remain in the shadow root after clear()", async () => {
		const widget = mountWidget({ adapter: stubAdapter() });
		await widget.sendMessage("hello");

		const before = Array.from(
			widget.shadowRoot?.querySelectorAll("[data-message-id]") ?? [],
		);
		expect(before.length).toBeGreaterThan(0);

		widget.clear();
		await flushMacrotasks();

		const after = Array.from(
			widget.shadowRoot?.querySelectorAll("[data-message-id]") ?? [],
		);
		expect(after).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// Case 3: clear() aborts an in-flight adapter call
// ---------------------------------------------------------------------------

describe("ChatWidget.clear — aborts the in-flight adapter AbortSignal", () => {
	it("the adapter's AbortSignal becomes aborted after clear() is called mid-stream", async () => {
		// Adapter that captures the signal and hangs until it is aborted.
		let capturedSignal: AbortSignal | null = null;
		let adapterStarted = false;

		const hangingAdapter: ChatAdapter = {
			async *send(
				_messages: Parameters<ChatAdapter["send"]>[0],
				signal: AbortSignal,
			): AsyncGenerator<AdapterChunk> {
				capturedSignal = signal;
				adapterStarted = true;
				// Suspend until the caller's AbortSignal fires; yield nothing in the interim.
				await new Promise<void>((resolve) => {
					if (signal.aborted) {
						resolve();
						return;
					}
					signal.addEventListener("abort", () => resolve(), { once: true });
				});
				// Return without yielding — matches SPEC §8.2 obligation to stop on abort.
			},
		};

		const widget = mountWidget({ adapter: hangingAdapter });

		// Start a send but do not await — let it hang inside the adapter.
		const sendPromise = widget.sendMessage("test");

		// Poll until the adapter generator has started so the signal is registered.
		await new Promise<void>((resolve) => {
			const poll = setInterval(() => {
				if (adapterStarted) {
					clearInterval(poll);
					resolve();
				}
			}, 2);
		});

		// Bind to a local so TypeScript narrows away null without losing the
		// type across the widget.clear() call (closure mutation).
		const signal = capturedSignal as AbortSignal | null;
		if (!signal) throw new Error("adapter did not capture a signal");
		expect(signal.aborted).toBe(false);

		// Calling clear() must fire the AbortSignal.
		widget.clear();

		expect(signal.aborted).toBe(true);

		// Let the hanging sendMessage promise settle to avoid unhandled rejections.
		await sendPromise;
	});
});

// ---------------------------------------------------------------------------
// Case 4: clear() before connectedCallback is a no-op (does not throw)
// ---------------------------------------------------------------------------

describe("ChatWidget.clear — is a no-op when called before connectedCallback", () => {
	it("does not throw when clear() is called on a widget not yet appended to the DOM", () => {
		// Instantiate but do NOT append to document.body.
		// connectedCallback will not fire, so this.observable remains null.
		// This mirrors the existing early-return guard pattern in sendMessage.
		const widget = new ChatWidget({ adapter: stubAdapter() });

		// Must not throw — should be a no-op just like sendMessage before mount.
		expect(() => widget.clear()).not.toThrow();
	});
});
