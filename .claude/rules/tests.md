---
paths:
  - "tests/**/*.ts"
  - "vitest.config.*"
---

# Test authoring rules

Applies when touching anything under `tests/` or the Vitest config. The project is TDD-driven (see CLAUDE.md and SPEC §14.0) — tests are first-class.

## Style

- **English only** for `describe` / `it` names, assertion messages, variable names, and comments.
- **One `it(...)` per scenario.** No kitchen-sink tests.
- **Behavioral, not structural.** Import from the project's public entry points (`../src/index.ts`, `../src/adapters/index.ts`, etc.). Do not reach into private modules to assert on internals.
- **Fakes over mocks.** For `ChatAdapter`, write a small class / object implementing `send(messages, signal)`. Do not use `vi.mock` to replace the adapter interface.
- **Deterministic.** No real network, no real timers unless `vi.useFakeTimers()`, no Date.now reliance. Pass a seeded clock if time matters.

## Environment

- Vitest + happy-dom. Never import jsdom.
- Custom Elements and Shadow DOM behave under happy-dom, but `adoptedCallback` and some layout APIs are limited — if you hit such a gap, isolate the test and add a `// happy-dom limitation` note rather than working around it invisibly.

## Layout

- Mirror `src/` paths: `src/core/markdown.ts` → `tests/core/markdown.test.ts`.
- Multi-module integration tests live under `tests/integration/`.
- Fixtures under `tests/fixtures/` — keep them small and text-based.

## TDD discipline

- New tests should fail on first run. Placeholder "it('works', () => expect(true).toBe(true))" tests are worse than none.
- Before writing production code to make a test pass, confirm you've read the relevant SPEC section and the test covers what SPEC says.
- If SPEC is ambiguous, stop and fix SPEC — don't let tests pin down behavior that should have come from SPEC first.

## Coverage is not a target

Aim for meaningful behavioral coverage of SPEC sections. Do not write tests whose only purpose is to move a coverage number.
