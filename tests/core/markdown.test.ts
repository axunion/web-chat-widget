import { describe, expect, it } from "vitest";
import { markdownToNodes } from "../../src/index.ts";

// SPEC §6.2 — supported Markdown syntax
// SPEC §6.3 — sanitization: no innerHTML, unsupported syntax as escaped text
// SPEC §6.4 — link constraints: ^https?:// only, target/_blank/rel forced
// SPEC §11.1 — XSS: only createElement + textContent, no innerHTML
// SPEC §11.2 — link security: disallowed schemes degrade to plain text

// Helper: mount returned nodes into a div for querying
function mount(nodes: Node[]): HTMLDivElement {
	const container = document.createElement("div");
	for (const n of nodes) container.appendChild(n);
	return container;
}

// ---------------------------------------------------------------------------
// Paragraphs & line breaks
// ---------------------------------------------------------------------------

describe("markdownToNodes — paragraphs", () => {
	it("wraps a single line in a <p> element", () => {
		// SPEC §6.2: paragraph (blank-line separated) → <p>
		const container = mount(markdownToNodes("hello world"));
		expect(container.querySelector("p")).not.toBeNull();
		expect(container.querySelector("p")?.textContent).toBe("hello world");
	});

	it("produces two <p> elements for blank-line-separated paragraphs", () => {
		// SPEC §6.2: two paragraphs separated by blank line → two <p>
		const container = mount(markdownToNodes("first\n\nsecond"));
		const paragraphs = container.querySelectorAll("p");
		expect(paragraphs.length).toBe(2);
		expect(paragraphs[0].textContent).toBe("first");
		expect(paragraphs[1].textContent).toBe("second");
	});

	it("inserts <br> for a newline inside a single paragraph", () => {
		// SPEC §6.2: line break (\n inside paragraph) → <br>
		const container = mount(markdownToNodes("line one\nline two"));
		const p = container.querySelector("p");
		expect(p).not.toBeNull();
		expect(p?.querySelector("br")).not.toBeNull();
	});

	it("inserts <br> for a trailing-two-space hard break", () => {
		// SPEC §6.2: trailing two-space → <br>
		const container = mount(markdownToNodes("line one  \nline two"));
		const p = container.querySelector("p");
		expect(p).not.toBeNull();
		expect(p?.querySelector("br")).not.toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Inline formatting
// ---------------------------------------------------------------------------

describe("markdownToNodes — inline formatting", () => {
	it("renders **bold** as <strong>", () => {
		// SPEC §6.2: **bold** → <strong>
		const container = mount(markdownToNodes("hello **world**"));
		const strong = container.querySelector("strong");
		expect(strong).not.toBeNull();
		expect(strong?.textContent).toBe("world");
	});

	it("renders *italic* as <em>", () => {
		// SPEC §6.2: *italic* → <em>
		const container = mount(markdownToNodes("hello *world*"));
		const em = container.querySelector("em");
		expect(em).not.toBeNull();
		expect(em?.textContent).toBe("world");
	});

	it("renders _italic_ as <em>", () => {
		// SPEC §6.2: _italic_ → <em>
		const container = mount(markdownToNodes("hello _world_"));
		const em = container.querySelector("em");
		expect(em).not.toBeNull();
		expect(em?.textContent).toBe("world");
	});

	it("renders `inline code` as <code> with exact inner text", () => {
		// SPEC §6.2: `inline code` → <code>
		const container = mount(markdownToNodes("use `console.log` here"));
		const code = container.querySelector("code");
		expect(code).not.toBeNull();
		expect(code?.textContent).toBe("console.log");
	});

	it("leaves unmatched asterisks as plain text", () => {
		// SPEC §6.2: only pair-matched delimiters trigger formatting
		const container = mount(markdownToNodes("a * b"));
		expect(container.querySelector("strong")).toBeNull();
		expect(container.querySelector("em")).toBeNull();
		expect(container.textContent).toContain("*");
	});
});

// ---------------------------------------------------------------------------
// Code blocks
// ---------------------------------------------------------------------------

describe("markdownToNodes — fenced code blocks", () => {
	it("renders a fenced code block as <pre><code> with the exact raw text", () => {
		// SPEC §6.2: triple-backtick fenced code block → <pre><code>
		const source = "```\nconst x = 1;\nconst y = 2;\n```";
		const container = mount(markdownToNodes(source));
		const pre = container.querySelector("pre");
		expect(pre).not.toBeNull();
		const code = pre?.querySelector("code");
		expect(code).not.toBeNull();
		expect(code?.textContent).toContain("const x = 1;");
		expect(code?.textContent).toContain("const y = 2;");
	});

	it("ignores the language tag after the opening fence", () => {
		// SPEC §6.2: language tag is ignored; content rendered as raw text
		const source = "```typescript\nconst x: number = 1;\n```";
		const container = mount(markdownToNodes(source));
		const pre = container.querySelector("pre");
		expect(pre).not.toBeNull();
		// The language tag itself must not appear in the rendered text content
		expect(pre?.querySelector("code")?.textContent).not.toContain("typescript");
		expect(pre?.querySelector("code")?.textContent).toContain("const x: number = 1;");
	});

	it("does NOT apply inline formatting inside a code block", () => {
		// SPEC §6.2: code block content is raw text — no Markdown processing inside
		const source = "```\n**bold** _italic_\n```";
		const container = mount(markdownToNodes(source));
		const pre = container.querySelector("pre");
		expect(pre).not.toBeNull();
		expect(pre?.querySelector("strong")).toBeNull();
		expect(pre?.querySelector("em")).toBeNull();
		// The literal asterisks must appear in the text
		expect(pre?.textContent).toContain("**bold**");
	});
});

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

describe("markdownToNodes — links", () => {
	it("renders [label](https://example.com) as an <a> with correct href and text", () => {
		// SPEC §6.2: [text](url) → <a href="…">text</a>
		// SPEC §6.4: https:// is allowed
		const container = mount(markdownToNodes("[click here](https://example.com)"));
		const a = container.querySelector("a");
		expect(a).not.toBeNull();
		expect(a?.getAttribute("href")).toBe("https://example.com");
		expect(a?.textContent).toBe("click here");
	});

	it("sets target=\"_blank\" and rel=\"noopener noreferrer\" on allowed links", () => {
		// SPEC §6.4: target="_blank" and rel="noopener noreferrer" are forced
		const container = mount(markdownToNodes("[visit](https://example.com)"));
		const a = container.querySelector("a");
		expect(a?.getAttribute("target")).toBe("_blank");
		expect(a?.getAttribute("rel")).toBe("noopener noreferrer");
	});

	it("degrades [x](javascript:alert(1)) to plain text (no <a> element)", () => {
		// SPEC §6.4: javascript: scheme → degrade to plain text
		// SPEC §11.2: disallowed schemes produce no <a> element
		const container = mount(markdownToNodes("[x](javascript:alert(1))"));
		expect(container.querySelector("a")).toBeNull();
		// The full source text must appear literally as text content
		expect(container.textContent).toContain("[x](javascript:alert(1))");
	});

	it("degrades [x](data:text/html,…) to plain text", () => {
		// SPEC §6.4: data: scheme → degrade to plain text
		// SPEC §11.2: disallowed schemes produce no <a> element
		const container = mount(markdownToNodes("[x](data:text/html,<b>hi</b>)"));
		expect(container.querySelector("a")).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

describe("markdownToNodes — lists", () => {
	it("renders `- a\\n- b` as a single <ul> with two <li>s", () => {
		// SPEC §6.2: - item → <ul><li>
		const container = mount(markdownToNodes("- alpha\n- beta"));
		const ul = container.querySelector("ul");
		expect(ul).not.toBeNull();
		const items = ul?.querySelectorAll("li");
		expect(items?.length).toBe(2);
		expect(items?.[0].textContent).toBe("alpha");
		expect(items?.[1].textContent).toBe("beta");
	});

	it("renders `* a\\n* b` as a single <ul>", () => {
		// SPEC §6.2: * item → <ul><li>
		const container = mount(markdownToNodes("* alpha\n* beta"));
		const ul = container.querySelector("ul");
		expect(ul).not.toBeNull();
		expect(ul?.querySelectorAll("li").length).toBe(2);
	});

	it("renders `1. a\\n2. b` as a single <ol>", () => {
		// SPEC §6.2: 1. item → <ol><li>
		const container = mount(markdownToNodes("1. first\n2. second"));
		const ol = container.querySelector("ol");
		expect(ol).not.toBeNull();
		const items = ol?.querySelectorAll("li");
		expect(items?.length).toBe(2);
		expect(items?.[0].textContent).toBe("first");
		expect(items?.[1].textContent).toBe("second");
	});

	it("renders inline formatting inside a list item", () => {
		// SPEC §6.2: inline spans apply inside list items
		const container = mount(markdownToNodes("- **bold item**"));
		const li = container.querySelector("li");
		expect(li).not.toBeNull();
		expect(li?.querySelector("strong")).not.toBeNull();
		expect(li?.querySelector("strong")?.textContent).toBe("bold item");
	});
});

// ---------------------------------------------------------------------------
// Unsupported syntax — must NOT produce the corresponding HTML element
// ---------------------------------------------------------------------------

describe("markdownToNodes — unsupported syntax", () => {
	it("does NOT render `# heading` as an <h1>; literal # characters appear as text", () => {
		// SPEC §6.2: headings are explicitly not supported
		const container = mount(markdownToNodes("# This is a heading"));
		expect(container.querySelector("h1")).toBeNull();
		expect(container.querySelector("h2")).toBeNull();
		expect(container.querySelector("h3")).toBeNull();
		// The literal # must be present in the rendered text
		expect(container.textContent).toContain("#");
	});

	it("does NOT render a Markdown image `![alt](src)` as an <img>", () => {
		// SPEC §6.2: images are explicitly not supported
		const container = mount(markdownToNodes("![alt text](https://example.com/img.png)"));
		expect(container.querySelector("img")).toBeNull();
	});

	it("does NOT render a GFM-style table as a <table>", () => {
		// SPEC §6.2: tables are explicitly not supported
		const source = "| col1 | col2 |\n|------|------|\n| a    | b    |";
		const container = mount(markdownToNodes(source));
		expect(container.querySelector("table")).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Security — CRITICAL (SPEC §11.1, §11.2)
// ---------------------------------------------------------------------------

describe("markdownToNodes — security", () => {
	it("escapes raw <script>alert(1)</script> as text — no <script> element", () => {
		// SPEC §11.1: raw HTML must never be injected; appears as escaped text
		const source = "<script>alert(1)</script>";
		const container = mount(markdownToNodes(source));
		expect(container.querySelector("script")).toBeNull();
		// The literal string must be visible as text content
		expect(container.textContent).toContain("<script>alert(1)</script>");
	});

	it("escapes <img src=x onerror=\"alert(1)\"> as text — no <img> element", () => {
		// SPEC §11.1: raw HTML img tag must not be created as a DOM element
		const source = '<img src=x onerror="alert(1)">';
		const container = mount(markdownToNodes(source));
		expect(container.querySelector("img")).toBeNull();
		expect(container.textContent).toContain("<img");
	});

	it("escapes a raw <a href=\"javascript:...\"> as text — no <a> with javascript href", () => {
		// SPEC §11.1, §11.2: raw HTML <a> with javascript: href must not produce an <a> element
		const source = '<a href="javascript:alert(1)">click</a>';
		const container = mount(markdownToNodes(source));
		// Either no <a> at all, or no <a> with javascript: href
		const anchors = container.querySelectorAll("a");
		for (const a of anchors) {
			const href = a.getAttribute("href") ?? "";
			expect(href.toLowerCase().startsWith("javascript:")).toBe(false);
		}
		// The literal text must appear as-is
		expect(container.textContent).toContain("<a href=");
	});

	it("returns Node[] — each item must be an instance of Node", () => {
		// SPEC §6.3: the function returns DOM Node instances, not a string
		const nodes = markdownToNodes("hello **world**");
		expect(Array.isArray(nodes)).toBe(true);
		expect(nodes.length).toBeGreaterThan(0);
		for (const node of nodes) {
			expect(node instanceof Node).toBe(true);
		}
	});

	it("does NOT leak extra attributes on a produced <a> — only href, target, rel", () => {
		// SPEC §6.4: the produced <a> element must have exactly href, target, rel
		// SPEC §11.1: no event-handler attributes (onclick, onerror, etc.)
		const container = mount(markdownToNodes("[visit](https://example.com)"));
		const a = container.querySelector("a");
		expect(a).not.toBeNull();
		expect(a?.attributes.length).toBe(3);
		const attrNames = Array.from(a?.attributes ?? []).map((attr) => attr.name);
		expect(attrNames).toContain("href");
		expect(attrNames).toContain("target");
		expect(attrNames).toContain("rel");
	});
});
