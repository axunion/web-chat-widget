# web-chat-widget

A distributable package that embeds a floating AI chat UI into any web page. Zero runtime dependencies, built on web standards only.

> **Status**: pre-release. Core, adapters, UI, declarative entry, IIFE bundle, and the library-mode build pipeline are all in place. The developer demo (`pnpm dev`) and a production-shaped sample page (`pnpm demo`) both run. See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for design decisions and [docs/API.md](./docs/API.md) for the public API reference. Version stays below `1.0.0` until the API is judged stable.

## Highlights

- **Zero runtime dependencies** — built on Custom Elements, Shadow DOM, `fetch`, `ReadableStream`, and other web standards
- **Two integration paths** — npm import (ESM) and `<script>` tag embedding (IIFE), from the same codebase
- **Pluggable backend** — adapters POST to an endpoint **you** control (your own proxy), so the LLM provider key never reaches the browser. A built-in OpenAI-compatible SSE adapter and a JSON adapter cover the common cases; any API can be wired up via the adapter interface
- **Style-safe** — internals live in a Shadow DOM so the host page's CSS cannot bleed in
- **Themeable** — colors, radii, fonts, and layout are exposed via CSS custom properties and `::part()` selectors
- **React-ready** — core logic is decoupled from the UI layer; a React wrapper is planned for a future release

## Quick Start

> **The widget talks to *your* backend, not directly to OpenAI/Anthropic.**
> A browser cannot safely hold a provider API key — anything the page holds is
> visible to the user. So the adapter's `url` points at a small server you run,
> which attaches the secret key and relays the response:
>
> ```
> browser (widget)  --POST /api/chat-->  YOUR SERVER  --key-->  OpenAI / etc.
>                   <----  SSE  --------               <-- SSE --
> ```
>
> See [`examples/backend`](./examples/backend) for a ~120-line Hono proxy you
> can copy, and [ARCHITECTURE.md §Authentication](./docs/ARCHITECTURE.md#authentication) for the rationale.

### npm (ESM)

```ts
import { ChatWidget } from "web-chat-widget";
import { createOpenAISseAdapter } from "web-chat-widget/adapters";

new ChatWidget({
  // Your backend endpoint — NOT api.openai.com.
  adapter: createOpenAISseAdapter({ url: "/api/chat/sse" }),
});
```

### `<script>` tag (IIFE)

```html
<script src="https://your.cdn/chat-widget.iife.js"></script>
<script>
  ChatWidget.mount({
    adapter: ChatWidget.adapters.createOpenAISseAdapter({ url: "/api/chat/sse" }),
  });
</script>
```

Not running an OpenAI-compatible endpoint? Return `{ "reply": "..." }` from your
server and use `createJsonAdapter({ url: "/api/chat/json" })` instead, or
implement the `ChatAdapter` interface for anything else (see [docs/API.md §4](./docs/API.md#4-adapters)).

## Documentation

- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — design decisions and architectural invariants: zero-deps rationale, adapter/store contracts, security policy, accessibility, future-work backlog
- [docs/API.md](./docs/API.md) — public API reference: type signatures, custom-element attributes, methods, events, `LabelDictionary`, CSS variables, `::part()` selectors, adapter / store factory options
- CHANGELOG — to be added with the first release

## Development

```bash
pnpm install
pnpm dev      # Vite dev server — developer demo (ESM, control panel, HMR)
pnpm build    # library build (ESM + IIFE + .d.ts) and copy demo HTML to dist/
pnpm demo     # build, then start a preview server hosting dist/
pnpm check    # Biome lint / format check
pnpm test     # Vitest unit tests
```

Two demo pages exist:

- `index.html` (`pnpm dev`) — developer-facing playground with theme/locale/position controls, wired up via ESM imports.
- `demo/sample-service.html` (`pnpm demo`, or `pnpm preview` after a manual `pnpm build`) — fictional SaaS landing page that loads the built IIFE bundle through a `<script>` tag, mirroring how a third-party site would embed the widget. Open `http://localhost:4173/sample-service.html` in your browser once preview is running.

A runnable reference backend lives in [`examples/backend`](./examples/backend)
(Hono proxy, OpenAI-compatible). It has its own `package.json` and is excluded
from the published package, so it does not affect the zero-dependency guarantee.

Node version is pinned via Volta. See `package.json` for the exact scripts.

## License

Not yet determined. Will be set before the first release.
