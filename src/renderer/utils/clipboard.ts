/** Standard copy-to-clipboard helper with toast feedback. */

import { showToast } from "../components/toast";

export function copyText(text: string, label = "Copied to clipboard"): void {
	navigator.clipboard
		.writeText(text)
		.then(() => showToast(label, "info"))
		.catch(() => showToast("Copy failed", "error"));
}

export function makeCopyable(el: HTMLElement, getText: () => string, label?: string): void {
	el.classList.add("copyable");
	el.title = "Double-click to copy";
	el.addEventListener("dblclick", () => copyText(getText(), label));
}
