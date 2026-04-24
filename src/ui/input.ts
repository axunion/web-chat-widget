import type { LabelDictionary } from "../core/i18n.ts";
import { el } from "./dom.ts";
import { PART } from "./parts.ts";

export interface InputHandle {
	root: HTMLDivElement;
	textarea: HTMLTextAreaElement;
	sendButton: HTMLButtonElement;
	applyLabels(labels: LabelDictionary): void;
}

export function buildInput(labels: LabelDictionary): InputHandle {
	const textarea = el("textarea", {
		class: "input",
		part: PART.input,
		attrs: { rows: "1" },
	});
	const sendButton = el("button", {
		class: "send-button",
		part: PART.sendButton,
		attrs: { type: "button" },
	});
	const root = el("div", { class: "input-area", part: PART.inputArea }, [
		textarea,
		sendButton,
	]);

	function applyLabels(next: LabelDictionary): void {
		textarea.setAttribute("placeholder", next.placeholder);
		textarea.setAttribute("aria-label", next.placeholder);
		sendButton.setAttribute("aria-label", next.sendButton);
		sendButton.textContent = next.sendButton;
	}

	applyLabels(labels);
	return { root, textarea, sendButton, applyLabels };
}
