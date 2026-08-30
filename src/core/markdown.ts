import { isAllowedHttpUrl } from "./sanitize.ts";

type Block =
	| { type: "paragraph"; text: string }
	| { type: "code"; text: string }
	| { type: "ul"; items: string[] }
	| { type: "ol"; items: string[] };

type InlineToken =
	| { type: "text"; value: string }
	| { type: "strong"; value: string }
	| { type: "em"; value: string }
	| { type: "code"; value: string }
	| { type: "link"; text: string; href: string };

const FENCE = /^```/;
const UNORDERED_ITEM = /^[-*] /;
const ORDERED_ITEM = /^\d+\. /;
const LINK = /\[([^\]]*)\]\(([^)]*)\)/y;

export function markdownToNodes(source: string): Node[] {
	return parseBlocks(source).map(renderBlock);
}

// Internal — used to build the aria-live announcement copy (see ARCHITECTURE.md
// §aria-live pattern). Not exported from "." — it stays a UI-layer concern.
export function markdownToPlainText(source: string): string {
	return parseBlocks(source).map(blockToPlainText).join("\n\n");
}

function blockToPlainText(block: Block): string {
	if (block.type === "code") return block.text;
	if (block.type === "ul") {
		return block.items.map((item) => `- ${inlineToPlainText(item)}`).join("\n");
	}
	if (block.type === "ol") {
		return block.items
			.map((item, i) => `${i + 1}. ${inlineToPlainText(item)}`)
			.join("\n");
	}
	return splitParagraphLines(block.text).map(inlineToPlainText).join("\n");
}

// A trailing double space is Markdown's hard line break: the break itself is
// rendered structurally (a <br>), so the marker is stripped from the text.
// Shared so the DOM output and the aria-live plain-text copy can't diverge.
function splitParagraphLines(text: string): string[] {
	return text.split("\n").map((line) => line.replace(/ {2}$/, ""));
}

function inlineToPlainText(text: string): string {
	return tokenizeInline(text).map(inlineTokenToPlainText).join("");
}

function inlineTokenToPlainText(token: InlineToken): string {
	if (token.type === "link") return `${token.text} (${token.href})`;
	return token.value;
}

function parseBlocks(source: string): Block[] {
	const lines = source.split("\n");
	const blocks: Block[] = [];
	let i = 0;
	while (i < lines.length) {
		const line = lines[i];
		if (FENCE.test(line)) {
			const codeLines: string[] = [];
			i++;
			while (i < lines.length && !FENCE.test(lines[i])) {
				codeLines.push(lines[i]);
				i++;
			}
			if (i < lines.length) i++;
			blocks.push({ type: "code", text: codeLines.join("\n") });
			continue;
		}
		if (UNORDERED_ITEM.test(line)) {
			const collected = collectItems(lines, i, UNORDERED_ITEM);
			i = collected.next;
			blocks.push({ type: "ul", items: collected.items });
			continue;
		}
		if (ORDERED_ITEM.test(line)) {
			const collected = collectItems(lines, i, ORDERED_ITEM);
			i = collected.next;
			blocks.push({ type: "ol", items: collected.items });
			continue;
		}
		if (line === "") {
			i++;
			continue;
		}
		const paraLines: string[] = [];
		while (
			i < lines.length &&
			lines[i] !== "" &&
			!FENCE.test(lines[i]) &&
			!UNORDERED_ITEM.test(lines[i]) &&
			!ORDERED_ITEM.test(lines[i])
		) {
			paraLines.push(lines[i]);
			i++;
		}
		blocks.push({ type: "paragraph", text: paraLines.join("\n") });
	}
	return blocks;
}

// Consumes the run of consecutive list items matching `marker`, stripping it
// from each. Shared by the ul and ol branches, which differ only in the marker.
function collectItems(
	lines: readonly string[],
	start: number,
	marker: RegExp,
): { items: string[]; next: number } {
	const items: string[] = [];
	let i = start;
	while (i < lines.length && marker.test(lines[i])) {
		items.push(lines[i].replace(marker, ""));
		i++;
	}
	return { items, next: i };
}

function renderBlock(block: Block): Node {
	if (block.type === "code") {
		const pre = document.createElement("pre");
		const code = document.createElement("code");
		code.textContent = block.text;
		pre.appendChild(code);
		return pre;
	}
	if (block.type === "ul") {
		return renderList("ul", block.items);
	}
	if (block.type === "ol") {
		return renderList("ol", block.items);
	}
	const p = document.createElement("p");
	for (const node of renderParagraph(block.text)) p.appendChild(node);
	return p;
}

function renderList(tag: "ul" | "ol", items: string[]): HTMLElement {
	const list = document.createElement(tag);
	for (const item of items) {
		const li = document.createElement("li");
		for (const node of renderInline(item)) li.appendChild(node);
		list.appendChild(li);
	}
	return list;
}

function renderParagraph(text: string): Node[] {
	const lines = splitParagraphLines(text);
	const nodes: Node[] = [];
	for (let i = 0; i < lines.length; i++) {
		for (const node of renderInline(lines[i])) nodes.push(node);
		if (i < lines.length - 1) nodes.push(document.createElement("br"));
	}
	return nodes;
}

function renderInline(text: string): Node[] {
	return tokenizeInline(text).map(tokenToNode);
}

function tokenizeInline(text: string): InlineToken[] {
	const tokens: InlineToken[] = [];
	let buffer = "";
	const flush = () => {
		if (buffer) {
			tokens.push({ type: "text", value: buffer });
			buffer = "";
		}
	};
	let i = 0;
	while (i < text.length) {
		const ch = text[i];
		if (ch === "[") {
			LINK.lastIndex = i;
			const match = LINK.exec(text);
			if (match) {
				const [full, linkText, href] = match;
				if (isAllowedHttpUrl(href)) {
					flush();
					tokens.push({ type: "link", text: linkText, href });
					i += full.length;
					continue;
				}
				buffer += full;
				i += full.length;
				continue;
			}
		}
		if (ch === "`") {
			const end = text.indexOf("`", i + 1);
			if (end > i) {
				flush();
				tokens.push({ type: "code", value: text.slice(i + 1, end) });
				i = end + 1;
				continue;
			}
		}
		if (ch === "*" && text[i + 1] === "*") {
			const end = text.indexOf("**", i + 2);
			if (end > i + 1 && text[i + 2] !== " ") {
				flush();
				tokens.push({ type: "strong", value: text.slice(i + 2, end) });
				i = end + 2;
				continue;
			}
		}
		if (ch === "*") {
			const end = text.indexOf("*", i + 1);
			if (end > i + 1 && text[i + 1] !== " " && text[i + 1] !== "*") {
				flush();
				tokens.push({ type: "em", value: text.slice(i + 1, end) });
				i = end + 1;
				continue;
			}
		}
		if (ch === "_") {
			const end = text.indexOf("_", i + 1);
			if (end > i + 1 && text[i + 1] !== " ") {
				flush();
				tokens.push({ type: "em", value: text.slice(i + 1, end) });
				i = end + 1;
				continue;
			}
		}
		buffer += ch;
		i++;
	}
	flush();
	return tokens;
}

const INLINE_TAG = { strong: "strong", em: "em", code: "code" } as const;

function tokenToNode(token: InlineToken): Node {
	if (token.type === "text") return document.createTextNode(token.value);
	if (token.type !== "link") {
		const el = document.createElement(INLINE_TAG[token.type]);
		el.textContent = token.value;
		return el;
	}
	const a = document.createElement("a");
	a.setAttribute("href", token.href);
	a.setAttribute("target", "_blank");
	a.setAttribute("rel", "noopener noreferrer");
	a.textContent = token.text;
	return a;
}
