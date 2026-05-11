const SVG_NS = "http://www.w3.org/2000/svg";

export function buildStrokeIcon(d: string, size = 24): SVGSVGElement {
	const svg = document.createElementNS(SVG_NS, "svg");
	svg.setAttribute("viewBox", "0 0 24 24");
	svg.setAttribute("width", String(size));
	svg.setAttribute("height", String(size));
	svg.setAttribute("fill", "none");
	svg.setAttribute("stroke", "currentColor");
	svg.setAttribute("stroke-width", "2");
	svg.setAttribute("stroke-linecap", "round");
	svg.setAttribute("stroke-linejoin", "round");
	svg.setAttribute("aria-hidden", "true");
	const path = document.createElementNS(SVG_NS, "path");
	path.setAttribute("d", d);
	svg.appendChild(path);
	return svg;
}
