import type { LabelDictionary } from "../core/i18n.ts";
import { el } from "./dom.ts";
import { buildInput, type InputHandle } from "./input.ts";
import { buildLog, type LogHandle } from "./log.ts";
import { PART } from "./parts.ts";

export interface PanelHandle {
	root: HTMLDivElement;
	closeButton: HTMLButtonElement;
	logHandle: LogHandle;
	inputHandle: InputHandle;
	setOpen(open: boolean): void;
	applyLabels(labels: LabelDictionary): void;
}

export function buildPanel(labels: LabelDictionary): PanelHandle {
	const title = el("div", { class: "panel-title" });
	const closeButton = el("button", {
		class: "close-button",
		part: PART.closeButton,
		attrs: { type: "button" },
	});
	const header = el("div", { class: "header", part: PART.header }, [
		title,
		closeButton,
	]);
	const logHandle = buildLog(labels);
	const inputHandle = buildInput(labels);
	const root = el(
		"div",
		{ class: "panel", part: PART.panel, role: "complementary" },
		[header, logHandle.root, inputHandle.root],
	);

	function applyLabels(next: LabelDictionary): void {
		title.textContent = next.panelTitle;
		closeButton.setAttribute("aria-label", next.closeButton);
		closeButton.textContent = next.closeButton;
		root.setAttribute("aria-label", next.panelTitle);
		logHandle.applyLabels(next);
		inputHandle.applyLabels(next);
	}

	function setOpen(open: boolean): void {
		if (open) root.setAttribute("data-open", "");
		else root.removeAttribute("data-open");
	}

	applyLabels(labels);
	return { root, closeButton, logHandle, inputHandle, setOpen, applyLabels };
}
