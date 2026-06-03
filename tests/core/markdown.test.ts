import { describe, expect, it } from "vitest";
import { markdownToNodes } from "../../src/index.ts";

// ARCHITECTURE.md §Markdown scope — supported Markdown syntax
// ARCHITECTURE.md §Sanitization — sanitization: no innerHTML, unsupported syntax as escaped text
// ARCHITECTURE.md §Link constraints — link constraints: ^https?:// only, target/_blank/rel forced
// ARCHITECTURE.md §XSS — XSS: only createElement + textContent, no innerHTML
// ARCHITECTURE.md §Link sanitization — link security: disallowed schemes degrade to plain text

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
		// ARCHITECTURE.md §Markdown scope: paragraph (blank-line separated) → <p>
		const container = mount(markdownToNodes("hello world"));
		expect(container.querySelector("p")).not.toBeNull();
		expect(container.querySelector("p")?.textContent).toBe("hello world");
	});

	it("produces two <p> elements for blank-line-separated paragraphs", () => {
		// ARCHITECTURE.md §Markdown scope: two paragraphs separated by blank line → two <p>
		const container = mount(markdownToNodes("first\n\nsecond"));
		const paragraphs = container.querySelectorAll("p");
		expect(paragraphs.length).toBe(2);
		expect(paragraphs[0].textContent).toBe("first");
		expect(paragraphs[1].textContent).toBe("second");
	});

	it("inserts <br> for a newline inside a single paragraph", () => {
		// ARCHITECTURE.md §Markdown scope: line break (\n inside paragraph) → <br>
		const container = mount(markdownToNodes("line one\nline two"));
		const p = container.querySelector("p");
		expect(p).not.toBeNull();
		expect(p?.querySelector("br")).not.toBeNull();
	});

	it("inserts <br> for a trailing-two-space hard break", () => {
		// ARCHITECTURE.md §Markdown scope: trailing two-space → <br>
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
		// ARCHITECTURE.md §Markdown scope: **bold** → <strong>
		const container = mount(markdownToNodes("hello **world**"));
		const strong = container.querySelector("strong");
		expect(strong).not.toBeNull();
		expect(strong?.textContent).toBe("world");
	});

	it("renders *italic* as <em>", () => {
		// ARCHITECTURE.md §Markdown scope: *italic* → <em>
		const container = mount(markdownToNodes("hello *world*"));
		const em = container.querySelector("em");
		expect(em).not.toBeNull();
		expect(em?.textContent).toBe("world");
	});

	it("renders _italic_ as <em>", () => {
		// ARCHITECTURE.md §Markdown scope: _italic_ → <em>
		const container = mount(markdownToNodes("hello _world_"));
		const em = container.querySelector("em");
		expect(em).not.toBeNull();
		expect(em?.textContent).toBe("world");
	});

	it("renders `inline code` as <code> with exact inner text", () => {
		// ARCHITECTURE.md §Markdown scope: `inline code` → <code>
		const container = mount(markdownToNodes("use `console.log` here"));
		const code = container.querySelector("code");
		expect(code).not.toBeNull();
		expect(code?.textContent).toBe("console.log");
	});

	it("leaves unmatched asterisks as plain text", () => {
		// ARCHITECTURE.md §Markdown scope: only pair-matched delimiters trigger formatting
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
		// ARCHITECTURE.md §Markdown scope: triple-backtick fenced code block → <pre><code>
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
		// ARCHITECTURE.md §Markdown scope: language tag is ignored; content rendered as raw text
		const source = "```typescript\nconst x: number = 1;\n```";
		const container = mount(markdownToNodes(source));
		const pre = container.querySelector("pre");
		expect(pre).not.toBeNull();
		// The language tag itself must not appear in the rendered text content
		expect(pre?.querySelector("code")?.textContent).not.toContain("typescript");
		expect(pre?.querySelector("code")?.textContent).toContain(
			"const x: number = 1;",
		);
	});

	it("does NOT apply inline formatting inside a code block", () => {
		// ARCHITECTURE.md §Markdown scope: code block content is raw text — no Markdown processing inside
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
		// ARCHITECTURE.md §Markdown scope: [text](url) → <a href="…">text</a>
		// ARCHITECTURE.md §Link constraints: https:// is allowed
		const container = mount(
			markdownToNodes("[click here](https://example.com)"),
		);
		const a = container.querySelector("a");
		expect(a).not.toBeNull();
		expect(a?.getAttribute("href")).toBe("https://example.com");
		expect(a?.textContent).toBe("click here");
	});

	it('sets target="_blank" and rel="noopener noreferrer" on allowed links', () => {
		// ARCHITECTURE.md §Link constraints: target="_blank" and rel="noopener noreferrer" are forced
		const container = mount(markdownToNodes("[visit](https://example.com)"));
		const a = container.querySelector("a");
		expect(a?.getAttribute("target")).toBe("_blank");
		expect(a?.getAttribute("rel")).toBe("noopener noreferrer");
	});

	it("degrades [x](javascript:alert(1)) to plain text (no <a> element)", () => {
		// ARCHITECTURE.md §Link constraints: javascript: scheme → degrade to plain text
		// ARCHITECTURE.md §Link sanitization: disallowed schemes produce no <a> element
		const container = mount(markdownToNodes("[x](javascript:alert(1))"));
		expect(container.querySelector("a")).toBeNull();
		// The full source text must appear literally as text content
		expect(container.textContent).toContain("[x](javascript:alert(1))");
	});

	it("degrades [x](data:text/html,…) to plain text", () => {
		// ARCHITECTURE.md §Link constraints: data: scheme → degrade to plain text
		// ARCHITECTURE.md §Link sanitization: disallowed schemes produce no <a> element
		const container = mount(markdownToNodes("[x](data:text/html,<b>hi</b>)"));
		expect(container.querySelector("a")).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

describe("markdownToNodes — lists", () => {
	it("renders `- a\\n- b` as a single <ul> with two <li>s", () => {
		// ARCHITECTURE.md §Markdown scope: - item → <ul><li>
		const container = mount(markdownToNodes("- alpha\n- beta"));
		const ul = container.querySelector("ul");
		expect(ul).not.toBeNull();
		const items = ul?.querySelectorAll("li");
		expect(items?.length).toBe(2);
		expect(items?.[0].textContent).toBe("alpha");
		expect(items?.[1].textContent).toBe("beta");
	});

	it("renders `* a\\n* b` as a single <ul>", () => {
		// ARCHITECTURE.md §Markdown scope: * item → <ul><li>
		const container = mount(markdownToNodes("* alpha\n* beta"));
		const ul = container.querySelector("ul");
		expect(ul).not.toBeNull();
		expect(ul?.querySelectorAll("li").length).toBe(2);
	});

	it("renders `1. a\\n2. b` as a single <ol>", () => {
		// ARCHITECTURE.md §Markdown scope: 1. item → <ol><li>
		const container = mount(markdownToNodes("1. first\n2. second"));
		const ol = container.querySelector("ol");
		expect(ol).not.toBeNull();
		const items = ol?.querySelectorAll("li");
		expect(items?.length).toBe(2);
		expect(items?.[0].textContent).toBe("first");
		expect(items?.[1].textContent).toBe("second");
	});

	it("renders inline formatting inside a list item", () => {
		// ARCHITECTURE.md §Markdown scope: inline spans apply inside list items
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
		// ARCHITECTURE.md §Markdown scope: headings are explicitly not supported
		const container = mount(markdownToNodes("# This is a heading"));
		expect(container.querySelector("h1")).toBeNull();
		expect(container.querySelector("h2")).toBeNull();
		expect(container.querySelector("h3")).toBeNull();
		// The literal # must be present in the rendered text
		expect(container.textContent).toContain("#");
	});

	it("does NOT render a Markdown image `![alt](src)` as an <img>", () => {
		// ARCHITECTURE.md §Markdown scope: images are explicitly not supported
		const container = mount(
			markdownToNodes("![alt text](https://example.com/img.png)"),
		);
		expect(container.querySelector("img")).toBeNull();
	});

	it("does NOT render a GFM-style table as a <table>", () => {
		// ARCHITECTURE.md §Markdown scope: tables are explicitly not supported
		const source = "| col1 | col2 |\n|------|------|\n| a    | b    |";
		const container = mount(markdownToNodes(source));
		expect(container.querySelector("table")).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Security — CRITICAL (ARCHITECTURE.md §XSS, §11.2)
// ---------------------------------------------------------------------------

describe("markdownToNodes — security", () => {
	it("escapes raw <script>alert(1)</script> as text — no <script> element", () => {
		// ARCHITECTURE.md §XSS: raw HTML must never be injected; appears as escaped text
		const source = "<script>alert(1)</script>";
		const container = mount(markdownToNodes(source));
		expect(container.querySelector("script")).toBeNull();
		// The literal string must be visible as text content
		expect(container.textContent).toContain("<script>alert(1)</script>");
	});

	it('escapes <img src=x onerror="alert(1)"> as text — no <img> element', () => {
		// ARCHITECTURE.md §XSS: raw HTML img tag must not be created as a DOM element
		const source = '<img src=x onerror="alert(1)">';
		const container = mount(markdownToNodes(source));
		expect(container.querySelector("img")).toBeNull();
		expect(container.textContent).toContain("<img");
	});

	it('escapes a raw <a href="javascript:..."> as text — no <a> with javascript href', () => {
		// ARCHITECTURE.md §XSS, §11.2: raw HTML <a> with javascript: href must not produce an <a> element
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
		// ARCHITECTURE.md §Sanitization: the function returns DOM Node instances, not a string
		const nodes = markdownToNodes("hello **world**");
		expect(Array.isArray(nodes)).toBe(true);
		expect(nodes.length).toBeGreaterThan(0);
		for (const node of nodes) {
			expect(node instanceof Node).toBe(true);
		}
	});

	it("does NOT leak extra attributes on a produced <a> — only href, target, rel", () => {
		// ARCHITECTURE.md §Link constraints: the produced <a> element must have exactly href, target, rel
		// ARCHITECTURE.md §XSS: no event-handler attributes (onclick, onerror, etc.)
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
