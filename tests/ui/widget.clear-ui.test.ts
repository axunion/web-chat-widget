/**
 * SPEC §9.9.1 — clear-history UI in the panel header.
 *
 * - A button with part="clear-button" lives inside the panel header.
 * - aria-label uses LabelDictionary.clearHistory.
 * - Clicking confirms via window.confirm(labels.clearConfirm).
 * - On OK, ChatWidget.clear() is invoked (history wiped + UI re-renders empty).
 * - On Cancel, nothing happens.
 * - When the history is empty the button is disabled (visually + a11y).
 */

import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import {
	cleanupWidgets,
	getPart,
	mountWidget,
	registerChatWidget,
} from "../helpers/dom-helpers.ts";
import { scriptedAdapter, stubAdapter } from "../helpers/fake-adapters.ts";

type ConfirmFn = (message?: string) => boolean;
type WindowWithConfirm = Window & { confirm: ConfirmFn };

let confirmMock: ReturnType<typeof vi.fn<ConfirmFn>>;

beforeAll(registerChatWidget);
beforeEach(() => {
	confirmMock = vi.fn<ConfirmFn>(() => true);
	(window as unknown as WindowWithConfirm).confirm =
		confirmMock as unknown as ConfirmFn;
});
afterEach(() => {
	cleanupWidgets();
	delete (window as Partial<WindowWithConfirm>).confirm;
	vi.restoreAllMocks();
});

function getClearButton(widget: {
	shadowRoot: ShadowRoot | null;
}): HTMLButtonElement | null {
	const el = getPart(widget as never, "clear-button");
	return (el as HTMLButtonElement | null) ?? null;
}

describe("ChatWidget clear-history UI", () => {
	it("renders a clear-button inside the panel header", () => {
		const widget = mountWidget({ adapter: stubAdapter() });
		const button = getClearButton(widget);
		expect(button).not.toBeNull();
		expect(button?.tagName).toBe("BUTTON");
		expect(button?.closest('[part~="header"]')).not.toBeNull();
	});

	it("uses the localized clearHistory label as aria-label", () => {
		const widget = mountWidget({ adapter: stubAdapter(), locale: "ja" });
		expect(getClearButton(widget)?.getAttribute("aria-label")).toBe(
			"履歴をクリア",
		);
	});

	it("is disabled when the history is empty", () => {
		const widget = mountWidget({ adapter: stubAdapter() });
		expect(getClearButton(widget)?.hasAttribute("disabled")).toBe(true);
	});

	it("is enabled once a message has been sent", async () => {
		const widget = mountWidget({
			adapter: scriptedAdapter([
				{ type: "text-delta", delta: "ok" },
				{ type: "done" },
			]),
		});
		await widget.sendMessage("hi");
		expect(getClearButton(widget)?.hasAttribute("disabled")).toBe(false);
	});

	it("invokes clear() on click after window.confirm returns true", async () => {
		const widget = mountWidget({
			adapter: scriptedAdapter([
				{ type: "text-delta", delta: "ok" },
				{ type: "done" },
			]),
		});
		await widget.sendMessage("hi");
		expect(widget.getMessages().length).toBeGreaterThan(0);

		confirmMock.mockReturnValue(true);
		getClearButton(widget)?.click();
		// allow notify() to flush
		await new Promise<void>((r) => setTimeout(r, 0));

		expect(confirmMock).toHaveBeenCalledTimes(1);
		expect(widget.getMessages().length).toBe(0);
	});

	it("does not invoke clear() when window.confirm returns false", async () => {
		const widget = mountWidget({
			adapter: scriptedAdapter([
				{ type: "text-delta", delta: "ok" },
				{ type: "done" },
			]),
		});
		await widget.sendMessage("hi");
		const before = widget.getMessages().length;
		expect(before).toBeGreaterThan(0);

		confirmMock.mockReturnValue(false);
		getClearButton(widget)?.click();
		await new Promise<void>((r) => setTimeout(r, 0));

		expect(widget.getMessages().length).toBe(before);
	});

	it("uses the localized clearConfirm prompt for the confirm dialog", async () => {
		const widget = mountWidget({
			adapter: scriptedAdapter([
				{ type: "text-delta", delta: "ok" },
				{ type: "done" },
			]),
			locale: "ja",
		});
		await widget.sendMessage("hi");

		confirmMock.mockReturnValue(false);
		getClearButton(widget)?.click();

		expect(confirmMock).toHaveBeenCalledWith("履歴を削除しますか？");
	});
});
