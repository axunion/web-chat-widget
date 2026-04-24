import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => {
	if (mode === "iife") {
		return {
			build: {
				lib: {
					entry: resolve(__dirname, "src/iife.ts"),
					formats: ["iife"],
					name: "ChatWidget",
					fileName: () => "chat-widget.iife.js",
				},
				sourcemap: true,
				emptyOutDir: false,
				rollupOptions: {
					output: {
						exports: "default",
					},
				},
			},
			publicDir: false,
		};
	}
	return {
		build: {
			lib: {
				entry: {
					index: resolve(__dirname, "src/index.ts"),
					element: resolve(__dirname, "src/element.ts"),
					adapters: resolve(__dirname, "src/adapters/index.ts"),
				},
				formats: ["es"],
				fileName: (_format, entryName) => `${entryName}.js`,
			},
			sourcemap: true,
			emptyOutDir: true,
		},
		publicDir: false,
	};
});
