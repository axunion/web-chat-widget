# web-chat-widget

A distributable package that embeds a floating AI chat UI into any web page. Zero runtime dependencies, built on web standards only.

> **Status**: pre-release. Core, adapters, UI, declarative entry, IIFE bundle, and the library-mode build pipeline are in place; the developer demo at `pnpm dev` and a production-shaped sample page at `pnpm demo` (fictional SaaS, IIFE via `<script>` tag) both run against a mock streaming adapter. The authoritative design document is [docs/SPEC.md](./docs/SPEC.md). Public API is settling but the version stays below `1.0.0` until the v1 milestone is cut.

## Highlights

- **Zero runtime dependencies** — built on Custom Elements, Shadow DOM, `fetch`, `ReadableStream`, and other web standards
- **Two integration paths** — npm import (ESM) and `<script>` tag embedding (IIFE), from the same codebase
- **Pluggable backend** — OpenAI-compatible SSE is the default, any API can be wired up via the adapter interface
- **Style-safe** — internals live in a Shadow DOM so the host page's CSS cannot bleed in
- **Themeable** — colors, radii, fonts, and layout are exposed via CSS custom properties and `::part()` selectors
- **React-ready** — core logic is decoupled from the UI layer; a React wrapper is planned for v2

## Documentation

- [docs/SPEC.md](./docs/SPEC.md) — full specification: public API, adapter contract, styling tokens, accessibility, build layout, test strategy
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

Node version is pinned via Volta. See `package.json` for the exact scripts.

## License

Not yet determined. Will be set before the first release.
