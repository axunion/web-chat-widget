---
name: tdd
description: Run a complete test-driven development (red-green-refactor) cycle for a feature in this project. Trigger when the user wants to implement a new feature or fix a bug via TDD, or invokes /tdd. Delegates the RED step to the test-writer subagent, writes the minimal implementation, and refactors with tests green.
---

Run a TDD cycle for the feature described in the user's arguments.

## Steps

1. **Clarify** — Read the relevant section of `docs/SPEC.md` for this feature. In 2–3 sentences, summarize the target behavior and list the public API surface involved. If SPEC is ambiguous or silent, stop here and ask the user.

2. **Red** — Delegate to the `test-writer` subagent to produce failing Vitest tests under `tests/` mirroring the `src/` path. Confirm failure with `pnpm test -- <new test file>`. Do not proceed if the tests pass.

3. **Green** — Write the minimal implementation under `src/` that passes the new tests. Rules:
   - No speculative generalization. No extra methods, options, or config not required by the failing tests.
   - Keep all previously green tests green — run `pnpm test` (not just the new file) to confirm.
   - Follow the project's architectural invariants from `CLAUDE.md` (dependency-zero, Shadow DOM, Engine/UI split, etc.).

4. **Refactor** — Clean up duplication, naming, and structure without changing behavior. All tests stay green. Run `pnpm check` to confirm Biome passes.

5. **Report** — Summarize:
   - SPEC section(s) covered
   - Test file paths created
   - Source file paths created / modified
   - Any SPEC ambiguities hit during the cycle (for follow-up)
   - Test + lint final status

## Ground rules

- If the feature spans more than ~200 lines of impl or 3+ modules, propose a split into 2–3 smaller cycles before starting.
- Do not commit unless the user asks. Leave the working tree ready for review.
- Language: English for all code / comments / identifiers; Japanese only in SPEC / CLAUDE.md / user dialogue.
- If `pnpm test:watch` is not already running in a terminal, suggest the user start it so they see red → green transitions live.
