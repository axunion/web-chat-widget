---
paths:
  - "src/ui/**/*.ts"
  - "src/element.ts"
  - "src/iife.ts"
---

# UI layer rules (Shadow DOM, XSS safety)

These rules apply inside `src/ui/` and the Custom Element entry points. Violating any of them breaks a SPEC invariant — prefer refactoring over "just this once" exceptions.

## DOM construction

- **Never use `innerHTML`, `outerHTML`, or `insertAdjacentHTML`.** Build DOM with `document.createElement(...)` and set text via `textContent`. This holds even for content you control, so one consistent pattern exists.
- **Never use `eval`, `Function(...)`, or `setTimeout(string)`.**
- Attach Shadow DOM with `mode: "open"` so `::part()` styling works.
- All widget DOM must live inside the Shadow Root. Do not mutate the host page outside the widget's own tree.

## Styles

- CSS is inlined as a JS string in `src/ui/styles.ts` (or similar) and injected into the Shadow Root as a `<style>` element at mount. No external CSS file is shipped.
- Public styling surface:
  - CSS custom properties (see SPEC §7.2 for the authoritative list)
  - `::part()` names (see SPEC §7.3)
  - Any new variable or part must be added to SPEC before use — do not invent surface area ad-hoc.

## Markdown / user content

- Rendering user or assistant message content goes through the allowlisted Markdown pipeline in `src/core/markdown.ts`. Do not bypass it and do not add new inline renderers.
- Links: `href` must start with `http://` or `https://`. Enforce `target="_blank"` and `rel="noopener noreferrer"`. Anything else → render as plain text.
- Assistant output is treated with the same suspicion as user input (prompt injection from the LLM can produce hostile markup).

## Public API surface

- Attributes / properties / methods / events exposed on `<chat-widget>` or the `ChatWidget` class are all listed in SPEC §4. Adding a new one requires a SPEC update first.
- Dispatch events via `EventTarget` + `CustomEvent` — do not expose callback props.

## Accessibility

- Panel is **non-modal** (`role="complementary"`, no `aria-modal`, no focus trap). See SPEC §9.
- Message log uses a two-container pattern (`aria-live="polite"` only on the committed-messages container; streaming container is silent) to avoid screen-reader spam during delta updates.
- Keyboard: Enter = send, Shift+Enter = newline, Esc = close panel.
