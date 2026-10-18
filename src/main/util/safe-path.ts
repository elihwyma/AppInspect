/**
 * Filesystem path-safety helpers.
 *
 * Centralises the "is this attacker-supplied path allowed?" checks used by the
 * container extractors, the IPC shell handlers and the MCP server, so the
 * path-traversal bug class is handled in exactly one place.
 */

import * as fs from "node:fs";
import * as path from "node:path";

/** Resolve a path, lower-casing on case-insensitive Windows filesystems. */
function normalise(p: string): string {
	const resolved = path.resolve(p);
	return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

/**
 * True when `target` is `root` itself or lives underneath it.
 *
 * The `+ path.sep` guard prevents the `/foo-bar` vs `/foo` sibling-prefix
 * mistake that a bare `startsWith(root)` would allow.
 */
export function isInside(root: string, target: string): boolean {
	const base = normalise(root);
	const candidate = normalise(target);
	return candidate === base || candidate.startsWith(base + path.sep);
}

/**
 * Join an untrusted entry name onto a base directory, refusing anything that
 * resolves outside the base (absolute paths, `..` traversal, sibling prefixes).
 * Returns null when the name is unsafe.
 */
export function safeJoin(baseDir: string, entryName: string): string | null {
	const base = path.resolve(baseDir);
	const target = path.resolve(base, entryName);
	if (!isInside(base, target)) return null;
	return target;
}

/** True when `target` is inside any of the supplied roots. */
export function isInsideAny(roots: readonly string[], target: string): boolean {
	return roots.some((root) => isInside(root, target));
}

/**
 * Walk an extracted tree and delete every symlink whose target resolves
 * outside `root` (broken links included). Neutralises archive-supplied links
 * so no later read can follow them out of the extraction directory, while
 * keeping the (otherwise valid) tree available for analysis.
 * Returns the number of symlinks removed.
 */
export function removeEscapingSymlinks(root: string): number {
	// Resolve the root through its own real path so that a symlinked ancestor
	// (e.g. macOS `/tmp` -> `/private/tmp`) does not make every in-tree symlink
	// look like it escapes.
	let resolvedRoot: string;
	try {
		resolvedRoot = fs.realpathSync(root);
	} catch {
		resolvedRoot = path.resolve(root);
	}
	const stack: string[] = [resolvedRoot];
	let removed = 0;

	while (stack.length > 0) {
		const dir = stack.pop()!;
		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true });
		} catch {
			continue;
		}

		for (const entry of entries) {
			const full = path.join(dir, entry.name);
			if (entry.isSymbolicLink()) {
				let target: string | null = null;
				try {
					target = fs.realpathSync(full);
				} catch {
					/* broken symlink — treated like an escaping one */
				}
				if (target === null || !isInside(resolvedRoot, target)) {
					try {
						fs.unlinkSync(full);
						removed++;
					} catch {
						/* best-effort; keep the walk going */
					}
				} else {
					// In-tree link: descend if it points at a directory, so links
					// inside symlinked directories are checked too.
					try {
						if (fs.statSync(target).isDirectory()) stack.push(target);
					} catch {
						/* vanished mid-walk; ignore */
					}
				}
			} else if (entry.isDirectory()) {
				stack.push(full);
			}
		}
	}

	return removed;
}
