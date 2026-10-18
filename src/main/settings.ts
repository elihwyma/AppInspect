/**
 * App Settings — persistent JSON file in userData directory.
 *
 * Uses Electron's userData path when running inside the desktop app,
 * falls back to ~/.appinspect when running standalone (e.g. MCP server).
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { AppSettings } from "../shared/types";

const DEFAULT_SETTINGS: AppSettings = {
	scanAllBinaries: false,
	maxBundleSizeMB: 200,
	maxFileSizeMB: 50
};

let userDataDir: string;
try {
	userDataDir = require("electron").app.getPath("userData");
} catch {
	userDataDir = path.join(os.homedir(), ".appinspect");
}

const LIMITS = {
	maxBundleSizeMB: { min: 1, max: 2000 },
	maxFileSizeMB: { min: 1, max: 500 }
} as const;

function getSettingsPath(): string {
	return path.join(userDataDir, "appinspect-settings.json");
}

/** Keep only known keys with valid values; drop everything else. */
export function sanitizeSettings(input: unknown): Partial<AppSettings> {
	if (typeof input !== "object" || input === null) return {};
	const raw = input as Record<string, unknown>;
	const out: Partial<AppSettings> = {};

	if (typeof raw.scanAllBinaries === "boolean") out.scanAllBinaries = raw.scanAllBinaries;

	for (const key of ["maxBundleSizeMB", "maxFileSizeMB"] as const) {
		const value = raw[key];
		if (value === undefined) continue;
		const n = Number(value);
		if (!Number.isFinite(n)) continue;
		out[key] = Math.min(Math.max(n, LIMITS[key].min), LIMITS[key].max);
	}

	return out;
}

export function loadSettings(): AppSettings {
	try {
		const raw = fs.readFileSync(getSettingsPath(), "utf-8");
		return { ...DEFAULT_SETTINGS, ...sanitizeSettings(JSON.parse(raw)) };
	} catch {
		return { ...DEFAULT_SETTINGS };
	}
}

export function saveSettings(settings: AppSettings): void {
	const settingsPath = getSettingsPath();
	fs.mkdirSync(path.dirname(settingsPath), { recursive: true });

	// Merge on top of current disk state to avoid clobbering
	// another instance's concurrent writes
	const current = loadSettings();
	const merged = { ...current, ...sanitizeSettings(settings) };
	fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2), "utf-8");
}
