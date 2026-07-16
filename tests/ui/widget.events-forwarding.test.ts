import { afterEach, describe, expect, it } from "vitest";
import type { ChatEventMap } from "../../src/index.ts";
import { cleanupWidgets, mountWidget } from "../helpers/dom-helpers.ts";
import { scriptedAdapter } from "../helpers/fake-adapters.ts";

describe("chat-widget message/error event forwarding (API.md §2.3)", () => {
	afterEach(() => {
		cleanupWidgets();
	});

	it("dispatches a message event on the element when the assistant reply completes", async () => {
		const widget = mountWidget({
			adapter: scriptedAdapter([
				{ type: "text-delta", delta: "hi" },
				{ type: "done" },
			]),
		});
		const received: ChatEventMap["message"][] = [];
		widget.addEventListener("message", (event) => {
			received.push((event as CustomEvent<ChatEventMap["message"]>).detail);
		});

		await widget.sendMessage("hello");

		expect(received).toEqual([
			{ role: "user", content: "hello" },
			{ role: "assistant", content: "hi" },
		]);
	});

	it("dispatches an error event on the element when the adapter reports an error", async () => {
		const failure = new Error("upstream unavailable");
		const widget = mountWidget({
			adapter: scriptedAdapter([{ type: "error", error: failure }]),
		});
		const received: ChatEventMap["error"][] = [];
		widget.addEventListener("error", (event) => {
			received.push(
				(event as unknown as CustomEvent<ChatEventMap["error"]>).detail,
			);
		});

		await widget.sendMessage("hello");

		expect(received).toHaveLength(1);
		expect(received[0].error).toBe(failure);
	});

	it("forwards exactly once per send after a destroy/re-initialize cycle", async () => {
		const widget = mountWidget({
			adapter: scriptedAdapter([
				{ type: "text-delta", delta: "hi" },
				{ type: "done" },
			]),
		});
		const received: ChatEventMap["message"][] = [];
		widget.addEventListener("message", (event) => {
			received.push((event as CustomEvent<ChatEventMap["message"]>).detail);
		});

		widget.remove();
		document.body.appendChild(widget);
		await widget.sendMessage("hello again");

		expect(received).toEqual([
			{ role: "user", content: "hello again" },
			{ role: "assistant", content: "hi" },
		]);
	});
});
