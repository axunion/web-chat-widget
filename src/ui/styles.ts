import { renderThemeCss } from "../core/theme.ts";

const WIDGET_LAYOUT_CSS = `
:host {
	position: fixed;
	inset: 0;
	pointer-events: none;
	z-index: var(--cw-z-index, 2147483000);
	display: block;
}

.root {
	position: relative;
	width: 100%;
	height: 100%;
	font-family: var(--cw-font-family);
	font-size: var(--cw-font-size);
	color: var(--cw-color-text);
	line-height: 1.5;
}

.sr-only {
	position: absolute;
	width: 1px;
	height: 1px;
	padding: 0;
	margin: -1px;
	overflow: hidden;
	clip: rect(0, 0, 0, 0);
	white-space: nowrap;
	border: 0;
}

/* === FAB === */
.fab {
	position: absolute;
	width: var(--cw-fab-size);
	height: var(--cw-fab-size);
	border-radius: 50%;
	border: none;
	background: var(--cw-color-primary);
	color: var(--cw-color-on-primary);
	cursor: pointer;
	pointer-events: auto;
	box-shadow: var(--cw-shadow);
	display: inline-flex;
	align-items: center;
	justify-content: center;
	padding: 0;
	transition:
		transform 160ms ease-out,
		box-shadow 160ms ease-out;
}

.fab:hover {
	transform: scale(1.05);
}

.fab:focus-visible {
	outline: 2px solid var(--cw-color-primary);
	outline-offset: 3px;
}

/* === Panel === */
.panel {
	position: absolute;
	width: var(--cw-panel-width);
	height: min(var(--cw-panel-height), calc(100vh - 120px));
	background: var(--cw-color-bg);
	color: var(--cw-color-text);
	border-radius: var(--cw-radius);
	border: 1px solid var(--cw-color-border);
	box-shadow: var(--cw-shadow);
	display: flex;
	flex-direction: column;
	overflow: hidden;
	pointer-events: auto;
	opacity: 0;
	transform: translateY(8px) scale(0.97);
	visibility: hidden;
	transform-origin: bottom right;
	transition:
		opacity 160ms ease-out,
		transform 160ms ease-out,
		visibility 0s linear 160ms;
}

.panel[data-open] {
	opacity: 1;
	transform: translateY(0) scale(1);
	visibility: visible;
	transition:
		opacity 160ms ease-out,
		transform 160ms ease-out;
}

/* === Position variants === */
:host([data-position="bottom-right"]) .fab {
	bottom: var(--cw-offset);
	right: var(--cw-offset);
}
:host([data-position="bottom-right"]) .panel {
	bottom: calc(var(--cw-offset) + var(--cw-fab-size) + 12px);
	right: var(--cw-offset);
	transform-origin: bottom right;
}

:host([data-position="bottom-left"]) .fab {
	bottom: var(--cw-offset);
	left: var(--cw-offset);
}
:host([data-position="bottom-left"]) .panel {
	bottom: calc(var(--cw-offset) + var(--cw-fab-size) + 12px);
	left: var(--cw-offset);
	transform-origin: bottom left;
}

:host([data-position="top-right"]) .fab {
	top: var(--cw-offset);
	right: var(--cw-offset);
}
:host([data-position="top-right"]) .panel {
	top: calc(var(--cw-offset) + var(--cw-fab-size) + 12px);
	right: var(--cw-offset);
	transform-origin: top right;
}

:host([data-position="top-left"]) .fab {
	top: var(--cw-offset);
	left: var(--cw-offset);
}
:host([data-position="top-left"]) .panel {
	top: calc(var(--cw-offset) + var(--cw-fab-size) + 12px);
	left: var(--cw-offset);
	transform-origin: top left;
}

/* === Header === */
.header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	padding: 12px 16px;
	border-bottom: 1px solid var(--cw-color-border);
	flex-shrink: 0;
}

.panel-title {
	font-weight: 600;
	font-size: 14px;
	color: var(--cw-color-text);
}

.close-button {
	appearance: none;
	border: none;
	background: transparent;
	color: var(--cw-color-muted);
	cursor: pointer;
	padding: 6px 10px;
	border-radius: var(--cw-radius-sm);
	font-size: 13px;
}

.close-button:hover {
	background: var(--cw-color-surface);
	color: var(--cw-color-text);
}

.close-button:focus-visible {
	outline: 2px solid var(--cw-color-primary);
	outline-offset: 1px;
}

/* === Log === */
.log {
	flex: 1;
	min-height: 0;
	overflow-y: auto;
	padding: 14px 16px;
	display: flex;
	flex-direction: column;
	scroll-behavior: smooth;
}

.log-streaming {
	display: flex;
	flex-direction: column;
	gap: 10px;
}

/* === Messages === */
.message {
	max-width: 85%;
	padding: 9px 13px;
	border-radius: var(--cw-radius);
	overflow-wrap: anywhere;
	line-height: 1.5;
}

.message-user {
	align-self: flex-end;
	background: var(--cw-color-user-bubble);
	color: var(--cw-color-user-text);
	border-bottom-right-radius: 6px;
	white-space: pre-wrap;
}

.message-assistant {
	align-self: flex-start;
	background: var(--cw-color-surface);
	color: var(--cw-color-text);
	border-bottom-left-radius: 6px;
}

.message-system {
	align-self: center;
	background: transparent;
	color: var(--cw-color-muted);
	font-size: 12px;
	font-style: italic;
	padding: 2px 8px;
}

.message-assistant[data-status="streaming"]:empty::before {
	content: "● ● ●";
	letter-spacing: 0.12em;
	color: var(--cw-color-muted);
	display: inline-block;
	animation: cw-typing-dots 1.4s ease-in-out infinite;
}

.message-assistant[data-status="streaming"]:not(:empty)::after {
	content: "▍";
	display: inline-block;
	margin-left: 2px;
	color: var(--cw-color-muted);
	animation: cw-blink 1s steps(2) infinite;
}

@keyframes cw-typing-dots {
	0%,
	100% {
		opacity: 0.35;
	}
	50% {
		opacity: 1;
	}
}

@keyframes cw-blink {
	to {
		opacity: 0;
	}
}

/* === Markdown content inside assistant/system messages === */
.message p {
	margin: 0;
}
.message p + p {
	margin-top: 8px;
}
.message ul,
.message ol {
	margin: 4px 0;
	padding-left: 22px;
}
.message li + li {
	margin-top: 2px;
}
.message code {
	background: rgba(0, 0, 0, 0.07);
	padding: 1px 5px;
	border-radius: 4px;
	font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
	font-size: 0.9em;
}
.message-user code {
	background: rgba(255, 255, 255, 0.22);
}
.message pre {
	background: rgba(0, 0, 0, 0.07);
	padding: 10px 12px;
	border-radius: var(--cw-radius-sm);
	overflow-x: auto;
	margin: 6px 0 0;
	font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
	font-size: 0.85em;
}
.message pre code {
	background: transparent;
	padding: 0;
	border-radius: 0;
}
.message-user pre {
	background: rgba(255, 255, 255, 0.18);
}
.message a {
	color: inherit;
	text-decoration: underline;
}

/* === Input area === */
.input-area {
	display: flex;
	align-items: flex-end;
	gap: 8px;
	padding: 10px 12px;
	border-top: 1px solid var(--cw-color-border);
	flex-shrink: 0;
	background: var(--cw-color-bg);
}

.input {
	flex: 1;
	resize: none;
	border: 1px solid var(--cw-color-border);
	border-radius: var(--cw-radius-sm);
	background: var(--cw-color-bg);
	color: var(--cw-color-text);
	padding: 8px 12px;
	font-family: inherit;
	font-size: inherit;
	line-height: 1.45;
	outline: none;
	min-height: 38px;
	max-height: 120px;
	box-sizing: border-box;
	overflow-y: auto;
}

.input:focus {
	border-color: var(--cw-color-primary);
}

.input::placeholder {
	color: var(--cw-color-muted);
}

.send-button {
	appearance: none;
	border: none;
	background: var(--cw-color-primary);
	color: var(--cw-color-on-primary);
	border-radius: var(--cw-radius-sm);
	padding: 0 14px;
	height: 38px;
	cursor: pointer;
	font-weight: 600;
	font-size: 13px;
	flex-shrink: 0;
}

.send-button:hover {
	filter: brightness(1.05);
}

.send-button:focus-visible {
	outline: 2px solid var(--cw-color-on-primary);
	outline-offset: -3px;
}

.send-button:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

/* === Mobile fullscreen === */
@media (max-width: 639px) {
	:host([data-position]) .panel {
		width: 100vw;
		height: 100dvh;
		max-height: 100dvh;
		border-radius: 0;
		border: none;
		top: 0;
		bottom: 0;
		left: 0;
		right: 0;
		transform-origin: center;
	}
}

/* === Reduced motion === */
@media (prefers-reduced-motion: reduce) {
	.panel,
	.fab {
		transition: none;
	}
	.message-assistant[data-status="streaming"]:empty::before,
	.message-assistant[data-status="streaming"]:not(:empty)::after {
		animation: none;
	}
}
`;

export const WIDGET_CSS = `${WIDGET_LAYOUT_CSS}\n${renderThemeCss()}`;

export function buildStyleElement(): HTMLStyleElement {
	const style = document.createElement("style");
	style.textContent = WIDGET_CSS;
	return style;
}
