import { describe, expect, it, vi } from "vitest";
import { ChatWidget } from "../src/ui/widget.ts";

describe("element side-effect entry", () => {
	it("does not register 'chat-widget' before the module is imported", () => {
		expect(customElements.get("chat-widget")).toBeUndefined();
	});

	it("registers the 'chat-widget' tag with ChatWidget on import", async () => {
		await import("../src/element.ts");
		expect(customElements.get("chat-widget")).toBe(ChatWidget);
	});

	it("does not throw when the module is re-evaluated after the tag is already defined", async () => {
		await import("../src/element.ts");
		expect(customElements.get("chat-widget")).toBe(ChatWidget);
		vi.resetModules();
		await expect(import("../src/element.ts")).resolves.toBeDefined();
		expect(customElements.get("chat-widget")).toBe(ChatWidget);
	});
});
