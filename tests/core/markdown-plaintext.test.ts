import { describe, expect, it } from "vitest";
import { markdownToPlainText } from "../../src/core/markdown.ts";

// PLAN.md §P8 — markdownToPlainText for the aria-live region
// ARCHITECTURE.md §aria-live pattern (two-container)

describe("markdownToPlainText — inline marker stripping", () => {
	it("strips bold/italic/inline-code markers while preserving the text", () => {
		const result = markdownToPlainText("**bold** and *em* and `code`");
		expect(result).toBe("bold and em and code");
	});

	it("strips underscore-em markers", () => {
		const result = markdownToPlainText("plain _emphasis_ text");
		expect(result).toBe("plain emphasis text");
	});
});

describe("markdownToPlainText — code fences", () => {
	it("drops the fence markers and language hint, keeping the code body", () => {
		const result = markdownToPlainText("```js\nconst x = 1;\n```");
		expect(result).toBe("const x = 1;");
		expect(result).not.toContain("```");
		expect(result).not.toContain("js");
	});
});

describe("markdownToPlainText — links", () => {
	it("renders an allowed https link as 'text (url)'", () => {
		const result = markdownToPlainText("[docs](https://example.com)");
		expect(result).toBe("docs (https://example.com)");
	});

	it("degrades a disallowed-scheme link to the plain original source, same as the DOM renderer", () => {
		const source = "[danger](javascript:alert(1))";
		const result = markdownToPlainText(source);
		expect(result).toBe(source);
	});
});

describe("markdownToPlainText — lists", () => {
	it("keeps '- ' markers for unordered list items", () => {
		const result = markdownToPlainText("- one\n- two");
		expect(result).toBe("- one\n- two");
	});

	it("keeps '1. ' style markers for ordered list items", () => {
		const result = markdownToPlainText("1. first\n2. second");
		expect(result).toBe("1. first\n2. second");
	});
});

describe("markdownToPlainText — paragraph separation", () => {
	it("preserves blank-line paragraph separation as a double newline", () => {
		const result = markdownToPlainText("first paragraph\n\nsecond paragraph");
		expect(result).toBe("first paragraph\n\nsecond paragraph");
	});
});

describe("markdownToPlainText — unrecognized syntax stays inert", () => {
	it("leaves unrecognized/hostile syntax as plain text, not interpreted", () => {
		const source = "<script>alert(1)</script> & unmatched **bold";
		const result = markdownToPlainText(source);
		expect(result).toBe(source);
	});
});
