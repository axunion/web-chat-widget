import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { ChatWidget } from "../../src/ui/widget.ts";
import {
	cleanupWidgets,
	mountWidget,
	registerChatWidget,
} from "../helpers/dom-helpers.ts";
import { scriptedAdapter } from "../helpers/fake-adapters.ts";

beforeAll(registerChatWidget);
afterEach(cleanupWidgets);

function assistantNode(widget: ChatWidget): Element | null {
	const assistant = widget.getMessages().find((m) => m.role === "assistant");
	if (!assistant) return null;
	return (
		widget.shadowRoot?.querySelector(
			`[data-message-id="${assistant.id}"]`,
		) ?? null
	);
}

describe("ChatWidget — assistant bold renders as <strong>", () => {
	it("delta 'Hello **world**' produces a <strong> child carrying 'world'", async () => {
		const widget = mountWidget({
			adapter: scriptedAdapter([
				{ type: "text-delta", delta: "Hello **world**" },
				{ type: "done" },
			]),
		});
		await widget.sendMessage("hi");
		const strong = assistantNode(widget)?.querySelector("strong");
		expect(strong?.textContent).toBe("world");
	});
});

describe("ChatWidget — assistant inline code renders as <code>", () => {
	it("backticked text becomes a <code> element", async () => {
		const widget = mountWidget({
			adapter: scriptedAdapter([
				{ type: "text-delta", delta: "run `npm test` now" },
				{ type: "done" },
			]),
		});
		await widget.sendMessage("hi");
		const code = assistantNode(widget)?.querySelector("code");
		expect(code?.textContent).toBe("npm test");
	});
});

describe("ChatWidget — assistant https link is rendered as <a>", () => {
	it("'[text](https://example.com)' yields an <a> with target=_blank and rel=noopener noreferrer", async () => {
		const widget = mountWidget({
			adapter: scriptedAdapter([
				{ type: "text-delta", delta: "go to [here](https://example.com)" },
				{ type: "done" },
			]),
		});
		await widget.sendMessage("hi");
		const link = assistantNode(widget)?.querySelector("a");
		expect(link).not.toBeNull();
		expect(link?.getAttribute("href")).toBe("https://example.com");
		expect(link?.getAttribute("target")).toBe("_blank");
		expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
	});
});

describe("ChatWidget — assistant javascript: link is downgraded to text", () => {
	it("no <a> is emitted for a javascript: link; the raw brackets remain as text", async () => {
		const widget = mountWidget({
			adapter: scriptedAdapter([
				{ type: "text-delta", delta: "[nope](javascript:alert(1))" },
				{ type: "done" },
			]),
		});
		await widget.sendMessage("hi");
		const node = assistantNode(widget);
		expect(node?.querySelector("a")).toBeNull();
		expect(node?.textContent).toContain("[nope]");
	});
});

describe("ChatWidget — assistant code fence renders as <pre><code>", () => {
	it("triple-backtick block yields <pre><code> with preserved text", async () => {
		const widget = mountWidget({
			adapter: scriptedAdapter([
				{ type: "text-delta", delta: "```\nline1\nline2\n```" },
				{ type: "done" },
			]),
		});
		await widget.sendMessage("hi");
		const pre = assistantNode(widget)?.querySelector("pre");
		const code = pre?.querySelector("code");
		expect(code?.textContent).toBe("line1\nline2");
	});
});

describe("ChatWidget — user message is plain text (Markdown NOT applied)", () => {
	it("user content with ** is rendered literally, not as <strong>", async () => {
		const widget = mountWidget({
			adapter: scriptedAdapter([{ type: "done" }]),
		});
		await widget.sendMessage("**still-plain**");
		const userMessage = widget.getMessages().find((m) => m.role === "user");
		const node = widget.shadowRoot?.querySelector(
			`[data-message-id="${userMessage?.id}"]`,
		);
		expect(node?.querySelector("strong")).toBeNull();
		expect(node?.textContent).toBe("**still-plain**");
	});
});

describe("ChatWidget — streaming Markdown refreshes in place", () => {
	it("the final assistant node shows the accumulated Markdown after all deltas", async () => {
		const widget = mountWidget({
			adapter: scriptedAdapter([
				{ type: "text-delta", delta: "Hello " },
				{ type: "text-delta", delta: "**world**" },
				{ type: "done" },
			]),
		});
		await widget.sendMessage("hi");
		const node = assistantNode(widget);
		expect(node?.textContent).toBe("Hello world");
		expect(node?.querySelector("strong")?.textContent).toBe("world");
	});
});

describe("ChatWidget — assistant bullet list renders as <ul><li>", () => {
	it("'- a\\n- b' produces a <ul> with two <li> children", async () => {
		const widget = mountWidget({
			adapter: scriptedAdapter([
				{ type: "text-delta", delta: "- a\n- b" },
				{ type: "done" },
			]),
		});
		await widget.sendMessage("hi");
		const ul = assistantNode(widget)?.querySelector("ul");
		const items = ul?.querySelectorAll("li") ?? [];
		expect(items.length).toBe(2);
		expect(items[0].textContent).toBe("a");
		expect(items[1].textContent).toBe("b");
	});
});
