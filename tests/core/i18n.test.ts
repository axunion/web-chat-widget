import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LabelDictionary, Locale } from "../../src/index.ts";
import { resolveLabels } from "../../src/index.ts";

// ARCHITECTURE.md §Internationalization — Internationalization
// ARCHITECTURE.md §Internationalization — locale resolution: "ja" | "en", navigator.language fallback
// ARCHITECTURE.md §Internationalization — LabelDictionary: 15 keys, JA/EN defaults, partial override

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ALL_KEYS: ReadonlyArray<keyof LabelDictionary> = [
	"fabLabel",
	"panelTitle",
	"closeButton",
	"placeholder",
	"sendButton",
	"errorGeneric",
	"errorRetry",
	"emptyState",
	"typingLabel",
	"user",
	"assistant",
	"system",
	"clearHistory",
	"clearConfirm",
	"poweredBy",
];

// Returns true if the string contains at least one ASCII letter and no
// characters in the CJK Unified Ideographs block (U+4E00–U+9FFF) or
// Katakana/Hiragana blocks, which are a reliable signal of Japanese text.
function looksEnglish(value: string): boolean {
	const hasAsciiLetter = /[A-Za-z]/.test(value);
	const hasJapanese = /[぀-ヿ一-鿿]/.test(value);
	return hasAsciiLetter && !hasJapanese;
}

// ---------------------------------------------------------------------------
// §10 — Locale resolution: explicit locale argument
// ---------------------------------------------------------------------------

describe("resolveLabels — explicit locale argument", () => {
	it("returns a complete JA dictionary when called with locale 'ja'", () => {
		// ARCHITECTURE.md §Internationalization: all 15 keys must be present
		const labels = resolveLabels("ja");

		for (const key of ALL_KEYS) {
			expect(labels).toHaveProperty(key);
			// poweredBy is an unused slot so empty string is allowed per ARCHITECTURE.md §Internationalization
			if (key !== "poweredBy") {
				expect(
					typeof labels[key] === "string" && labels[key].length > 0,
					`JA key '${key}' must be a non-empty string`,
				).toBe(true);
			}
		}
	});

	it("returns a complete EN dictionary when called with locale 'en'", () => {
		// ARCHITECTURE.md §Internationalization: all 15 keys must be present
		const labels = resolveLabels("en");

		for (const key of ALL_KEYS) {
			expect(labels).toHaveProperty(key);
			if (key !== "poweredBy") {
				expect(
					typeof labels[key] === "string" && labels[key].length > 0,
					`EN key '${key}' must be a non-empty string`,
				).toBe(true);
			}
		}
	});

	it("JA and EN dictionaries differ in at least the fabLabel key", () => {
		// ARCHITECTURE.md §Internationalization: each locale has its own distinct values
		const ja = resolveLabels("ja");
		const en = resolveLabels("en");
		expect(ja.fabLabel).not.toBe(en.fabLabel);
	});

	it("returned object has exactly 15 keys — no extras", () => {
		// ARCHITECTURE.md §Internationalization: 15 keys defined, no implementation leakage
		const labels = resolveLabels("en");
		expect(Object.keys(labels).length).toBe(15);
	});
});

// ---------------------------------------------------------------------------
// §10.2 — JA dictionary spot-checks (exact values from ARCHITECTURE.md §Internationalization examples)
// ---------------------------------------------------------------------------

describe("resolveLabels — JA dictionary values", () => {
	it("JA fabLabel is 'AI チャットを開く'", () => {
		// ARCHITECTURE.md §Internationalization example: fabLabel: "AI チャットを開く"
		const labels = resolveLabels("ja");
		expect(labels.fabLabel).toBe("AI チャットを開く");
	});

	it("JA placeholder is 'メッセージを入力'", () => {
		// ARCHITECTURE.md §Internationalization example: placeholder: "メッセージを入力"
		const labels = resolveLabels("ja");
		expect(labels.placeholder).toBe("メッセージを入力");
	});

	it("JA sendButton is '送信'", () => {
		// ARCHITECTURE.md §Internationalization example: sendButton: "送信"
		const labels = resolveLabels("ja");
		expect(labels.sendButton).toBe("送信");
	});
});

// ---------------------------------------------------------------------------
// §10 — EN dictionary values
// ---------------------------------------------------------------------------

describe("resolveLabels — EN dictionary values", () => {
	it("EN fabLabel is a non-empty English string with no Japanese characters", () => {
		// ARCHITECTURE.md §Internationalization: EN locale must return English text for fabLabel
		const labels = resolveLabels("en");
		expect(labels.fabLabel.length).toBeGreaterThan(0);
		expect(looksEnglish(labels.fabLabel)).toBe(true);
	});

	it("EN sendButton is a non-empty English string with no Japanese characters", () => {
		// ARCHITECTURE.md §Internationalization: EN locale must return English text for sendButton
		const labels = resolveLabels("en");
		expect(labels.sendButton.length).toBeGreaterThan(0);
		expect(looksEnglish(labels.sendButton)).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// §10.2 — override behavior
// ---------------------------------------------------------------------------

describe("resolveLabels — override behavior", () => {
	it("a single-key override replaces that key; other keys keep locale defaults", () => {
		// ARCHITECTURE.md §Internationalization: messages option partially overrides locale defaults
		const custom = "Send it!";
		const labels = resolveLabels("en", { sendButton: custom });

		expect(labels.sendButton).toBe(custom);
		// Spot-check: a key NOT in the override must still equal the locale default
		expect(labels.fabLabel).toBe(resolveLabels("en").fabLabel);
	});

	it("multiple-key override replaces exactly those keys", () => {
		// ARCHITECTURE.md §Internationalization: partial override affects only the supplied keys
		const overrides: Partial<LabelDictionary> = {
			sendButton: "GO",
			closeButton: "X",
		};
		const labels = resolveLabels("en", overrides);

		expect(labels.sendButton).toBe("GO");
		expect(labels.closeButton).toBe("X");
		// Keys not in the override keep the locale default
		expect(labels.placeholder).toBe(resolveLabels("en").placeholder);
		expect(labels.fabLabel).toBe(resolveLabels("en").fabLabel);
	});

	it("override keys do not add extra properties to the returned object", () => {
		// ARCHITECTURE.md §Internationalization: result shape is always exactly LabelDictionary (15 keys)
		// TypeScript's Partial<LabelDictionary> prevents unknown keys at compile time.
		// At runtime we assert the count stays at 15.
		const labels = resolveLabels("en", { sendButton: "Go" });
		expect(Object.keys(labels).length).toBe(15);
	});

	it("empty override object returns the same values as no override", () => {
		// ARCHITECTURE.md §Internationalization: empty partial should be identical to the bare locale defaults
		const withEmpty = resolveLabels("en", {});
		const withoutOverride = resolveLabels("en");

		for (const key of ALL_KEYS) {
			expect(withEmpty[key]).toBe(withoutOverride[key]);
		}
	});
});

// ---------------------------------------------------------------------------
// §10.1 — navigator.language fallback (no explicit locale argument)
// ---------------------------------------------------------------------------

describe("resolveLabels — navigator.language fallback", () => {
	let originalLanguage: PropertyDescriptor | undefined;

	beforeEach(() => {
		// Capture the original descriptor so we can restore it exactly
		originalLanguage = Object.getOwnPropertyDescriptor(
			globalThis.navigator,
			"language",
		);
	});

	afterEach(() => {
		// Restore navigator.language to its original value
		if (originalLanguage !== undefined) {
			Object.defineProperty(globalThis.navigator, "language", originalLanguage);
		} else {
			// If there was no own descriptor, try via vi.restoreAllMocks as a fallback
			vi.restoreAllMocks();
		}
	});

	it("returns JA dictionary when navigator.language starts with 'ja'", () => {
		// ARCHITECTURE.md §Internationalization: navigator.language 'ja' (or 'ja-JP') → JA locale
		vi.spyOn(navigator, "language", "get").mockReturnValue("ja-JP");

		const labels = resolveLabels();
		expect(labels.fabLabel).toBe("AI チャットを開く");
	});

	it("returns EN dictionary when navigator.language is 'en-US'", () => {
		// ARCHITECTURE.md §Internationalization: navigator.language 'en-US' → EN locale
		vi.spyOn(navigator, "language", "get").mockReturnValue("en-US");

		const labels = resolveLabels();
		expect(looksEnglish(labels.fabLabel)).toBe(true);
	});

	it("falls back to EN when navigator.language is a non-ja non-en value like 'fr-FR'", () => {
		// ARCHITECTURE.md §Internationalization: unrecognised locale → en fallback
		vi.spyOn(navigator, "language", "get").mockReturnValue("fr-FR");

		const labels = resolveLabels();
		// Must equal what explicit "en" returns
		const enLabels = resolveLabels("en");
		expect(labels.fabLabel).toBe(enLabels.fabLabel);
		expect(labels.sendButton).toBe(enLabels.sendButton);
	});
});
