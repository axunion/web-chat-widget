import { describe, expect, it } from "vitest";
import * as adapters from "../src/adapters/index.ts";
import { ChatWidget } from "../src/ui/widget.ts";

describe("iife entry", () => {
	it("does not register 'chat-widget' before the module is imported", () => {
		expect(customElements.get("chat-widget")).toBeUndefined();
	});

	it("registers 'chat-widget' on import (element side effect is bundled)", async () => {
		await import("../src/iife.ts");
		expect(customElements.get("chat-widget")).toBe(ChatWidget);
	});

	it("exposes ChatWidget as the default export", async () => {
		const mod = await import("../src/iife.ts");
		expect(mod.default).toBe(ChatWidget);
	});

	it("attaches the adapters namespace onto ChatWidget for CDN consumers", async () => {
		await import("../src/iife.ts");
		const attached = (ChatWidget as unknown as { adapters?: typeof adapters })
			.adapters;
		expect(attached).toBeDefined();
		expect(attached?.createOpenAISseAdapter).toBe(
			adapters.createOpenAISseAdapter,
		);
		expect(attached?.createJsonAdapter).toBe(adapters.createJsonAdapter);
	});
});
