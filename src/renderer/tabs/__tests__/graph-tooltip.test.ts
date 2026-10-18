/**
 * Unit tests for the library-graph tooltip content builder.
 *
 * Importing ONLY `buildTooltipFragment` — the type-only `LayoutNode` import in
 * graph-tooltip.ts is erased at runtime, so graph.ts is never loaded.
 */

import { describe, expect, it } from "bun:test";
import { buildTooltipFragment } from "../graph-tooltip";

// ── Minimal fake DOM (records a node tree: tag, text, children) ──

class FakeNode {
	tag: string;
	text: string | null;
	children: FakeNode[] = [];

	constructor(tag: string, text: string | null = null) {
		this.tag = tag;
		this.text = text;
	}

	get childNodes(): FakeNode[] {
		return this.children;
	}

	appendChild(child: FakeNode): FakeNode {
		this.children.push(child);
		return child;
	}

	set textContent(value: string) {
		this.text = value;
		this.children = [];
	}

	get textContent(): string {
		if (this.text !== null) return this.text;
		return this.children.map((c) => c.textContent).join("");
	}
}

function makeDoc(): Document {
	return {
		createDocumentFragment: () => new FakeNode("#fragment"),
		createElement: (tag: string) => new FakeNode(tag),
		createTextNode: (text: string) => new FakeNode("#text", text)
	} as unknown as Document;
}

function flatten(node: FakeNode, out: FakeNode[] = []): FakeNode[] {
	out.push(node);
	for (const child of node.children) flatten(child, out);
	return out;
}

function childAt(node: FakeNode, index: number): FakeNode {
	const c = node.children[index];
	if (!c) throw new Error(`no child at index ${index}`);
	return c;
}

function build(node: Parameters<typeof buildTooltipFragment>[0]): FakeNode {
	return buildTooltipFragment(node, makeDoc()) as unknown as FakeNode;
}

// ── Tests ──

describe("buildTooltipFragment", () => {
	const PAYLOAD = "<img src=x onerror=alert(1)>";

	it("renders hostile library markup as text, never as elements", () => {
		const frag = build({
			type: "library",
			id: `@rpath/${PAYLOAD}.dylib`,
			label: `${PAYLOAD}.dylib`,
			category: "embedded",
			weak: false,
			version: "2.1.0"
		});

		const nodes = flatten(frag);
		expect(nodes.some((n) => n.tag === "img")).toBe(false);

		const textValues = nodes.filter((n) => n.tag === "#text").map((n) => n.text);
		expect(textValues).toContain(`${PAYLOAD}.dylib`);
		expect(textValues).not.toContain(PAYLOAD);
	});

	it("separates lines with <br> and adds a <wbr> after each /", () => {
		const id = "@rpath/Foo.framework/Foo";
		const frag = build({
			type: "library",
			id,
			label: "Foo",
			category: "framework",
			weak: true,
			version: "1.2.3"
		});

		expect(frag.children.map((c) => c.tag)).toEqual(["strong", "br", "#text", "br", "#text"]);

		const strong = childAt(frag, 0);
		expect(strong.tag).toBe("strong");
		// one "/" text node + one <wbr> per separator
		const slashCount = id.split("/").length - 1;
		expect(strong.children.filter((c) => c.tag === "wbr")).toHaveLength(slashCount);
		expect(strong.children.filter((c) => c.tag === "#text" && c.text === "/")).toHaveLength(
			slashCount
		);

		// version line present, then the type line with the weak suffix
		expect(childAt(frag, 2).text).toBe("Version: 1.2.3");
		expect(childAt(frag, 4).text).toBe("Type: framework (weak)");
	});

	it("renders a binary node as bold label then its type", () => {
		const frag = build({
			type: "binary",
			id: "main",
			label: "MaliciousApp",
			binaryType: "main"
		});

		expect(frag.children.map((c) => c.tag)).toEqual(["strong", "br", "#text"]);
		const strong = childAt(frag, 0);
		expect(strong.text).toBe("MaliciousApp");
		expect(flatten(strong).some((n) => n.tag === "wbr")).toBe(false);
		expect(childAt(frag, 2).text).toBe("main");
	});
});
