/**
 * Collapsible JSON tree viewer with syntax coloring.
 */

import { getTabState, setTabState } from "../tab-state";
import { makeCopyable } from "../utils/clipboard";

/** Persistence handle so a tree's expanded nodes survive a re-render. */
export interface JsonTreeState {
	sessionId: string;
	tabId: string;
	field?: string;
}

export class JsonTree {
	private container: HTMLElement | null = null;
	private root: HTMLElement | null = null;
	private data: unknown = null;
	private filterTerm = "";
	private state: JsonTreeState | null;
	/** Per-node expansion overrides relative to the default expansion depth. */
	private overrides: Record<string, boolean> = {};

	private static MAX_AUTO_EXPAND_DEPTH = 2;

	constructor(state?: JsonTreeState) {
		this.state = state ?? null;
	}

	private overridesField(): string {
		return this.state?.field ? `${this.state.field}:expanded` : "expanded";
	}

	private persistOverrides(): void {
		if (!this.state) return;
		setTabState(this.state.sessionId, this.state.tabId, this.overridesField(), this.overrides);
	}

	mount(container: HTMLElement): void {
		this.container = container;
		this.root = document.createElement("div");
		this.root.className = "jt-root";
		container.appendChild(this.root);
	}

	setData(data: unknown): void {
		this.data = data;
		this.render();
	}

	filter(term: string): void {
		this.filterTerm = term.toLowerCase();
		this.render();
	}

	private render(): void {
		if (!this.root) return;
		this.overrides = this.state
			? (getTabState<Record<string, boolean>>(
					this.state.sessionId,
					this.state.tabId,
					this.overridesField()
				) ?? {})
			: {};
		this.root.innerHTML = "";
		if (this.data === undefined) return;
		const tree = this.buildNode("root", this.data, 0, "root");
		if (tree) this.root.appendChild(tree);
	}

	private buildNode(
		key: string,
		value: unknown,
		depth: number,
		path: string
	): HTMLElement | null {
		const isExpandable = value !== null && typeof value === "object";

		const wrapper = document.createElement("div");
		wrapper.className = "jt-node";
		wrapper.style.paddingLeft = `${depth * 16}px`;

		const line = document.createElement("div");
		line.className = "jt-line";

		if (isExpandable) {
			const toggle = document.createElement("span");
			toggle.className = "jt-toggle";
			const expanded = this.overrides[path] ?? depth < JsonTree.MAX_AUTO_EXPAND_DEPTH;
			toggle.textContent = expanded ? "\u25BC" : "\u25B6";
			toggle.addEventListener("click", (e) => {
				e.stopPropagation();
				const children = wrapper.querySelector(".jt-children") as HTMLElement | null;
				if (!children) return;
				const isOpen = children.style.display !== "none";
				children.style.display = isOpen ? "none" : "block";
				toggle.textContent = isOpen ? "\u25B6" : "\u25BC";
				this.overrides[path] = !isOpen;
				this.persistOverrides();
			});
			line.appendChild(toggle);
		} else {
			const spacer = document.createElement("span");
			spacer.className = "jt-toggle-spacer";
			line.appendChild(spacer);
		}

		// Key label
		if (key !== "root") {
			const keyEl = document.createElement("span");
			keyEl.className = "jt-key";
			keyEl.textContent = key;
			if (this.filterTerm && key.toLowerCase().includes(this.filterTerm)) {
				keyEl.classList.add("jt-highlight");
			}
			line.appendChild(keyEl);

			const colon = document.createElement("span");
			colon.className = "jt-colon";
			colon.textContent = ": ";
			line.appendChild(colon);
		}

		if (!isExpandable) {
			const valEl = document.createElement("span");
			valEl.className = this.getValueClass(value);
			valEl.textContent = this.formatValue(value);
			if (this.filterTerm && String(value).toLowerCase().includes(this.filterTerm)) {
				valEl.classList.add("jt-highlight");
			}
			line.appendChild(valEl);

			makeCopyable(line, () => String(value));
		} else {
			// Show type summary
			const summary = document.createElement("span");
			summary.className = "jt-summary";
			if (Array.isArray(value)) {
				summary.textContent = `Array(${value.length})`;
			} else {
				summary.textContent = `{${Object.keys(value as object).length}}`;
			}
			line.appendChild(summary);
		}

		wrapper.appendChild(line);

		// Children
		if (isExpandable) {
			const children = document.createElement("div");
			children.className = "jt-children";
			const expanded = this.overrides[path] ?? depth < JsonTree.MAX_AUTO_EXPAND_DEPTH;
			children.style.display = expanded ? "block" : "none";

			if (Array.isArray(value)) {
				for (let i = 0; i < value.length; i++) {
					const child = this.buildNode(
						String(i),
						value[i],
						depth + 1,
						`${path}\u0000${i}`
					);
					if (child) children.appendChild(child);
				}
			} else {
				const obj = value as Record<string, unknown>;
				for (const k of Object.keys(obj)) {
					const child = this.buildNode(k, obj[k], depth + 1, `${path}\u0000${k}`);
					if (child) children.appendChild(child);
				}
			}

			wrapper.appendChild(children);
		}

		return wrapper;
	}

	private getValueClass(value: unknown): string {
		if (value === null || value === undefined) return "jt-val jt-null";
		switch (typeof value) {
			case "string":
				return "jt-val jt-string";
			case "number":
				return "jt-val jt-number";
			case "boolean":
				return "jt-val jt-boolean";
			default:
				return "jt-val";
		}
	}

	private formatValue(value: unknown): string {
		if (value === null) return "null";
		if (value === undefined) return "undefined";
		if (typeof value === "string") return `"${value}"`;
		return String(value);
	}

	destroy(): void {
		if (this.root && this.container) {
			this.container.removeChild(this.root);
		}
		this.root = null;
		this.container = null;
		this.data = null;
	}
}
