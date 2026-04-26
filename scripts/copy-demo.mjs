#!/usr/bin/env node
// Copies demo/*.html into the build output so `vite preview` (which serves
// build.outDir) can host the production-shaped sample pages alongside the
// IIFE bundle.
import { copyFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(process.argv[2] ?? ".");
const SRC = join(ROOT, "demo");
const DST = join(ROOT, "dist");

let entries;
try {
	entries = readdirSync(SRC);
} catch (err) {
	if (err && err.code === "ENOENT") process.exit(0);
	throw err;
}

for (const name of entries) {
	if (!name.endsWith(".html")) continue;
	copyFileSync(join(SRC, name), join(DST, name));
	console.log(`copied demo/${name} -> dist/${name}`);
}
