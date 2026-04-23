---
paths:
  - "src/adapters/**/*.ts"
---

# Adapter layer rules

Applies to everything under `src/adapters/`. The adapter layer is framework-neutral and must stay that way — React/Vue wrappers in v2+ reuse it as-is.

## Contract (from SPEC §8.1)

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

## Invariants

- Return an `AsyncIterable<AdapterChunk>` — use `async function*` generators. One generator call per `send` invocation.
- **Never throw synchronously.** Wrap failures in `{ type: "error", error }` and `yield` them. This keeps error handling uniform at the call site.
- **Honor `signal`.** Pass it into `fetch`, and in the generator loop check `signal.aborted` between chunks so the stream closes promptly on cancel.
- Always `yield { type: "done" }` as the terminal chunk for successful streams. After `done` or `error`, the iterator must end — do not emit further chunks.
- Release resources (reader locks, abort controllers) in `finally` blocks so cancellation never leaks.

## Shape of `send`'s inputs / outputs

- `messages` is `readonly`. Do not mutate it. Build any request body from a copy.
- Body serialization is adapter-specific but must match what SPEC §8.2 describes for the built-in adapters.
- Network / JSON parsing failures become `error` chunks, not rejected promises.

## Dependencies

- No runtime dependencies. Use native `fetch`, `ReadableStream`, `TextDecoder`, `AbortController`.
- SSE parsing is in `src/adapters/sse-parse.ts` — reuse it, do not write a second parser.

## Authentication reminder

- Do not hard-code API keys. Adapters accept a `headers` option; authentication is the integrator's responsibility and should normally go through their own backend.
