import { describe, expect, it } from "vitest";
import { renderThemeCss, THEME_TOKENS } from "../../src/index.ts";

// API.md §7.1 — CSS Custom Property tokens and CSS string generator
// ARCHITECTURE.md §Shadow DOM & Style Customization — theming strategy: CSS vars, light/dark via [data-theme]
// ARCHITECTURE.md §Theme — [data-theme="light"] / [data-theme="dark"] selectors

// ---------------------------------------------------------------------------
// Shape and completeness
// ---------------------------------------------------------------------------

describe("THEME_TOKENS — shape and completeness", () => {
	it("exports exactly 20 token entries", () => {
		// API.md §7.1: table lists 20 CSS custom properties
		expect(THEME_TOKENS.length).toBe(20);
	});

	it("every token name starts with '--cw-'", () => {
		// API.md §7.1: all tokens are in the --cw- namespace
		for (const token of THEME_TOKENS) {
			expect(token.name).toMatch(/^--cw-/);
		}
	});

	it("every token has a non-empty light value", () => {
		// API.md §7.1: each token must carry a light-mode default
		for (const token of THEME_TOKENS) {
			expect(typeof token.light).toBe("string");
			expect(token.light.trim().length).toBeGreaterThan(0);
		}
	});

	it("every token has a non-empty dark value", () => {
		// API.md §7.1: each token must carry a dark-mode default
		for (const token of THEME_TOKENS) {
			expect(typeof token.dark).toBe("string");
			expect(token.dark.trim().length).toBeGreaterThan(0);
		}
	});

	it("every token has a non-empty description string", () => {
		// API.md §7.1: tokens carry a description for maintainability
		for (const token of THEME_TOKENS) {
			expect(typeof token.description).toBe("string");
			expect(token.description.trim().length).toBeGreaterThan(0);
		}
	});

	it("all token names are unique", () => {
		// API.md §7.1: each CSS variable name must appear exactly once
		const names = THEME_TOKENS.map((t) => t.name);
		const uniqueNames = new Set(names);
		expect(uniqueNames.size).toBe(names.length);
	});
});

// ---------------------------------------------------------------------------
// Specific SPEC values (spot-checks to pin the table)
// ---------------------------------------------------------------------------

describe("THEME_TOKENS — specific API.md §7.1 values", () => {
	function find(name: string) {
		return THEME_TOKENS.find((t) => t.name === name);
	}

	it("--cw-color-primary has light #2563eb and dark #60a5fa", () => {
		// API.md §7.1: FAB / accent button color
		const token = find("--cw-color-primary");
		expect(token).toBeDefined();
		expect(token?.light).toBe("#2563eb");
		expect(token?.dark).toBe("#60a5fa");
	});

	it("--cw-color-bg has light #ffffff and dark #0f172a", () => {
		// API.md §7.1: panel background
		const token = find("--cw-color-bg");
		expect(token).toBeDefined();
		expect(token?.light).toBe("#ffffff");
		expect(token?.dark).toBe("#0f172a");
	});

	it("--cw-color-error has light #dc2626 and dark #f87171", () => {
		// API.md §7.1: error display color
		const token = find("--cw-color-error");
		expect(token).toBeDefined();
		expect(token?.light).toBe("#dc2626");
		expect(token?.dark).toBe("#f87171");
	});

	it("--cw-radius is 16px for both light and dark", () => {
		// API.md §7.1: panel and bubble border radius — same for both modes
		const token = find("--cw-radius");
		expect(token).toBeDefined();
		expect(token?.light).toBe("16px");
		expect(token?.dark).toBe("16px");
	});

	it("--cw-z-index is 2147483000 (not the integer maximum)", () => {
		// ARCHITECTURE.md §Floating UI Behavior and §7.2: z-index is 2147483000 to avoid collision with existing sites
		// Explicitly NOT 2147483647 (INT32 max)
		const token = find("--cw-z-index");
		expect(token).toBeDefined();
		expect(token?.light).toBe("2147483000");
		expect(token?.dark).toBe("2147483000");
	});

	it("--cw-fab-size is 56px", () => {
		// ARCHITECTURE.md §Floating UI Behavior and §7.2: FAB is a 56px circle
		const token = find("--cw-fab-size");
		expect(token).toBeDefined();
		expect(token?.light).toBe("56px");
		expect(token?.dark).toBe("56px");
	});
});

// ---------------------------------------------------------------------------
// CSS generation — renderThemeCss()
// ---------------------------------------------------------------------------

describe("renderThemeCss — output structure", () => {
	it("returns a non-empty string", () => {
		// API.md §7.1: the function must produce a CSS string for injection
		const css = renderThemeCss();
		expect(typeof css).toBe("string");
		expect(css.trim().length).toBeGreaterThan(0);
	});

	it('output contains a [data-theme="light"] block', () => {
		// ARCHITECTURE.md §Theme: Shadow DOM uses [data-theme="light"] selector
		const css = renderThemeCss();
		expect(css).toContain('[data-theme="light"]');
	});

	it('output contains a [data-theme="dark"] block', () => {
		// ARCHITECTURE.md §Theme: Shadow DOM uses [data-theme="dark"] selector
		const css = renderThemeCss();
		expect(css).toContain('[data-theme="dark"]');
	});

	it("output contains every token name under the light block", () => {
		// API.md §7.1: all 20 tokens must be declared in the light section
		const css = renderThemeCss();
		const lightBlockStart = css.indexOf('[data-theme="light"]');
		const darkBlockStart = css.indexOf('[data-theme="dark"]');
		expect(lightBlockStart).toBeGreaterThanOrEqual(0);

		// Extract light block text (between its opening brace and its closing brace)
		// We look for the text after the light selector up to the dark selector to
		// confirm each token appears in that region (not just anywhere in the string).
		const lightSection =
			darkBlockStart > lightBlockStart
				? css.slice(lightBlockStart, darkBlockStart)
				: css.slice(lightBlockStart);

		for (const token of THEME_TOKENS) {
			expect(lightSection).toContain(token.name);
		}
	});

	it("output contains every token name under the dark block", () => {
		// API.md §7.1: all 20 tokens must be declared in the dark section
		const css = renderThemeCss();
		const lightBlockStart = css.indexOf('[data-theme="light"]');
		const darkBlockStart = css.indexOf('[data-theme="dark"]');
		expect(darkBlockStart).toBeGreaterThanOrEqual(0);

		// Extract dark block text (after dark selector)
		const darkSection =
			darkBlockStart > lightBlockStart
				? css.slice(darkBlockStart)
				: css.slice(darkBlockStart);

		for (const token of THEME_TOKENS) {
			expect(darkSection).toContain(token.name);
		}
	});

	it("light block contains the declaration '--cw-color-primary: #2563eb'", () => {
		// API.md §7.1: exact light value for primary color
		const css = renderThemeCss();
		const lightBlockStart = css.indexOf('[data-theme="light"]');
		const darkBlockStart = css.indexOf('[data-theme="dark"]');
		const lightSection =
			darkBlockStart > lightBlockStart
				? css.slice(lightBlockStart, darkBlockStart)
				: css.slice(lightBlockStart);
		expect(lightSection).toContain("--cw-color-primary: #2563eb");
	});

	it("dark block contains the declaration '--cw-color-primary: #60a5fa'", () => {
		// API.md §7.1: exact dark value for primary color
		const css = renderThemeCss();
		const darkBlockStart = css.indexOf('[data-theme="dark"]');
		expect(darkBlockStart).toBeGreaterThanOrEqual(0);
		const darkSection = css.slice(darkBlockStart);
		expect(darkSection).toContain("--cw-color-primary: #60a5fa");
	});
});

describe("renderThemeCss — custom token list", () => {
	it("when given a single custom token, produces a shorter CSS with only that token name", () => {
		// API.md §7.1: renderThemeCss(tokens?) accepts an override array
		// A caller-supplied 1-token array must produce output that contains the
		// custom token name but does NOT contain the names of the default tokens.
		const customToken = {
			name: "--cw-custom-test",
			light: "red",
			dark: "blue",
			description: "test token",
		};
		const fullCss = renderThemeCss();
		const customCss = renderThemeCss([customToken]);

		// Custom CSS is shorter than the full default CSS
		expect(customCss.length).toBeLessThan(fullCss.length);

		// Custom CSS contains the custom token name
		expect(customCss).toContain("--cw-custom-test");

		// Custom CSS does NOT contain any of the default token names
		for (const token of THEME_TOKENS) {
			expect(customCss).not.toContain(token.name);
		}
	});
});
