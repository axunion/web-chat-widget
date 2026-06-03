/**
 * ARCHITECTURE.md §aria-live pattern — two-container aria-live pattern.
 *
 * Streaming deltas render in an aria-live="off" container (streamingHost);
 * on the terminal "done" chunk the assistant message's plain text is copied
 * into an aria-live="polite" container (liveHost) so screen readers receive
 * exactly one announcement per confirmed reply.
 *
 * The current log.ts creates liveHost but never writes to it.
 */

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { AdapterChunk, ChatAdapter } from "../../src/index.ts";
import {
	cleanupWidgets,
	mountWidget,
	registerChatWidget,
} from "../helpers/dom-helpers.ts";
import { scriptedAdapter } from "../helpers/fake-adapters.ts";

beforeAll(registerChatWidget);
afterEach(cleanupWidgets);

function getLiveHost(widget: { shadowRoot: ShadowRoot | null }): Element | null {
	return widget.shadowRoot?.querySelector('[aria-live="polite"]') ?? null;
}

function getStreamingHost(widget: {
	shadowRoot: ShadowRoot | null;
}): Element | null {
	return widget.shadowRoot?.querySelector('[aria-live="off"]') ?? null;
}

describe("ChatWidget aria-live two-container pattern", () => {
	it("exposes exactly one aria-live=polite container inside the shadow root", () => {
		const widget = mountWidget({ adapter: scriptedAdapter([{ type: "done" }]) });
		const politeContainers = widget.shadowRoot?.querySelectorAll(
			'[aria-live="polite"]',
		);
		expect(politeContainers?.length).toBe(1);
	});

	it("keeps the polite container empty while streaming deltas are in flight", async () => {
		let release: (() => void) | null = null;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});

		const pausingAdapter: ChatAdapter = {
			async *send(): AsyncGenerator<AdapterChunk> {
				await Promise.resolve();
				yield { type: "text-delta", delta: "partial text" };
				await gate;
				yield { type: "done" };
			},
		};

		const widget = mountWidget({ adapter: pausingAdapter });
		const sendPromise = widget.sendMessage("hi");

		for (let i = 0; i < 5; i++) {
			await new Promise<void>((r) => setTimeout(r, 0));
		}

		expect(getStreamingHost(widget)?.textContent).toContain("partial text");
		expect(getLiveHost(widget)?.textContent?.trim()).toBe("");

		(release as unknown as () => void)();
		await sendPromise;
	});

	it("copies the assistant plain text into the polite container after done", async () => {
		const widget = mountWidget({
			adapter: scriptedAdapter([
				{ type: "text-delta", delta: "Hello " },
				{ type: "text-delta", delta: "world" },
				{ type: "done" },
			]),
		});

		await widget.sendMessage("hi");

		expect(getLiveHost(widget)?.textContent).toContain("Hello world");
	});

	it("does not announce partial output when the adapter ends with an error", async () => {
		const widget = mountWidget({
			adapter: scriptedAdapter([
				{ type: "text-delta", delta: "partial before error" },
				{ type: "error", error: new Error("network failure") },
			]),
		});

		await widget.sendMessage("hi");

		expect(getLiveHost(widget)?.textContent?.trim()).toBe("");
	});

	it("does not place the user message text into the polite container", async () => {
		const widget = mountWidget({
			adapter: scriptedAdapter([
				{ type: "text-delta", delta: "assistant reply" },
				{ type: "done" },
			]),
		});

		await widget.sendMessage("user question text");

		const liveHost = getLiveHost(widget);
		expect(liveHost?.textContent).not.toContain("user question text");
		expect(liveHost?.textContent).toContain("assistant reply");
	});
});
