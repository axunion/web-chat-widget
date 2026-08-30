import type { LabelDictionary } from "../core/i18n.ts";
import { el, setLabel } from "./dom.ts";
import { PART } from "./parts.ts";

export interface InputHandle {
	root: HTMLDivElement;
	textarea: HTMLTextAreaElement;
	sendButton: HTMLButtonElement;
	applyLabels(labels: LabelDictionary): void;
	setBusy(busy: boolean): void;
	setMaxLength(maxLength: number | undefined): void;
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

	let currentLabels = labels;
	let busyState = false;

	function applyLabels(next: LabelDictionary): void {
		currentLabels = next;
		textarea.setAttribute("placeholder", next.placeholder);
		textarea.setAttribute("aria-label", next.placeholder);
		applyButtonLabel();
	}

	function applyButtonLabel(): void {
		setLabel(
			sendButton,
			busyState ? currentLabels.stopButton : currentLabels.sendButton,
		);
	}

	function setBusy(busy: boolean): void {
		busyState = busy;
		sendButton.setAttribute("part", busy ? PART.stopButton : PART.sendButton);
		sendButton.toggleAttribute("data-busy", busy);
		applyButtonLabel();
	}

	function setMaxLength(maxLength: number | undefined): void {
		if (maxLength === undefined) textarea.removeAttribute("maxlength");
		else textarea.setAttribute("maxlength", String(maxLength));
	}

	applyLabels(labels);
	return { root, textarea, sendButton, applyLabels, setBusy, setMaxLength };
}
