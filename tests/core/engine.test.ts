import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdapterChunk, ChatAdapter, Message } from "../../src/index.ts";
import { ChatEngine } from "../../src/index.ts";
import type { ChatEngineOptions } from "../../src/index.ts";

// ---------------------------------------------------------------------------
// Fake adapter helpers
// ---------------------------------------------------------------------------

function scriptedAdapter(chunks: AdapterChunk[]): ChatAdapter {
  return {
    async *send() {
      for (const c of chunks) {
        await Promise.resolve(); // microtask yield
        yield c;
      }
    },
  };
}

function capturingAdapter(chunks: AdapterChunk[]): ChatAdapter & {
  capturedMessages: Message[][];
  capturedSignal: AbortSignal | null;
} {
  const self = {
    capturedMessages: [] as Message[][],
    capturedSignal: null as AbortSignal | null,
    async *send(messages: readonly Message[], signal: AbortSignal) {
      self.capturedMessages.push([...messages]);
      self.capturedSignal = signal;
      for (const c of chunks) {
        await Promise.resolve();
        yield c;
      }
    },
  };
  return self;
}

function hangingAdapter(): ChatAdapter & { signalRef: AbortSignal | null } {
  const self = {
    signalRef: null as AbortSignal | null,
    async *send(_messages: readonly Message[], signal: AbortSignal) {
      self.signalRef = signal;
      // Yield forever until signal aborts
      while (!signal.aborted) {
        await new Promise((r) => setTimeout(r, 10));
      }
    },
  };
  return self;
}

// Adapter whose generator throws before yielding its first chunk
function throwingAdapter(error: Error): ChatAdapter {
  return {
    async *send() {
      await Promise.resolve();
      throw error;
    },
  };
}

// Adapter that pauses between chunks using a callback to allow mid-stream inspection
function pausingAdapter(
  chunks: AdapterChunk[],
  onPause?: () => void,
): ChatAdapter {
  return {
    async *send() {
      for (let i = 0; i < chunks.length; i++) {
        await Promise.resolve();
        if (i > 0 && onPause) onPause();
        yield chunks[i];
      }
    },
  };
}

// ---------------------------------------------------------------------------
// SPEC §4.2.1 — Construction & getMessages
// ---------------------------------------------------------------------------

describe("ChatEngine construction — empty initial state", () => {
  it("starts with no messages when no initialMessages option is provided", () => {
    const adapter = scriptedAdapter([]);
    const engine = new ChatEngine({ adapter });

    expect(engine.getMessages()).toHaveLength(0);
  });
});

describe("ChatEngine construction — initialMessages", () => {
  it("returns seeded messages deep-equal to the provided initialMessages array", () => {
    const m1: Message = {
      id: "seed-1",
      role: "user",
      content: "hello",
      createdAt: 1000,
    };
    const m2: Message = {
      id: "seed-2",
      role: "assistant",
      content: "hi there",
      createdAt: 2000,
      status: "done",
    };
    const engine = new ChatEngine({
      adapter: scriptedAdapter([]),
      initialMessages: [m1, m2],
    });

    const messages = engine.getMessages();
    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual(m1);
    expect(messages[1]).toEqual(m2);
  });
});

describe("ChatEngine — getMessages snapshot isolation", () => {
  it("mutating the returned array does not affect subsequent getMessages() calls", () => {
    const engine = new ChatEngine({ adapter: scriptedAdapter([]) });
    const snap = engine.getMessages() as Message[];
    // Push a fake message into the snapshot
    snap.push({
      id: "injected",
      role: "user",
      content: "injected",
      createdAt: 9999,
    });

    // Internal state must be unaffected
    expect(engine.getMessages()).toHaveLength(0);
  });
});

describe("ChatEngine — getMessages type signature", () => {
  it("returns readonly Message[] (compile-time guard via assignability)", () => {
    const engine = new ChatEngine({ adapter: scriptedAdapter([]) });
    // This line must typecheck: readonly Message[] is assignable from getMessages()
    const arr: readonly Message[] = engine.getMessages();
    expect(arr).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// SPEC §6.5 — sendMessage streaming semantics
// ---------------------------------------------------------------------------

describe("ChatEngine.sendMessage — user message appended", () => {
  it("adds a user message with role='user' and the supplied content", async () => {
    const adapter = scriptedAdapter([{ type: "done" }]);
    const engine = new ChatEngine({ adapter });

    await engine.sendMessage("hello world");

    const messages = engine.getMessages();
    const userMsg = messages.find((m) => m.role === "user");
    expect(userMsg).toBeDefined();
    expect(userMsg?.content).toBe("hello world");
    expect(userMsg?.role).toBe("user");
  });
});

describe("ChatEngine.sendMessage — single delta plus done", () => {
  it("produces an assistant message with accumulated content and status='done'", async () => {
    const adapter = scriptedAdapter([
      { type: "text-delta", delta: "A" },
      { type: "done" },
    ]);
    const engine = new ChatEngine({ adapter });

    await engine.sendMessage("hi");

    const messages = engine.getMessages();
    const assistantMsg = messages.find((m) => m.role === "assistant");
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg?.content).toBe("A");
    expect(assistantMsg?.status).toBe("done");
  });
});

describe("ChatEngine.sendMessage — multiple deltas accumulate", () => {
  it("concatenates three text-delta chunks into the assistant message content", async () => {
    const adapter = scriptedAdapter([
      { type: "text-delta", delta: "A" },
      { type: "text-delta", delta: "B" },
      { type: "text-delta", delta: "C" },
      { type: "done" },
    ]);
    const engine = new ChatEngine({ adapter });

    await engine.sendMessage("hi");

    const messages = engine.getMessages();
    const assistantMsg = messages.find((m) => m.role === "assistant");
    expect(assistantMsg?.content).toBe("ABC");
  });
});

describe("ChatEngine.sendMessage — streaming status transitions", () => {
  it("message event fires exactly once at completion (implying streaming ended with status=done)", async () => {
    const adapter = scriptedAdapter([
      { type: "text-delta", delta: "X" },
      { type: "done" },
    ]);
    const engine = new ChatEngine({ adapter });

    let messageEventCount = 0;
    engine.addEventListener("message", () => {
      messageEventCount += 1;
    });

    await engine.sendMessage("test");

    // The message event fires once at done — confirms streaming->done transition
    expect(messageEventCount).toBe(1);

    // Final state must be done
    const assistantMsg = engine
      .getMessages()
      .find((m) => m.role === "assistant");
    expect(assistantMsg?.status).toBe("done");
  });
});

describe("ChatEngine.sendMessage — adapter receives current messages", () => {
  it("passes the full message list (including the new user message) to adapter.send", async () => {
    const adapter = capturingAdapter([{ type: "done" }]);
    const engine = new ChatEngine({ adapter });

    await engine.sendMessage("ping");

    expect(adapter.capturedMessages).toHaveLength(1);
    const sentMessages = adapter.capturedMessages[0];
    // Must include at minimum the user message just sent
    const userMsg = sentMessages.find((m) => m.role === "user");
    expect(userMsg).toBeDefined();
    expect(userMsg?.content).toBe("ping");
  });
});

// ---------------------------------------------------------------------------
// SPEC §4.3 — message event semantics
// ---------------------------------------------------------------------------

describe("ChatEngine — message event fires once per completion", () => {
  it("fires exactly once with role='assistant' and the full accumulated content", async () => {
    const adapter = scriptedAdapter([
      { type: "text-delta", delta: "Hello " },
      { type: "text-delta", delta: "world" },
      { type: "done" },
    ]);
    const engine = new ChatEngine({ adapter });

    const received: Array<{ role: string; content: string }> = [];
    engine.addEventListener("message", (rawEvt) => {
      const evt = rawEvt as CustomEvent<{ role: string; content: string }>;
      received.push({ role: evt.detail.role, content: evt.detail.content });
    });

    await engine.sendMessage("hi");

    expect(received).toHaveLength(1);
    expect(received[0].role).toBe("assistant");
    expect(received[0].content).toBe("Hello world");
  });
});

describe("ChatEngine — message event does not fire mid-stream", () => {
  it("no message event fires while text-delta chunks arrive, only at done", async () => {
    let messageEventCount = 0;
    let deltaCount = 0;

    // We need to count events fired per delta. Use a custom adapter with a
    // listener injected between yields by tracking counts at each step.
    // Strategy: use a "counter" that we compare during the send loop.
    const eventCountPerDelta: number[] = [];

    const adapter: ChatAdapter = {
      async *send() {
        await Promise.resolve();
        yield { type: "text-delta", delta: "A" };
        eventCountPerDelta.push(messageEventCount);
        deltaCount += 1;

        await Promise.resolve();
        yield { type: "text-delta", delta: "B" };
        eventCountPerDelta.push(messageEventCount);
        deltaCount += 1;

        await Promise.resolve();
        yield { type: "done" };
      },
    };

    const engine = new ChatEngine({ adapter });
    engine.addEventListener("message", () => {
      messageEventCount += 1;
    });

    await engine.sendMessage("test");

    expect(deltaCount).toBe(2);
    // At the point each delta was yielded, no message event should have fired yet
    for (const count of eventCountPerDelta) {
      expect(count).toBe(0);
    }
    // After completion the event fires once
    expect(messageEventCount).toBe(1);
  });
});

describe("ChatEngine — two sequential sends fire message event twice", () => {
  it("fires the message event twice total after two sendMessage calls", async () => {
    const adapter = scriptedAdapter([
      { type: "text-delta", delta: "resp" },
      { type: "done" },
    ]);

    // We need to send twice, so use capturingAdapter that always yields the same chunks
    const adapter2: ChatAdapter = {
      async *send() {
        await Promise.resolve();
        yield { type: "text-delta", delta: "resp" };
        await Promise.resolve();
        yield { type: "done" };
      },
    };

    const engine = new ChatEngine({ adapter: adapter2 });
    let count = 0;
    engine.addEventListener("message", () => {
      count += 1;
    });

    await engine.sendMessage("first");
    await engine.sendMessage("second");

    expect(count).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// SPEC §6.7 — error handling
// ---------------------------------------------------------------------------

describe("ChatEngine — error chunk sets status and fires error event", () => {
  it("sets assistant message status to 'error' and fires an error event with the same Error instance", async () => {
    const originalError = new Error("adapter error");
    const adapter = scriptedAdapter([
      { type: "error", error: originalError },
    ]);
    const engine = new ChatEngine({ adapter });

    let receivedError: Error | undefined;
    engine.addEventListener("error", (rawEvt) => {
      const evt = rawEvt as CustomEvent<{ error: Error }>;
      receivedError = evt.detail.error;
    });

    await engine.sendMessage("hi");

    const messages = engine.getMessages();
    const assistantMsg = messages.find((m) => m.role === "assistant");
    expect(assistantMsg?.status).toBe("error");
    expect(receivedError).toBe(originalError);
  });
});

describe("ChatEngine — error chunk produces final state", () => {
  it("after an error chunk, the assistant message content reflects only deltas before the error", async () => {
    const error = new Error("boom");
    const adapter = scriptedAdapter([
      { type: "text-delta", delta: "partial" },
      { type: "error", error },
    ]);
    const engine = new ChatEngine({ adapter });

    await engine.sendMessage("hi");

    const messages = engine.getMessages();
    const assistantMsg = messages.find((m) => m.role === "assistant");
    // Content before the error is preserved, status is error
    expect(assistantMsg?.content).toBe("partial");
    expect(assistantMsg?.status).toBe("error");
  });
});

describe("ChatEngine — thrown exception from adapter produces error state", () => {
  it("a rejection inside the generator fires the error event and marks assistant status='error'", async () => {
    const networkError = new Error("network failure");
    const adapter = throwingAdapter(networkError);
    const engine = new ChatEngine({ adapter });

    let receivedError: Error | undefined;
    engine.addEventListener("error", (rawEvt) => {
      const evt = rawEvt as CustomEvent<{ error: Error }>;
      receivedError = evt.detail.error;
    });

    await engine.sendMessage("hi");

    const messages = engine.getMessages();
    const assistantMsg = messages.find((m) => m.role === "assistant");
    expect(assistantMsg?.status).toBe("error");
    expect(receivedError).toBeInstanceOf(Error);
    expect(receivedError?.message).toBe("network failure");
  });
});

// ---------------------------------------------------------------------------
// SPEC §4.2.3 — retry
// ---------------------------------------------------------------------------

describe("ChatEngine.retry — no-op with no prior user message", () => {
  it("resolves without throwing when there is no prior user message", async () => {
    const engine = new ChatEngine({ adapter: scriptedAdapter([]) });
    // Must resolve (no-op), not throw
    await expect(engine.retry()).resolves.toBeUndefined();
  });
});

describe("ChatEngine.retry — re-sends the last user message", () => {
  it("calls adapter.send a second time and the sent messages include the last user message", async () => {
    const adapter = capturingAdapter([{ type: "done" }]);
    const engine = new ChatEngine({ adapter });

    await engine.sendMessage("original message");

    // Now retry — should trigger another send
    await engine.retry();

    expect(adapter.capturedMessages).toHaveLength(2);
    const secondSendMessages = adapter.capturedMessages[1];
    const userMsg = secondSendMessages.find((m) => m.role === "user");
    expect(userMsg).toBeDefined();
    expect(userMsg?.content).toBe("original message");
  });
});

describe("ChatEngine.retry — after error, assistant message reaches done on success", () => {
  it("replaces or appends a new assistant message that reaches status='done' after retry", async () => {
    const error = new Error("first attempt failed");

    let callCount = 0;
    const adapter: ChatAdapter = {
      async *send() {
        callCount += 1;
        await Promise.resolve();
        if (callCount === 1) {
          yield { type: "error", error };
        } else {
          yield { type: "text-delta", delta: "retry response" };
          yield { type: "done" };
        }
      },
    };

    const engine = new ChatEngine({ adapter });
    await engine.sendMessage("test");

    // First assistant message should be errored
    const afterError = engine.getMessages();
    const erroredMsg = afterError.find(
      (m) => m.role === "assistant" && m.status === "error",
    );
    expect(erroredMsg).toBeDefined();

    // Retry
    await engine.retry();

    const afterRetry = engine.getMessages();
    const doneMsg = afterRetry.find(
      (m) => m.role === "assistant" && m.status === "done",
    );
    expect(doneMsg).toBeDefined();
    expect(doneMsg?.content).toBe("retry response");
  });
});

// ---------------------------------------------------------------------------
// SPEC §4.2.3 — clear
// ---------------------------------------------------------------------------

describe("ChatEngine.clear — empties messages", () => {
  it("returns an empty array from getMessages() after clear()", async () => {
    const adapter = scriptedAdapter([
      { type: "text-delta", delta: "hi" },
      { type: "done" },
    ]);
    const engine = new ChatEngine({ adapter });
    await engine.sendMessage("hello");

    engine.clear();

    expect(engine.getMessages()).toHaveLength(0);
  });
});

describe("ChatEngine.clear — aborts in-flight send", () => {
  it("aborts the adapter's AbortSignal when clear() is called during streaming", async () => {
    const adapter = hangingAdapter();
    const engine = new ChatEngine({ adapter });

    // Start a send but don't await — let it hang
    const sendPromise = engine.sendMessage("test");

    // Give the adapter time to register its signal
    await new Promise((r) => setTimeout(r, 20));
    expect(adapter.signalRef).not.toBeNull();
    expect(adapter.signalRef?.aborted).toBe(false);

    engine.clear();

    expect(adapter.signalRef?.aborted).toBe(true);

    // Let the promise settle (the generator should exit due to signal)
    await sendPromise.catch(() => {
      /* ignore */
    });
  });
});

// ---------------------------------------------------------------------------
// SPEC §4.2.3 — destroy
// ---------------------------------------------------------------------------

describe("ChatEngine.destroy — aborts in-flight send", () => {
  it("aborts the adapter's AbortSignal when destroy() is called during streaming", async () => {
    const adapter = hangingAdapter();
    const engine = new ChatEngine({ adapter });

    const sendPromise = engine.sendMessage("test");

    await new Promise((r) => setTimeout(r, 20));
    expect(adapter.signalRef?.aborted).toBe(false);

    engine.destroy();

    expect(adapter.signalRef?.aborted).toBe(true);

    await sendPromise.catch(() => {
      /* ignore */
    });
  });
});

describe("ChatEngine.destroy — sendMessage throws after destroy", () => {
  it("throws an error when sendMessage is called on a destroyed engine", async () => {
    const engine = new ChatEngine({ adapter: scriptedAdapter([]) });
    engine.destroy();

    await expect(engine.sendMessage("hi")).rejects.toThrow();
  });
});

describe("ChatEngine.destroy — clear throws after destroy", () => {
  it("throws an error when clear() is called on a destroyed engine", () => {
    const engine = new ChatEngine({ adapter: scriptedAdapter([]) });
    engine.destroy();

    expect(() => engine.clear()).toThrow();
  });
});

// ---------------------------------------------------------------------------
// SPEC §4.3 / §13.1 — EventTarget contract
// ---------------------------------------------------------------------------

describe("ChatEngine — EventTarget inheritance", () => {
  it("ChatEngine instance is an instanceof EventTarget", () => {
    const engine = new ChatEngine({ adapter: scriptedAdapter([]) });
    expect(engine).toBeInstanceOf(EventTarget);
  });
});

describe("ChatEngine — message event detail shape", () => {
  it("the message event is a CustomEvent whose detail has role and content properties", async () => {
    const adapter = scriptedAdapter([
      { type: "text-delta", delta: "response" },
      { type: "done" },
    ]);
    const engine = new ChatEngine({ adapter });

    let capturedDetail: { role?: string; content?: string } = {};
    engine.addEventListener("message", (rawEvt) => {
      const evt = rawEvt as CustomEvent;
      capturedDetail = evt.detail as { role: string; content: string };
    });

    await engine.sendMessage("ping");

    expect(capturedDetail).toHaveProperty("role");
    expect(capturedDetail).toHaveProperty("content");
    expect(capturedDetail.role).toBe("assistant");
    expect(capturedDetail.content).toBe("response");
  });
});
