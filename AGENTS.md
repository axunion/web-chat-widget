# AGENTS.md

Agent guide for this repository. Applies to any AI coding agent (Codex, Cursor, etc.). Shared guidance goes here and reaches Claude Code via the `@AGENTS.md` import in [CLAUDE.md](./CLAUDE.md); Claude Code–specific tooling (sub-agents, skills, auto-loaded rules) is written directly in CLAUDE.md instead, since it doesn't apply to other agents.

## Approach

- **Change scope.** Change only what was requested. Don't "improve" adjacent code, comments, or formatting; match the existing style. Delete code your own change makes unused, never leave it commented out. Point out pre-existing dead code only; don't delete, split, or refactor it unless asked.
- **Implementation size.** Don't add unrequested features, abstractions, or configurability. Extract a helper only when it's used in 3+ places; otherwise inline it. Don't write error handling for cases that can't happen.
- **Uncertainty.** When more than one interpretation is possible, present the options instead of silently picking one.

## Language

Default to the user's language for everything interactive — chat replies, plan-mode proposals, clarifying questions, and any other back-and-forth during the session.

Switch to English only for durable artifacts: things other people or tools will read after the session ends — in-code comments, console/log/error output, AI-readable instruction files, and reader-facing docs (README and the like). Scratch notes and other throwaway dev artifacts stay in the user's language.

In this repository the durable-artifact rule has no exceptions: **everything except live chat is English, all the time.** That covers all code, identifiers, comments, commit messages, and documentation (`CLAUDE.md`, `AGENTS.md`, `README.md`, and everything under `docs/`). Code comments stay minimal — add one only when the *why* is non-obvious — and are written in English. The only Japanese allowed is live conversation with the user.

## Testing

Write tests before implementation — they are your success criteria. In this repository that's not a preference but a strict rule: **test-first / red-green-refactor**. Write a failing test under `tests/` before writing any production code under `src/` (same commit is fine, but no test = no merge).

- Test observable outcomes and edge cases, not implementation details — assert via public API entry points only.
- Each test is fully self-contained; no shared mutable state between tests.
- One `it(...)` per scenario. No kitchen-sink tests.
- Keep `pnpm test:watch` running during development to watch red → green live.
- **Exceptions** (no test required): type-only changes, demo page visual tweaks, documentation, config files.
- Structural correctness (state transitions, API responses, DOM output with a right answer) belongs in a test. Visual/subjective judgment (does the panel look right, spacing, animation feel) can't be scripted reliably — verify it by hand via `pnpm dev` / `pnpm demo`.
- Persist a regression test only for a durable, worth-protecting flow — not a one-off "let me verify this specific change" check.

### Cycle

1. **Red** — write one failing test that corresponds to an ARCHITECTURE.md/API.md behavior (`pnpm test` is red).
2. **Green** — write the minimum code to make it pass. No speculative generalization.
3. **Refactor** — clean up duplication, naming, structure while keeping tests green.

### Directory layout

- Mirror `src/` paths under `tests/`: e.g. `src/core/markdown.ts` → `tests/core/markdown.test.ts`.
- Multi-module integration tests go in `tests/integration/`.
- Fixtures under `tests/fixtures/` — keep them small and text-based.
- Vitest environment: happy-dom (required for Custom Elements / Shadow DOM).

## Commits

Format — plain prose, no prefixes or labels (`feat:`, `fix:`, and the like):

```
<summary: imperative mood, ≤70 chars, no trailing period>

<motivation: one sentence, only when not evident from the diff>

- <change bullets: only for 2+ distinct changes>
```

- Never commit secrets (`*.key`, `*.pem`, `credentials*`).
- Never use `--no-verify`. Use `--amend` only when explicitly asked; default to a new commit.

## Architectural Invariants

Hard constraints locked in ARCHITECTURE.md — never violate these:

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

Each document has exactly one audience — keep the separation (no tutorial prose in the reference docs, no reference dumps in the guide):

- [docs/GETTING-STARTED.md](./docs/GETTING-STARTED.md) — task-oriented integration guide: mock-first demo → backend wiring → customization → production checklist. Carries only the ordering and minimum code; details stay behind links to the other docs. English.
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — authoritative design decisions and architectural invariants. Covers core invariants, adapter/store contracts, security policy, accessibility, and future work. English.
- [docs/API.md](./docs/API.md) — public API reference: type signatures, attribute/event tables, factory options, `LabelDictionary` (19 keys), `::part()` list. English.
- [README.md](./README.md) — external-facing storefront: highlights, a minimal mock-adapter Quick Start, and a documentation index table. Keep it lean (~90 lines); when it needs more content, link out instead of growing it. English.
- [examples/backend/README.md](./examples/backend/README.md) — server-side contract, runnable Hono reference proxy, provider adaptation, production checklist. English.

Always update ARCHITECTURE.md and/or API.md before implementing. Never let the implementation drift ahead of these docs. New API signatures must be reflected in API.md; design decisions and invariants go in ARCHITECTURE.md.
