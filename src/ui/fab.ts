import type { LabelDictionary } from "../core/i18n.ts";
import { el } from "./dom.ts";
import { PART } from "./parts.ts";
import { buildStrokeIcon } from "./svg.ts";

const CHAT_ICON_PATH =
	"M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z";

export interface FabHandle {
	root: HTMLButtonElement;
	setOpen(open: boolean): void;
	applyLabels(labels: LabelDictionary): void;
}

export function buildFab(labels: LabelDictionary): FabHandle {
	const root = el(
		"button",
		{
			class: "fab",
			part: PART.fab,
			attrs: {
				type: "button",
				"aria-expanded": "false",
			},
		},
		[buildStrokeIcon(CHAT_ICON_PATH)],
	);

	function applyLabels(next: LabelDictionary): void {
		root.setAttribute("aria-label", next.fabLabel);
	}

	function setOpen(open: boolean): void {
		root.setAttribute("aria-expanded", open ? "true" : "false");
		if (open) root.setAttribute("data-open", "");
		else root.removeAttribute("data-open");
	}

	applyLabels(labels);
	return { root, setOpen, applyLabels };
}
