import { describe, expect, it } from "vitest";
import type { Message } from "../../src/index.ts";
import { ChatEngine } from "../../src/index.ts";
import { ObservableEngine } from "../../src/ui/observable-engine.ts";
import {
	scriptedAdapter,
	spacedAdapter,
} from "../helpers/fake-adapters.ts";

// ---------------------------------------------------------------------------
// SPEC §13.1 — ObservableEngine subscribe contract
// ---------------------------------------------------------------------------

describe("ObservableEngine — getMessages delegation", () => {
	it("mirrors the wrapped engine's messages on construction", () => {
		const seed: Message = {
			id: "seed-1",
			role: "assistant",
			content: "hello",
			createdAt: 1000,
			status: "done",
		};
		const engine = new ChatEngine({
			adapter: scriptedAdapter([]),
			initialMessages: [seed],
		});
		const observable = new ObservableEngine(engine);

		expect(observable.getMessages()).toEqual(engine.getMessages());
	});
});

describe("ObservableEngine.subscribe — returns unsubscribe", () => {
	it("stops invoking the listener after the returned function is called", async () => {
		const engine = new ChatEngine({
			adapter: scriptedAdapter([
				{ type: "text-delta", delta: "hi" },
				{ type: "done" },
			]),
		});
		const observable = new ObservableEngine(engine);
		let calls = 0;
		const unsubscribe = observable.subscribe(() => {
			calls += 1;
		});

		expect(typeof unsubscribe).toBe("function");
		unsubscribe();
		await observable.sendMessage("ping");

		expect(calls).toBe(0);
	});
});

describe("ObservableEngine.sendMessage — notifies subscribers during send", () => {
	it("invokes the listener at least once before sendMessage() resolves", async () => {
		const engine = new ChatEngine({
			adapter: scriptedAdapter([
				{ type: "text-delta", delta: "A" },
				{ type: "done" },
			]),
		});
		const observable = new ObservableEngine(engine);
		let calls = 0;
		observable.subscribe(() => {
			calls += 1;
		});

		await observable.sendMessage("ping");

		expect(calls).toBeGreaterThan(0);
	});
});

describe("ObservableEngine.sendMessage — final snapshot reflects terminal state", () => {
	it("the last snapshot delivered contains the assistant message with status='done'", async () => {
		const engine = new ChatEngine({
			adapter: scriptedAdapter([
				{ type: "text-delta", delta: "pong" },
				{ type: "done" },
			]),
		});
		const observable = new ObservableEngine(engine);
		let lastSnapshot: readonly Message[] = [];
		observable.subscribe((msgs) => {
			lastSnapshot = msgs;
		});

		await observable.sendMessage("ping");

		const assistant = lastSnapshot.find((m) => m.role === "assistant");
		expect(assistant?.status).toBe("done");
		expect(assistant?.content).toBe("pong");
	});
});

describe("ObservableEngine.sendMessage — notifies on error completion too", () => {
	it("the final snapshot contains the assistant message with status='error'", async () => {
		const engine = new ChatEngine({
			adapter: scriptedAdapter([{ type: "error", error: new Error("boom") }]),
		});
		const observable = new ObservableEngine(engine);
		let lastSnapshot: readonly Message[] = [];
		observable.subscribe((msgs) => {
			lastSnapshot = msgs;
		});

		await observable.sendMessage("ping");

		const assistant = lastSnapshot.find((m) => m.role === "assistant");
		expect(assistant?.status).toBe("error");
	});
});

describe("ObservableEngine.sendMessage — batches intermediate deltas", () => {
	it("notifies more than once when multiple deltas arrive across frames", async () => {
		const engine = new ChatEngine({
			adapter: spacedAdapter(["alpha", "beta", "gamma"]),
		});
		const observable = new ObservableEngine(engine);
		let calls = 0;
		observable.subscribe(() => {
			calls += 1;
		});

		await observable.sendMessage("ping");

		expect(calls).toBeGreaterThan(1);
	});
});

describe("ObservableEngine.retry — notifies subscribers", () => {
	it("invokes the listener while retry() is in flight", async () => {
		let callCount = 0;
		const engine = new ChatEngine({
			adapter: {
				async *send() {
					callCount += 1;
					await Promise.resolve();
					yield {
						type: "text-delta",
						delta: callCount === 1 ? "first" : "second",
					};
					yield { type: "done" };
				},
			},
		});
		const observable = new ObservableEngine(engine);

		await observable.sendMessage("hi");

		let calls = 0;
		observable.subscribe(() => {
			calls += 1;
		});
		await observable.retry();

		expect(calls).toBeGreaterThan(0);
	});
});

describe("ObservableEngine.clear — delegates and notifies subscribers", () => {
	it("empties the wrapped engine and fires a final empty snapshot to subscribers", async () => {
		const engine = new ChatEngine({
			adapter: scriptedAdapter([
				{ type: "text-delta", delta: "hello" },
				{ type: "done" },
			]),
		});
		const observable = new ObservableEngine(engine);
		await observable.sendMessage("hi");
		expect(engine.getMessages().length).toBeGreaterThan(0);

		let lastSnapshot: readonly Message[] | null = null;
		observable.subscribe((msgs) => {
			lastSnapshot = msgs;
		});
		observable.clear();

		expect(engine.getMessages()).toHaveLength(0);
		expect(lastSnapshot).not.toBeNull();
		expect((lastSnapshot as readonly Message[]).length).toBe(0);
	});
});

describe("ObservableEngine.destroy — stops notifying and delegates to engine", () => {
	it("does not invoke subscribers after destroy and leaves the engine destroyed", async () => {
		const engine = new ChatEngine({
			adapter: scriptedAdapter([
				{ type: "text-delta", delta: "x" },
				{ type: "done" },
			]),
		});
		const observable = new ObservableEngine(engine);
		let calls = 0;
		observable.subscribe(() => {
			calls += 1;
		});

		observable.destroy();

		await expect(engine.sendMessage("hi")).rejects.toThrow();
		expect(calls).toBe(0);
	});
});
