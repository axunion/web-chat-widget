import type { ChatWidgetOptions } from "../../src/index.ts";
import { ChatWidget } from "../../src/index.ts";
import { defineChatWidget } from "../../src/ui/widget.ts";

export function registerChatWidget(): void {
	defineChatWidget();
}

// happy-dom's [part~="..."] selector does not strictly follow the CSS
// whitespace-token semantics, so tokens are filtered manually here.
export function getPart(widget: ChatWidget, partName: string): Element | null {
	const candidates = widget.shadowRoot?.querySelectorAll("[part]") ?? [];
	for (const candidate of Array.from(candidates)) {
		const tokens = (candidate.getAttribute("part") ?? "").split(/\s+/);
		if (tokens.includes(partName)) return candidate;
	}
	return null;
}

export function mountWidget(options: ChatWidgetOptions): ChatWidget {
	registerChatWidget();
	const widget = new ChatWidget(options);
	document.body.appendChild(widget);
	return widget;
}

export function cleanupWidgets(): void {
	for (const node of Array.from(
		document.body.querySelectorAll("chat-widget"),
	)) {
		node.remove();
	}
}

// happy-dom has no real layout, so scroll-related dimensions must be patched
// in. Use this from any test that needs scrollHeight/clientHeight to drive
// widget behaviour. scrollTop remains a normal writable property.
export function patchLayout(
	target: HTMLElement,
	scrollHeight: number,
	clientHeight: number,
): void {
	Object.defineProperty(target, "scrollHeight", {
		value: scrollHeight,
		configurable: true,
	});
	Object.defineProperty(target, "clientHeight", {
		value: clientHeight,
		configurable: true,
	});
}
