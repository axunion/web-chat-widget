# Implementation Plan — Feature Wave 2

Sequenced implementation plan for every item currently marked **(planned)** in
[ARCHITECTURE.md](./ARCHITECTURE.md) and [API.md](./API.md). The specs there are
authoritative; this file adds the execution detail (order, files, tests,
acceptance criteria) so each phase can be implemented without re-deriving design
decisions.

## How to work this plan

- **One phase = one TDD cycle = one commit-sized unit.** Follow red-green-refactor
  as defined in CLAUDE.md: write the failing tests listed under *Tests first*,
  then the minimal implementation, then refactor.
- **Docs are already updated.** When a phase ships, remove its **(planned)**
  markers from ARCHITECTURE.md / API.md in the same change. Nothing else in the
  docs should need editing — if it does, the docs were wrong; fix them first.
- Phases are ordered by dependency. P1 → P2 → P3 must be sequential. P4–P10 are
  mutually independent and can be done in any order after P3.
- After each phase: `pnpm check && pnpm typecheck && pnpm test` must pass.
- When a phase finishes the whole wave (last phase done), run `/spec-sync` — it
  should report no `(planned)` markers left.
- CLAUDE.md / AGENTS.md mirror rule applies if either is touched (see CLAUDE.md
  §Language Policy for the diff command).

## Phase overview

| Phase | Feature | Layer | Depends on |
| --- | --- | --- | --- |
| P1 | Engine busy state, `stop()`, abort settlement | core | — |
| P2 | Save-on-error, `message` event for user role | core | P1 |
| P3 | Busy UI: stop button, `busy` forwarding, widget `stop()` | ui | P1 |
| P4 | Adapter `timeoutMs` + `api-timeout` attribute | adapters, ui | P3 (attribute wiring only) |
| P5 | Declarative config: `welcome-message`, `max-input-length` | ui | — |
| P6 | Focus management + panel-wide `Esc` | ui | — |
| P7 | Unread badge on FAB | ui | — |
| P8 | `markdownToPlainText` for the aria-live region | core, ui | — |
| P9 | Code block copy button + textarea auto-grow | ui | — |
| P10 | CI workflow + CHANGELOG scaffold | infra | all (last) |

---

## P1 — Engine busy state, `stop()`, abort settlement

**Problem being fixed:** an aborted in-flight send (new `sendMessage()` /
`retry()` while streaming) leaves the previous assistant message with
`status: "streaming"` forever, and the engine exposes no in-flight state and no
way to cancel a generation without wiping history.

**Spec:** ARCHITECTURE.md §Busy state and stop; API.md §2.2 (`stop`), §2.2.1
(`busy`), §2.3/§2.4 (`busy` event).

### Design

- `ChatEngine` gains:
  - `get busy(): boolean` — private `busyState` flag.
  - `stop(): void` — public; also reused internally for settlement.
  - `busy` event added to `ChatEventMap` in `src/core/events.ts`:
    `busy: { busy: boolean }`. Dispatch **only on transitions** (guard against
    redundant dispatch when a busy send is superseded by another send).
- **Settlement rule** (single helper, e.g. `settleStreaming()`): find the
  trailing assistant message with `status: "streaming"`:
  - `content !== ""` → set `status: "done"`, `store.save(messages)`.
  - `content === ""` → remove it from `messages`, `store.save(messages)`.
  - Never dispatch `message` for settled-by-stop content.
- `stop()`: no-op when idle. When busy: abort controller, run settlement, set
  busy `false` (dispatch event).
- `sendMessage()` / `retry()` while busy: run the same settlement **before**
  mutating history for the new exchange (abort first, settle, then push the new
  user message / splice). Busy stays `true` across the transition — no
  `true→false→true` event flicker. Implementation note: the existing
  `this.controller === controller` guard in `runAdapter`'s `finally` is the
  right place to gate the busy-off transition, mirroring how the controller
  reset already works (`src/core/engine.ts:135`).
- Natural terminal paths also settle busy: `done` chunk, `error` chunk, thrown
  error, and generator completion without `done`.
- `clear()` and `destroy()`: abort as today; `clear()` empties history so no
  settlement is needed, but busy must transition to `false` (with event).
- `ObservableEngine` gains `stop(): void` (delegates + `notify()`) and
  `get busy()`. Not public API — no API.md entry.

### Files

- `src/core/events.ts` — add `busy` to `ChatEventMap`.
- `src/core/engine.ts` — busy flag, `stop()`, settlement, event dispatch.
- `src/ui/observable-engine.ts` — `stop()` wrapper, `busy` getter.

### Tests first

Extend `tests/core/engine.test.ts` (or add `tests/core/engine.busy.test.ts`),
using the scripted fakes in `tests/helpers/fake-adapters.ts`:

1. `busy` is `false` initially, `true` while the adapter iterates, `false`
   after `done`.
2. `busy` event fires `{ busy: true }` on send start and `{ busy: false }` on
   settle; no duplicate events for send-while-busy (stays `true`).
3. `stop()` during streaming with partial content: message keeps content,
   `status === "done"`, `store.save` called, **no** `message` event.
4. `stop()` before any delta: streaming placeholder removed, user message
   remains, `store.save` called.
5. `stop()` when idle: no-op (no event, no save).
6. `sendMessage()` while streaming: previous assistant message is settled
   (never left `"streaming"`), new exchange proceeds, and the settled partial
   is included in the messages passed to the adapter.
7. `retry()` while streaming: same settlement guarantee.
8. `clear()` while streaming: busy transitions to `false` with event.
9. `busy` event also fires `false` on `error` chunk.

`tests/ui/observable-engine.test.ts`: `stop()` triggers a listener
notification; `busy` reflects the engine.

### Acceptance

- No code path can leave a message with `status: "streaming"` once its request
  is no longer in flight.
- API.md §2.2/§2.2.1/§2.3/§2.4 and ARCHITECTURE.md §Busy state markers removed.

---

## P2 — Save-on-error + `message` event for user role

**Problem being fixed:** an `error` chunk never persists, so a reload loses the
user's message; hosts cannot observe user messages via events even though
`ChatEventMap` types allow `role: "user"`.

**Spec:** ARCHITECTURE.md §Save timing (error/stop bullets); API.md §2.3
(`message` row).

### Design

- In `runAdapter`'s `error` branch (`src/core/engine.ts:125`): call
  `this.store?.save(this.messages)` after setting `status: "error"` (the
  error-status assistant message is persisted; on reload it renders with its
  retry button — `log.ts` already handles `status: "error"` rendering).
- In `sendMessage()`: after pushing the user message, dispatch
  `createChatEvent("message", { role: "user", content: text })`. `retry()` does
  **not** re-dispatch for the re-sent user message (it was announced when first
  sent).
- Check the stored-message validation in `src/core/store.ts` accepts
  `status: "error"` (it should already; add a test).

### Files

- `src/core/engine.ts` — two small additions.
- `src/core/store.ts` — only if validation rejects `"error"` status.

### Tests first

1. Engine: `error` chunk → `store.save` called with the user message and the
   `status: "error"` assistant message.
2. Engine: `sendMessage("hi")` dispatches `message` with
   `{ role: "user", content: "hi" }` before the assistant `message` event.
3. Engine: `retry()` does not dispatch a user `message` event.
4. Store: a persisted `status: "error"` message round-trips through
   `load()` (not discarded by validation).
5. Widget (`tests/ui/widget.events-forwarding.test.ts`): user `message` event
   is forwarded on the element. **Check existing assertions** — any test
   asserting `message` fires only once per exchange must be updated to expect
   the user event too.

### Acceptance

- Reload after an error shows the user message and the error row.
- Markers removed from the two doc locations.

---

## P3 — Busy UI: stop button, event forwarding, widget `stop()`

**Spec:** ARCHITECTURE.md §Busy state and stop (UI paragraph); API.md §2.2
(`stop`), §2.2.1 (`busy`), §3.3 (`stop-button`), §6.1 (`stopButton` label).

### Design

- `LabelDictionary` + locales in `src/core/i18n.ts`: add `stopButton`
  (en `"Stop"` / ja `"停止"`). Update any i18n test asserting the key count.
- `ChatWidget`:
  - `stop(): void` → `this.observable?.stop()`.
  - `get busy(): boolean` → `this.observable?.busy ?? false`.
  - Forward the engine `busy` event (extend `forwardEngineEvent` union in
    `src/ui/widget.ts:203`).
  - Subscribe to `busy` to toggle input UI state.
- `src/ui/input.ts`: `InputHandle` gains `setBusy(busy: boolean)`:
  - Busy: button label/aria-label switch to `stopButton`, `part` switches to
    `stop-button`, a `data-busy` attribute set for internal styling.
  - Idle: revert to `sendButton` / `send-button`.
  - `applyLabels` must respect the current busy state when re-applying.
- `src/ui/widget.ts` `wireInputHandlers`: the button click submits when idle,
  calls `this.stop()` when busy. `Enter` while busy: `preventDefault`, no-op.
  Textarea stays enabled.
- `src/ui/styles.ts`: minimal `.send-button[data-busy]` styling (e.g. error /
  neutral color shift). No new CSS variables.

### Files

- `src/core/i18n.ts`, `src/ui/input.ts`, `src/ui/widget.ts`,
  `src/ui/styles.ts`.

### Tests first

New `tests/ui/widget.busy-ui.test.ts` (+ extend `tests/core/i18n.test.ts`):

1. While a scripted adapter is mid-stream: button `part` contains
   `stop-button` and its text is the `stopButton` label; after `done` it
   reverts to `send-button` / `sendButton`.
2. Clicking the button while busy stops the stream (partial content settles to
   `done`), and does not send the textarea draft.
3. `Enter` while busy neither sends nor stops; the draft text is preserved.
4. `widget.busy` getter reflects in-flight state; `busy` events fire on the
   element.
5. `widget.stop()` public method works when panel UI is untouched.
6. i18n: `stopButton` present in both locales; partial override works.

### Acceptance

- A user can always halt a generation from the UI without losing history.
- Markers removed (API.md §2.2, §2.2.1, §2.3/2.4 UI parts, §3.3 `stop-button`,
  §6.1 `stopButton`; ARCHITECTURE.md busy-UI paragraph).

---

## P4 — Adapter `timeoutMs` + `api-timeout` attribute

**Spec:** ARCHITECTURE.md §Timeouts; API.md §4.2/§4.3 (`timeoutMs`), §3.1/§3.2
(`api-timeout`).

### Design

- Shared helper in `src/adapters/internal.ts`, e.g.
  `createTimeoutController(outer: AbortSignal, timeoutMs?: number)` returning
  `{ signal, arm(), disarm(), timedOut: boolean }`:
  - Composes an internal `AbortController` with the outer signal via explicit
    `addEventListener("abort", ...)` (do **not** rely on `AbortSignal.any` —
    keep happy-dom compatibility), cleaning the listener up on disarm.
  - `arm()` (re)starts the `setTimeout`; `disarm()` clears it.
- `openai-sse.ts`: pass the composed `signal` to `fetch`; `arm()` before the
  fetch and after every successful `reader.read()`; `disarm()` in `finally`.
  When a rejection occurs and `timedOut` is set (outer signal not aborted) →
  yield `{ type: "error", error: new Error(\`Timed out after ${timeoutMs}ms\`) }`.
- `json.ts`: `arm()` once before fetch, `disarm()` after the body is read.
  Same error mapping.
- `timeoutMs` undefined → helper degenerates to a pass-through of the outer
  signal (zero behavior change).
- Widget `buildAdapterFromAttributes` (`src/ui/widget.ts:305`): parse
  `api-timeout` with `Number.parseInt`; pass as `timeoutMs` only when a finite
  positive number. Ignored when the `adapter` option is supplied.

### Tests first

Extend `tests/adapters/openai-sse.test.ts` / `tests/adapters/json.test.ts`
(use `vi.useFakeTimers()` and a `fetchImpl` that never resolves / a
`ReadableStream` that stalls):

1. SSE: no response within `timeoutMs` → one `error` chunk, message contains
   "Timed out".
2. SSE: stream that stalls between chunks longer than `timeoutMs` → deltas
   received so far were yielded, then `error`.
3. SSE: steady stream slower in *total* than `timeoutMs` but with small gaps →
   completes with `done` (timer re-arms per read).
4. SSE/JSON: outer abort during the wait → generator ends silently, **no**
   timeout error chunk.
5. JSON: total time exceeding `timeoutMs` → `error` chunk.
6. Both: `timeoutMs` unset → behavior identical to today (existing tests stay
   green untouched).
7. Widget (`tests/element.test.ts` or new): `api-timeout="5000"` reaches the
   adapter (observable via a stalling `fetchImpl`? simpler: assert through
   behavior with fake timers, or export nothing — test at the attribute-parsing
   level by timing out a mocked fetch).

### Acceptance

- A dead backend surfaces the standard inline error row within `timeoutMs`.
- Markers removed (API.md §3.1/§3.2/§4.2/§4.3, ARCHITECTURE.md §Timeouts).

---

## P5 — Declarative config: `welcome-message`, `max-input-length`

**Spec:** ARCHITECTURE.md §Floating UI (welcome message, input length cap);
API.md §2.1 (`maxInputLength`), §3.1/§3.2.

### Design

- `resolveConfig` in `src/ui/widget.ts`:
  - `initialMessages`: `opts?.initialMessages` wins; otherwise a non-empty
    `welcome-message` attribute becomes
    `[createMessage("assistant", text, { status: "done" })]`. Stored history
    winning over `initialMessages` is already engine behavior — no engine
    change.
  - `maxInputLength`: `opts?.maxInputLength` or parsed `max-input-length`
    attribute (finite positive integer, else ignored).
- `src/ui/input.ts`: `buildInput` (or an `InputHandle.setMaxLength`) applies
  `maxlength` to the textarea. Mount-time only — not in `observedAttributes`.

### Tests first

New `tests/ui/widget.declarative-config.test.ts`:

1. `<chat-widget api-url welcome-message="Hi!">` renders one assistant bubble
   with "Hi!"; `getMessages()` contains it.
2. `welcome-message` + existing stored history (pre-seeded store key): stored
   history wins, greeting absent.
3. `initialMessages` option + `welcome-message` attribute: option wins.
4. `max-input-length="10"` → textarea has `maxlength="10"`.
5. `maxInputLength: 10` option → same.
6. Invalid values (`"0"`, `"abc"`, `"-5"`) → no `maxlength` attribute.
7. `sendMessage("longer than ten chars…")` still works (no programmatic limit).

### Acceptance

- A script-tag embed can ship a greeting and input cap with zero JS.
- Markers removed (API.md §2.1/§3.1/§3.2, ARCHITECTURE.md two bullets).

---

## P6 — Focus management + panel-wide `Esc`

**Spec:** ARCHITECTURE.md §Accessibility (focus management paragraph, keyboard
table); no API surface.

### Design

- `ChatWidget.open()`: after `panel.setOpen(true)`, call
  `textarea.focus({ preventScroll: true })` (guard with `try/catch` for exotic
  environments). Only when open is user/API triggered — which is every path.
- `ChatWidget.close()`: if `this.shadow.activeElement` is inside `panel.root`,
  call `fab.root.focus()` after closing.
- Move the `Escape` handling from the textarea `keydown`
  (`src/ui/widget.ts:248`) to a `keydown` listener on `panel.root`
  (`Enter` handling stays on the textarea).

### Tests first

New `tests/ui/widget.focus.test.ts` (happy-dom supports focus/activeElement):

1. `open()` → `shadowRoot.activeElement` is the textarea.
2. `Esc` pressed on the close button (not the textarea) → panel closes.
3. `close()` while focus is inside the panel → `shadowRoot.activeElement` is
   the FAB.
4. `close()` while focus is on the host page → host focus untouched.
5. Existing `Esc`-in-textarea test stays green.

### Acceptance

- Keyboard-only round trip: FAB → Enter → type → Esc → focus back on FAB.
- Markers removed (ARCHITECTURE.md focus paragraph + keyboard table row).

---

## P7 — Unread badge on FAB

**Spec:** ARCHITECTURE.md §Floating UI (unread badge); API.md §3.3 (`badge`),
§6.1 (`unreadBadge`).

### Design

- `LabelDictionary`: add `unreadBadge` (en `"New message"` / ja
  `"新着メッセージ"`).
- `src/ui/fab.ts`: `FabHandle.setUnread(unread: boolean)` toggles a badge
  `<span part="badge" class="badge">` containing a `.sr-only` span with the
  `unreadBadge` label (the visual dot is CSS; `.sr-only` class already exists
  for the live region). Badge hidden by default. `applyLabels` updates the
  sr-only text.
- `src/ui/widget.ts`: in the existing engine `message` forwarding path, when
  `detail.role === "assistant"` and `!this.isOpen` → `fab.setUnread(true)`.
  `open()` → `fab.setUnread(false)`. (Stops/errors never fire `message`, so
  they can't raise the badge — spec'd behavior falls out of P1/P2.)
- `src/ui/styles.ts`: badge dot styling using `--cw-color-error` or
  `--cw-color-primary` (pick primary; no new variable).

### Tests first

New `tests/ui/widget.unread-badge.test.ts` (+ i18n key test):

1. Assistant `done` while panel closed → badge element visible with sr-only
   `unreadBadge` text.
2. Assistant `done` while panel open → no badge.
3. Badge visible → `open()` clears it.
4. Adapter `error` while closed → no badge.

### Acceptance

- Markers removed (API.md §3.3 `badge`, §6.1 `unreadBadge`; ARCHITECTURE.md
  bullet). Label key-count phrasing in both docs updated as keys ship.

---

## P8 — `markdownToPlainText` for the aria-live region

**Spec:** ARCHITECTURE.md §aria-live pattern; internal only, no API.md surface.

### Design

- `src/core/markdown.ts`: export `markdownToPlainText(source: string): string`
  from the module (do **not** re-export from `src/index.ts`). Reuse the
  existing tokenizer; render tokens to a string: strip `**`/`*`/`_`/backticks
  and code fences (keep code text and language-less content), links →
  `"text (url)"`, list markers → `"- "` / `"1. "` kept, blank-line paragraph
  separation preserved as `"\n\n"`.
- `src/ui/log.ts` `announceCompleted` (`src/ui/log.ts:125`): assign
  `markdownToPlainText(message.content)` via `textContent` (sink unchanged).

### Tests first

New `tests/core/markdown-plaintext.test.ts` + extend
`tests/ui/widget.aria-live.test.ts`:

1. Bold/italic/inline-code markers stripped, text preserved.
2. Code fence: backticks and language hint dropped, code body preserved.
3. Link: `[docs](https://example.com)` → `docs (https://example.com)`;
   disallowed-scheme links degrade the same way the DOM renderer does (plain
   text of the original source).
4. Unrecognized/hostile syntax stays inert plain text.
5. aria-live container receives the plain-text version (no `**` in
   `textContent`) after `done`.

### Acceptance

- Screen readers hear prose, not Markdown. Marker removed from
  ARCHITECTURE.md; drop the "Current limitation" phrasing entirely.

---

## P9 — Code block copy button + textarea auto-grow

**Spec:** ARCHITECTURE.md §Floating UI (copy button, auto-grow); API.md §3.3
(`copy-button`), §6.1 (`copyCode` / `copyCodeDone`).

### Design

- Labels: `copyCode` (en `"Copy"` / ja `"コピー"`), `copyCodeDone` (en
  `"Copied"` / ja `"コピーしました"`).
- Copy button (in `src/ui/log.ts`, **not** in `core/markdown.ts` — the parser
  stays a pure Markdown→DOM transform):
  - After `updateMessageNode` renders assistant content, iterate
    `node.querySelectorAll("pre")`; wrap or position a
    `<button part="copy-button" type="button">` per block.
  - Skip entirely when `navigator.clipboard?.writeText` is unavailable.
  - Click → `writeText(codeEl.textContent ?? "")`; on success set label to
    `copyCodeDone`, revert after ~2 s (`setTimeout`; store the handle and
    clear it if the node re-renders). Failures are silent (console.warn at
    most).
  - Re-renders during streaming recreate buttons — acceptable; buttons only
    matter on settled messages, but no special-casing needed.
- Auto-grow (in `src/ui/widget.ts` or `input.ts`): on textarea `input` event:
  `style.height = "auto"; style.height = \`${Math.min(scrollHeight, MAX)}px\``
  where `MAX` mirrors the CSS `max-height` (120). Reset height after a
  successful submit. Note: happy-dom reports `scrollHeight` as 0 — test only
  that the handler runs and resets on submit; visual behavior is verified in
  the demo pages.

### Tests first

New `tests/ui/widget.copy-code.test.ts`:

1. Assistant message with a code fence renders a `part="copy-button"` button
   inside/adjacent to the `<pre>`.
2. Click → `navigator.clipboard.writeText` (mocked) called with the exact code
   text; label switches to `copyCodeDone`, reverts after timers advance.
3. Clipboard API absent → no button rendered.
4. User messages / non-code assistant messages → no button.
5. Auto-grow: textarea height style resets after submit.

### Acceptance

- Markers removed (API.md §3.3 `copy-button`, §6.1 two keys; ARCHITECTURE.md
  two bullets). Once P3/P7/P9 have all shipped, normalize the LabelDictionary
  count phrasing to a plain "19 keys" in API.md §6.1, ARCHITECTURE.md §i18n,
  and CLAUDE.md / AGENTS.md (mirror rule).

---

## P10 — CI workflow + CHANGELOG scaffold

**Spec:** none (config files — TDD exception per CLAUDE.md).

### Design

- `.github/workflows/ci.yml`:
  - Triggers: `push` to `main`, `pull_request`.
  - Steps: checkout → `pnpm/action-setup` → `actions/setup-node` (node 24,
    pnpm cache) → `pnpm install --frozen-lockfile` → `pnpm check` →
    `pnpm typecheck` → `pnpm test` → `pnpm build`.
  - Optional follow-up job (non-blocking): print
    `dist/chat-widget.iife.js` raw/gzip size next to
    `bundle-size-baseline.json` for the log (the bundle-size-checker agent
    remains the review-time gate; baseline updates stay a human decision).
- `CHANGELOG.md` at repo root: Keep-a-Changelog skeleton with an `Unreleased`
  section listing this wave's user-facing additions. README's "CHANGELOG — to
  be added with the first release" line gets updated to link it.

### Acceptance

- CI green on a PR containing this wave. README link updated.

---

## Explicitly deferred (stays in Future Work)

- Message timestamps in the UI — needs a locale-aware formatting decision;
  `createdAt` is already persisted so this loses nothing by waiting.
- Automatic retry with backoff — interacts with busy/stop semantics; revisit
  after P1–P3 have soaked.
- System-prompt attribute — rejected, not deferred: prompts are trusted input
  and belong in the backend proxy (see ARCHITECTURE.md §Floating UI, welcome
  message bullet).
