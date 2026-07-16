import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createMemoryStore } from "../../src/core/store.ts";
import { ChatWidget } from "../../src/index.ts";
import {
	cleanupWidgets,
	getPart,
	registerChatWidget,
} from "../helpers/dom-helpers.ts";
import { stubAdapter } from "../helpers/fake-adapters.ts";

beforeAll(registerChatWidget);
afterEach(() => {
	cleanupWidgets();
	localStorage.clear();
	sessionStorage.clear();
});

// Mounts a bare <chat-widget> with attributes already set before connection,
// so connectedCallback observes them at initialization time.
function mountWidgetWithAttributes(
	attrs: Record<string, string>,
	options?: { store?: ReturnType<typeof createMemoryStore> },
): ChatWidget {
	registerChatWidget();
	const widget = new ChatWidget({
		adapter: stubAdapter(),
		store: options?.store,
	});
	for (const [name, value] of Object.entries(attrs)) {
		widget.setAttribute(name, value);
	}
	document.body.appendChild(widget);
	return widget;
}

// PLAN.md §P5 — Declarative config: welcome-message, max-input-length

describe("ChatWidget — welcome-message attribute", () => {
	it("renders a single assistant greeting when no stored history exists", () => {
		const widget = mountWidgetWithAttributes({ "welcome-message": "Hi!" });

		const messages = widget.getMessages();
		expect(messages).toHaveLength(1);
		expect(messages[0]).toMatchObject({
			role: "assistant",
			content: "Hi!",
			status: "done",
		});
	});

	it("stored history wins over the welcome-message attribute", () => {
		const store = createMemoryStore();
		store.save([
			{
				id: "stored-1",
				role: "user",
				content: "already chatting",
				createdAt: 1000,
			},
		]);
		const widget = mountWidgetWithAttributes(
			{ "welcome-message": "Hi!" },
			{ store },
		);

		const messages = widget.getMessages();
		expect(messages).toHaveLength(1);
		expect(messages[0].content).toBe("already chatting");
	});

	it("the initialMessages option wins over the welcome-message attribute", () => {
		registerChatWidget();
		const widget = new ChatWidget({
			adapter: stubAdapter(),
			initialMessages: [
				{
					id: "seed-1",
					role: "assistant",
					content: "from initialMessages",
					createdAt: 1000,
					status: "done",
				},
			],
		});
		widget.setAttribute("welcome-message", "Hi!");
		document.body.appendChild(widget);

		const messages = widget.getMessages();
		expect(messages).toHaveLength(1);
		expect(messages[0].content).toBe("from initialMessages");
	});
});

describe("ChatWidget — max-input-length attribute / maxInputLength option", () => {
	it("applies maxlength to the textarea from the max-input-length attribute", () => {
		const widget = mountWidgetWithAttributes({ "max-input-length": "10" });
		const textarea = getPart(widget, "input") as HTMLTextAreaElement;
		expect(textarea.getAttribute("maxlength")).toBe("10");
	});

	it("applies maxlength to the textarea from the maxInputLength option", () => {
		registerChatWidget();
		const widget = new ChatWidget({ adapter: stubAdapter(), maxInputLength: 10 });
		document.body.appendChild(widget);
		const textarea = getPart(widget, "input") as HTMLTextAreaElement;
		expect(textarea.getAttribute("maxlength")).toBe("10");
	});

	it.each(["0", "abc", "-5"])(
		"ignores an invalid max-input-length value %s (no maxlength attribute set)",
		(value) => {
			const widget = mountWidgetWithAttributes({ "max-input-length": value });
			const textarea = getPart(widget, "input") as HTMLTextAreaElement;
			expect(textarea.hasAttribute("maxlength")).toBe(false);
		},
	);

	it("does not limit programmatic sendMessage() even when max-input-length is set", async () => {
		const widget = mountWidgetWithAttributes({ "max-input-length": "10" });
		const longText = "this text is definitely longer than ten characters";

		await widget.sendMessage(longText);

		const user = widget.getMessages().find((m) => m.role === "user");
		expect(user?.content).toBe(longText);
	});
});
