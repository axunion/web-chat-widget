import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
	cleanupWidgets,
	getPart,
	mountWidget,
	registerChatWidget,
} from "../helpers/dom-helpers.ts";
import { scriptedAdapter, stubAdapter } from "../helpers/fake-adapters.ts";

beforeAll(registerChatWidget);

function stubClipboard(writeText: (text: string) => Promise<void>): void {
	Object.defineProperty(navigator, "clipboard", {
		value: { writeText },
		configurable: true,
	});
}

function clearClipboardStub(): void {
	Object.defineProperty(navigator, "clipboard", {
		value: undefined,
		configurable: true,
	});
}

afterEach(() => {
	cleanupWidgets();
	clearClipboardStub();
});

const codeFence = "```js\nconst x = 1;\n```";

// PLAN.md §P9 — Code block copy button + textarea auto-grow

describe("ChatWidget — code block copy button", () => {
	it("renders a part=copy-button button for an assistant code fence when the Clipboard API is available", async () => {
		stubClipboard(() => Promise.resolve());
		const widget = mountWidget({
			adapter: scriptedAdapter([
				{ type: "text-delta", delta: codeFence },
				{ type: "done" },
			]),
		});

		await widget.sendMessage("show code");

		expect(getPart(widget, "copy-button")).not.toBeNull();
	});

	it("copies the code text and reverts the label after ~2s", async () => {
		vi.useFakeTimers();
		try {
			const writeText = vi.fn().mockResolvedValue(undefined);
			stubClipboard(writeText);
			const widget = mountWidget({
				adapter: scriptedAdapter([
					{ type: "text-delta", delta: codeFence },
					{ type: "done" },
				]),
			});
			await widget.sendMessage("show code");

			const button = getPart(widget, "copy-button") as HTMLButtonElement;
			expect(button.textContent).toBe("Copy");

			button.click();
			await vi.advanceTimersByTimeAsync(0);

			expect(writeText).toHaveBeenCalledWith("const x = 1;");
			expect(button.textContent).toBe("Copied");

			await vi.advanceTimersByTimeAsync(2000);
			expect(button.textContent).toBe("Copy");
		} finally {
			vi.useRealTimers();
		}
	});

	it("renders no button when the Clipboard API is unavailable", async () => {
		clearClipboardStub();
		const widget = mountWidget({
			adapter: scriptedAdapter([
				{ type: "text-delta", delta: codeFence },
				{ type: "done" },
			]),
		});

		await widget.sendMessage("show code");

		expect(getPart(widget, "copy-button")).toBeNull();
	});

	it("refreshes an already-rendered button's label when the locale attribute changes", async () => {
		stubClipboard(() => Promise.resolve());
		const widget = mountWidget({
			adapter: scriptedAdapter([
				{ type: "text-delta", delta: codeFence },
				{ type: "done" },
			]),
		});
		await widget.sendMessage("show code");
		const button = getPart(widget, "copy-button") as HTMLButtonElement;
		expect(button.textContent).toBe("Copy");

		widget.setAttribute("locale", "ja");

		expect(button.textContent).toBe("コピー");
	});

	it("renders no button for a user message or a non-code assistant message", async () => {
		stubClipboard(() => Promise.resolve());
		const widget = mountWidget({
			adapter: scriptedAdapter([
				{ type: "text-delta", delta: "plain text, no code" },
				{ type: "done" },
			]),
		});

		await widget.sendMessage("no code here");

		expect(getPart(widget, "copy-button")).toBeNull();
	});
});

describe("ChatWidget — textarea auto-grow", () => {
	const flushMacrotasks = (): Promise<void> =>
		new Promise((r) => setTimeout(r, 10));

	it("resets the textarea height style after a successful submit", async () => {
		const widget = mountWidget({ adapter: stubAdapter() });
		const textarea = getPart(widget, "input") as HTMLTextAreaElement;
		const sendButton = getPart(widget, "send-button") as HTMLButtonElement;
		textarea.value = "line one\nline two\nline three";
		textarea.dispatchEvent(new Event("input", { bubbles: true }));

		sendButton.click();
		await flushMacrotasks();

		expect(textarea.style.height).toBe("auto");
	});
});
