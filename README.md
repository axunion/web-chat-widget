# web-chat-widget

A distributable package that embeds a floating AI chat UI into any web page. Zero runtime dependencies, built on web standards only.

> **Status**: specification draft. No implementation yet. The authoritative design document is [docs/SPEC.md](./docs/SPEC.md). Usage examples will be added to this README once the public API is implemented and stable.

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
pnpm dev      # Vite dev server (demo page)
pnpm build    # library build
pnpm check    # Biome lint / format check
pnpm test     # Vitest unit tests
```

Node version is pinned via Volta. See `package.json` for the exact scripts.

## License

Not yet determined. Will be set before the first release.
