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
 * Walk an extracted tree and report whether any symlink resolves outside
 * `root`. Broken symlinks are treated as unsafe. Returns false for trees
 * without escaping symlinks (the normal case).
 */
export function hasEscapingSymlink(root: string): boolean {
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
				try {
					const real = fs.realpathSync(full);
					if (!isInside(resolvedRoot, real)) return true;
				} catch {
					return true; // broken symlink
				}
			} else if (entry.isDirectory()) {
				stack.push(full);
			}
		}
	}

	return false;
}
