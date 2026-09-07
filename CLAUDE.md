<!-- Shared, agent-agnostic instructions live in AGENTS.md — edit that file, not this
     one, for anything that should also apply to Codex, Cursor, etc. This file adds
     Claude Code–specific tooling (sub-agents, skills, auto-loaded rules) that has no
     equivalent in other agents. -->

@AGENTS.md

## Conditional rules (`.claude/rules/`)

Auto-loaded by Claude Code when the matched path is opened. Minimal invariant reminders.

| Rule file | Applied to |
| --- | --- |
| [shadow-dom-ui.md](./.claude/rules/shadow-dom-ui.md) | `src/ui/**`, `src/element.ts`, `src/iife.ts` |
| [adapters.md](./.claude/rules/adapters.md) | `src/adapters/**` |
| [zero-deps.md](./.claude/rules/zero-deps.md) | `package.json`, `src/**/*.ts` |
| [tests.md](./.claude/rules/tests.md) | `tests/**`, `vitest.config.*` |

## Sub-agents

- [bundle-size-checker](./.claude/agents/bundle-size-checker.md) — after `pnpm build`, compares `dist/chat-widget.iife.js` raw/gzip sizes against [bundle-size-baseline.json](./bundle-size-baseline.json). Reports Blocker / Risk / Clean. Read-only — baseline updates are a human decision.
- [test-writer](./.claude/agents/test-writer.md) — RED step of TDD; writes failing Vitest tests from ARCHITECTURE.md/API.md.
- [security-reviewer](./.claude/agents/security-reviewer.md) — XSS / CSP / link sanitization / prompt-injection audit.
- [researcher](./.claude/agents/researcher.md) — looks up current Vite / Vitest / TypeScript API usage and the OpenAI-compatible SSE contract before implementation. Scopes the `context7` MCP doc-lookup server to itself only (never registered project-wide in `.mcp.json`).
- [reviewer](./.claude/agents/reviewer.md) — general diff review (scope, simplicity, correctness), independent of `security-reviewer`'s security-only focus.
- [tester](./.claude/agents/tester.md) — runs `pnpm test` / `pnpm typecheck` / `pnpm check` after a change and reports pass/fail.
- [inspector](./.claude/agents/inspector.md) — drives the widget in a real (Playwright) browser to verify rendered UI: screenshots plus overflow checks across viewports.

## When to spawn sub-agents

Three tiers of engagement, based on risk and size:

- **Trivial** (one-line fixes, typos, config tweaks): implement directly, no agents.
- **Non-trivial but contained** (a self-contained change in one area): implement directly. Optionally run [researcher](./.claude/agents/researcher.md) first if the change leans on an unfamiliar or fast-moving external API, or the built-in `Explore` agent to confirm an existing convention. Afterward, run [reviewer](./.claude/agents/reviewer.md) and [tester](./.claude/agents/tester.md) in parallel, automatically — no need to ask first, since both are read-only / test-only and exist specifically to catch blind spots in self-review.
- **Large, ambiguous, or high-risk** (spans many files, substantially touches `src/core/engine.ts`, `src/core/store.ts`, `src/adapters/sse-parse.ts`, or `src/adapters/openai-sse.ts`, or the task itself is genuinely ambiguous): drive it with the built-in `/goal` command, with a completion condition that explicitly requires `reviewer` and `tester` passing (not just "implement X" — `/goal`'s evaluator has no built-in knowledge that these agents exist, so an omitted condition lets the loop end right after implementation).

The main conversation writes the code at every tier — only the scaffolding around it changes (none, then verification after, then research before and verification after with iteration). None of `researcher` / `reviewer` / `tester` / `inspector` write production code: a write agent enforces no tool restriction worth having, its real product is the working tree rather than the summary it returns, and every retry pass would re-spawn it with no memory of the code it just wrote.

**Visual verification is a separate axis, not a fourth tier** — it's keyed to whether a change touches rendered UI, independent of how risky the change is:

- No rendered surface touched: skip, no browser involved.
- Small, isolated, single-property tweak: a quick manual glance at `pnpm dev` is enough.
- Layout that can vary by viewport, a change spanning multiple UI components sharing styles, or chasing a reported visual bug: run [inspector](./.claude/agents/inspector.md). Give it the full picture — it has no memory of the conversation — and treat a fix as unverified until a re-run comes back clean.

This gate needs no confirmation to run, but isn't automatic for every UI change either — weigh it against the three cases above each time.

## Skills

- [`/spec-sync`](./.claude/skills/spec-sync/SKILL.md) — cross-references `docs/ARCHITECTURE.md` and `docs/API.md` against `src/` and reports match / missing / extra / divergent. User-triggered only (`disable-model-invocation: true`). Run before releases or after large refactors.
- [`/tdd`](./.claude/skills/tdd/SKILL.md) — runs a full red-green-refactor cycle for a feature.
