import { renderThemeCss } from "../core/theme.ts";

const BASE_CSS = `
:host {
	display: block;
	font-family: var(--cw-font-family);
	font-size: var(--cw-font-size);
	color: var(--cw-color-text);
}
`;

export const WIDGET_CSS = `${BASE_CSS}${renderThemeCss()}`;

export function buildStyleElement(): HTMLStyleElement {
	const style = document.createElement("style");
	style.textContent = WIDGET_CSS;
	return style;
}
