/**
 * Best-effort Swift symbol demangling via swift-demangle-wasm.
 *
 * The wasm is compiled once and shared by all callers. If it cannot be located
 * or fails to load, every call returns null and symbols are left mangled.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import initSwiftDemangle from "swift-demangle-wasm/dist/index.browser.js";

// ── Constants ─────────────────────────────────────────────────────────

const WASM_FILENAME = "swift-demangle.wasm";
const NODE_MODULES_WASM = path.join("node_modules", "swift-demangle-wasm", "dist", WASM_FILENAME);

const MANGLING_PREFIXES = [
	"_$s",
	"__$s",
	"_$S",
	"$s",
	"$S",
	"_T0",
	"_Tt",
	"_$e",
	"__$e",
	"@__swiftmacro_",
	"$e"
];

// ── State ─────────────────────────────────────────────────────────────

let demangler: ((name: string) => string) | null = null;
let initPromise: Promise<boolean> | null = null;

// ── Public API ────────────────────────────────────────────────────────

/** True if `name` carries a Swift mangling prefix. */
export function isSwiftMangled(name: string): boolean {
	return MANGLING_PREFIXES.some((prefix) => name.startsWith(prefix));
}

/** Initialise the wasm demangler. Resolves true if ready. Never throws. */
export async function initSwiftDemangler(): Promise<boolean> {
	if (demangler) return true;
	if (!initPromise) {
		initPromise = (async () => {
			try {
				const wasmPath = resolveWasmPath();
				if (!wasmPath) {
					console.error("[swift-demangle] wasm not found; Swift names stay mangled");
					return false;
				}
				const module = await WebAssembly.compile(fs.readFileSync(wasmPath));
				demangler = await initSwiftDemangle({ module });
				return true;
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				console.error(`[swift-demangle] failed to initialise: ${msg}`);
				return false;
			}
		})();
	}
	return initPromise;
}

/** Demangle a symbol; returns null if not mangled, not ready, or unchanged. */
export function demangleSwiftSymbol(name: string): string | null {
	if (!demangler || !isSwiftMangled(name)) return null;
	const result = demangler(name);
	return result && result !== name ? result : null;
}

// ── Wasm path resolution ──────────────────────────────────────────────

function resolveWasmPath(): string | null {
	const candidates = [
		process.env.APPINSPECT_SWIFT_DEMANGLE_WASM,
		...bundleDirs().map((dir) => path.join(dir, WASM_FILENAME)),
		path.join(process.cwd(), NODE_MODULES_WASM)
	];
	for (const candidate of candidates) {
		if (candidate && fs.existsSync(candidate)) return candidate;
	}
	return null;
}

/**
 * Candidate directories holding the wasm beside the bundle. Bun rewrites
 * `__dirname`/`module.filename`/`import.meta.url` to the source location when
 * bundling, so derive the directory from runtime entry points too. Electron
 * ships no node_modules, hence the `resourcesPath` and app-root candidates.
 * Every candidate is existence-checked, so stale source paths are harmless.
 */
function bundleDirs(): string[] {
	const dirs: string[] = [];
	const addFile = (file: string | null | undefined) => {
		if (file) dirs.push(path.dirname(file));
	};
	addFile(requireMainFilename());
	addFile(metaFilename());
	addFile(process.argv[1]);

	const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
	if (typeof resourcesPath === "string") {
		dirs.push(path.join(resourcesPath, "app.asar", "dist", "main"));
		dirs.push(path.join(resourcesPath, "app", "dist", "main"));
	}
	if (process.argv[1]) {
		dirs.push(path.join(process.argv[1], "dist", "main"));
	}

	return [...new Set(dirs)];
}

function requireMainFilename(): string | null {
	if (typeof require === "undefined" || !require.main?.filename) return null;
	return require.main.filename;
}

function metaFilename(): string | null {
	if (typeof import.meta.url !== "string") return null;
	try {
		return fileURLToPath(import.meta.url);
	} catch {
		return null;
	}
}
