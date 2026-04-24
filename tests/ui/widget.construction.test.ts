import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Message } from "../../src/index.ts";
import { ChatWidget } from "../../src/ui/widget.ts";
import {
	cleanupWidgets,
	getPart,
	mountWidget,
	registerChatWidget,
} from "../helpers/dom-helpers.ts";
import { stubAdapter } from "../helpers/fake-adapters.ts";

beforeAll(registerChatWidget);
afterEach(cleanupWidgets);

function themedRoot(widget: ChatWidget): Element | null {
	return widget.shadowRoot?.querySelector("[data-theme]") ?? null;
}

describe("ChatWidget — locale='en' selects English labels", () => {
	it("the FAB aria-label is the English default", () => {
		const widget = mountWidget({ adapter: stubAdapter(), locale: "en" });
		expect(getPart(widget, "fab")?.getAttribute("aria-label")).toBe(
			"Open AI chat",
		);
	});
});

describe("ChatWidget — locale='ja' selects Japanese labels", () => {
	it("the FAB aria-label is the Japanese default", () => {
		const widget = mountWidget({ adapter: stubAdapter(), locale: "ja" });
		expect(getPart(widget, "fab")?.getAttribute("aria-label")).toBe(
			"AI チャットを開く",
		);
	});
});

describe("ChatWidget — messages option overrides individual labels", () => {
	it("the FAB aria-label reflects the overridden fabLabel", () => {
		const widget = mountWidget({
			adapter: stubAdapter(),
			locale: "en",
			messages: { fabLabel: "Custom label" },
		});
		expect(getPart(widget, "fab")?.getAttribute("aria-label")).toBe(
			"Custom label",
		);
	});
});

describe("ChatWidget — api-url attribute builds an adapter automatically", () => {
	it("connects without throwing when api-url is set and no adapter option is supplied", () => {
		const widget = document.createElement("chat-widget") as ChatWidget;
		widget.setAttribute("api-url", "/api/chat");
		expect(() => document.body.appendChild(widget)).not.toThrow();
	});
});

describe("ChatWidget — missing adapter throws on connect", () => {
	it("throws when connected without an adapter option or api-url attribute", () => {
		const widget = document.createElement("chat-widget") as ChatWidget;
		expect(() => document.body.appendChild(widget)).toThrow();
	});
});

describe("ChatWidget — theme option reflected on the shadow root wrapper", () => {
	it("applies theme='dark' as data-theme, cascading CSS variables to FAB and panel", () => {
		const widget = mountWidget({ adapter: stubAdapter(), theme: "dark" });
		const host = themedRoot(widget);
		expect(host?.getAttribute("data-theme")).toBe("dark");
		expect(host?.querySelector('[part~="fab"]')).toBeTruthy();
		expect(host?.querySelector('[part~="panel"]')).toBeTruthy();
	});
});

describe("ChatWidget — theme option reflected on the shadow root wrapper (light)", () => {
	it("applies theme='light' as data-theme", () => {
		const widget = mountWidget({ adapter: stubAdapter(), theme: "light" });
		expect(themedRoot(widget)?.getAttribute("data-theme")).toBe("light");
	});
});

describe("ChatWidget — position option reflected as data-position on the host", () => {
	it("applies position='top-right' to the widget host element", () => {
		const widget = mountWidget({
			adapter: stubAdapter(),
			position: "top-right",
		});
		expect(widget.getAttribute("data-position")).toBe("top-right");
	});
});

describe("ChatWidget — default position is bottom-right", () => {
	it("data-position is 'bottom-right' when no position is provided", () => {
		const widget = mountWidget({ adapter: stubAdapter() });
		expect(widget.getAttribute("data-position")).toBe("bottom-right");
	});
});

describe("ChatWidget — getMessages exposes the engine's initialMessages", () => {
	it("returns the initialMessages passed via options", () => {
		const seed: Message = {
			id: "seed-1",
			role: "user",
			content: "hi",
			createdAt: 1,
		};
		const widget = mountWidget({
			adapter: stubAdapter(),
			initialMessages: [seed],
		});
		const messages = widget.getMessages();
		expect(messages).toHaveLength(1);
		expect(messages[0].content).toBe("hi");
	});
});
