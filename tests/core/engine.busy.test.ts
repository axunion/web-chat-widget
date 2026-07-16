import { describe, expect, it } from "vitest";
import type { ChatStore } from "../../src/core/store.ts";
import type { AdapterChunk, ChatAdapter, Message } from "../../src/index.ts";
import { ChatEngine } from "../../src/index.ts";

// ---------------------------------------------------------------------------
// Fake adapter / store helpers (mirrors tests/core/engine.test.ts style)
// ---------------------------------------------------------------------------

function scriptedAdapter(chunks: AdapterChunk[]): ChatAdapter {
	return {
		async *send() {
			for (const c of chunks) {
				await Promise.resolve();
				yield c;
			}
		},
	};
}

// Yields nothing until its signal is aborted, then completes without a
// `done` chunk — simulates a request that never received a delta.
function hangingAdapter(): ChatAdapter & { signalRef: AbortSignal | null } {
	const self = {
		signalRef: null as AbortSignal | null,
		async *send(_messages: readonly Message[], signal: AbortSignal) {
			self.signalRef = signal;
			while (!signal.aborted) {
				await new Promise((r) => setTimeout(r, 5));
			}
		},
	};
	return self;
}

function fakeStore(
	initial: Message[] = [],
): ChatStore & { saveCalls: Message[][]; clearCalls: number } {
	let messages: Message[] = [...initial];
	const self = {
		saveCalls: [] as Message[][],
		clearCalls: 0,
		load() {
			return [...messages];
		},
		save(next: readonly Message[]) {
			self.saveCalls.push([...next]);
			messages = [...next];
		},
		clear() {
			self.clearCalls += 1;
			messages = [];
		},
	};
	return self;
}

function collectBusyEvents(engine: ChatEngine): boolean[] {
	const events: boolean[] = [];
	engine.addEventListener("busy", (e) => {
		events.push((e as CustomEvent<{ busy: boolean }>).detail.busy);
	});
	return events;
}

// ---------------------------------------------------------------------------
// PLAN.md P1 — Engine busy state, stop(), abort settlement
// ---------------------------------------------------------------------------

describe("ChatEngine.busy — reflects in-flight state", () => {
	it("is false initially, true while streaming, and false again after done", async () => {
		const adapter = scriptedAdapter([
			{ type: "text-delta", delta: "hi" },
			{ type: "done" },
		]);
		const engine = new ChatEngine({ adapter });

		expect(engine.busy).toBe(false);
		const sendPromise = engine.sendMessage("hello");
		expect(engine.busy).toBe(true);
		await sendPromise;
		expect(engine.busy).toBe(false);
	});
});

describe("ChatEngine.busy — event fires only on transitions", () => {
	it("fires busy:true once on start and busy:false once on settle, with no duplicate transition when a second send supersedes the first", async () => {
		let call = 0;
		const adapter: ChatAdapter = {
			async *send(_messages, signal) {
				call += 1;
				if (call === 1) {
					while (!signal.aborted) {
						await new Promise((r) => setTimeout(r, 5));
					}
					return;
				}
				await Promise.resolve();
				yield { type: "done" };
			},
		};
		const engine = new ChatEngine({ adapter });
		const events = collectBusyEvents(engine);

		const firstSend = engine.sendMessage("one");
		await new Promise((r) => setTimeout(r, 10));
		expect(events).toEqual([true]);

		const secondSend = engine.sendMessage("two");
		await secondSend;
		await firstSend;

		expect(events).toEqual([true, false]);
	});
});

describe("ChatEngine.stop — settles partial content to done", () => {
	it("keeps the partial content, sets status to done, saves via the store, and does not fire the message event", async () => {
		const store = fakeStore();
		const adapter: ChatAdapter = {
			async *send(_messages, signal) {
				yield { type: "text-delta", delta: "partial" };
				while (!signal.aborted) {
					await new Promise((r) => setTimeout(r, 5));
				}
			},
		};
		const engine = new ChatEngine({ adapter, store });
		let messageFired = false;
		engine.addEventListener("message", (e) => {
			const detail = (e as CustomEvent<{ role: string }>).detail;
			if (detail.role === "assistant") messageFired = true;
		});

		const sendPromise = engine.sendMessage("hi");
		await new Promise((r) => setTimeout(r, 10));

		engine.stop();

		const messages = engine.getMessages();
		const assistant = messages.find((m) => m.role === "assistant");
		expect(assistant?.content).toBe("partial");
		expect(assistant?.status).toBe("done");
		expect(store.saveCalls.length).toBeGreaterThanOrEqual(1);
		expect(messageFired).toBe(false);

		await sendPromise;
	});
});

describe("ChatEngine.stop — removes an empty placeholder when no content arrived yet", () => {
	it("removes the streaming assistant placeholder while keeping the user message", async () => {
		const store = fakeStore();
		const adapter = hangingAdapter();
		const engine = new ChatEngine({ adapter, store });

		const sendPromise = engine.sendMessage("hi");
		await new Promise((r) => setTimeout(r, 10));

		engine.stop();

		const messages = engine.getMessages();
		expect(messages).toHaveLength(1);
		expect(messages[0].role).toBe("user");
		expect(messages[0].content).toBe("hi");
		expect(store.saveCalls.length).toBeGreaterThanOrEqual(1);

		await sendPromise;
	});
});

describe("ChatEngine.stop — no-op when idle", () => {
	it("does nothing when called while no request is in flight", () => {
		const store = fakeStore();
		const engine = new ChatEngine({ adapter: scriptedAdapter([]), store });
		const events = collectBusyEvents(engine);

		engine.stop();

		expect(events).toHaveLength(0);
		expect(store.saveCalls).toHaveLength(0);
		expect(engine.busy).toBe(false);
	});
});

describe("ChatEngine.sendMessage — settles a previous streaming exchange before starting a new one", () => {
	it("never leaves the previous assistant message as streaming, and includes the settled partial as context for the new request", async () => {
		const store = fakeStore();
		const capturedMessagesPerCall: Message[][] = [];
		let call = 0;
		const adapter: ChatAdapter = {
			async *send(messages, signal) {
				call += 1;
				capturedMessagesPerCall.push([...messages]);
				if (call === 1) {
					yield { type: "text-delta", delta: "partial-one" };
					while (!signal.aborted) {
						await new Promise((r) => setTimeout(r, 5));
					}
					return;
				}
				await Promise.resolve();
				yield { type: "done" };
			},
		};
		const engine = new ChatEngine({ adapter, store });

		const firstSend = engine.sendMessage("first");
		await new Promise((r) => setTimeout(r, 10));

		const secondSend = engine.sendMessage("second");
		await secondSend;
		await firstSend;

		const messages = engine.getMessages();
		expect(messages.some((m) => m.status === "streaming")).toBe(false);

		const settled = messages.find((m) => m.content === "partial-one");
		expect(settled?.status).toBe("done");

		const secondCallMessages = capturedMessagesPerCall[1];
		expect(secondCallMessages.some((m) => m.content === "partial-one")).toBe(
			true,
		);
	});
});

describe("ChatEngine.retry — settles a previous streaming exchange before retrying", () => {
	it("never leaves a message stuck as streaming and keeps busy true across the transition", async () => {
		const store = fakeStore();
		let call = 0;
		const adapter: ChatAdapter = {
			async *send(_messages, signal) {
				call += 1;
				if (call === 1) {
					yield { type: "text-delta", delta: "partial" };
					while (!signal.aborted) {
						await new Promise((r) => setTimeout(r, 5));
					}
					return;
				}
				await Promise.resolve();
				yield { type: "text-delta", delta: "retried" };
				await Promise.resolve();
				yield { type: "done" };
			},
		};
		const engine = new ChatEngine({ adapter, store });
		const events = collectBusyEvents(engine);

		const firstSend = engine.sendMessage("hi");
		await new Promise((r) => setTimeout(r, 10));
		expect(events).toEqual([true]);

		await engine.retry();
		await firstSend;

		expect(engine.getMessages().some((m) => m.status === "streaming")).toBe(
			false,
		);
		expect(events).toEqual([true, false]);
		const finalAssistant = engine
			.getMessages()
			.find((m) => m.role === "assistant");
		expect(finalAssistant?.content).toBe("retried");
	});
});

describe("ChatEngine.clear — settles busy to false while streaming", () => {
	it("transitions busy to false and fires the event when clearing during an in-flight send", async () => {
		const adapter = hangingAdapter();
		const engine = new ChatEngine({ adapter });
		const events = collectBusyEvents(engine);

		const sendPromise = engine.sendMessage("hi");
		await new Promise((r) => setTimeout(r, 10));
		expect(engine.busy).toBe(true);

		engine.clear();

		expect(engine.busy).toBe(false);
		expect(events).toEqual([true, false]);

		await sendPromise;
	});
});

describe("ChatEngine.destroy — busy resets to false", () => {
	it("does not leave busy stuck at true when destroy() is called mid-stream", async () => {
		const adapter = hangingAdapter();
		const engine = new ChatEngine({ adapter });

		const sendPromise = engine.sendMessage("hi");
		await new Promise((r) => setTimeout(r, 10));
		expect(engine.busy).toBe(true);

		engine.destroy();

		expect(engine.busy).toBe(false);

		await sendPromise.catch(() => {
			/* ignore */
		});
	});
});

describe("ChatEngine.busy — settles to false on an error chunk", () => {
	it("fires busy:false when the adapter yields an error chunk", async () => {
		const adapter = scriptedAdapter([
			{ type: "error", error: new Error("boom") },
		]);
		const engine = new ChatEngine({ adapter });
		const events = collectBusyEvents(engine);

		await engine.sendMessage("hi");

		expect(events).toEqual([true, false]);
	});
});
