import { describe, expect, it } from "vitest";
import type { ChatEventMap, ChatEventType } from "../../src/index.ts";
import { createChatEvent } from "../../src/index.ts";

// SPEC §4.3 — ChatEventMap, ChatEventType, createChatEvent

// -------------------------------------------------------------------------
// Basic shape — five event types
// -------------------------------------------------------------------------

describe("createChatEvent — basic shape for void events", () => {
  it("returns a CustomEvent instance with type 'ready' for createChatEvent('ready', undefined)", () => {
    const evt = createChatEvent("ready", undefined);
    expect(evt).toBeInstanceOf(CustomEvent);
    expect(evt.type).toBe("ready");
  });

  it("returns an event with type 'open' for createChatEvent('open', undefined)", () => {
    const evt = createChatEvent("open", undefined);
    expect(evt).toBeInstanceOf(CustomEvent);
    expect(evt.type).toBe("open");
  });

  it("returns an event with type 'close' for createChatEvent('close', undefined)", () => {
    const evt = createChatEvent("close", undefined);
    expect(evt).toBeInstanceOf(CustomEvent);
    expect(evt.type).toBe("close");
  });

  it("returns an event with type 'message' and correct detail for a user message", () => {
    const evt = createChatEvent("message", { role: "user", content: "hi" });
    expect(evt.type).toBe("message");
    expect(evt.detail.role).toBe("user");
    expect(evt.detail.content).toBe("hi");
  });

  it("returns an event with type 'error' and detail.error.message matching the original error", () => {
    const original = new Error("boom");
    const evt = createChatEvent("error", { error: original });
    expect(evt.type).toBe("error");
    expect(evt.detail.error.message).toBe("boom");
  });
});

// -------------------------------------------------------------------------
// Detail preservation
// -------------------------------------------------------------------------

describe("createChatEvent — detail preservation", () => {
  it("preserves assistant role in message detail unchanged", () => {
    const evt = createChatEvent("message", {
      role: "assistant",
      content: "Hello, how can I help?",
    });
    expect(evt.detail.role).toBe("assistant");
    expect(evt.detail.content).toBe("Hello, how can I help?");
  });

  it("preserves message content exactly, including multibyte characters and empty string", () => {
    const multibyte = "こんにちは world 🌏";
    const evtMultibyte = createChatEvent("message", {
      role: "user",
      content: multibyte,
    });
    expect(evtMultibyte.detail.content).toBe(multibyte);

    const evtEmpty = createChatEvent("message", { role: "assistant", content: "" });
    expect(evtEmpty.detail.content).toBe("");
  });

  it("error detail holds the original Error instance (reference equality)", () => {
    const err = new Error("original error");
    const evt = createChatEvent("error", { error: err });
    expect(evt.detail.error).toBe(err);
  });
});

// -------------------------------------------------------------------------
// Bubbling / composed — widget events should not bubble by default
// -------------------------------------------------------------------------

describe("createChatEvent — bubbles and cancelable flags", () => {
  it("returned event has bubbles === false", () => {
    const evt = createChatEvent("ready", undefined);
    expect(evt.bubbles).toBe(false);
  });

  it("returned event has cancelable === false", () => {
    const evt = createChatEvent("ready", undefined);
    expect(evt.cancelable).toBe(false);
  });
});

// -------------------------------------------------------------------------
// EventTarget integration
// -------------------------------------------------------------------------

describe("createChatEvent — EventTarget dispatch", () => {
  it("a 'message' listener on an EventTarget receives the event and can read detail.content", () => {
    const target = new EventTarget();
    let receivedContent: string | undefined;

    target.addEventListener("message", (rawEvt) => {
      const evt = rawEvt as CustomEvent<ChatEventMap["message"]>;
      receivedContent = evt.detail.content;
    });

    const evt = createChatEvent("message", { role: "user", content: "dispatched" });
    target.dispatchEvent(evt);

    expect(receivedContent).toBe("dispatched");
  });

  it("an 'error' listener on an EventTarget receives an event whose detail.error is the original Error", () => {
    const target = new EventTarget();
    const originalError = new Error("network failure");
    let receivedError: Error | undefined;

    target.addEventListener("error", (rawEvt) => {
      const evt = rawEvt as CustomEvent<ChatEventMap["error"]>;
      receivedError = evt.detail.error;
    });

    const evt = createChatEvent("error", { error: originalError });
    target.dispatchEvent(evt);

    expect(receivedError).toBe(originalError);
  });
});

// -------------------------------------------------------------------------
// Compile-time shape guard: ChatEventType must be a union of the five keys
// -------------------------------------------------------------------------

describe("ChatEventType — type coverage", () => {
  it("'ready' is a valid ChatEventType (compile-time check via runtime usage)", () => {
    const type: ChatEventType = "ready";
    expect(type).toBe("ready");
  });

  it("'message' is a valid ChatEventType", () => {
    const type: ChatEventType = "message";
    expect(type).toBe("message");
  });

  it("'error' is a valid ChatEventType", () => {
    const type: ChatEventType = "error";
    expect(type).toBe("error");
  });
});
