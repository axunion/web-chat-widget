---
paths:
  - "package.json"
  - "src/**/*.ts"
---

# Zero runtime dependencies

This package ships with **no runtime dependencies**. It's a headline feature (see ARCHITECTURE.md §Core Invariants and §Zero deps) and the main reason it can be embedded anywhere without supply-chain surprises.

## Hard rules

- `dependencies` and `peerDependencies` in `package.json` stay **empty**.
- `src/**/*.ts` must not import from any third-party package — only native Web APIs, TypeScript's own types, and other files in `src/`.
- If an implementation feels like it needs a library (Markdown parser, SSE parser, DOM utility, sanitizer), write it yourself as a small module. ARCHITECTURE.md already calls this out for Markdown (§Markdown scope) and SSE (§Adapter Contract via `src/adapters/sse-parse.ts`).

## Allowed `devDependencies` (as of now)

- `@biomejs/biome`
- `typescript`
- `vite`
- `vitest`
- `happy-dom` (test environment — added when tests start requiring it)
- `@testing-library/dom` (test helper — optional; add only if tests genuinely need it)
- `lefthook` (git hooks)
- `playwright` (Claude Code tooling only — drives the `inspector` sub-agent's throwaway browser-verification scripts; nothing in `src/` or the Vitest suite imports it, see ARCHITECTURE.md §Zero deps)

Anything else needs justification. Before adding a new devDependency, update ARCHITECTURE.md §Zero deps with the reason.

## When editing `package.json`

- Verify `dependencies` and `peerDependencies` remain empty (or absent).
- Check that the `exports` map still matches API.md §1.3.
- Do not downgrade Node's `engines` or the Volta pin without discussing.

## Bundle check (manual until automated)

After building, `dist/` output should not contain any `node_modules` code other than what you intentionally inlined from `src/`. If it does, an import slipped in — track it down before merging.
