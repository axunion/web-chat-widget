import { beforeAll, describe, expect, it } from "vitest";
import { ChatWidget } from "../../src/ui/widget.ts";
import { registerChatWidget } from "../helpers/dom-helpers.ts";

beforeAll(registerChatWidget);

describe("ChatWidget — custom element registration", () => {
	it("is registerable under the 'chat-widget' tag", () => {
		expect(customElements.get("chat-widget")).toBe(ChatWidget);
	});
});

describe("ChatWidget — createElement returns a ChatWidget instance", () => {
	it("document.createElement('chat-widget') yields an instance of ChatWidget", () => {
		const el = document.createElement("chat-widget");
		expect(el).toBeInstanceOf(ChatWidget);
	});
});

describe("ChatWidget — open-mode shadow root", () => {
	it("attaches an open-mode shadow root so ::part() styling works", () => {
		const el = document.createElement("chat-widget") as ChatWidget;
		expect(el.shadowRoot).not.toBeNull();
		expect(el.shadowRoot?.mode).toBe("open");
	});
});

describe("ChatWidget — style element is injected into the shadow root", () => {
	it("the shadow root contains a <style> child immediately after construction", () => {
		const el = document.createElement("chat-widget") as ChatWidget;
		const styleEl = el.shadowRoot?.querySelector("style");
		expect(styleEl).toBeTruthy();
		expect(styleEl?.textContent?.length ?? 0).toBeGreaterThan(0);
	});
});
