import { describe, expect, it } from "bun:test";
import { demangleSwiftSymbol, initSwiftDemangler, isSwiftMangled } from "../swift-demangle";

describe("isSwiftMangled", () => {
	it("matches Swift mangling prefixes", () => {
		expect(isSwiftMangled("$s4main5helloyyF")).toBe(true);
		expect(isSwiftMangled("_$s4main5helloyyF")).toBe(true);
		expect(isSwiftMangled("_TtC4main3Foo")).toBe(true);
	});

	it("rejects non-Swift names", () => {
		expect(isSwiftMangled("_objc_msgSend")).toBe(false);
		expect(isSwiftMangled("main")).toBe(false);
		expect(isSwiftMangled("_ZN3foo3barEv")).toBe(false);
	});
});

describe("demangleSwiftSymbol", () => {
	it("returns null for non-Swift names", () => {
		expect(demangleSwiftSymbol("_objc_msgSend")).toBeNull();
	});

	it("demangles a Swift symbol once initialised", async () => {
		expect(await initSwiftDemangler()).toBe(true);
		expect(demangleSwiftSymbol("$s4main5helloyyF")).toBe("main.hello() -> ()");
	});

	it("returns null when the demangler leaves the name unchanged", async () => {
		await initSwiftDemangler();
		expect(demangleSwiftSymbol("_TtC4main3Foo")).toBeNull();
	});
});
