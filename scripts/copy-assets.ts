import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const source = join("node_modules", "swift-demangle-wasm", "dist", "swift-demangle.wasm");

for (const target of process.argv.slice(2)) {
	mkdirSync(target, { recursive: true });
	copyFileSync(source, join(target, "swift-demangle.wasm"));
}
