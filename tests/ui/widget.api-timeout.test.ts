import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatWidget } from "../../src/index.ts";
import type { ChatEventMap } from "../../src/index.ts";
import { cleanupWidgets, registerChatWidget } from "../helpers/dom-helpers.ts";

// PLAN.md §P4 — Adapter timeoutMs + api-timeout attribute
// API.md §3.1 (`api-timeout`) — parsed with Number.parseInt, passed as
// timeoutMs to the built-in adapter only when finite and positive, and only
// when the widget builds the adapter itself from attributes (no explicit
// `adapter` option supplied).

/**
 * Mounts a bare `<chat-widget>` with the given attributes already set before
 * it is inserted into the document, so `connectedCallback` sees them at
 * initialization time (no `adapter` option — the adapter must come from
 * `api-url` / `api-timeout` attribute parsing).
 */
function mountWidgetWithAttributes(
	attrs: Record<string, string>,
): ChatWidget {
	registerChatWidget();
	const widget = new ChatWidget();
	for (const [name, value] of Object.entries(attrs)) {
		widget.setAttribute(name, value);
	}
	document.body.appendChild(widget);
	return widget;
}

/** A fetch stub that never settles except via the signal it is given. */
function neverRespondingFetch(): typeof fetch {
	return (_url, init) =>
		new Promise((_resolve, reject) => {
			init?.signal?.addEventListener("abort", () => {
				reject(new DOMException("The operation was aborted", "AbortError"));
			});
		});
}

/** A fetch stub that never settles and never reacts to abort either. */
function foreverPendingFetch(): typeof fetch {
	return () => new Promise(() => {});
}

describe("ChatWidget — api-timeout attribute wires timeoutMs into the built-in adapter", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
		cleanupWidgets();
	});

	it("surfaces a 'Timed out' error once the fake clock passes the api-timeout value, with no adapter option supplied", async () => {
		vi.stubGlobal("fetch", neverRespondingFetch());

		const widget = mountWidgetWithAttributes({
			"api-url": "https://example.com/api/chat",
			"api-timeout": "50",
		});

		let caughtError: Error | undefined;
		widget.addEventListener("error", (event) => {
			caughtError = (event as unknown as CustomEvent<ChatEventMap["error"]>)
				.detail.error;
		});

		const sendPromise = widget.sendMessage("hello");
		await vi.advanceTimersByTimeAsync(50);
		await sendPromise;

		const assistant = widget.getMessages().find((m) => m.role === "assistant");
		expect(assistant?.status).toBe("error");
		expect(assistant?.content).toBe("");
		expect(caughtError?.message).toContain("Timed out");
	});

	it("does not arm a timeout when api-timeout is not a finite positive integer", async () => {
		for (const invalidValue of ["0", "-5", "abc"]) {
			vi.stubGlobal("fetch", foreverPendingFetch());

			const widget = mountWidgetWithAttributes({
				"api-url": "https://example.com/api/chat",
				"api-timeout": invalidValue,
			});

			void widget.sendMessage("hello");
			await vi.advanceTimersByTimeAsync(5000);

			const assistant = widget
				.getMessages()
				.find((m) => m.role === "assistant");
			expect(assistant?.status).toBe("streaming");

			widget.remove();
			vi.unstubAllGlobals();
		}
	});
});
