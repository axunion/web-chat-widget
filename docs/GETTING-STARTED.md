# Getting Started

The shortest path from nothing to a production-ready chat widget. Each step
links to the reference docs for details — this guide only carries the order and
the minimum code.

**Who this is for:** integrators embedding the widget in a site for the first
time. For the full API surface see [API.md](./API.md); for design rationale see
[ARCHITECTURE.md](./ARCHITECTURE.md).

---

## Step 1 — See it working (no backend, ~1 minute)

Drop this into any HTML page. `createMockAdapter` streams a canned reply with
realistic latency, so you can evaluate the look and feel before writing a
single line of server code:

```html
<script src="https://unpkg.com/web-chat-widget/dist/chat-widget.iife.js"></script>
<script>
  ChatWidget.mount({
    adapter: ChatWidget.adapters.createMockAdapter(),
  });
</script>
```

Or via npm:

```bash
pnpm add web-chat-widget
```

```ts
import { ChatWidget } from "web-chat-widget";
import { createMockAdapter } from "web-chat-widget/adapters";

ChatWidget.mount({ adapter: createMockAdapter() });
```

A chat button appears in the bottom-right corner. Open it, send a message, and
watch the mock reply stream in.

> Mock adapter options (custom reply text, latency) are in
> [API.md §4.4](./API.md#44-createmockadapter).

## Step 2 — Wire a real backend

The widget never talks to an LLM provider directly — a browser page cannot
hold an API key secret. Instead it POSTs to a small proxy **you** run, which
attaches the key server-side:

```
browser (widget)  --POST /api/chat-->  YOUR SERVER  --key-->  OpenAI / etc.
                  <----  SSE  -------               <-- SSE --
```

A small runnable reference proxy lives in
[`examples/backend`](../examples/backend) (Hono, OpenAI-compatible). Copy it,
or implement the same contract in any language — your endpoint just needs to
accept `{ messages }` and answer in one of two shapes:

| Your endpoint returns | Use this adapter |
| --- | --- |
| OpenAI-compatible `text/event-stream` (streaming) | `createOpenAISseAdapter({ url })` |
| `{ "reply": "..." }` JSON (non-streaming) | `createJsonAdapter({ url })` |

Then swap the mock for the real adapter:

```ts
import { createOpenAISseAdapter } from "web-chat-widget/adapters";

ChatWidget.mount({
  adapter: createOpenAISseAdapter({ url: "/api/chat/sse" }),
});
```

The exact request/response contract, provider adaptation notes (Azure,
OpenRouter, Anthropic, local models), and the system-prompt pattern are in the
[backend README](../examples/backend/README.md). For anything beyond the two
built-in shapes (WebSocket, custom protocols), implement the `ChatAdapter`
interface — see [API.md §4.5](./API.md#45-writing-a-custom-adapter).

## Step 3 — Make it yours

Everything below is optional. The declarative element covers the common knobs:

```html
<script src="https://unpkg.com/web-chat-widget/dist/chat-widget.iife.js"></script>
<chat-widget
  api-url="/api/chat/sse"
  theme="auto"
  locale="en"
  position="bottom-right"
  persist="local"
  welcome-message="Hi! How can I help?"
></chat-widget>
```

- **Attributes** (theme, locale, position, persistence, timeouts, input limits):
  [API.md §3.1](./API.md#31-attributes)
- **Colors, radii, fonts** via CSS custom properties, and per-element styling
  via `::part()`: [API.md §7](./API.md#7-css-customization)
- **UI labels** (all 19 overridable, ja/en built in):
  [API.md §6](./API.md#6-locale-and-labels)
- **History persistence** (localStorage / sessionStorage / custom store):
  [API.md §5](./API.md#5-chatstore)
- **Events and programmatic control** (`open()`, `sendMessage()`, `clear()`,
  `stop()`, …): [API.md §2](./API.md#2-chatwidget-class)

## Step 4 — Production checklist

Before going live:

- [ ] **Lock down CORS.** Set your proxy's allowed origin to your real site —
      never ship `*`. (`ALLOWED_ORIGIN` in the reference backend.)
- [ ] **Authenticate the browser→proxy hop.** Session cookie or your own bearer
      token via the adapter's `headers` option — an open proxy spends your LLM
      budget for anyone who finds it. See
      [ARCHITECTURE.md §Authentication](./ARCHITECTURE.md#authentication).
- [ ] **Rate-limit and validate on the server.** Cap request frequency, message
      count, and message length per client.
- [ ] **Keep the system prompt server-side** and pin the model server-side —
      treat everything in the request body as untrusted user input. See the
      [backend README](../examples/backend/README.md#production-checklist).
- [ ] **Set a request timeout** so a stalled backend doesn't leave the widget
      spinning: `timeoutMs` option or `api-timeout` attribute
      ([API.md §3.1](./API.md#31-attributes)).
- [ ] **Pin the IIFE version** when loading from a CDN:
      `https://unpkg.com/web-chat-widget@x.y.z/dist/chat-widget.iife.js`.
