/**
 * SPEC §5.7 — message log auto-scroll behavior.
 *
 * When a new message arrives the log container auto-scrolls to the bottom
 * only if scrollTop is within 48px of the bottom. If the user has scrolled
 * up to read history, the log must stay put.
 *
 * happy-dom does not compute layout, so scrollHeight / clientHeight are
 * patched via Object.defineProperty. scrollTop is observed as the assertion
 * target.
 */

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { ChatWidget } from "../../src/index.ts";
import {
	cleanupWidgets,
	getPart,
	mountWidget,
	patchLayout,
	registerChatWidget,
} from "../helpers/dom-helpers.ts";
import { scriptedAdapter } from "../helpers/fake-adapters.ts";

beforeAll(registerChatWidget);
afterEach(cleanupWidgets);

function getLogEl(widget: ChatWidget): HTMLElement {
	const el = getPart(widget, "log");
	if (!el) throw new Error("log part not found");
	return el as HTMLElement;
}

describe("ChatWidget log auto-scroll 48px rule", () => {
	it("scrolls to the bottom when the user is within 48px of the bottom", async () => {
		const widget = mountWidget({
			adapter: scriptedAdapter([
				{ type: "text-delta", delta: "reply" },
				{ type: "done" },
			]),
		});
		const log = getLogEl(widget);

		patchLayout(log, 1000, 400);
		log.scrollTop = 590; // 10px from bottom (600 = 1000 - 400)

		await widget.sendMessage("hi");

		expect(log.scrollTop).toBe(600);
	});

	it("does not scroll when the user is far above the bottom", async () => {
		const widget = mountWidget({
			adapter: scriptedAdapter([
				{ type: "text-delta", delta: "reply" },
				{ type: "done" },
			]),
		});
		const log = getLogEl(widget);

		patchLayout(log, 1000, 400);
		log.scrollTop = 100; // 500px from bottom

		await widget.sendMessage("hi");

		expect(log.scrollTop).toBe(100);
	});

	it("scrolls when exactly 48px from the bottom (boundary inclusive)", async () => {
		const widget = mountWidget({
			adapter: scriptedAdapter([
				{ type: "text-delta", delta: "reply" },
				{ type: "done" },
			]),
		});
		const log = getLogEl(widget);

		patchLayout(log, 1000, 400);
		log.scrollTop = 552; // 600 - 48 = exactly 48px from bottom

		await widget.sendMessage("hi");

		expect(log.scrollTop).toBe(600);
	});

	it("does not scroll when 49px from the bottom (just outside the threshold)", async () => {
		const widget = mountWidget({
			adapter: scriptedAdapter([
				{ type: "text-delta", delta: "reply" },
				{ type: "done" },
			]),
		});
		const log = getLogEl(widget);

		patchLayout(log, 1000, 400);
		log.scrollTop = 551; // 49px from bottom

		await widget.sendMessage("hi");

		expect(log.scrollTop).toBe(551);
	});
});
