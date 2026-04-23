---
paths:
  - "package.json"
  - "src/**/*.ts"
---

# Zero runtime dependencies

This package ships with **no runtime dependencies**. It's a headline feature (see SPEC §1.2 and §11.5) and the main reason it can be embedded anywhere without supply-chain surprises.

## Hard rules

- `dependencies` and `peerDependencies` in `package.json` stay **empty**.
- `src/**/*.ts` must not import from any third-party package — only native Web APIs, TypeScript's own types, and other files in `src/`.
- If an implementation feels like it needs a library (Markdown parser, SSE parser, DOM utility, sanitizer), write it yourself as a small module. SPEC already calls this out for Markdown (§6) and SSE (§8.2.1 via `src/adapters/sse-parse.ts`).

## Allowed `devDependencies` (as of now)

- `@biomejs/biome`
- `typescript`
- `vite`
- `vitest`
- `happy-dom` (test environment — added when tests start requiring it)
- `@testing-library/dom` (test helper — optional; add only if tests genuinely need it)

Anything else needs justification. Before adding a new devDependency, update SPEC §11.5 with the reason.

## When editing `package.json`

- Verify `dependencies` and `peerDependencies` remain empty (or absent).
- Check that the `exports` map still matches SPEC §3.2.
- Do not downgrade Node's `engines` or the Volta pin without discussing.

## Bundle check (manual until automated)

After building, `dist/` output should not contain any `node_modules` code other than what you intentionally inlined from `src/`. If it does, an import slipped in — track it down before merging.
