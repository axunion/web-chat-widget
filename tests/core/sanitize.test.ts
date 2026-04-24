import { describe, expect, it } from "vitest";
import { isAllowedHttpUrl } from "../../src/core/sanitize.ts";

// SPEC §6.4 — link href restriction: only ^https?:// is allowed
// SPEC §11.2 — link security: javascript:, data:, etc. degrade to plain text

describe("isAllowedHttpUrl — allowed schemes", () => {
  it("returns true for a standard https URL", () => {
    expect(isAllowedHttpUrl("https://example.com")).toBe(true);
  });

  it("returns true for an http URL with path and query string", () => {
    expect(isAllowedHttpUrl("http://example.com/path?q=1")).toBe(true);
  });

  it("returns true for an uppercase HTTPS scheme", () => {
    expect(isAllowedHttpUrl("HTTPS://example.com")).toBe(true);
  });

  it("returns true for a mixed-case HtTp scheme", () => {
    expect(isAllowedHttpUrl("HtTp://example.com")).toBe(true);
  });
});

describe("isAllowedHttpUrl — disallowed schemes", () => {
  it("returns false for javascript: scheme", () => {
    expect(isAllowedHttpUrl("javascript:alert(1)")).toBe(false);
  });

  it("returns false for uppercase JAVASCRIPT: scheme", () => {
    expect(isAllowedHttpUrl("JAVASCRIPT:void(0)")).toBe(false);
  });

  it("returns false for data: URI", () => {
    expect(isAllowedHttpUrl("data:text/html,<script>")).toBe(false);
  });

  it("returns false for mailto: scheme", () => {
    expect(isAllowedHttpUrl("mailto:a@b.c")).toBe(false);
  });

  it("returns false for file: scheme", () => {
    expect(isAllowedHttpUrl("file:///etc/passwd")).toBe(false);
  });

  it("returns false for vbscript: scheme", () => {
    expect(isAllowedHttpUrl('vbscript:msgbox("x")')).toBe(false);
  });
});

describe("isAllowedHttpUrl — non-absolute or ambiguous inputs", () => {
  it("returns false for an empty string", () => {
    expect(isAllowedHttpUrl("")).toBe(false);
  });

  it("returns false for a whitespace-only string", () => {
    expect(isAllowedHttpUrl("   ")).toBe(false);
  });

  it("returns false for a protocol-relative URL", () => {
    expect(isAllowedHttpUrl("//example.com")).toBe(false);
  });

  it("returns false for a root-relative path", () => {
    expect(isAllowedHttpUrl("/foo/bar")).toBe(false);
  });

  it("returns false for a fragment-only reference", () => {
    expect(isAllowedHttpUrl("#section")).toBe(false);
  });

  it("returns false for a string with leading whitespace before https", () => {
    // Leading whitespace would bypass a naive startsWith check; strict regex must reject it.
    expect(isAllowedHttpUrl(" https://x")).toBe(false);
  });
});

describe("isAllowedHttpUrl — non-string inputs", () => {
  it("returns false for null", () => {
    expect(isAllowedHttpUrl(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isAllowedHttpUrl(undefined)).toBe(false);
  });

  it("returns false for a number", () => {
    expect(isAllowedHttpUrl(42)).toBe(false);
  });

  it("returns false for a plain object", () => {
    expect(isAllowedHttpUrl({ href: "https://example.com" })).toBe(false);
  });
});
