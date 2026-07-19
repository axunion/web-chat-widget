# Architecture

Design decisions and invariants for `web-chat-widget`. API signatures and usage examples are in [API.md](./API.md). New to the widget? Start with [GETTING-STARTED.md](./GETTING-STARTED.md).

---

## Overview

`web-chat-widget` is a floating AI chat UI that can be embedded in any web page.

- A FAB (Floating Action Button) in a page corner opens a chat panel.
- User input is sent to a backend API; the assistant response is streamed in place.
- The backend API format is swappable via an **adapter**.
- History persistence is **opt-in** via a **store**.

**Goals:**

- Run entirely on Web standards. Zero runtime dependencies.
- Render correctly regardless of the host page's CSS.
- Provide both a declarative (`<chat-widget>`) and an imperative (`new ChatWidget()`) API.
- Default to OpenAI-compatible SSE while letting integrators substitute any backend.
- Support opt-in client-side history persistence.
- Let integrators override theme via CSS Custom Properties.
- Meet baseline accessibility requirements (keyboard, `aria-live`, sufficient contrast).
- Support Japanese and English UI labels, with all labels overridable.

---

## Distribution & Entry Points

The package ships five artifacts. CSS is not distributed as a separate file — it is embedded as a string in the JS bundle and injected as a `<style>` element inside the Shadow Root.

UMD is not provided; ESM + IIFE covers both use cases.

**Export design decisions:**

- `package.json` exposes only three export paths: `"."`, `"./element"`, `"./adapters"`. Unimplemented paths (e.g. `"./react"`) are never added to the public exports until the file ships.
- **Side-effect isolation:** Importing `"."` does not register the custom element. Call `customElements.define` explicitly via `"./element"`, or use the IIFE bundle which registers it automatically.
- The IIFE attaches the class to `window.ChatWidget` and sets up `ChatWidget.adapters` / `ChatWidget.stores` namespaces so CDN users get a single `<script>` tag workflow.

**Packaging decisions (npm publish):**

- **Demo HTML never ships.** `scripts/copy-demo.mjs` copies `demo/*.html` into `dist/` so `vite preview` can serve them next to the built IIFE, but the npm tarball excludes them via a `files` negation (`"!dist/*.html"`). The demo pages are a verification surface, not a product artifact.
- **`sideEffects` is declared as an array**, not `false`. `dist/element.js` (registers the custom element on import) and `dist/chat-widget.iife.js` (mutates `window`) are side-effectful; everything else — `dist/index.js`, `dist/adapters.js`, and the shared chunks — is pure and safe to tree-shake. A blanket `false` would let bundlers drop the element registration.
- **CDN discovery via `unpkg` / `jsdelivr` fields**, both pointing at `dist/chat-widget.iife.js`. No `./iife` entry is added to the `exports` map: `exports` subpaths imply module semantics, and the IIFE build is `<script src>`-only. ESM consumers who want the registration side effect already have `"./element"`.
- **`prepack` runs the full build.** `dist/` is git-ignored, so packing from a fresh checkout must produce it; `prepack` covers both `pnpm pack` and `pnpm publish`.
- **Release steps that stay manual:** removing `"private": true` and setting the first real version are human decisions made at release time, never automated.

---

## Core Invariants

These constraints are non-negotiable. Any change that violates one is a breaking architectural decision, not a refactor.

| Invariant | Rationale |
| --- | --- |
| **Zero runtime dependencies** | Supply-chain safety. No bundle bloat. Can be embedded anywhere without version conflicts. Use Web APIs; write your own Markdown parser, SSE parser, etc. |
| **UI lives entirely inside Shadow DOM** | Prevents host page CSS from leaking in. The widget renders consistently on any site. |
| **Engine / UI separation** | `ChatEngine` holds state and drives the adapter with no DOM dependency. The UI layer only renders. A future React wrapper can reuse `ChatEngine` as-is. |
| **Adapter interface is `AsyncIterable<AdapterChunk>`** | See Adapter Contract below. |
| **Non-modal panel** | The panel must not block the host page (see Accessibility). |
| **No `innerHTML` / `insertAdjacentHTML`** | XSS prevention. DOM is always built via `createElement` + `textContent`. |

---

## API Design

### Two-track API

The widget exposes two APIs that must offer identical functionality:

- **Declarative** (`<chat-widget>` custom element) — for CMS / no-build embed via `<script>` tag.
- **Imperative** (`new ChatWidget()` / `ChatWidget.mount()`) — for npm consumers who need lifecycle control or multiple instances.

### EventTarget inheritance

`ChatWidget` extends `HTMLElement` (and thus `EventTarget`). Notifications are dispatched via `addEventListener` / `dispatchEvent`. Callback props are intentionally absent because:

- Framework-neutral: React wrappers use `useEffect` to subscribe.
- Multiple listeners compose naturally.
- `signal` enables clean teardown.

All events have `bubbles: false`, `composed: false` — they do not cross the Shadow DOM boundary.

### Dynamic attribute change rules

Some attributes can be changed at runtime; others require recreating the element via JS:

| Attribute | Live change reflected | Reason |
| --- | --- | --- |
| `open` / `position` / `locale` / `theme` | Yes | Display-only; no engine rebuild required |
| `api-url` / `api-mode` | No | Changing the adapter after mount requires rebuilding the engine |
| `persist` / `persist-key` | No | Changing the store after mount requires rebuilding the engine |

### Multiple instances

Multiple `ChatWidget` instances on the same page are technically allowed, but `z-index` and FAB position will conflict. If multiple instances are needed, set distinct `--cw-z-index` and `position` per instance.

---

## Shadow DOM & Style Customization

### Why Shadow DOM

Shadow DOM encapsulates widget styles from the host page in both directions — host CSS cannot bleed into the widget, and widget CSS cannot leak out.

### CSS Custom Properties

CSS variables are the primary styling surface. They inherit through the Shadow DOM boundary, so any variable set on `chat-widget` (or a parent) is visible inside the Shadow Root:

```css
chat-widget {
  --cw-color-primary: #ff5722;
}
```

The authoritative list of exposed variables is in [API.md §7](./API.md#7-css-customization). The single source of truth for their runtime values is `src/core/theme.ts::THEME_TOKENS`.

**Governance:** Variable names and purposes are defined here first (or in API.md); implementation (`THEME_TOKENS`) follows. Never add a variable to the implementation without updating the documentation.

### `::part()` selectors

For DOM-level overrides that go beyond what CSS variables allow, selected elements expose a `part` attribute. The full list is in [API.md §3.3](./API.md#33-part-selectors).

### Theme

`theme: "light" | "dark" | "auto"`. The `"auto"` value follows `prefers-color-scheme` and switches in real time. Inside the Shadow Root, `[data-theme="light"]` or `[data-theme="dark"]` is always set on the root element.

---

## Message Model

### Roles

| Role | Source | Rendering |
| --- | --- | --- |
| `user` | Typed by the user | Plain text only |
| `assistant` | Backend response | Markdown pipeline (see below) |
| `system` | Host-injected (e.g. `initialMessages`) | Markdown pipeline, muted styling |

### Markdown scope

The Markdown parser is hand-written (zero-deps constraint). The supported feature set is intentionally minimal and fixed:

| Syntax | Supported |
| --- | --- |
| Paragraphs (blank-line separated) | Yes |
| Line breaks (trailing double-space or `\n`) | Yes |
| `**bold**` | Yes |
| `*italic*` / `_italic_` | Yes |
| `` `inline code` `` | Yes |
| Triple-backtick code blocks | Yes (language hint ignored) |
| `[text](url)` links | Yes (with link constraints below) |
| `- ` / `* ` unordered lists | Yes |
| `1.` ordered lists | Yes |
| Headings `#` | No — excessive in chat context |
| Tables | No |
| Images `![](...)` | No |
| Raw HTML | No |
| Syntax highlighting | No |

Markdown is applied only to `assistant` and `system` messages. `user` messages are rendered as plain text (`textContent` only).

### Sanitization

- The parser produces a token stream; DOM is built with `document.createElement` + `textContent` + `appendChild` only. No string is ever assigned to `innerHTML`.
- Unrecognized syntax is always rendered as escaped plain text.
- Assistant output is treated with the same suspicion as user input — a malicious LLM response cannot inject active DOM nodes.

### Link constraints

- `href` must match `^https?://`. Any other scheme (`javascript:`, `data:`, `vbscript:`, etc.) causes the link to degrade to plain text.
- All links force `target="_blank"` and `rel="noopener noreferrer"`.

### Streaming model

As `text-delta` chunks arrive from the adapter, the most recent assistant message's content is updated in place and the Markdown renderer re-runs. When the `done` chunk arrives the message transitions to `status: "done"`. A blinking caret is shown while `status` is `"streaming"`.

### Error and retry

When the adapter yields an `error` chunk, an inline error row with a retry button appears in the affected message. `retry()` drops the last assistant message and re-sends the last user message through the same adapter.

### Busy state and stop

The engine exposes a single boolean `busy` state: `true` from the moment `sendMessage()` / `retry()` starts until the exchange settles (`done`, `error`, or stop). Transitions dispatch a `busy` event (`{ busy: boolean }`), forwarded by the widget like `message` / `error`.

At most one request is in flight. Starting a new send or retry while busy first **settles** the previous exchange exactly like `stop()` (below) — a previous assistant message must never be left with `status: "streaming"` after its request is aborted. The settled partial response stays in the history and is therefore included as context in the next request (it is what the user sees on screen).

`stop()` aborts the in-flight request and settles the streaming assistant message:

- Partial content exists → keep it, set `status: "done"`, persist via `store.save()`.
- No content yet → remove the placeholder entirely (the user message stays), persist.
- The `message` event is **not** fired for a stopped response — it signals only naturally completed messages.
- `stop()` while idle is a no-op. No new `MessageStatus` value is introduced; a stopped partial is a normal `"done"` message (avoids a store schema bump).

The UI reflects `busy` by swapping the send button into a stop button (its `part` switches from `send-button` to `stop-button`, label key `stopButton`). While busy, `Enter` in the textarea is ignored (no accidental double-send, no accidental stop); the textarea itself stays editable — the panel is non-blocking.

---

## Adapter Contract

### Why `AsyncIterable<AdapterChunk>`

Streaming (SSE) and non-streaming (single JSON response) use the **same interface**:

```ts
interface ChatAdapter {
  send(messages: readonly Message[], signal: AbortSignal): AsyncIterable<AdapterChunk>;
}

type AdapterChunk =
  | { type: "text-delta"; delta: string }
  | { type: "done" }
  | { type: "error"; error: Error };
```

A streaming adapter yields multiple `text-delta` chunks then `done`. A non-streaming adapter yields one `text-delta` then `done`. The engine (`ChatEngine`) is unaware of which mode is in use.

### AbortSignal obligation

The adapter **must** forward `signal` to `fetch` and check `signal.aborted` between chunks. The engine fires the signal when `clear()`, `destroy()`, or a superseding `sendMessage()` / `retry()` cancels an in-flight request — and when `stop()` is called.

### Error-not-throw

Network failures, HTTP errors, and JSON parse errors must all be yielded as `{ type: "error", error }`. Synchronous throws from inside `send` are forbidden. This keeps error handling at the engine call-site to a single code path.

### Timeouts

The `ChatAdapter` contract itself has no timeout — it is a per-adapter concern, so custom adapters stay free to define their own semantics. Both built-in adapters accept an opt-in `timeoutMs`:

- `createOpenAISseAdapter`: bounds the wait for response headers **and** the inactivity gap between SSE reads. A steadily streaming response never times out, no matter how long it runs in total.
- `createJsonAdapter`: bounds the whole request.

On timeout the adapter aborts its own (internal) fetch controller and yields `{ type: "error", error }` — the error-not-throw invariant holds. There is no default value: unset preserves current behavior, and production deployments are advised to set it. The declarative `api-timeout` attribute maps to this option.

### Built-in mock adapter

`createMockAdapter` ships as a third built-in adapter even though it talks to no backend. Rationale: the dev playground, the IIFE demo page, and any integrator evaluating the widget all need the same "stream a canned reply with realistic latency" behavior, and before it shipped each surface hand-rolled its own copy (which drifted). One public factory costs a few hundred bytes in the IIFE and removes the duplication. It is a demo/evaluation tool — automated tests keep using purpose-built scripted fakes (`tests/helpers/fake-adapters.ts`) because they need chunk-level control.

### Authentication

Putting API keys in the browser is insecure. The built-in adapters target **your own backend proxy**, not the LLM provider directly. The proxy runs server-side, attaches the key, and forwards the request. A working reference implementation is in [`examples/backend`](../examples/backend) (Hono).

The `headers` option on the built-in adapters lets you attach cookies or bearer tokens for proxy authentication. CORS and CSRF on the proxy endpoint are the integrator's responsibility.

---

## ChatStore

### Motivation

History disappears on page reload by default. Persistence is opt-in because the right choice (localStorage, sessionStorage, remote sync, or none) depends on the embedding site's requirements. `ChatStore` is the second seam alongside `ChatAdapter`.

### Interface

```ts
interface ChatStore {
  load(): Message[];                         // called once synchronously in the engine constructor
  save(messages: readonly Message[]): void;  // called when state is settled
  clear(): void;                             // purges the persistent layer
}
```

### Why sync

All public methods are synchronous so `ChatEngine`'s constructor and state-update paths stay synchronous. `localStorage` / `sessionStorage` are sync APIs, so this is free. For async backends (IndexedDB, remote sync), the pattern is: **factory is async, the resulting store is sync**:

```ts
const store = await createIndexedDbStore({ ... });
new ChatWidget({ store }); // engine runs synchronously from here
```

### Save timing

`save()` is called after:
- A `done` chunk confirms an assistant message.
- `clear()` empties the history.
- `retry()` splices the history.
- An `error` chunk settles the exchange — the user message and the `status: "error"` assistant message are persisted, so a reload never loses the user's input. A reloaded error message renders with its retry button intact.
- `stop()` settles a partial response (see [Busy state and stop](#busy-state-and-stop)).

`save()` is **not** called on every `text-delta` (write cost + risk of garbage on stream interruption), nor immediately when the user message is appended (it's saved atomically with the assistant response).

### Load timing

`store.load()` is called synchronously during `ChatEngine` construction. When both `initialMessages` and stored history exist, the **stored history wins** (continue an existing conversation rather than re-injecting initial messages).

### Storage format and versioning

```json
{ "v": 1, "messages": [] }
```

Parse failure, `v` mismatch, missing `messages` array, or invalid message schema → discard and start fresh. Schema-breaking changes increment `v`; old versions are discarded without migration (migration not implemented in v1).

### Quota handling

On `QuotaExceededError` from `localStorage.setItem`:
1. Drop the oldest half of messages and retry once.
2. If it still fails, fall back to an in-memory store for the remainder of the session (silent `console.warn`).
3. No UI notification — a store failure must not break the chat experience.

### Storage exception resilience

Private browsing modes and hardened browsers may throw on `localStorage` access. The factory probes storage with a sentinel key/value on construction. If the probe fails, the factory returns a memory store transparently.

### `clear()` responsibility

`ChatWidget.clear()` triggers:
1. In-memory history cleared and any in-flight request aborted.
2. `store.clear()` purges the persistent layer.
3. UI re-renders to empty state.

A clear button in the panel header also calls `clear()` after a `window.confirm` prompt (non-modal — no custom dialog).

### Privacy

Enabling persistence stores the user's conversation in browser storage. The embedding site is responsible for:
- Disclosing storage use in its privacy policy.
- Aligning with cookie-consent flows where applicable.
- Choosing `createSessionStorageStore` or disabling persistence on shared devices.

---

## Floating UI Behavior

Key design decisions:

- **Initial state:** closed unless the `open` attribute / option is set.
- **Position:** one of four corners via `position`; screen-edge offset is adjustable via `--cw-offset`.
- **Responsive:** below 640 px viewport width, the panel expands to full screen. The non-modal invariant still holds even in full-screen mode.
- **Reduced motion:** open/close transitions are disabled when `prefers-reduced-motion: reduce` is set.
- **Scroll follow:** the message list auto-scrolls to the bottom only when the user's scroll position is already near the bottom (within ~48 px). Scrolling up to read history disables auto-follow.
- **Unread badge:** when an assistant response completes while the panel is closed, a badge appears on the FAB (`part="badge"`, containing visually-hidden text from the `unreadBadge` label). Opening the panel clears it. Only natural completions raise it — errors and stops do not.
- **Input length cap:** the `max-input-length` attribute / `maxInputLength` option applies a native `maxlength` to the textarea. Programmatic `sendMessage()` is intentionally not limited — the caller owns that input.
- **Textarea auto-grow:** the input grows with its content up to the existing CSS `max-height` (then scrolls), and resets to one row after send.
- **Code block copy button:** assistant code blocks get a copy button (`part="copy-button"`, labels `copyCode` / `copyCodeDone`) backed by `navigator.clipboard.writeText`. The copied string is taken from the code element's `textContent` only. When the Clipboard API is unavailable, the button is omitted entirely.
- **Welcome message:** the `welcome-message` attribute injects a single assistant greeting as `initialMessages` for declarative embeds. Stored history still wins (same rule as `initialMessages`). A *system prompt* attribute is deliberately **not** offered: the system prompt is trusted input and belongs server-side in the backend proxy, not in page markup.

---

## Accessibility

### Non-modal

The panel does **not** trap focus. The host page remains interactive while the panel is open.

- Panel element uses `role="complementary"` with a localizable `aria-label`.
- `aria-modal` is not set.
- No focus trap. `Tab` cycles through panel elements then returns to the host page.

**Focus management:** `open()` moves focus to the textarea; `close()` returns focus to the FAB when focus was inside the panel at the time. This does not contradict non-modality — focus moves once in response to an explicit user action and is never trapped.

### aria-live pattern (two-container)

Streaming delta updates must not spam screen readers. The implementation uses two containers:

1. **Streaming container** — rendered into while `status: "streaming"`, `aria-live="off"`.
2. **Committed container** — receives the final text on `done`, `aria-live="polite"`.

The committed container copy is done via `textContent`, which guarantees that any HTML or `javascript:` links in the LLM response never become active DOM nodes in the live region.

The committed copy is passed through `markdownToPlainText` (`src/core/markdown.ts`), which strips Markdown syntax down to plain text before assignment, so screen readers hear prose rather than Markdown syntax characters. The sanitization guarantee is unchanged because the result is still written via `textContent`. The helper stays internal (not exported from `"."`).

### Keyboard

| Key | Action |
| --- | --- |
| `Enter` | Send (when textarea is focused) |
| `Shift + Enter` | Insert newline |
| `Esc` | Close panel (anywhere inside the panel) |
| `Tab` | Move through panel elements; exits to host page after the last element |

---

## Internationalization

The widget ships with two built-in locales: `"ja"` and `"en"`. The active locale is resolved from `navigator.language` (falling back to `"en"`) unless overridden explicitly.

All UI labels are grouped in a `LabelDictionary` (19 keys). Any key can be overridden at construction time via `messages: Partial<LabelDictionary>`. Non-overridden keys use the locale default. The full key list is in [API.md §6](./API.md#6-locale-and-labels).

---

## Security

### XSS

- The Markdown pipeline uses an allowlist. Unrecognized syntax is always rendered as escaped text.
- `innerHTML`, `outerHTML`, and `insertAdjacentHTML` are never used, even for content we control. One consistent DOM-construction pattern prevents accidental holes.
- SVG icons in the UI are built from compile-time path constants only (`src/ui/svg.ts`). User or assistant content is never interpolated into SVG attributes.
- `LabelDictionary` values are treated as trusted host strings. The widget passes them directly to `window.confirm` and text sinks without sanitizing. Hosts must not feed LLM output or unsanitized user input into `LabelDictionary`.

### Link sanitization

- Only `https://` and `http://` href values are allowed. All other schemes degrade to plain text.
- `target="_blank"` is always paired with `rel="noopener noreferrer"`.

### CSP

- Shadow DOM `<style>` injection requires `style-src 'unsafe-inline'`. This is documented in the README.
- Strict CSP environments that cannot allow `'unsafe-inline'` are not supported in this version.
- `script-src` is unaffected; the widget JS is loaded from an external file.

### Trusted Types

The widget never assigns to `innerHTML`, so it is compatible with Trusted Types policies. Testing under a Trusted Types enforcement policy is out of scope for now.

### Zero deps (supply chain)

No runtime dependencies means no third-party code in the bundle and no transitive vulnerability surface. `devDependencies` are limited to: Biome, TypeScript, Vite, Vitest, happy-dom.

---

## Engine / UI Separation

`ChatEngine` (`src/core/engine.ts`) owns:

- The `messages: Message[]` state.
- Adapter invocation and `text-delta` accumulation.
- Store `load` / `save`.
- `EventTarget`-based event dispatch.
- `sendMessage`, `clear`, `retry`, `stop()` operation methods, plus the `busy` flag.

`ChatEngine` has no DOM dependency and no knowledge of how the UI is rendered.

The DOM-free invariant covers `ChatEngine` and the events / messages / i18n modules. Two `core/` modules are browser-coupled by design: `core/markdown.ts` builds real DOM nodes (`document.createElement`), and the storage store factories probe `globalThis.localStorage` / `sessionStorage` (falling back to an in-memory store when unavailable). Relocating markdown rendering out of `core/` is future work.

The UI (`src/ui/widget.ts`) receives a `ChatEngine` instance and renders it. UI subscribes to state changes through `ObservableEngine` (`src/ui/observable-engine.ts`), a thin wrapper that batches state-change callbacks via `requestAnimationFrame` and exposes `subscribe(cb): () => void`.

`ObservableEngine`'s subscribe signature is designed to match `useSyncExternalStore(subscribe, getSnapshot)` so a future React wrapper connects with minimal glue.

**Invariant:** The public API of `ChatEngine` is locked for the v1.x lifetime. No changes that break existing consumers.

**Future React wrapper:** A `@web-chat-widget/react` (or `web-chat-widget/react`) package can reuse `ChatEngine` and both adapter and store implementations unchanged. Only the UI layer is rewritten in React. Shadow DOM is not used in the React version — CSS scoping is delegated to the React app.

---

## Testing Strategy

This project is **test-first / red-green-refactor**. No production code lands without a preceding failing test.

- Write the failing test first (`pnpm test` is red).
- Write the minimum code to pass it. No speculative generalization.
- Refactor with tests green.
- Tests assert on observable behavior through public API entry points. No reaching into private modules.
- Exceptions (no test required): type-only changes, demo page visual tweaks, documentation, config files.

Tests live in `tests/`, mirroring the `src/` path layout. Multi-module integration tests go in `tests/integration/`. The test environment is Vitest + happy-dom.

---

## Versioning

Follows semantic versioning:

- Start at `0.1.0`; promote to `1.0.0` when the API is considered stable.
- Breaking changes are only permitted in major version bumps.
- The `ChatAdapter` and `ChatStore` interfaces, once public, are stable for the entire v1.x line.

---

## Future Work

Not in scope for the current version. Items promoted out of this list into concrete, sequenced work get their own phase-by-phase plan and **(planned)** markers throughout this document until they ship. (Feature wave 2 — engine busy/stop state, save-on-error, adapter timeouts, declarative config, focus management, unread badge, code-block copy button, textarea auto-grow, CI — shipped this way; no `(planned)` markers remain.)

- Multi-thread (conversation tabs) UI and store schema extension
- Tool call / function call visualization
- File attachments (images, PDFs)
- Voice input/output
- Code block syntax highlighting (conflicts with the zero-deps constraint)
- `postMessage`-based cross-frame communication
- React wrapper package
- Vue / Svelte / Solid wrappers
- Optional modal mode (with focus trap)
- External CSS file variant for strict-CSP environments
- Built-in IndexedDB store factory
- Message timestamps in the UI (`createdAt` is already stored on every message)
- Automatic retry with exponential backoff on transient network errors (manual retry only for now)
