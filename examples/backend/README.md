# web-chat-widget — reference backend

A minimal proxy backend showing how to wire the widget to a real LLM provider
**without exposing your API key to the browser**.

> This directory is an **example only**. It is excluded from the published npm
> package (`files: ["dist"]`) and has its own dependencies — it does not affect
> the widget's zero-runtime-dependency guarantee.

## Why a backend at all?

The widget runs in the browser, so anything it holds is visible to the user
(DevTools → Network, `view-source`, etc.). An LLM provider key must therefore
**never** live in the page. Instead, the widget POSTs to a URL you control, and
that server attaches the secret key and relays the response:

```
browser (widget)  --POST /api/chat/sse-->  YOUR SERVER  --key-->  OpenAI
                  <----  SSE  ------------               <-- SSE --
```

The key only ever exists on the server. Auth between the browser and your server
is your call (session cookie, your own bearer token, etc.) — see the widget's
[ARCHITECTURE.md §Authentication](../../docs/ARCHITECTURE.md#authentication).

## Run it

Requires Node 24 (it runs the TypeScript file directly via native type
stripping — no build step).

```bash
cd examples/backend
pnpm install
cp .env.example .env   # then set OPENAI_API_KEY
pnpm start             # or: pnpm dev  (restarts on change)
```

The server listens on `http://localhost:8787` and exposes two endpoints, one per
built-in adapter:

| Endpoint | Pair with | Response |
| --- | --- | --- |
| `POST /api/chat/sse` | `createOpenAISseAdapter` | OpenAI-compatible `text/event-stream` |
| `POST /api/chat/json` | `createJsonAdapter` | `{ "reply": "..." }` |

## Try it with the built demo

The repo ships a demo page already wired to this server. From the repo root:

```bash
pnpm demo   # builds the widget and serves dist/ on http://localhost:4173
```

With this backend running, open `http://localhost:4173/backend-live.html` — the
widget streams real completions through `POST /api/chat/sse`. If your `.env`
sets a concrete `ALLOWED_ORIGIN`, it must be `http://localhost:4173`.

## Wire the widget to it

```ts
import { ChatWidget } from "web-chat-widget";
import { createOpenAISseAdapter } from "web-chat-widget/adapters";

ChatWidget.mount({
  // Point at YOUR backend — not at api.openai.com.
  adapter: createOpenAISseAdapter({ url: "http://localhost:8787/api/chat/sse" }),
});
```

Or, via the `<script>` (IIFE) build:

```html
<script src="chat-widget.iife.js"></script>
<script>
  ChatWidget.mount({
    adapter: ChatWidget.adapters.createOpenAISseAdapter({
      url: "http://localhost:8787/api/chat/sse",
    }),
  });
</script>
```

## Request / response contract

Your endpoint must accept and return these shapes (this is all the adapters
expect — implement it in any language/framework you like):

**Request body** (sent by the adapter):

```jsonc
// createOpenAISseAdapter
{ "messages": [{ "role": "user", "content": "hi" }], "stream": true, "model": "..." }
// createJsonAdapter
{ "messages": [{ "role": "user", "content": "hi" }] }
```

**Response:**

- SSE: `Content-Type: text/event-stream`, lines of
  `data: {"choices":[{"delta":{"content":"..."}}]}`, terminated by `data: [DONE]`.
- JSON: `{ "reply": "<full assistant message>" }`.

Because OpenAI's own streaming format already matches the SSE shape, this proxy
mostly just forwards the upstream byte stream. If your provider differs (e.g.
Anthropic), transform its events into the shape above, or return JSON and use
`createJsonAdapter`.

## Adapting to other providers

- **Any OpenAI-compatible API** (Azure OpenAI, OpenRouter, Together, local
  llama.cpp / Ollama): just change `OPENAI_BASE_URL` / `OPENAI_MODEL`.
- **Anthropic / others**: call their SDK server-side and either (a) re-emit the
  `{choices:[{delta:{content}}]}` SSE shape for `createOpenAISseAdapter`, or
  (b) collect the full text and return `{ reply }` for `createJsonAdapter`.
