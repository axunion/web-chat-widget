<!-- KEEP IN SYNC with AGENTS.md — these two files are mirrors.
     Edit one, then copy the change to the other.
     Everything from ## Project Overview onward must stay identical between the two files. -->

# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository.

## Project Overview

`web-chat-widget` is a zero-dependency, Web-standards-only floating AI chat UI that can be embedded in any web page. It supports both npm import and `<script>` tag embedding.

**Status**: All features are implemented. Core layer, adapter layer, UI layer, declarative entry (`element.ts`) / IIFE entry (`iife.ts`), `ChatStore` (history persistence, see API.md §5), and `ChatWidget.clear()` / `retry()` are all shipped. The Vite library-mode build pipeline (ESM + IIFE + `.d.ts`) and three demo pages are working:
- Developer playground: `index.html` + `src/main.ts` (run via `pnpm dev`)
- Production-shaped sample: `demo/sample-service.html` (run via `pnpm demo`, loads the IIFE via `<script>`)
- Live-backend sample: `demo/backend-live.html` (run via `pnpm demo` with `examples/backend` running; exercises the real SSE adapter)

Feature wave 2 (engine busy/stop state, adapter timeouts, declarative config, focus management, unread badge, CI) is **specified but not yet implemented**: the specs carry **(planned)** markers in the docs, and the phase-by-phase execution plan is [docs/PLAN.md](./docs/PLAN.md).

Design decisions and architectural invariants live in [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md). Public API signatures live in [docs/API.md](./docs/API.md). These are the single sources of truth.

## Dev Commands

Package manager: pnpm (`pnpm-lock.yaml` present). Node version pinned to `24.16.0` via `devEngines` (`onFail: warn`).

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Vite dev server. Serves `index.html` + `src/main.ts` (ESM direct import). Includes HMR and a control panel. |
| `pnpm build` | Full build: ESM library → IIFE → `.d.ts` emit → rewrite `.ts` refs in `.d.ts` → copy `demo/*.html` to `dist/`. Runs: `vite build && vite build --mode iife && tsc -p tsconfig.build.json && node scripts/rewrite-dts-extensions.mjs && node scripts/copy-demo.mjs` |
| `pnpm preview` | Serve `dist/` via `vite preview`. Verify the built IIFE and demo HTML at `http://localhost:4173/sample-service.html`. |
| `pnpm demo` | `pnpm build && pnpm preview` — build then immediately preview. |
| `pnpm typecheck` | Type-check only (`tsc --noEmit`). Covers all of `src/`. |
| `pnpm check` | Biome lint + format check. |
| `pnpm fix` | Biome auto-fix. |
| `pnpm test` | Run Vitest once. |
| `pnpm test:watch` | Vitest watch mode. |

Single-test execution: `pnpm vitest run path/to/file.test.ts`. Name filter: `pnpm vitest run -t "test name"`.

## Architectural Invariants

Hard constraints locked in SPEC — never violate these:

- **Zero runtime dependencies.** `dependencies` / `peerDependencies` stay empty. Write your own Markdown parser, SSE parser, etc.
- **UI lives inside Shadow DOM.** `Custom Element + Shadow DOM` blocks external CSS bleed. Styles are embedded as strings in the JS bundle and injected as `<style>` into the Shadow Root.
- **Engine / UI separation.** `src/core/engine.ts` is a DOM-free logic layer (state, adapter calls, `EventTarget` inheritance). UI (`src/ui/`) only receives an Engine and renders. Required for a future React wrapper to reuse Engine.
- **Adapter interface:** `send(messages, signal): AsyncIterable<AdapterChunk>`. Streaming and non-streaming both use the same shape.
- **Non-modal.** Opening the panel must not block the host page. Use `role="complementary"`, no `aria-modal`, no focus trap.
- **XSS prevention:** No `innerHTML` / `insertAdjacentHTML`. The Markdown parser builds DOM via `createElement` + `textContent`. Links allow `^https?://` only.

## Entry Points and Distribution

Implemented per ARCHITECTURE.md §Distribution & Entry Points.

- `src/index.ts` — side-effect-free. Exports `ChatWidget`, `ChatEngine`, built-in store factories, and types.
- `src/element.ts` — calls `defineChatWidget()`; side-effect entry.
- `src/adapters/index.ts` — `createOpenAISseAdapter` / `createJsonAdapter`.
- `src/iife.ts` — IIFE build entry. Attaches `ChatWidget` class to `window.ChatWidget` with `ChatWidget.adapters` / `ChatWidget.stores` namespaces.
- `package.json` exports: `"."` / `"./element"` / `"./adapters"`. `"./react"` is added only when the React wrapper ships (never expose an unimplemented export path). Publishing metadata: `sideEffects` lists only `dist/element.js` and the IIFE (everything else is tree-shakable), `unpkg` / `jsdelivr` point at `dist/chat-widget.iife.js`, and `prepack` runs the full build so packing works from a fresh checkout. See ARCHITECTURE.md §Distribution for the rationale.
- `vite.config.ts` uses `defineConfig(({ mode }) => ...)` to split ESM (default mode) from IIFE (`mode === "iife"`). Both dev and preview set `publicDir: false`. The demo is not bundled with the library; `scripts/copy-demo.mjs` copies `demo/*.html` to `dist/` so `vite preview` can serve them, and the `files` negation `"!dist/*.html"` keeps them out of the npm tarball.
- `demo/sample-service.html` loads the IIFE via `<script src="./chat-widget.iife.js?v=...">`. It is copied to `dist/` alongside the IIFE, so the relative path resolves correctly.
- `tsconfig.build.json` sets `declaration: true` / `emitDeclarationOnly: true` / `rewriteRelativeImportExtensions: true`. Because TS 6.x does not apply `rewriteRelativeImportExtensions` to declaration output, `scripts/rewrite-dts-extensions.mjs` post-processes the `.d.ts` files.
- `examples/backend/` — a reference proxy (Hono, its own `package.json`). Excluded from `files` in `package.json`. Shows the backend contract: request `{ messages, stream?, model? }` → OpenAI-compatible SSE or `{ reply }`. Does not affect the zero-deps guarantee.

## Documentation

- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — authoritative design decisions and architectural invariants. Covers core invariants, adapter/store contracts, security policy, accessibility, and future work. English.
- [docs/API.md](./docs/API.md) — public API reference: type signatures, attribute/event tables, factory options, `LabelDictionary` (19 keys — 4 planned), `::part()` list. English.
- [docs/PLAN.md](./docs/PLAN.md) — sequenced implementation plan for the **(planned)** items in the two docs above. One phase = one TDD cycle; markers are removed as each phase ships. English.
- [README.md](./README.md) — external-facing Quick Start and examples. English.

Always update ARCHITECTURE.md and/or API.md before implementing. Never let the implementation drift ahead of these docs. New API signatures must be reflected in API.md; design decisions and invariants go in ARCHITECTURE.md.

## Test-Driven Development (TDD)

This project is **test-first / red-green-refactor**. Write failing tests under `tests/` before writing any production code under `src/`.

### Cycle

1. **Red** — write one failing test that corresponds to a SPEC behavior (`pnpm test` is red).
2. **Green** — write the minimum code to make it pass. No speculative generalization.
3. **Refactor** — clean up duplication, naming, structure while keeping tests green.

### Fixed rules

- Every implementation change must be preceded by a corresponding test (same commit is fine, but no test = no merge).
- Tests assert on **behavior**, not internal implementation. Use public API entry points only.
- One `it(...)` per scenario. No kitchen-sink tests.
- Keep `pnpm test:watch` running during development to watch red → green live.
- **Exceptions** (no test required): type-only changes, demo page visual tweaks, documentation, config files.

### Directory layout

- Mirror `src/` paths under `tests/`: e.g. `src/core/markdown.ts` → `tests/core/markdown.test.ts`.
- Multi-module integration tests go in `tests/integration/`.
- Fixtures under `tests/fixtures/` — keep them small and text-based.
- Vitest environment: happy-dom (required for Custom Elements / Shadow DOM).

### Tooling

- [test-writer sub-agent](./.claude/agents/test-writer.md) — generates failing tests from SPEC (RED step).
- [security-reviewer sub-agent](./.claude/agents/security-reviewer.md) — audits XSS / CSP / link sanitization / prompt-injection.
- `/tdd <feature>` skill ([.claude/skills/tdd/SKILL.md](./.claude/skills/tdd/SKILL.md)) — runs the full TDD cycle.

### Conditional rules (`.claude/rules/`)

Auto-loaded by Claude Code when the matched path is opened. Minimal invariant reminders.

| Rule file | Applied to |
| --- | --- |
| [shadow-dom-ui.md](./.claude/rules/shadow-dom-ui.md) | `src/ui/**`, `src/element.ts`, `src/iife.ts` |
| [adapters.md](./.claude/rules/adapters.md) | `src/adapters/**` |
| [zero-deps.md](./.claude/rules/zero-deps.md) | `package.json`, `src/**/*.ts` |
| [tests.md](./.claude/rules/tests.md) | `tests/**`, `vitest.config.*` |

## Harness Automation

### Git hooks (lefthook, pre-commit)

Defined in `lefthook.yml`. Installed automatically by `pnpm install`.

| Hook | Role |
| --- | --- |
| zero-deps-guard | Blocks commit when `package.json` is staged and `dependencies` / `peerDependencies` are non-empty. Enforces the zero-deps invariant (see [ARCHITECTURE.md](./docs/ARCHITECTURE.md#zero-deps-supply-chain) and [zero-deps.md](./.claude/rules/zero-deps.md)). |
| biome | Runs `pnpm exec biome check --write` on staged `src/**/*.{ts,tsx,js}` files and auto-re-stages the fixes. |

### Sub-agents

- [bundle-size-checker](./.claude/agents/bundle-size-checker.md) — after `pnpm build`, compares `dist/chat-widget.iife.js` raw/gzip sizes against [bundle-size-baseline.json](./bundle-size-baseline.json). Reports Blocker / Risk / Clean. Read-only — baseline updates are a human decision.
- [test-writer](./.claude/agents/test-writer.md) — RED step of TDD; writes failing Vitest tests from SPEC.
- [security-reviewer](./.claude/agents/security-reviewer.md) — XSS / CSP / link sanitization / prompt-injection audit.

### Skills

- [`/spec-sync`](./.claude/skills/spec-sync/SKILL.md) — cross-references `docs/ARCHITECTURE.md` and `docs/API.md` against `src/` and reports match / missing / extra / divergent. User-triggered only (`disable-model-invocation: true`). Run before releases or after large refactors.
- [`/tdd`](./.claude/skills/tdd/SKILL.md) — runs a full red-green-refactor cycle for a feature.

## Code Style

- **Biome** for lint and formatting (`biome.json` at project root). `pnpm check` must pass.
- **TypeScript 6**, strict mode + `verbatimModuleSyntax` + `erasableSyntaxOnly`. Use `import type` where required.
- `tsconfig.json` is `noEmit: true`. Declaration generation is handled by `tsconfig.build.json` (separate from the dev config).

## Language Policy

**Everything is written in English** — this is a hard rule, not a preference:

- All code, identifiers, comments, commit messages, documentation (including `CLAUDE.md`, `AGENTS.md`, `README.md`, and files under `docs/`).
- Code comments are kept minimal: add them only when the *why* is non-obvious. Write them in English.
- **The only Japanese allowed** is live conversation with the user (interactive chat).

**Migration note:** `docs/SPEC.md` has been replaced by `docs/ARCHITECTURE.md` (English). `docs/API.md` has been rewritten in English. No further Japanese docs remain.

**Mirroring:** `CLAUDE.md` (Claude Code guide) and `AGENTS.md` (generic agent guide at the repo root) are kept identical from `## Project Overview` onward. When you edit one, copy the change to the other and verify with:
```bash
diff <(grep -A9999 "^## Project Overview" CLAUDE.md) \
     <(grep -A9999 "^## Project Overview" AGENTS.md)
```
