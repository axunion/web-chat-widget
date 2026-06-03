---
name: spec-sync
description: Cross-reference docs/ARCHITECTURE.md and docs/API.md against the current src/ implementation and report drift (missing features, divergent behavior, undocumented additions, leaked non-goals). Read-only audit; produces a table the engineer can act on. Run before a release or after large refactors.
disable-model-invocation: true
---

Cross-check `docs/ARCHITECTURE.md` and `docs/API.md` (single sources of truth) against the current `src/` implementation. Produce a drift report. Make no edits — fixes are decided by the engineer (update docs, or update src to match docs).

## Steps

1. **Load docs.** Read `docs/ARCHITECTURE.md` and `docs/API.md` end to end. Note the current git commit (`git rev-parse --short HEAD`) and include it in the report header.

2. **Extract pinned items.** Build a checklist from these doc sections:

   | Doc section | What to extract | Where to verify in src |
   | --- | --- | --- |
   | API.md §1.3 exports table | every named symbol | `src/index.ts` (exports) |
   | API.md §2 ChatWidget | constructor, all 8 methods, 5 events | `src/ui/widget.ts`, `src/index.ts` |
   | API.md §3.1 attributes | every attribute name | `src/ui/widget.ts` (`observedAttributes`) |
   | API.md §3.3 `::part()` names | every part name | `src/ui/*.ts` (search `setAttribute("part"` or `part="`) |
   | API.md §4.1 ChatAdapter | `send` signature, `AdapterChunk` union | `src/adapters/types.ts` or equivalent |
   | API.md §4.2–4.3 built-in adapters | `createOpenAISseAdapter`, `createJsonAdapter` signatures | `src/adapters/openai-sse.ts`, `src/adapters/json.ts` |
   | API.md §5.1 ChatStore | interface with `load` / `save` / `clear` | `src/core/store.ts` |
   | API.md §5.2–5.4 store factories | `createMemoryStore`, `createLocalStorageStore`, `createSessionStorageStore` | `src/core/store.ts` |
   | API.md §6.1 LabelDictionary | all 15 keys | `src/core/i18n.ts` |
   | API.md §7.1 CSS variables | every `--cw-*` property name | `src/core/theme.ts` (`THEME_TOKENS`) |
   | ARCHITECTURE.md §Core Invariants | no `innerHTML`/`insertAdjacentHTML`, zero deps, Shadow DOM, Engine/UI split, non-modal | `src/**/*.ts` |
   | ARCHITECTURE.md §Markdown scope | exact supported feature set | `src/core/markdown.ts` |
   | ARCHITECTURE.md §Link constraints | `^https?://` only, `noopener noreferrer` | `src/core/sanitize.ts` or `src/core/markdown.ts` |
   | ARCHITECTURE.md §Future Work | items listed should NOT be in src | `src/**/*.ts` |

3. **Map each item.** For every doc item:
   - Search `src/` with `grep` / `Glob` for the corresponding symbol or string.
   - Assign a status:
     - `match` — doc and src agree.
     - `match (intentionally absent)` — future-work item; src correctly does NOT implement it.
     - `missing in src` — doc says it exists, src has nothing.
     - `extra in src` — src has it, doc does not mention it.
     - `divergent` — both exist but behavior or signature differs.

4. **Spot-check future-work items.** For each item in the ARCHITECTURE.md "Future Work" section, grep `src/` for telltale symbols (e.g. `postMessage`, `IndexedDB`, `syntaxHighlight`). Any hit → `extra in src` (drift).

5. **Check the language policy.** All code, identifiers, comments, commit messages, and documentation must be English. The only exception is live user conversation. Spot-check 5 random files under `src/` with `grep -nP "[\p{Hiragana}\p{Katakana}\p{Han}]"` — any hits in identifiers/comments are `divergent` against the language policy.

## Output format

```
# spec-sync report
src commit: <git rev-parse --short HEAD>
Build present: yes/no (dist/ existence)

## Drift table

| Doc ref | Item | src location | Status | Note |
| --- | --- | --- | --- | --- |
| API.md §1.3 | export ChatWidget | src/index.ts | match | |
| API.md §3.3 | part: clear-button | src/ui/panel.ts | match | |
| ARCHITECTURE.md §Future Work | postMessage usage | (none) | match (intentionally absent) | |
| ... | | | | |

## Summary

- match: N
- match (intentionally absent): N
- missing in src: N  ← engineer should implement
- extra in src: N    ← engineer should add to docs or remove
- divergent: N       ← engineer should reconcile

## Suggested follow-ups

1. <one bullet per drift item, ordered by impact>
```

## Hard rules

- Do not edit `docs/ARCHITECTURE.md`, `docs/API.md`, or any file under `src/`. The skill only reports.
- Do not paraphrase docs. Quote the exact symbol or line if there is ambiguity.
- If a doc item is too vague to verify objectively (e.g. "should be performant"), report `ARCHITECTURE ambiguous` and stop.
- If src has something not in the docs, do not invent a doc requirement. Report it as `extra in src`.
