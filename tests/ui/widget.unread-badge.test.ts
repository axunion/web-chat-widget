import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
	cleanupWidgets,
	getPart,
	mountWidget,
	registerChatWidget,
} from "../helpers/dom-helpers.ts";
import { scriptedAdapter } from "../helpers/fake-adapters.ts";

beforeAll(registerChatWidget);
afterEach(cleanupWidgets);

// PLAN.md §P7 — Unread badge on FAB

function badge(widget: { shadowRoot: ShadowRoot | null }): Element | null {
	return getPart(widget as never, "badge");
}

describe("ChatWidget — unread badge on the FAB", () => {
	it("becomes visible after an assistant reply completes while the panel is closed", async () => {
		const widget = mountWidget({
			adapter: scriptedAdapter([
				{ type: "text-delta", delta: "hi" },
				{ type: "done" },
			]),
		});

		await widget.sendMessage("hello");

		const badgeEl = badge(widget);
		expect(badgeEl?.hasAttribute("data-visible")).toBe(true);
		expect(badgeEl?.textContent).toBe("New message");
	});

	it("stays hidden when the assistant reply completes while the panel is open", async () => {
		const widget = mountWidget({
			adapter: scriptedAdapter([
				{ type: "text-delta", delta: "hi" },
				{ type: "done" },
			]),
		});
		widget.open();

		await widget.sendMessage("hello");

		expect(badge(widget)?.hasAttribute("data-visible")).toBe(false);
	});

	it("is cleared when the panel is opened", async () => {
		const widget = mountWidget({
			adapter: scriptedAdapter([
				{ type: "text-delta", delta: "hi" },
				{ type: "done" },
			]),
		});
		await widget.sendMessage("hello");
		expect(badge(widget)?.hasAttribute("data-visible")).toBe(true);

		widget.open();

		expect(badge(widget)?.hasAttribute("data-visible")).toBe(false);
	});

	it("stays hidden when the adapter reports an error while the panel is closed", async () => {
		const widget = mountWidget({
			adapter: scriptedAdapter([
				{ type: "error", error: new Error("boom") },
			]),
		});

		await widget.sendMessage("hello");

		expect(badge(widget)?.hasAttribute("data-visible")).toBe(false);
	});
});
