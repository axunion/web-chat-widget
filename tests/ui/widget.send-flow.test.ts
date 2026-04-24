import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
	cleanupWidgets,
	getPart,
	mountWidget,
	registerChatWidget,
} from "../helpers/dom-helpers.ts";
import {
	capturingAdapter,
	stubAdapter,
} from "../helpers/fake-adapters.ts";

beforeAll(registerChatWidget);
afterEach(cleanupWidgets);

const flushMacrotasks = (): Promise<void> =>
	new Promise((r) => setTimeout(r, 10));

describe("ChatWidget.sendMessage — appends a user message to engine state", () => {
	it("engine state contains the sent user message after await", async () => {
		const widget = mountWidget({ adapter: stubAdapter() });
		await widget.sendMessage("hello");
		const user = widget.getMessages().find((m) => m.role === "user");
		expect(user?.content).toBe("hello");
	});
});

describe("ChatWidget — send button click triggers sendMessage", () => {
	it("clicking send with non-empty text calls the adapter once", async () => {
		const adapter = capturingAdapter();
		const widget = mountWidget({ adapter });
		const textarea = getPart(widget, "input") as HTMLTextAreaElement;
		const sendButton = getPart(widget, "send-button") as HTMLButtonElement;
		textarea.value = "via-button";
		sendButton.click();
		await flushMacrotasks();
		expect(adapter.captured).toHaveLength(1);
		const sentUser = adapter.captured[0].find((m) => m.role === "user");
		expect(sentUser?.content).toBe("via-button");
	});
});

describe("ChatWidget — Enter key submits the textarea", () => {
	it("Enter (no shift) in the textarea calls the adapter once", async () => {
		const adapter = capturingAdapter();
		const widget = mountWidget({ adapter });
		const textarea = getPart(widget, "input") as HTMLTextAreaElement;
		textarea.value = "via-enter";
		textarea.dispatchEvent(
			new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
		);
		await flushMacrotasks();
		expect(adapter.captured).toHaveLength(1);
		const sentUser = adapter.captured[0].find((m) => m.role === "user");
		expect(sentUser?.content).toBe("via-enter");
	});
});

describe("ChatWidget — Shift+Enter does not submit", () => {
	it("Shift+Enter leaves the adapter uncalled", async () => {
		const adapter = capturingAdapter();
		const widget = mountWidget({ adapter });
		const textarea = getPart(widget, "input") as HTMLTextAreaElement;
		textarea.value = "multiline";
		textarea.dispatchEvent(
			new KeyboardEvent("keydown", {
				key: "Enter",
				shiftKey: true,
				bubbles: true,
			}),
		);
		await flushMacrotasks();
		expect(adapter.captured).toHaveLength(0);
	});
});

describe("ChatWidget — empty-string submit is ignored", () => {
	it("clicking send with an empty textarea does not call the adapter", async () => {
		const adapter = capturingAdapter();
		const widget = mountWidget({ adapter });
		const sendButton = getPart(widget, "send-button") as HTMLButtonElement;
		sendButton.click();
		await flushMacrotasks();
		expect(adapter.captured).toHaveLength(0);
	});
});

describe("ChatWidget — textarea is cleared after submit", () => {
	it("the textarea value becomes empty after a successful submit", async () => {
		const widget = mountWidget({ adapter: stubAdapter() });
		const textarea = getPart(widget, "input") as HTMLTextAreaElement;
		const sendButton = getPart(widget, "send-button") as HTMLButtonElement;
		textarea.value = "hello";
		sendButton.click();
		await flushMacrotasks();
		expect(textarea.value).toBe("");
	});
});

describe("ChatWidget — Escape key in the input closes the panel", () => {
	it("pressing Escape while the textarea is focused closes the panel", () => {
		const widget = mountWidget({ adapter: stubAdapter() });
		widget.open();
		const textarea = getPart(widget, "input") as HTMLTextAreaElement;
		textarea.dispatchEvent(
			new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
		);
		expect(getPart(widget, "panel")?.hasAttribute("data-open")).toBe(false);
	});
});

describe("ChatWidget — user message appears in the log after send", () => {
	it("the log contains a node with data-message-id carrying the sent content", async () => {
		const widget = mountWidget({ adapter: stubAdapter() });
		await widget.sendMessage("shown");
		const userNode = Array.from(
			widget.shadowRoot?.querySelectorAll("[data-message-id]") ?? [],
		).find((node) => node.textContent?.includes("shown"));
		expect(userNode).toBeTruthy();
	});
});
