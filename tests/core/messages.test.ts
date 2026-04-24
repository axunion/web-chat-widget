import { describe, expect, it } from "vitest";
import type { Message } from "../../src/index.ts";
import { createMessage } from "../../src/index.ts";

// SPEC §4.4 — Message interface
// SPEC §6.1 — role semantics and createMessage factory

describe("Message interface shape", () => {
  it("returns an object with all required fields", () => {
    const msg = createMessage("user", "hello");

    expect(typeof msg.id).toBe("string");
    expect(typeof msg.role).toBe("string");
    expect(typeof msg.content).toBe("string");
    expect(typeof msg.createdAt).toBe("number");
  });
});

describe("createMessage — id generation", () => {
  it("auto-generates a non-empty id when none is supplied", () => {
    const msg = createMessage("user", "hello");
    expect(msg.id.length).toBeGreaterThan(0);
  });

  it("generates unique ids across consecutive calls", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 10; i++) {
      ids.add(createMessage("user", `message ${i}`).id);
    }
    // All 10 must be distinct
    expect(ids.size).toBe(10);
  });
});

describe("createMessage — createdAt", () => {
  it("sets createdAt to a finite positive epoch-ms value", () => {
    const before = Date.now();
    const msg = createMessage("user", "timing test");
    const after = Date.now();

    expect(Number.isFinite(msg.createdAt)).toBe(true);
    expect(msg.createdAt).toBeGreaterThan(0);
    expect(msg.createdAt).toBeGreaterThanOrEqual(before);
    expect(msg.createdAt).toBeLessThanOrEqual(after);
  });
});

describe("createMessage — role", () => {
  it("passes the 'user' role through unchanged", () => {
    const msg = createMessage("user", "hi");
    expect(msg.role).toBe("user");
  });

  it("passes the 'assistant' role through unchanged", () => {
    const msg = createMessage("assistant", "hi");
    expect(msg.role).toBe("assistant");
  });

  it("passes the 'system' role through unchanged", () => {
    const msg = createMessage("system", "you are helpful");
    expect(msg.role).toBe("system");
  });
});

describe("createMessage — content", () => {
  it("passes content through unchanged", () => {
    const text = "**bold** and `code` and normal text";
    const msg = createMessage("user", text);
    expect(msg.content).toBe(text);
  });

  it("preserves an empty string as content", () => {
    const msg = createMessage("assistant", "");
    expect(msg.content).toBe("");
  });
});

describe("createMessage — overrides: status", () => {
  it("sets status to 'streaming' when provided via overrides", () => {
    const msg = createMessage("assistant", "...", { status: "streaming" });
    expect(msg.status).toBe("streaming");
  });

  it("sets status to 'done' when provided via overrides", () => {
    const msg = createMessage("assistant", "finished", { status: "done" });
    expect(msg.status).toBe("done");
  });

  it("sets status to 'error' when provided via overrides", () => {
    const msg = createMessage("assistant", "", { status: "error" });
    expect(msg.status).toBe("error");
  });

  it("leaves status undefined when no overrides are supplied", () => {
    const msg = createMessage("user", "no status");
    expect(msg.status).toBeUndefined();
  });
});

describe("createMessage — overrides: id and createdAt", () => {
  it("uses the provided id override instead of auto-generating one", () => {
    const fixedId = "test-id-abc-123";
    const msg = createMessage("user", "content", { id: fixedId });
    expect(msg.id).toBe(fixedId);
  });

  it("uses the provided createdAt override instead of Date.now()", () => {
    const fixedTime = 1_700_000_000_000;
    const msg = createMessage("user", "content", { createdAt: fixedTime });
    expect(msg.createdAt).toBe(fixedTime);
  });

  it("allows supplying both id and createdAt overrides simultaneously", () => {
    const fixedId = "rehydrated-id";
    const fixedTime = 1_000_000_000_000;
    const msg = createMessage("assistant", "rehydrated content", {
      id: fixedId,
      createdAt: fixedTime,
    });
    expect(msg.id).toBe(fixedId);
    expect(msg.createdAt).toBe(fixedTime);
  });
});

// Compile-time shape guard: assigning createMessage output to Message must typecheck.
// If the Message interface is missing a field this will fail at build time.
describe("Message type compatibility", () => {
  it("result of createMessage is assignable to the Message interface", () => {
    const msg: Message = createMessage("user", "type check");
    expect(msg).toBeDefined();
  });
});
