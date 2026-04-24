#!/usr/bin/env node
// Rewrites relative `.ts` import specifiers in emitted `.d.ts` files to `.js`.
// TypeScript 6.x preserves the original specifier in declaration output even
// with `rewriteRelativeImportExtensions: true`, so consumers resolving the
// shipped types would otherwise fail to find the referenced modules.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const DIST = resolve(process.argv[2] ?? "dist");
const PATTERN = /((?:from|import)\s+["'])(\.\.?\/[^"']+?)\.ts(["'])/g;

for (const name of readdirSync(DIST, { recursive: true })) {
	if (!name.endsWith(".d.ts")) continue;
	const file = join(DIST, name);
	const src = readFileSync(file, "utf8");
	const out = src.replace(PATTERN, "$1$2.js$3");
	if (out !== src) writeFileSync(file, out);
}
