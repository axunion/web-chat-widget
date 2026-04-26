---
name: spec-sync
description: Cross-reference docs/SPEC.md against the current src/ implementation and report drift (missing features, divergent behavior, undocumented additions, leaked non-goals). Read-only audit; produces a table the engineer can act on. Run before a release or after large refactors.
disable-model-invocation: true
---

Cross-check `docs/SPEC.md` (single source of truth) against the current `src/` implementation. Produce a drift report. Make no edits — fixes are decided by the engineer (update SPEC, or update src to match SPEC).

## Steps

1. **Load SPEC.** Read `docs/SPEC.md` end to end. Note the version line at the top (e.g. `draft-1 / 最終更新: YYYY-MM-DD`) and include it in the report header.

2. **Extract pinned sections.** Build a checklist from these SPEC sections:

   | SPEC section | What to extract | Where to verify in src |
   | --- | --- | --- |
   | §3.1 distribution artifacts | filenames listed in the table | `dist/` after `pnpm build` (skip if dist absent — note in report) |
   | §3.2 `package.json` exports | the `exports` map | `package.json` |
   | §4 Custom Element API | attributes, properties, methods, events | `src/index.ts`, `src/element.ts`, `src/ui/widget.ts` |
   | §6.2 Markdown features (supported list) | each bullet (paragraphs, bold, italic, code spans, code blocks, links, lists) | `src/core/markdown.ts` |
   | §7.2 CSS Custom Properties | every `--*` name in the table | `src/ui/styles.ts` |
   | §7.3 `::part()` names | every part name | `src/ui/styles.ts`, `src/ui/*.ts` (search for `setAttribute("part", ...)` or `part="..."`) |
   | §8.1 `ChatAdapter` contract | exact `send` signature and `AdapterChunk` shape | `src/adapters/types.ts`, `src/adapters/internal.ts` |
   | §8.2 built-in adapters | `createOpenAISseAdapter`, `createJsonAdapter` request/response shapes | `src/adapters/openai-sse.ts`, `src/adapters/json.ts` |
   | §11 security invariants | every numbered rule | `src/core/sanitize.ts`, `src/core/markdown.ts`, `src/ui/*.ts` |
   | §16 v1 non-goals | the bulleted list | `src/` should NOT contain these |

3. **Map each item.** For every SPEC item:
   - Search `src/` with `grep` / `Glob` for the corresponding symbol or string.
   - Decide a `status`:
     - `match` — SPEC and src agree.
     - `match (intentionally absent)` — for non-goals; src correctly does NOT implement.
     - `missing in src` — SPEC says yes, src has nothing.
     - `extra in src` — src has it, SPEC does not mention it.
     - `divergent` — both exist but behavior or signature differs.

4. **Spot-check non-goals.** For each item in §16 (history persistence, multi-thread, attachments, tool-call viz, syntax highlighting, postMessage, IE), grep `src/` for telltale symbols (`localStorage`, `IndexedDB`, `postMessage`, `highlight`, `attachment`, etc.). Any hit → `extra in src` against §16 = drift.

5. **Check the language policy from CLAUDE.md.** README, commit messages, code comments, identifiers must be English. SPEC.md and CLAUDE.md may be Japanese. Spot-check 5 random files under `src/` with `grep -nP "[\p{Hiragana}\p{Katakana}\p{Han}]"` — any hits in identifiers/comments are `divergent` against the language policy.

## Output format

```
# spec-sync report
SPEC version: <version line copied from SPEC.md>
src commit: <git rev-parse --short HEAD>
Build present: yes/no (dist/ existence)

## Drift table

| SPEC ref | Item | src location | Status | Note |
| --- | --- | --- | --- | --- |
| §3.2 | exports `./element` | package.json | match | |
| §6.2 | strikethrough `~~x~~` | src/core/markdown.ts | extra in src | not in SPEC list — confirm before §6.2 codifies |
| §16 | localStorage usage | (none) | match (intentionally absent) | |
| ... | | | | |

## Summary

- match: N
- match (intentionally absent): N
- missing in src: N  ← engineer should implement
- extra in src: N    ← engineer should add to SPEC or remove
- divergent: N       ← engineer should reconcile

## Suggested follow-ups

1. <one bullet per drift item, ordered by impact>
```

## Hard rules

- Do not edit `docs/SPEC.md` or any file under `src/`. The skill only reports.
- Do not paraphrase SPEC. Quote the exact bullet or line if there is ambiguity, and cite `§X.Y`.
- If SPEC is silent on something src does, do **not** invent a SPEC requirement. Report it as `extra in src`.
- Stop and report `SPEC ambiguous` if a section is too vague to verify (e.g. "should be performant"). Do not fall back to subjective judgement.
