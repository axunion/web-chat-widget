import type { LabelDictionary } from "../core/i18n.ts";
import { el } from "./dom.ts";
import { PART } from "./parts.ts";

const SVG_NS = "http://www.w3.org/2000/svg";

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
		[buildChatIcon()],
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

function buildChatIcon(): SVGSVGElement {
	const svg = document.createElementNS(SVG_NS, "svg");
	svg.setAttribute("viewBox", "0 0 24 24");
	svg.setAttribute("width", "24");
	svg.setAttribute("height", "24");
	svg.setAttribute("fill", "none");
	svg.setAttribute("stroke", "currentColor");
	svg.setAttribute("stroke-width", "2");
	svg.setAttribute("stroke-linecap", "round");
	svg.setAttribute("stroke-linejoin", "round");
	svg.setAttribute("aria-hidden", "true");

	const bubble = document.createElementNS(SVG_NS, "path");
	bubble.setAttribute(
		"d",
		"M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
	);
	svg.appendChild(bubble);

	return svg;
}
