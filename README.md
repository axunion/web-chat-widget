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

Try it with zero backend — `createMockAdapter` streams a canned reply so you
can evaluate the widget in one minute:

```html
<script src="https://unpkg.com/web-chat-widget/dist/chat-widget.iife.js"></script>
<script>
  ChatWidget.mount({
    adapter: ChatWidget.adapters.createMockAdapter(),
  });
</script>
```

Or via npm:

```ts
import { ChatWidget } from "web-chat-widget";
import { createMockAdapter } from "web-chat-widget/adapters";

ChatWidget.mount({ adapter: createMockAdapter() });
```

To connect a real LLM, point a built-in adapter at **your own backend proxy**
(never at the provider — a browser page cannot hold an API key secret):

```ts
import { createOpenAISseAdapter } from "web-chat-widget/adapters";

ChatWidget.mount({
  adapter: createOpenAISseAdapter({ url: "/api/chat/sse" }),
});
```

**[docs/GETTING-STARTED.md](./docs/GETTING-STARTED.md)** walks the full path:
mock → real backend (a copyable proxy lives in
[`examples/backend`](./examples/backend)) → customization → production
checklist.

## Documentation

| Document | What it covers | Read it when |
| --- | --- | --- |
| [docs/GETTING-STARTED.md](./docs/GETTING-STARTED.md) | Step-by-step integration: mock demo, backend wiring, customization, production checklist | You are embedding the widget for the first time |
| [docs/API.md](./docs/API.md) | Full public API reference: types, attributes, methods, events, labels, CSS variables, `::part()`, adapter/store factories | You need the exact signature or option |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Design decisions and invariants: zero-deps rationale, adapter/store contracts, security policy, accessibility | You are contributing, or wondering *why* |
| [examples/backend/README.md](./examples/backend/README.md) | The backend contract, a runnable Hono proxy, provider adaptation, production hardening | You are building the server side |

CHANGELOG — to be added with the first release.

## Development

```bash
pnpm install
pnpm dev      # Vite dev server — developer demo (ESM, control panel, HMR)
pnpm build    # library build (ESM + IIFE + .d.ts) and copy demo HTML to dist/
pnpm demo     # build, then start a preview server hosting dist/
pnpm check    # Biome lint / format check
pnpm test     # Vitest unit tests
```

Three demo pages exist:

- `index.html` (`pnpm dev`) — developer-facing playground with theme/locale/position controls, wired up via ESM imports.
- `demo/sample-service.html` (`pnpm demo`, or `pnpm preview` after a manual `pnpm build`) — fictional SaaS landing page that loads the built IIFE bundle through a `<script>` tag, mirroring how a third-party site would embed the widget. Open `http://localhost:4173/sample-service.html` in your browser once preview is running.
- `demo/backend-live.html` (`pnpm demo`, with [`examples/backend`](./examples/backend) running) — wires the real `createOpenAISseAdapter` to the reference proxy, exercising the full widget → backend → LLM path. Open `http://localhost:4173/backend-live.html`.

A runnable reference backend lives in [`examples/backend`](./examples/backend)
(Hono proxy, OpenAI-compatible). It has its own `package.json` and is excluded
from the published package, so it does not affect the zero-dependency guarantee.

Node version is pinned via Volta. See `package.json` for the exact scripts.

## License

[MIT](https://opensource.org/licenses/MIT) (see the `license` field in `package.json`).
