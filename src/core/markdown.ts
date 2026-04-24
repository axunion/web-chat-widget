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
			const items: string[] = [];
			while (i < lines.length && UNORDERED_ITEM.test(lines[i])) {
				items.push(lines[i].replace(UNORDERED_ITEM, ""));
				i++;
			}
			blocks.push({ type: "ul", items });
			continue;
		}
		if (ORDERED_ITEM.test(line)) {
			const items: string[] = [];
			while (i < lines.length && ORDERED_ITEM.test(lines[i])) {
				items.push(lines[i].replace(ORDERED_ITEM, ""));
				i++;
			}
			blocks.push({ type: "ol", items });
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
	const lines = text.split("\n").map((l) => l.replace(/ {2}$/, ""));
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

function tokenToNode(token: InlineToken): Node {
	if (token.type === "text") return document.createTextNode(token.value);
	if (token.type === "strong") {
		const el = document.createElement("strong");
		el.textContent = token.value;
		return el;
	}
	if (token.type === "em") {
		const el = document.createElement("em");
		el.textContent = token.value;
		return el;
	}
	if (token.type === "code") {
		const el = document.createElement("code");
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
