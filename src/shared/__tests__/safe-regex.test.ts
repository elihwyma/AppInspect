import { describe, expect, it } from "bun:test";

import { compileSafeRegex, isPotentiallyUnsafeRegex } from "../safe-regex";

describe("isPotentiallyUnsafeRegex", () => {
	it("flags nested quantifiers", () => {
		expect(isPotentiallyUnsafeRegex("(a+)+$")).toBe(true);
		expect(isPotentiallyUnsafeRegex("(.*)*")).toBe(true);
	});

	it("flags identical alternation branches", () => {
		expect(isPotentiallyUnsafeRegex("(a|a)+")).toBe(true);
	});

	it("flags nested quantifiers over escaped classes", () => {
		expect(isPotentiallyUnsafeRegex("(\\d+\\.\\d+)+")).toBe(true);
	});

	it("flags an over-long pattern", () => {
		expect(isPotentiallyUnsafeRegex("a".repeat(600))).toBe(true);
	});

	it("accepts ordinary search patterns", () => {
		expect(isPotentiallyUnsafeRegex("^foo.*bar$")).toBe(false);
		expect(isPotentiallyUnsafeRegex("\\w+\\.dylib")).toBe(false);
		expect(isPotentiallyUnsafeRegex("UIKit")).toBe(false);
		expect(isPotentiallyUnsafeRegex("(foo|bar)+")).toBe(false);
		expect(isPotentiallyUnsafeRegex("com\\.example")).toBe(false);
		expect(isPotentiallyUnsafeRegex("[a-z]+")).toBe(false);
	});
});

describe("compileSafeRegex", () => {
	it("returns null for an unsafe pattern", () => {
		expect(compileSafeRegex("(a+)+$")).toBeNull();
	});

	it("returns null for an invalid pattern", () => {
		expect(compileSafeRegex("(")).toBeNull();
	});

	it("compiles a benign pattern with flags", () => {
		const re = compileSafeRegex("foo.*bar", "i");
		expect(re).not.toBeNull();
		expect(re!.test("FooBAR")).toBe(true);
	});
});
