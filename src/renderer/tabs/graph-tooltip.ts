/**
 * Library-graph tooltip content builder.
 *
 * Builds the tooltip as DOM nodes and text nodes only — attacker-controlled
 * `id` / `label` / `version` / `category` values are never parsed as HTML.
 */

import type { LayoutNode } from "./graph";

/** The subset of a layout node the tooltip renders. */
type TooltipNode = Pick<
	LayoutNode,
	"type" | "id" | "label" | "binaryType" | "version" | "category" | "weak"
>;

/** Build the tooltip content as DOM nodes — never parses HTML. */
export function buildTooltipFragment(nd: TooltipNode, doc: Document): DocumentFragment {
	const frag = doc.createDocumentFragment();
	const line = (fill: () => void): void => {
		if (frag.childNodes.length > 0) frag.appendChild(doc.createElement("br"));
		fill();
	};
	const strong = (text: string, breakable: boolean): void => {
		const el = doc.createElement("strong");
		if (!breakable) {
			el.textContent = text;
		} else {
			const parts = text.split("/");
			parts.forEach((part, i) => {
				if (i > 0) {
					el.appendChild(doc.createTextNode("/"));
					el.appendChild(doc.createElement("wbr"));
				}
				el.appendChild(doc.createTextNode(part));
			});
		}
		frag.appendChild(el);
	};

	if (nd.type === "binary") {
		line(() => strong(nd.label, false));
		line(() => frag.appendChild(doc.createTextNode(nd.binaryType ?? "binary")));
	} else {
		line(() => strong(nd.id, true));
		if (nd.version) line(() => frag.appendChild(doc.createTextNode(`Version: ${nd.version}`)));
		line(() =>
			frag.appendChild(
				doc.createTextNode(`Type: ${nd.category ?? "unknown"}${nd.weak ? " (weak)" : ""}`)
			)
		);
	}
	return frag;
}
