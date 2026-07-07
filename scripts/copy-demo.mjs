#!/usr/bin/env node
// Copies demo/*.html into the build output so `vite preview` (which serves
// build.outDir) can host the production-shaped sample pages alongside the
// IIFE bundle. The IIFE cache-buster query (`?v=...`) is stamped with the
// build time so statically hosted copies of dist/ never serve a stale bundle;
// the checked-in demo sources keep a stable `?v=dev` placeholder.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(process.argv[2] ?? ".");
const SRC = join(ROOT, "demo");
const DST = join(ROOT, "dist");
const STAMP = Date.now();

let entries;
try {
	entries = readdirSync(SRC);
} catch (err) {
	if (err && err.code === "ENOENT") process.exit(0);
	throw err;
}

for (const name of entries) {
	if (!name.endsWith(".html")) continue;
	const html = readFileSync(join(SRC, name), "utf8").replace(
		/chat-widget\.iife\.js\?v=[^"']*/g,
		`chat-widget.iife.js?v=${STAMP}`,
	);
	writeFileSync(join(DST, name), html);
	console.log(`copied demo/${name} -> dist/${name} (?v=${STAMP})`);
}
