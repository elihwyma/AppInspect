import { describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { StringEntry } from "../../../shared/types";
import { checkDebugArtifacts, findBundleDebugArtifacts } from "../debug-artifacts";

// ── Helpers ──

function makeStr(value: string, offset = 0): StringEntry {
	return { value, sectionSource: "__cstring", offset };
}

function params(overrides: Partial<Parameters<typeof checkDebugArtifacts>[0]> = {}) {
	return {
		segmentNames: [],
		sectionNames: [],
		strings: [],
		debugSymbolCount: 0,
		...overrides
	};
}

// ── Binary-level artifacts ──

describe("checkDebugArtifacts", () => {
	it("warns on a DWARF segment", () => {
		const findings = checkDebugArtifacts(params({ segmentNames: ["__DWARF"] }));
		expect(findings).toHaveLength(1);
		expect(findings[0]!.severity).toBe("warning");
		expect(findings[0]!.category).toBe("debug-artifacts");
		expect(findings[0]!.message).toContain("DWARF");
		expect(findings[0]!.evidence).toContain("__DWARF");
	});

	it("warns on DWARF debug sections", () => {
		const findings = checkDebugArtifacts(params({ sectionNames: ["__debug_info"] }));
		expect(findings).toHaveLength(1);
		expect(findings[0]!.severity).toBe("warning");
		expect(findings[0]!.evidence).toContain("__debug_info");
	});

	it("reports retained STABS symbols as info", () => {
		const findings = checkDebugArtifacts(params({ debugSymbolCount: 3 }));
		expect(findings).toHaveLength(1);
		expect(findings[0]!.severity).toBe("info");
		expect(findings[0]!.category).toBe("debug-artifacts");
		expect(findings[0]!.message).toContain("3");
		expect(findings[0]!.evidence).toBe("stabs=3");
	});

	it("emits nothing for a stripped binary carrying only production strings", () => {
		// Must supply realistic-but-benign input: an all-empty fixture would pass
		// against any implementation that returned [] unconditionally.
		expect(
			checkDebugArtifacts(
				params({
					segmentNames: ["__TEXT", "__DATA", "__LINKEDIT"],
					sectionNames: ["__text", "__cstring", "__const", "__objc_methname"],
					strings: [
						makeStr("LoginViewController"),
						makeStr("https://api.example.com/v1/users"),
						makeStr("/System/Library/Frameworks/UIKit.framework/UIKit"),
						makeStr("Failed to load view")
					]
				})
			)
		).toEqual([]);
	});

	it("flags developer source paths but not system paths or URLs", () => {
		const findings = checkDebugArtifacts(
			params({
				strings: [
					makeStr("/Users/alice/dev/app/Sources/Login.swift", 0x40),
					makeStr("/usr/lib/libSystem.dylib"),
					makeStr("https://example.com/a/b"),
					makeStr("a/b/c")
				]
			})
		);
		const paths = findings.filter((f) => f.category === "leaked-source-path");
		expect(paths).toHaveLength(1);
		expect(paths[0]!.severity).toBe("info");
		expect(paths[0]!.evidence).toBe("/Users/alice/dev/app/Sources/Login.swift");
		expect(paths[0]!.location).toBe("offset=0x40");
	});

	it("does not flag system headers matched by the source-extension heuristic", () => {
		const findings = checkDebugArtifacts(
			params({ strings: [makeStr("/usr/include/stdio.h")] })
		);
		expect(findings.filter((f) => f.category === "leaked-source-path")).toHaveLength(0);
	});

	it("dedupes and caps source-path findings at 10", () => {
		const strings = Array.from({ length: 15 }, (_, i) =>
			makeStr(`/Users/alice/dev/project${i}/File.swift`)
		);
		// Duplicate one entry to confirm dedupe
		strings.push(makeStr("/Users/alice/dev/project0/File.swift"));

		const findings = checkDebugArtifacts(params({ strings }));
		const paths = findings.filter((f) => f.category === "leaked-source-path");
		expect(paths).toHaveLength(10);
	});
});

// ── Bundle-level artifacts ──

describe("findBundleDebugArtifacts", () => {
	it("finds shipped build artifacts and ignores normal files", () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "appinspect-bundle-"));
		try {
			fs.mkdirSync(path.join(root, "App.dSYM", "Contents"), { recursive: true });
			fs.writeFileSync(path.join(root, "App.dSYM", "Contents", "leaked.map"), "");
			fs.mkdirSync(path.join(root, "_CodeSignature"), { recursive: true });
			fs.writeFileSync(path.join(root, "_CodeSignature", "skip.map"), "");
			fs.writeFileSync(path.join(root, "main.js"), "console.log(1)");
			fs.writeFileSync(path.join(root, "main.js.map"), "{}");
			fs.writeFileSync(path.join(root, "Foo.swiftinterface"), "// swift");

			const findings = findBundleDebugArtifacts(root);
			expect(findings).toHaveLength(3);

			const sourceMap = findings.find((f) => f.category === "source-map");
			expect(sourceMap).toBeDefined();
			expect(sourceMap!.severity).toBe("warning");
			expect(sourceMap!.source).toBe("main.js.map");

			const swiftInterface = findings.find((f) => f.source === "Foo.swiftinterface");
			expect(swiftInterface).toBeDefined();
			expect(swiftInterface!.severity).toBe("info");
			expect(swiftInterface!.category).toBe("debug-artifacts");

			const dsym = findings.find((f) => f.source === "App.dSYM");
			expect(dsym).toBeDefined();
			expect(dsym!.severity).toBe("warning");
			expect(dsym!.category).toBe("debug-artifacts");
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
});
