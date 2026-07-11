# web-chat-widget API Reference

Public API reference for `web-chat-widget`. For design decisions and architectural invariants, see [ARCHITECTURE.md](./ARCHITECTURE.md).

> Entries marked **(planned)** are specified but not yet implemented. The implementation order and per-phase details live in [PLAN.md](./PLAN.md). Remove a marker in the same change that ships the feature.

---

## 1. Installation and Entry Points

### 1.1 Via npm

```bash
pnpm add web-chat-widget
```

```ts
// Imperative usage
import { ChatWidget } from "web-chat-widget";
import { createOpenAISseAdapter } from "web-chat-widget/adapters";

const widget = ChatWidget.mount({
  adapter: createOpenAISseAdapter({ url: "/api/chat" }),
});
```

```ts
// Declarative usage — side-effect import registers the custom element
import "web-chat-widget/element";
```

```html
<chat-widget api-url="/api/chat" theme="auto" locale="en"></chat-widget>
```

### 1.2 Via `<script>` tag

```html
<!-- Pin a version in production: https://unpkg.com/web-chat-widget@x.y.z/dist/chat-widget.iife.js -->
<script src="https://unpkg.com/web-chat-widget/dist/chat-widget.iife.js"></script>
<script>
  ChatWidget.mount({
    adapter: ChatWidget.adapters.createOpenAISseAdapter({
      url: "/api/chat",
    }),
  });
</script>
```

The IIFE bundle:

- Exposes the class at `window.ChatWidget`.
- Attaches `createOpenAISseAdapter` / `createJsonAdapter` / `createMockAdapter` under `ChatWidget.adapters`.
- Attaches `createMemoryStore` / `createLocalStorageStore` / `createSessionStorageStore` under `ChatWidget.stores`.
- Automatically registers the `<chat-widget>` custom element.

### 1.3 Exported symbols

| Entry point | Contents | Side effects |
| --- | --- | --- |
| `web-chat-widget` (`"."`) | `ChatWidget` class, `ChatEngine`, and all types | None |
| `web-chat-widget/element` | Calls `customElements.define("chat-widget", ChatWidget)` | Yes (define) |
| `web-chat-widget/adapters` | `createOpenAISseAdapter`, `createJsonAdapter`, `createMockAdapter`, and related types | None |
| IIFE (`chat-widget.iife.js`) | `window.ChatWidget` + `.adapters` + `.stores` + element define | Yes |

Symbols exported from `"."`:

| Category | Names |
| --- | --- |
| Classes | `ChatWidget`, `ChatEngine` |
| Options / union types | `ChatWidgetOptions`, `ChatWidgetPosition`, `ChatWidgetTheme`, `ChatWidgetApiMode`, `ChatWidgetPersist`, `ChatEngineOptions` |
| Message | `Message`, `MessageRole`, `MessageStatus`, `CreateMessageOverrides`, `createMessage` |
| Events | `ChatEventMap`, `ChatEventType`, `createChatEvent` |
| i18n | `LabelDictionary`, `Locale`, `resolveLabels` |
| Adapter | `ChatAdapter`, `AdapterChunk` |
| Store | `ChatStore`, `CreateLocalStorageStoreOptions`, `CreateSessionStorageStoreOptions`, `createMemoryStore`, `createLocalStorageStore`, `createSessionStorageStore` |
| Theme | `ThemeToken`, `THEME_TOKENS`, `renderThemeCss` |
| Markdown | `markdownToNodes` |

> **DOM requirement:** `markdownToNodes` builds real DOM nodes via `document.createElement`, so it needs a browser (or a DOM test environment such as happy-dom). Calling it in plain Node/SSR throws `document is not defined`. The storage store factories are safe everywhere: when `globalThis.localStorage` / `sessionStorage` is missing or unusable, they silently return an in-memory store instead (see §5.3).

---

## 2. ChatWidget Class

### 2.1 Constructor / mount

```ts
class ChatWidget extends HTMLElement {
  constructor(options?: ChatWidgetOptions);
  static mount(options: ChatWidgetOptions): ChatWidget;
}

interface ChatWidgetOptions {
  target?: HTMLElement;                  // defaults to document.body (mount only)
  adapter?: ChatAdapter;                 // if omitted, built from api-url attribute
  position?: ChatWidgetPosition;
  theme?: ChatWidgetTheme;
  locale?: Locale;
  initialMessages?: Message[];
  messages?: Partial<LabelDictionary>;   // override specific UI labels
  store?: ChatStore;
  maxInputLength?: number;               // (planned) maxlength applied to the input textarea
}

type ChatWidgetPosition = "bottom-right" | "bottom-left" | "top-right" | "top-left";
type ChatWidgetTheme    = "light" | "dark" | "auto";
type ChatWidgetApiMode  = "openai-sse" | "json";
```

- `mount(options)` internally calls `defineChatWidget()`, constructs `new ChatWidget(options)`, appends it to `target` (default `document.body`), and returns the instance.
- When constructing with `new ChatWidget(...)` directly, the caller is responsible for inserting it into the DOM. Initialization runs in `connectedCallback`.
- If neither `adapter` nor an `api-url` attribute is present at `connectedCallback` time, an `Error` is thrown.

### 2.2 Methods

| Method | Signature | Description |
| --- | --- | --- |
| `open` | `(): void` | Opens the panel. No-op if already open. Dispatches `open` event. |
| `close` | `(): void` | Closes the panel. No-op if already closed. Dispatches `close` event. |
| `toggle` | `(): void` | Toggles open/closed state. |
| `sendMessage` | `(text: string): Promise<void>` | Programmatically sends a user message. Caller is responsible for preventing empty strings. |
| `getMessages` | `(): readonly Message[]` | Returns a snapshot copy of the current history. |
| `destroy` | `(): void` | Detaches listeners and destroys the engine. Re-attaching the element re-initializes it. |
| `clear` | `(): void` | Clears conversation history. Aborts any in-flight request, empties in-memory history, calls `store.clear()`, and re-renders the UI to the empty state. Also triggered by the clear button in the panel header. |
| `retry` | `(): Promise<void>` | Resends the last user message. The previous assistant response is dropped and replaced. |
| `stop` | `(): void` | **(planned)** Aborts the in-flight response. Partial assistant content is kept and settled to `status: "done"`; an empty streaming placeholder is removed (the user message stays). Does **not** fire the `message` event. No-op when idle. |

### 2.2.1 Properties

| Property | Type | Description |
| --- | --- | --- |
| `busy` | `boolean` (read-only) | **(planned)** `true` while a response is in flight — from send until the exchange settles (`done` / `error` / `stop()`). |

### 2.3 Events

`ChatWidget` inherits from `HTMLElement` (and thus `EventTarget`). Subscribe with `addEventListener(type, handler)`. All events have `bubbles: false`, `composed: false`.

| Event | `detail` type | When |
| --- | --- | --- |
| `ready` | `undefined` | Initialization complete (DOM inserted and styles applied). |
| `open` | `undefined` | Panel just opened. |
| `close` | `undefined` | Panel just closed. |
| `message` | `{ role: "user" \| "assistant"; content: string }` | An assistant response is confirmed on `done` chunk (once per message), or **(planned)** a user message is appended by a send. `"system"` role is excluded. Stopped (partial) responses do not fire this event. |
| `error` | `{ error: Error }` | The adapter yielded an `error` chunk, or an internal error occurred during send. |
| `busy` | `{ busy: boolean }` | **(planned)** A response started (`true`) or settled (`false` — on `done` / `error` / `stop()`). Fires only on transitions. |

The `message` event fires once per completed message, not on every `text-delta` chunk.

```ts
widget.addEventListener("message", (e) => {
  console.log(e.detail.role, e.detail.content);
});
```

### 2.4 Types

```ts
interface Message {
  id: string;                                      // "msg_<base36>_<seq>_<rand>"
  role: "user" | "assistant" | "system";
  content: string;                                 // Markdown source string
  createdAt: number;                               // epoch ms
  status?: "streaming" | "done" | "error";
}

interface CreateMessageOverrides {
  id?: string;
  createdAt?: number;
  status?: MessageStatus;
}

interface ChatEventMap {
  ready: undefined;
  open: undefined;
  close: undefined;
  message: { role: Exclude<MessageRole, "system">; content: string };
  error: { error: Error };
  busy: { busy: boolean }; // (planned)
}
```

`createMessage(role, content, overrides?)` is exported from `"."` and is useful for constructing `initialMessages` or in tests.

---

## 3. `<chat-widget>` Custom Element

Importing `web-chat-widget/element` or loading the IIFE bundle calls `customElements.define("chat-widget", ChatWidget)`.

### 3.1 Attributes

| Attribute | Type | Default | Description |
| --- | --- | --- | --- |
| `open` | boolean (presence) | — | Panel is open on initialization when this attribute is present. |
| `position` | `"bottom-right" \| "bottom-left" \| "top-right" \| "top-left"` | `"bottom-right"` | FAB and panel placement. |
| `locale` | `"ja" \| "en"` | Derived from `navigator.language` | UI language. |
| `theme` | `"light" \| "dark" \| "auto"` | `"auto"` | Color theme. `"auto"` follows `prefers-color-scheme`. |
| `api-url` | string | — | Endpoint for the built-in adapter. Required if no `adapter` option is passed. |
| `api-mode` | `"openai-sse" \| "json"` | `"openai-sse"` | Which built-in adapter to use when `api-url` is set. |
| `persist` | `"local" \| "session" \| "none"` | `"none"` | Constructs the corresponding built-in store factory. |
| `persist-key` | string | `"web-chat-widget"` | Storage key passed to the store factory. |
| `welcome-message` | string | — | **(planned)** Initial assistant greeting rendered when no stored history exists. Declarative sugar for `initialMessages` (stored history still wins). |
| `api-timeout` | number (ms) | — | **(planned)** Passed to the built-in adapter as `timeoutMs`. Ignored when invalid or when an `adapter` option is supplied. |
| `max-input-length` | number | — | **(planned)** `maxlength` applied to the input textarea. Does not limit programmatic `sendMessage()`. |

### 3.2 Dynamic attribute change rules

| Attribute | Live change reflected |
| --- | --- |
| `open` / `position` / `locale` / `theme` | Yes |
| `api-url` / `api-mode` | No — evaluated at mount time only |
| `persist` / `persist-key` | No — evaluated at mount time only |
| `welcome-message` / `api-timeout` / `max-input-length` | No — evaluated at mount time only **(planned)** |

To change the adapter or store after mount, recreate the element via the JS API.

### 3.3 `::part()` selectors

Use these to override individual DOM elements from outside the Shadow Root:

| Part name | Element |
| --- | --- |
| `fab` | The closed-state button |
| `panel` | The expanded panel container |
| `header` | Panel header bar |
| `clear-button` | History clear button |
| `close-button` | Panel close button |
| `log` | Message list scroll container |
| `message` | Any message bubble |
| `message-user` / `message-assistant` / `message-system` | Role-specific message bubbles |
| `message-error` | Error display row |
| `input-area` | Container wrapping the textarea and send button |
| `input` | The `<textarea>` element |
| `send-button` | Send button |
| `stop-button` | **(planned)** The same button while a response is in flight — its `part` switches from `send-button` to `stop-button` |
| `badge` | **(planned)** Unread indicator on the FAB |
| `copy-button` | **(planned)** Copy button on assistant code blocks |

```css
chat-widget::part(fab) {
  border: 2px solid hotpink;
}
```

---

## 4. Adapters

> **Important:** Point the built-in adapter `url` at **your own backend proxy**, not directly at an LLM provider. API keys cannot be stored securely in a browser page. Your proxy runs server-side, attaches the key, and forwards the request. A working reference implementation is in [`examples/backend`](../examples/backend) (Hono). See [Authentication](./ARCHITECTURE.md#authentication) in ARCHITECTURE.md.
>
> Backend contract:
>
> | Adapter | Request body | Response |
> | --- | --- | --- |
> | `createOpenAISseAdapter` | `{ messages, stream: true, model? }` | `text/event-stream`; lines `data: {"choices":[{"delta":{"content":"..."}}]}`; ends with `data: [DONE]` |
> | `createJsonAdapter` | `{ messages }` | `{ "reply": "..." }` (customizable via `extract`) |

### 4.1 `ChatAdapter` interface

```ts
interface ChatAdapter {
  send(
    messages: readonly Message[],
    signal: AbortSignal
  ): AsyncIterable<AdapterChunk>;
}

type AdapterChunk =
  | { type: "text-delta"; delta: string }
  | { type: "done" }
  | { type: "error"; error: Error };
```

Implementation obligations (see also [ARCHITECTURE.md — Adapter Contract](./ARCHITECTURE.md#adapter-contract)):

- Never throw synchronously. Yield `{ type: "error", error }` instead.
- Forward `signal` to `fetch`; check `signal.aborted` between chunks.
- On success, yield exactly one `{ type: "done" }` as the final chunk.

### 4.2 `createOpenAISseAdapter`

```ts
function createOpenAISseAdapter(options: OpenAISseAdapterOptions): ChatAdapter;

interface OpenAISseAdapterOptions {
  url: string;
  headers?: Record<string, string>;
  model?: string;           // included in the request body when set
  timeoutMs?: number;       // (planned) inactivity timeout — see below
  fetchImpl?: typeof fetch; // for test injection
}
```

Behavior:

- `POST url` with `Content-Type: application/json`.
- Body: `{ messages: [{ role, content }], stream: true, model? }`.
- Parses `text/event-stream` line by line, yielding `text-delta` from `choices[0].delta.content`.
- Yields `done` on `data: [DONE]`.
- Yields `error` on fetch failure, 4xx/5xx status, JSON parse failure, or missing `choices`.
- Passes `signal` directly to `fetch`; `finally` block calls `cancel()` on the reader.
- **(planned)** When `timeoutMs` is set, it bounds the wait for response headers **and** the inactivity gap between SSE reads (a steadily streaming response never times out). On timeout the adapter aborts its own fetch and yields an `error` chunk. Unset = no timeout (current behavior).

### 4.3 `createJsonAdapter`

```ts
function createJsonAdapter(options: JsonAdapterOptions): ChatAdapter;

interface JsonAdapterOptions {
  url: string;
  headers?: Record<string, string>;
  extract?: (json: unknown) => string; // default: returns json.reply (throws if not a string)
  timeoutMs?: number;                  // (planned) total request timeout
  fetchImpl?: typeof fetch;
}
```

Behavior:

- `POST url` with body `{ messages }`.
- `await response.json()`, then calls `extract(parsed)` to get the reply string.
- Yields one `text-delta` + `done`.
- Yields `error` if `extract` throws or returns a non-string.
- **(planned)** When `timeoutMs` is set, it bounds the whole request (fetch + body read). On timeout the adapter aborts its own fetch and yields an `error` chunk. Unset = no timeout (current behavior).

### 4.4 `createMockAdapter`

```ts
function createMockAdapter(options?: MockAdapterOptions): ChatAdapter;

interface MockAdapterOptions {
  reply?: string;          // Markdown reply to stream. Default: a short canned reply.
  initialDelayMs?: number; // latency before the first chunk. Default: 300.
  chunkDelayMs?: number;   // delay between characters. Default: 12.
}
```

Behavior:

- Streams `reply` character by character as `text-delta` chunks, simulating LLM latency.
- Checks `signal.aborted` between chunks and stops silently when aborted (no `done` after abort).
- On completion, yields exactly one `done`. Never yields `error`.
- Needs no backend. Intended for demos, playgrounds, and evaluating the widget before wiring a real endpoint — **not** for automated tests that need chunk-level scripting (write a scripted fake instead).

### 4.5 Writing a custom adapter

Any object implementing `ChatAdapter` works. Use this for WebSocket, mocks, multi-backend routing, etc.:

```ts
const customAdapter: ChatAdapter = {
  async *send(messages, signal) {
    const ws = new WebSocket("/api/ws");
    signal.addEventListener("abort", () => ws.close(), { once: true });
    try {
      for await (const event of fromWs(ws)) {
        if (signal.aborted) return;
        if (event.kind === "delta")    yield { type: "text-delta", delta: event.text };
        else if (event.kind === "end") { yield { type: "done" }; return; }
        else if (event.kind === "err") { yield { type: "error", error: event.err }; return; }
      }
    } finally {
      ws.close();
    }
  },
};
```

---

## 5. ChatStore

Optional persistence layer for conversation history. Import the built-in factories from `web-chat-widget`. For design rationale, see [ARCHITECTURE.md — ChatStore](./ARCHITECTURE.md#chatstore).

### 5.1 `ChatStore` interface

```ts
interface ChatStore {
  load(): Message[];                          // called once synchronously in the engine constructor
  save(messages: readonly Message[]): void;   // called when state settles — see ARCHITECTURE.md §Save timing
  clear(): void;                              // purges the persistent layer
}
```

- All methods are synchronous. For async backends, use an async factory that returns a sync store.
- `save` is not called on every `text-delta` — only when state is settled.

### 5.2 `createMemoryStore`

```ts
function createMemoryStore(): ChatStore;
```

No-op persistence; same behavior as omitting the `store` option entirely.

### 5.3 `createLocalStorageStore`

```ts
function createLocalStorageStore(opts?: {
  key?: string;          // default: "web-chat-widget"
  maxMessages?: number;  // default: 100
}): ChatStore;
```

- Persists to `localStorage`.
- Storage format: `{ "v": 1, "messages": [...] }`.
- Drops oldest messages when `maxMessages` is exceeded.
- When `globalThis.localStorage` is absent (plain Node/SSR) or fails a write probe (private mode, disabled storage), the factory returns an in-memory store instead of throwing. `createSessionStorageStore` behaves the same way.
- On `QuotaExceededError`: drops the oldest half and retries once; on continued failure, silently falls back to memory.

### 5.4 `createSessionStorageStore`

```ts
function createSessionStorageStore(opts?: {
  key?: string; // default: "web-chat-widget"
}): ChatStore;
```

- Persists to `sessionStorage`. Data is lost when the tab closes.
- No `maxMessages` limit.
- Same fallback behavior as `createLocalStorageStore`.

### 5.5 Writing a custom store

```ts
// Example: async factory that produces a sync store
async function createRemoteStore(api: RemoteApi): Promise<ChatStore> {
  const snapshot = await api.fetchInitial();
  return {
    load() {
      return snapshot;
    },
    save(messages) {
      enqueueRemoteSave(messages); // fire-and-forget
    },
    clear() {
      snapshot = [];
      enqueueRemoteClear();
    },
  };
}

const store = await createRemoteStore(myApi);
const widget = new ChatWidget({ adapter, store });
```

Multiple `ChatWidget` instances using the same storage key will mix their histories. Use distinct `persist-key` values when running multiple instances.

---

## 6. Locale and Labels

### 6.1 `LabelDictionary` — all 19 keys (4 planned)

```ts
interface LabelDictionary {
  fabLabel: string;       // tooltip / aria-label on the FAB
  panelTitle: string;     // panel header title
  closeButton: string;    // close button aria-label
  placeholder: string;    // textarea placeholder
  sendButton: string;     // send button label
  errorGeneric: string;   // generic error message
  errorRetry: string;     // retry button label
  emptyState: string;     // message shown when history is empty
  typingLabel: string;    // aria label during streaming: "Generating response"
  user: string;           // aria role label for user messages
  assistant: string;      // aria role label for assistant messages
  system: string;         // aria role label for system messages
  clearHistory: string;   // clear button aria-label
  clearConfirm: string;   // window.confirm prompt before clearing
  poweredBy: string;      // footer slot, unused by default (empty string)
  stopButton: string;     // (planned) stop-generation button label — en "Stop" / ja "停止"
  unreadBadge: string;    // (planned) sr-only text on the FAB unread badge — en "New message" / ja "新着メッセージ"
  copyCode: string;       // (planned) code block copy button label — en "Copy" / ja "コピー"
  copyCodeDone: string;   // (planned) copy button label after a successful copy — en "Copied" / ja "コピーしました"
}
```

Built-in locales: `"ja"` and `"en"`. The locale is resolved from `navigator.language` (maps `ja*` to `"ja"`, everything else to `"en"`) unless overridden.

### 6.2 Partial override

```ts
new ChatWidget({
  locale: "en",
  messages: {
    placeholder: "Ask anything…",
    sendButton: "Send",
  },
  // unspecified keys use the "en" built-in defaults
});
```

---

## 7. CSS Customization

### 7.1 CSS Custom Properties

CSS variables are the primary theming surface. They inherit through the Shadow DOM boundary, so setting them on `chat-widget` (or any ancestor) is sufficient:

```css
chat-widget {
  --cw-color-primary: #ff5722;
  --cw-radius: 8px;
  --cw-z-index: 9999;
}
```

| Property | Light default | Dark default | Purpose |
| --- | --- | --- | --- |
| `--cw-color-primary` | `#2563eb` | `#60a5fa` | Accent color for FAB, send button, and focus rings |
| `--cw-color-on-primary` | `#ffffff` | `#0b1220` | Foreground color on primary |
| `--cw-color-bg` | `#ffffff` | `#0f172a` | Panel background |
| `--cw-color-surface` | `#f1f5f9` | `#1e293b` | Assistant message bubble background |
| `--cw-color-user-bubble` | `#2563eb` | `#3b82f6` | User message bubble |
| `--cw-color-user-text` | `#ffffff` | `#ffffff` | User bubble text color |
| `--cw-color-text` | `#0f172a` | `#e2e8f0` | Body text |
| `--cw-color-muted` | `#64748b` | `#94a3b8` | Muted text and system role |
| `--cw-color-border` | `#e2e8f0` | `#334155` | Dividers and borders |
| `--cw-color-error` | `#dc2626` | `#f87171` | Error text and indicator |
| `--cw-radius` | `16px` | same | Panel and bubble border radius |
| `--cw-radius-sm` | `8px` | same | Small corner radius (input etc.) |
| `--cw-font-family` | system-ui stack | same | Font stack |
| `--cw-font-size` | `14px` | same | Body font size |
| `--cw-panel-width` | `380px` | same | Desktop panel width |
| `--cw-panel-height` | `600px` | same | Panel max height |
| `--cw-fab-size` | `56px` | same | FAB diameter |
| `--cw-offset` | `20px` | same | Viewport edge offset |
| `--cw-z-index` | `2147483000` | same | Stacking order (not max, intentionally — avoids collision with existing sites) |
| `--cw-shadow` | `0 10px 30px rgba(0,0,0,.15)` | `0 10px 30px rgba(0,0,0,.6)` | Panel shadow |

### 7.2 `::part()` selectors

See [§3.3](#33-part-selectors) for the full list and usage example.
