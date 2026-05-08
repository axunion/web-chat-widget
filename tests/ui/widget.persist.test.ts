import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createMemoryStore } from "../../src/core/store.ts";
import { ChatWidget } from "../../src/index.ts";
import { defineChatWidget } from "../../src/ui/widget.ts";
import {
	cleanupWidgets,
	mountWidget,
	registerChatWidget,
} from "../helpers/dom-helpers.ts";
import { stubAdapter } from "../helpers/fake-adapters.ts";

beforeAll(registerChatWidget);
afterEach(() => {
	cleanupWidgets();
	localStorage.clear();
	sessionStorage.clear();
});

const flushMacrotasks = (): Promise<void> =>
	new Promise((r) => setTimeout(r, 10));

// ---------------------------------------------------------------------------
// C1 — JS API: `store` option is honored
// ---------------------------------------------------------------------------

describe("ChatWidget — store option is accepted in ChatWidgetOptions", () => {
	it("mounts without throwing and getMessages() reflects a sent user message when a store is provided", async () => {
		const store = createMemoryStore();
		const widget = mountWidget({ adapter: stubAdapter(), store });
		await widget.sendMessage("hi from store");
		const user = widget.getMessages().find((m) => m.role === "user");
		expect(user?.content).toBe("hi from store");
	});
});

// ---------------------------------------------------------------------------
// C2 — `persist="local"` writes to localStorage on done
// ---------------------------------------------------------------------------

describe('ChatWidget — persist="local" attribute writes conversation to localStorage', () => {
	it("localStorage has the sent user message after sendMessage resolves", async () => {
		defineChatWidget();
		const widget = new ChatWidget({ adapter: stubAdapter() });
		widget.setAttribute("persist", "local");
		widget.setAttribute("persist-key", "test-c2");
		document.body.appendChild(widget);

		await widget.sendMessage("hello");

		const raw = localStorage.getItem("test-c2");
		expect(raw).not.toBeNull();
		const parsed = JSON.parse(raw as string) as {
			v: number;
			messages: Array<{ role: string; content: string }>;
		};
		expect(parsed.v).toBe(1);
		expect(
			parsed.messages.some((m) => m.role === "user" && m.content === "hello"),
		).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// C3 — `persist="session"` writes to sessionStorage (not localStorage)
// ---------------------------------------------------------------------------

describe('ChatWidget — persist="session" attribute writes to sessionStorage only', () => {
	it("sessionStorage has data and localStorage is empty after sendMessage", async () => {
		defineChatWidget();
		const widget = new ChatWidget({ adapter: stubAdapter() });
		widget.setAttribute("persist", "session");
		widget.setAttribute("persist-key", "test-c3");
		document.body.appendChild(widget);

		await widget.sendMessage("session-hello");

		const sessionRaw = sessionStorage.getItem("test-c3");
		expect(sessionRaw).not.toBeNull();

		const localRaw = localStorage.getItem("test-c3");
		expect(localRaw).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// C4 — `persist="none"` does NOT write to storage
// ---------------------------------------------------------------------------

describe('ChatWidget — persist="none" does not persist any data', () => {
	it("localStorage and sessionStorage remain empty after sendMessage with persist=none", async () => {
		defineChatWidget();
		const widget = new ChatWidget({ adapter: stubAdapter() });
		widget.setAttribute("persist", "none");
		widget.setAttribute("persist-key", "test-c4");
		document.body.appendChild(widget);

		await widget.sendMessage("ephemeral");

		expect(localStorage.getItem("test-c4")).toBeNull();
		expect(sessionStorage.getItem("test-c4")).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// C5 — Setting `persist` after mount is ignored (no dynamic store swap)
// ---------------------------------------------------------------------------

describe("ChatWidget — persist attribute change after mount is ignored", () => {
	it("nothing is written to localStorage when persist is set after connectedCallback", async () => {
		defineChatWidget();
		// Mount WITHOUT the persist attribute — store is memory-only at init time.
		const widget = new ChatWidget({ adapter: stubAdapter() });
		widget.setAttribute("persist-key", "test-c5");
		document.body.appendChild(widget);

		// First message goes into memory-only store.
		await widget.sendMessage("first");

		// Now set persist AFTER mount — SPEC §4.2 says this must be ignored.
		widget.setAttribute("persist", "local");

		// Second message — still no localStorage because the store was not swapped.
		await widget.sendMessage("second");
		await flushMacrotasks();

		expect(localStorage.getItem("test-c5")).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// C6 — widget.clear() also clears the persisted storage entry
// ---------------------------------------------------------------------------

describe("ChatWidget.clear — removes the persisted entry from localStorage", () => {
	it("localStorage key is null after clear() when persist=local was set at mount", async () => {
		defineChatWidget();
		const widget = new ChatWidget({ adapter: stubAdapter() });
		widget.setAttribute("persist", "local");
		widget.setAttribute("persist-key", "test-c6");
		document.body.appendChild(widget);

		await widget.sendMessage("persist me");
		expect(localStorage.getItem("test-c6")).not.toBeNull();

		widget.clear();
		await flushMacrotasks();

		expect(localStorage.getItem("test-c6")).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// C7 — `persist-key` defaults to "web-chat-widget"
// ---------------------------------------------------------------------------

describe('ChatWidget — persist-key defaults to "web-chat-widget"', () => {
	it('localStorage key "web-chat-widget" has data when persist=local but no persist-key is set', async () => {
		defineChatWidget();
		const widget = new ChatWidget({ adapter: stubAdapter() });
		widget.setAttribute("persist", "local");
		// Intentionally no persist-key attribute — the default must be used.
		document.body.appendChild(widget);

		await widget.sendMessage("default key test");

		const raw = localStorage.getItem("web-chat-widget");
		expect(raw).not.toBeNull();
		const parsed = JSON.parse(raw as string) as {
			messages: Array<{ role: string }>;
		};
		expect(parsed.messages.some((m) => m.role === "user")).toBe(true);
	});
});
