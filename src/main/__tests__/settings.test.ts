/**
 * Tests for settings sanitisation (sanitizeSettings).
 *
 * Pure-function tests only — never reads or writes the real user settings file.
 */

import { describe, expect, it } from "bun:test";
import { sanitizeSettings } from "../settings";

describe("sanitizeSettings", () => {
	it("drops non-finite values and clamps out-of-range ones", () => {
		const result = sanitizeSettings({ maxBundleSizeMB: -1, maxFileSizeMB: Number.NaN });
		expect(result).toEqual({ maxBundleSizeMB: 1 });
	});

	it("keeps a valid boolean and coerces a numeric string", () => {
		expect(sanitizeSettings({ scanAllBinaries: true, maxFileSizeMB: "42" })).toEqual({
			scanAllBinaries: true,
			maxFileSizeMB: 42
		});
	});

	it("clamps above the upper bound", () => {
		expect(sanitizeSettings({ maxBundleSizeMB: 999999 })).toEqual({ maxBundleSizeMB: 2000 });
	});

	it("drops unknown keys", () => {
		expect(sanitizeSettings({ unknownKey: 1 })).toEqual({});
	});

	it("returns an empty object for null input", () => {
		expect(sanitizeSettings(null)).toEqual({});
	});
});
