import type { LabelDictionary } from "../core/i18n.ts";
import { el } from "./dom.ts";
import { PART } from "./parts.ts";

export interface FabHandle {
	root: HTMLButtonElement;
	setOpen(open: boolean): void;
	applyLabels(labels: LabelDictionary): void;
}

export function buildFab(labels: LabelDictionary): FabHandle {
	const root = el("button", {
		class: "fab",
		part: PART.fab,
		attrs: {
			type: "button",
			"aria-expanded": "false",
		},
	});

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
