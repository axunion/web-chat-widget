import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
	cleanupWidgets,
	getPart,
	mountWidget,
	registerChatWidget,
} from "../helpers/dom-helpers.ts";
import { stubAdapter } from "../helpers/fake-adapters.ts";

beforeAll(registerChatWidget);
afterEach(cleanupWidgets);

// PLAN.md §P6 — Focus management + panel-wide Esc
// ARCHITECTURE.md §Accessibility — Focus management (planned)

describe("ChatWidget.open — focuses the textarea", () => {
	it("moves focus to the textarea inside the shadow root", () => {
		const widget = mountWidget({ adapter: stubAdapter() });
		widget.open();
		expect(widget.shadowRoot?.activeElement).toBe(getPart(widget, "input"));
	});
});

describe("ChatWidget — panel-wide Escape closes regardless of the focused element", () => {
	it("closes when Escape is pressed while the close button (not the textarea) has focus", () => {
		const widget = mountWidget({ adapter: stubAdapter() });
		widget.open();
		const closeButton = getPart(widget, "close-button") as HTMLButtonElement;
		closeButton.focus();
		closeButton.dispatchEvent(
			new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
		);
		expect(getPart(widget, "panel")?.hasAttribute("data-open")).toBe(false);
	});
});

describe("ChatWidget.close — returns focus to the FAB when focus was inside the panel", () => {
	it("moves focus to the FAB after closing", () => {
		const widget = mountWidget({ adapter: stubAdapter() });
		widget.open();
		const textarea = getPart(widget, "input") as HTMLTextAreaElement;
		textarea.focus();

		widget.close();

		expect(widget.shadowRoot?.activeElement).toBe(getPart(widget, "fab"));
	});
});

describe("ChatWidget.close — leaves host page focus untouched otherwise", () => {
	it("does not move focus to the FAB when nothing inside the panel was focused", () => {
		const widget = mountWidget({ adapter: stubAdapter() });
		widget.open();
		const outside = document.createElement("button");
		document.body.appendChild(outside);
		outside.focus();

		widget.close();

		expect(document.activeElement).toBe(outside);
		outside.remove();
	});
});
