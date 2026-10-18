import { afterEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { extractDEB } from "../extractor";

const AR_MAGIC = "!<arch>\n";
const AR_HEADER_SIZE = 60;

/** Build one 60-byte ar header with a fixed-width, space-padded field layout. */
function arHeader(name: string, size: number): Buffer {
	const header =
		name.padEnd(16, " ") +
		"0".padEnd(12, " ") +
		"0".padEnd(6, " ") +
		"0".padEnd(6, " ") +
		"100644".padEnd(8, " ") +
		String(size).padEnd(10, " ") +
		"`\n";
	if (header.length !== AR_HEADER_SIZE) {
		throw new Error(`bad header length ${header.length}`);
	}
	return Buffer.from(header, "ascii");
}

/** Build an ar archive. Data is 2-byte aligned (padded with a newline). */
function buildAr(members: Array<{ name: string; data: Buffer }>): Buffer {
	const parts: Buffer[] = [Buffer.from(AR_MAGIC, "ascii")];
	for (const m of members) {
		parts.push(arHeader(m.name, m.data.length));
		parts.push(m.data);
		if (m.data.length % 2 !== 0) parts.push(Buffer.from("\n"));
	}
	return Buffer.concat(parts);
}

/** Build a single ustar tar header block for a regular file. */
function tarHeader(name: string, size: number): Buffer {
	const header = Buffer.alloc(512);
	header.write(name, 0, 100, "utf-8");
	header.write("0000644\0", 100, 8, "ascii");
	header.write("0000000\0", 108, 8, "ascii");
	header.write("0000000\0", 116, 8, "ascii");
	header.write(`${size.toString(8).padStart(11, "0")}\0`, 124, 12, "ascii");
	header.write("00000000000\0", 136, 12, "ascii");
	header.write("        ", 148, 8, "ascii"); // checksum placeholder
	header.write("0", 156, 1, "ascii"); // typeflag: regular file
	header.write("ustar\0", 257, 6, "ascii");
	header.write("00", 263, 2, "ascii");

	let sum = 0;
	for (const byte of header) sum += byte;
	header.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148, 8, "ascii");
	return header;
}

/** Build an uncompressed (ustar) tar archive. */
function buildTar(files: Array<{ name: string; data: Buffer }>): Buffer {
	const parts: Buffer[] = [];
	for (const f of files) {
		parts.push(tarHeader(f.name, f.data.length));
		parts.push(f.data);
		const pad = (512 - (f.data.length % 512)) % 512;
		if (pad > 0) parts.push(Buffer.alloc(pad));
	}
	parts.push(Buffer.alloc(1024)); // two zero blocks terminate the archive
	return Buffer.concat(parts);
}

const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), `appinspect-deb-${prefix}-`));
	tempDirs.push(dir);
	return dir;
}

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

describe("extractDEB – path traversal", () => {
	it("does not write a file outside destDir for a member named ../../escape", async () => {
		const base = makeTempDir("traversal");
		// destDir sits two levels deep so "../../escape" resolves outside it.
		const sandboxDir = path.join(base, "sandbox", "deep");
		const escapedPath = path.join(base, "escape");
		fs.mkdirSync(sandboxDir, { recursive: true });

		const debPath = path.join(base, "malicious.deb");
		fs.writeFileSync(
			debPath,
			buildAr([
				{ name: "debian-binary", data: Buffer.from("2.0\n", "ascii") },
				{ name: "../../escape", data: Buffer.from("PWNED\n", "ascii") }
			])
		);

		const result = await extractDEB(debPath, sandboxDir);

		expect(result.success).toBe(false);
		expect(fs.existsSync(escapedPath)).toBe(false);
		// Nothing outside the sandbox should have been created.
		expect(fs.readdirSync(base).sort()).toEqual(["malicious.deb", "sandbox"]);
	});
});

describe("extractDEB – well-formed archive", () => {
	it("still extracts a valid .deb containing debian-binary and data.tar", async () => {
		const base = makeTempDir("valid");
		const destDir = path.join(base, "dest");

		const tar = buildTar([
			{ name: "./usr/lib/test.txt", data: Buffer.from("hello world", "utf-8") }
		]);
		const debPath = path.join(base, "valid.deb");
		fs.writeFileSync(
			debPath,
			buildAr([
				{ name: "debian-binary", data: Buffer.from("2.0\n", "ascii") },
				{ name: "data.tar", data: tar }
			])
		);

		const result = await extractDEB(debPath, destDir);

		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(fs.existsSync(path.join(result.dataDir, "usr", "lib", "test.txt"))).toBe(true);
	});
});
