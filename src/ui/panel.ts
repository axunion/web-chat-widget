import type { LabelDictionary } from "../core/i18n.ts";
import { el, setLabel } from "./dom.ts";
import { buildInput, type InputHandle } from "./input.ts";
import { buildLog, type LogHandle } from "./log.ts";
import { PART } from "./parts.ts";
import { buildStrokeIcon } from "./svg.ts";

const TRASH_ICON_PATH =
	"M3 6h18 M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2 M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6 M10 11v6 M14 11v6";

export interface PanelHandle {
	root: HTMLDivElement;
	closeButton: HTMLButtonElement;
	logHandle: LogHandle;
	inputHandle: InputHandle;
	setOpen(open: boolean): void;
	setHistoryEmpty(empty: boolean): void;
	applyLabels(labels: LabelDictionary): void;
}

export interface BuildPanelOptions {
	labels: LabelDictionary;
	onRetry: () => void;
	onClear: () => void;
}

export function buildPanel(options: BuildPanelOptions): PanelHandle {
	const { labels, onRetry, onClear } = options;
	let currentLabels = labels;

	const title = el("div", { class: "panel-title" });
	const clearButton = el(
		"button",
		{
			class: "clear-button",
			part: PART.clearButton,
			attrs: { type: "button" },
		},
		[buildStrokeIcon(TRASH_ICON_PATH, 16)],
	);
	const closeButton = el("button", {
		class: "close-button",
		part: PART.closeButton,
		attrs: { type: "button" },
	});
	const headerActions = el("div", { class: "header-actions" }, [
		clearButton,
		closeButton,
	]);
	const header = el("div", { class: "header", part: PART.header }, [
		title,
		headerActions,
	]);
	const logHandle = buildLog(labels, onRetry);
	const inputHandle = buildInput(labels);
	const root = el(
		"div",
		{ class: "panel", part: PART.panel, role: "complementary" },
		[header, logHandle.root, inputHandle.root],
	);

	clearButton.addEventListener("click", () => {
		if (window.confirm(currentLabels.clearConfirm)) onClear();
	});

	function applyLabels(next: LabelDictionary): void {
		currentLabels = next;
		title.textContent = next.panelTitle;
		setLabel(closeButton, next.closeButton);
		clearButton.setAttribute("aria-label", next.clearHistory);
		root.setAttribute("aria-label", next.panelTitle);
		logHandle.applyLabels(next);
		inputHandle.applyLabels(next);
	}

	function setOpen(open: boolean): void {
		root.toggleAttribute("data-open", open);
	}

	function setHistoryEmpty(empty: boolean): void {
		clearButton.toggleAttribute("disabled", empty);
	}

	applyLabels(labels);
	setHistoryEmpty(true);
	return {
		root,
		closeButton,
		logHandle,
		inputHandle,
		setOpen,
		setHistoryEmpty,
		applyLabels,
	};
}
