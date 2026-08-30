export interface ElProps {
	class?: string;
	part?: string;
	role?: string;
	attrs?: Record<string, string>;
	text?: string;
}

export function el<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	props?: ElProps,
	children?: readonly Node[],
): HTMLElementTagNameMap[K] {
	const element = document.createElement(tag);
	if (props?.class) element.className = props.class;
	if (props?.part) element.setAttribute("part", props.part);
	if (props?.role) element.setAttribute("role", props.role);
	if (props?.attrs) {
		for (const [key, value] of Object.entries(props.attrs)) {
			element.setAttribute(key, value);
		}
	}
	if (props?.text) element.textContent = props.text;
	if (children) {
		for (const child of children) element.appendChild(child);
	}
	return element;
}

// A visible control's text and its accessible name are the same string
// everywhere in this widget; keeping them in one call stops the two from
// drifting apart when a label changes.
export function setLabel(element: Element, text: string): void {
	element.textContent = text;
	element.setAttribute("aria-label", text);
}
