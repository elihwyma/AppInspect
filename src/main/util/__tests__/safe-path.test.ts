import { afterEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { hasEscapingSymlink, isInside, safeJoin } from "../safe-path";

/**
 * Create a temp dir under the *resolved* OS temp dir. On macOS `os.tmpdir()` is
 * `/var/folders/...`, which is a symlink to `/private/var/folders/...`; anchoring
 * tests to the real path keeps `hasEscapingSymlink`'s resolve-vs-realpath
 * comparison meaningful.
 */
function makeTempDir(prefix: string): string {
	return fs.mkdtempSync(
		path.join(fs.realpathSync(os.tmpdir()), `appinspect-safe-path-${prefix}-`)
	);
}

const tempDirs: string[] = [];

afterEach(() => {
	for (const dir of tempDirs) {
		try {
			fs.rmSync(dir, { recursive: true, force: true });
		} catch {
			// Best-effort cleanup
		}
	}
	tempDirs.length = 0;
});

describe("safeJoin", () => {
	it("rejects parent-directory traversal", () => {
		expect(safeJoin("/base/dir", "../x")).toBeNull();
	});

	it("rejects absolute paths", () => {
		expect(safeJoin("/base/dir", "/etc/passwd")).toBeNull();
	});

	it("rejects traversal buried in the middle of the name", () => {
		expect(safeJoin("/base/dir", "a/../../b")).toBeNull();
	});

	it("accepts a flat member name", () => {
		expect(safeJoin("/base/dir", "data.tar.xz")).toBe("/base/dir/data.tar.xz");
	});
});

describe("isInside", () => {
	it("accepts a child path", () => {
		expect(isInside("/foo", "/foo/bar")).toBe(true);
	});

	it("accepts the root itself", () => {
		expect(isInside("/foo", "/foo")).toBe(true);
	});

	it("rejects a sibling sharing a name prefix", () => {
		expect(isInside("/foo", "/foo-bar")).toBe(false);
	});
});

describe("hasEscapingSymlink", () => {
	it("returns false for an in-tree symlink", () => {
		if (process.platform === "win32") return;

		const root = makeTempDir("intree");
		tempDirs.push(root);

		fs.writeFileSync(path.join(root, "real.txt"), "hello");
		fs.symlinkSync("real.txt", path.join(root, "link.txt"));

		expect(hasEscapingSymlink(root)).toBe(false);
	});

	it("returns true for a symlink pointing outside the root", () => {
		if (process.platform === "win32") return;

		const parent = makeTempDir("escape");
		tempDirs.push(parent);
		const root = path.join(parent, "root");
		fs.mkdirSync(root, { recursive: true });

		fs.writeFileSync(path.join(parent, "outside.txt"), "secret");
		fs.symlinkSync(path.join(parent, "outside.txt"), path.join(root, "escape.txt"));

		expect(hasEscapingSymlink(root)).toBe(true);
	});

	it("returns false for an empty tree", () => {
		const root = makeTempDir("empty");
		tempDirs.push(root);

		expect(hasEscapingSymlink(root)).toBe(false);
	});
});
