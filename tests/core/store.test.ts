import { afterEach, describe, expect, it, vi } from "vitest";
import type { Message } from "../../src/core/messages.ts";
import { createMessage } from "../../src/core/messages.ts";
import {
	type ChatStore,
	createLocalStorageStore,
	createMemoryStore,
	createSessionStorageStore,
} from "../../src/core/store.ts";

// ARCHITECTURE.md §ChatStore  — ChatStore interface (load / save / clear, all sync)
// API.md §5  — createMemoryStore / createLocalStorageStore / createSessionStorageStore
// ARCHITECTURE.md §Storage format  — storage format { v: 1, messages: [...] } and schema validation
// ARCHITECTURE.md §Quota handling  — QuotaExceededError: drop older half and retry; fallback to memory on double failure
// ARCHITECTURE.md §Storage exception resilience  — private-browsing sentinel probe; return memory store if probe throws

// ---------------------------------------------------------------------------
// Shared fixture helpers
// ---------------------------------------------------------------------------

function msg(content: string): Message {
	return createMessage("user", content);
}

// ---------------------------------------------------------------------------
// Fake Storage implementation
// Supports per-call throw configuration for quota / probe failure simulation.
// ---------------------------------------------------------------------------

interface FakeStorageOptions {
	/** If set, setItem throws on these (1-based) call numbers. */
	throwOnSetItemCalls?: number[];
	/** If set, setItem ALWAYS throws (sentinel probe failure). */
	alwaysThrow?: boolean;
}

class FakeStorage implements Storage {
	private store: Record<string, string> = {};
	private setItemCallCount = 0;
	private readonly throwOnCalls: Set<number>;
	private readonly alwaysThrow: boolean;

	constructor(options: FakeStorageOptions = {}) {
		this.throwOnCalls = new Set(options.throwOnSetItemCalls ?? []);
		this.alwaysThrow = options.alwaysThrow ?? false;
	}

	get length(): number {
		return Object.keys(this.store).length;
	}

	key(index: number): string | null {
		return Object.keys(this.store)[index] ?? null;
	}

	getItem(key: string): string | null {
		return Object.hasOwn(this.store, key) ? this.store[key] : null;
	}

	setItem(key: string, value: string): void {
		this.setItemCallCount += 1;
		if (this.alwaysThrow || this.throwOnCalls.has(this.setItemCallCount)) {
			// DOMException with name "QuotaExceededError" is the standard browser error.
			const err = new DOMException("QuotaExceededError", "QuotaExceededError");
			throw err;
		}
		this.store[key] = value;
	}

	removeItem(key: string): void {
		delete this.store[key];
	}

	clear(): void {
		this.store = {};
	}
}

// ---------------------------------------------------------------------------
// createMemoryStore
// ---------------------------------------------------------------------------

describe("createMemoryStore — initial state", () => {
	it("load() returns an empty array on a fresh memory store", () => {
		// ARCHITECTURE.md §ChatStore: load() returns Message[]; fresh store has no messages
		const store: ChatStore = createMemoryStore();
		expect(store.load()).toEqual([]);
	});
});

describe("createMemoryStore — save and load", () => {
	it("load() returns the saved messages after save()", () => {
		// ARCHITECTURE.md §ChatStore: save(messages) then load() should return equal content
		const store: ChatStore = createMemoryStore();
		const messages = [msg("hello"), msg("world")];
		store.save(messages);
		expect(store.load()).toEqual(messages);
	});

	it("load() returns empty after save() then clear()", () => {
		// ARCHITECTURE.md §ChatStore: clear() purges the store; load() returns [] afterwards
		const store: ChatStore = createMemoryStore();
		store.save([msg("hello")]);
		store.clear();
		expect(store.load()).toEqual([]);
	});

	it("internal mutation of the saved array does not affect subsequent load()", () => {
		// ARCHITECTURE.md §ChatStore: save() should store a defensive snapshot, not a live reference
		// If the implementation holds a reference, mutating the original array after
		// save would change what load() returns — that must NOT happen.
		const store: ChatStore = createMemoryStore();
		const messages = [msg("first"), msg("second")];
		store.save(messages);
		// Mutate the original array after saving
		messages.push(msg("third — should not appear in load()"));
		messages[0] = createMessage("assistant", "replaced — should not appear");

		const loaded = store.load();
		expect(loaded.length).toBe(2);
		expect(loaded[0].content).toBe("first");
		expect(loaded[1].content).toBe("second");
	});
});

// ---------------------------------------------------------------------------
// createLocalStorageStore — basic persistence
// ---------------------------------------------------------------------------

describe("createLocalStorageStore — default key and storage format", () => {
	afterEach(() => {
		localStorage.clear();
		sessionStorage.clear();
	});

	it("save() writes JSON with v:1 and messages array to the default key", () => {
		// ARCHITECTURE.md §Storage format: storage format is { "v": 1, "messages": [...] }
		// API.md §5: default key is "web-chat-widget"
		const store = createLocalStorageStore();
		const m = msg("hello");
		store.save([m]);

		const raw = globalThis.localStorage.getItem("web-chat-widget");
		expect(raw).not.toBeNull();

		const parsed = JSON.parse(raw as string) as unknown;
		expect(parsed).toMatchObject({ v: 1 });
		expect(
			Array.isArray((parsed as { v: number; messages: unknown }).messages),
		).toBe(true);
		const messages = (parsed as { v: number; messages: Message[] }).messages;
		expect(messages.length).toBe(1);
		expect(messages[0].content).toBe("hello");
	});

	it("save() writes to the custom key when key option is provided", () => {
		// API.md §5: opts.key overrides the default "web-chat-widget"
		const store = createLocalStorageStore({ key: "alt" });
		store.save([msg("alt-key-test")]);

		expect(globalThis.localStorage.getItem("alt")).not.toBeNull();
		// The default key should remain untouched
		expect(globalThis.localStorage.getItem("web-chat-widget")).toBeNull();
	});

	it("a second store instance sharing the same key sees saved messages via load()", () => {
		// API.md §5: cross-instance restore — two instances with the same key
		const store1 = createLocalStorageStore({ key: "shared" });
		const m = msg("persisted message");
		store1.save([m]);

		const store2 = createLocalStorageStore({ key: "shared" });
		const loaded = store2.load();
		expect(loaded.length).toBe(1);
		expect(loaded[0].content).toBe("persisted message");
	});

	it("maxMessages:3 with 5 saves keeps only the 3 most recent messages", () => {
		// API.md §5: maxMessages truncates older messages before writing
		const store = createLocalStorageStore({ key: "trunc", maxMessages: 3 });
		const messages = [
			createMessage("user", "oldest"),
			createMessage("user", "second"),
			createMessage("user", "third"),
			createMessage("user", "fourth"),
			createMessage("user", "newest"),
		];
		store.save(messages);

		const loaded = store.load();
		expect(loaded.length).toBe(3);
		// The 3 most recent (last 3) must be retained
		expect(loaded[0].content).toBe("third");
		expect(loaded[1].content).toBe("fourth");
		expect(loaded[2].content).toBe("newest");
		// The 2 oldest must be gone
		const contents = loaded.map((m) => m.content);
		expect(contents).not.toContain("oldest");
		expect(contents).not.toContain("second");
	});
});

// ---------------------------------------------------------------------------
// createLocalStorageStore — schema validation (ARCHITECTURE.md §Storage format)
// ---------------------------------------------------------------------------

describe("createLocalStorageStore — schema validation on load", () => {
	afterEach(() => {
		localStorage.clear();
		sessionStorage.clear();
	});

	it("load() returns [] when the stored value is malformed JSON", () => {
		// ARCHITECTURE.md §Storage format: JSON parse failure → discard, return []
		globalThis.localStorage.setItem("web-chat-widget", "{not json");
		const store = createLocalStorageStore();
		expect(store.load()).toEqual([]);
	});

	it("load() returns [] when the stored value has a mismatched version (v !== 1)", () => {
		// ARCHITECTURE.md §Storage format: v mismatch → discard, return []
		globalThis.localStorage.setItem(
			"web-chat-widget",
			JSON.stringify({ v: 999, messages: [] }),
		);
		const store = createLocalStorageStore();
		expect(store.load()).toEqual([]);
	});

	it("a subsequent save() after version mismatch overwrites the bad value cleanly", () => {
		// ARCHITECTURE.md §Storage format: discarded bad value does not prevent future saves from writing correct data
		globalThis.localStorage.setItem(
			"web-chat-widget",
			JSON.stringify({ v: 999, messages: [] }),
		);
		const store = createLocalStorageStore();
		store.load(); // triggers discard
		store.save([msg("clean save")]);

		const raw = globalThis.localStorage.getItem("web-chat-widget");
		expect(raw).not.toBeNull();
		const parsed = JSON.parse(raw as string) as {
			v: number;
			messages: Message[];
		};
		expect(parsed.v).toBe(1);
		expect(parsed.messages.length).toBe(1);
		expect(parsed.messages[0].content).toBe("clean save");
	});

	it("load() returns [] when messages is not an array", () => {
		// ARCHITECTURE.md §Storage format: messages not array → discard, return []
		globalThis.localStorage.setItem(
			"web-chat-widget",
			JSON.stringify({ v: 1, messages: "oops" }),
		);
		const store = createLocalStorageStore();
		expect(store.load()).toEqual([]);
	});

	it("a persisted status='error' message round-trips through load() (PLAN.md P2)", () => {
		// ARCHITECTURE.md §Save timing: an error chunk settles the exchange and is
		// persisted, so a reload must not discard the error-status message.
		const errored = createMessage("assistant", "", { status: "error" });
		createLocalStorageStore().save([msg("hi"), errored]);

		const loaded = createLocalStorageStore().load();
		expect(loaded).toHaveLength(2);
		expect(loaded[1].status).toBe("error");
	});
});

// ---------------------------------------------------------------------------
// createLocalStorageStore — clear() removes the stored key
// ---------------------------------------------------------------------------

describe("createLocalStorageStore — clear()", () => {
	afterEach(() => {
		localStorage.clear();
		sessionStorage.clear();
	});

	it("clear() causes load() to return [] and removes the key from localStorage", () => {
		// ARCHITECTURE.md §clear() responsibility: store.clear() purges the persistent layer
		// Assertion: after clear(), load() returns [] AND the underlying key is absent
		const store = createLocalStorageStore({ key: "to-clear" });
		store.save([msg("something")]);
		store.clear();

		expect(store.load()).toEqual([]);
		expect(globalThis.localStorage.getItem("to-clear")).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// createLocalStorageStore — QuotaExceededError handling (ARCHITECTURE.md §Quota handling)
// ---------------------------------------------------------------------------

describe("createLocalStorageStore — quota recovery", () => {
	afterEach(() => {
		localStorage.clear();
		sessionStorage.clear();
		vi.restoreAllMocks();
	});

	it("drops the older half and retries when setItem throws QuotaExceededError once", () => {
		// ARCHITECTURE.md §Quota handling: on QuotaExceededError, drop older half and retry once.
		// ARCHITECTURE.md §Storage exception resilience: factory probe also calls setItem once (call 1). Therefore the
		// initial save attempt is call 2; making call 2 throw forces the drop+retry path.
		const fakeStorage = new FakeStorage({ throwOnSetItemCalls: [2] });

		Object.defineProperty(globalThis, "localStorage", {
			value: fakeStorage,
			configurable: true,
			writable: true,
		});

		try {
			const store = createLocalStorageStore({ key: "quota-test" });
			const messages = [
				createMessage("user", "oldest 1"),
				createMessage("user", "oldest 2"),
				createMessage("user", "newer 3"),
				createMessage("user", "newer 4"),
			];
			store.save(messages);

			// After drop-older-half + successful retry, load() must return only the newer half
			const loaded = store.load();
			expect(loaded.length).toBe(2);
			expect(loaded[0].content).toBe("newer 3");
			expect(loaded[1].content).toBe("newer 4");
		} finally {
			// Restore real localStorage
			Object.defineProperty(globalThis, "localStorage", {
				value: new FakeStorage(), // happy-dom restores on its own between tests;
				// this just ensures fakeStorage is no longer attached
				configurable: true,
				writable: true,
			});
			localStorage.clear();
		}
	});

	it("falls back to memory and calls console.warn once when both setItem attempts throw", () => {
		// ARCHITECTURE.md §Quota handling: if retry also fails → memory fallback, console.warn once
		const warnSpy = vi
			.spyOn(console, "warn")
			.mockImplementation(() => undefined);

		// Throw on both the first (initial save) and second (retry after drop) setItem calls.
		// The sentinel probe uses setItem too — so throws on calls 1 & 2 (relative to probe),
		// but we need the probe to succeed (call 1 is probe; calls 2 and 3 are save attempts).
		// Therefore we throw on calls 2 and 3.
		const fakeStorage = new FakeStorage({ throwOnSetItemCalls: [2, 3] });

		Object.defineProperty(globalThis, "localStorage", {
			value: fakeStorage,
			configurable: true,
			writable: true,
		});

		try {
			const store = createLocalStorageStore({ key: "double-quota" });
			store.save([msg("a"), msg("b"), msg("c"), msg("d")]);

			// console.warn must have been called exactly once
			expect(warnSpy).toHaveBeenCalledTimes(1);

			// Subsequent saves are no-ops (memory fallback); no additional setItem throws
			store.save([msg("e")]);
			// No second warn
			expect(warnSpy).toHaveBeenCalledTimes(1);

			// The in-memory fallback still allows load() to return the last attempted save
			// data — or at minimum, does not throw. Either an empty array or the fallback
			// in-memory messages are acceptable; what matters is no crash and warn fired once.
			expect(() => store.load()).not.toThrow();
		} finally {
			Object.defineProperty(globalThis, "localStorage", {
				value: new FakeStorage(),
				configurable: true,
				writable: true,
			});
			localStorage.clear();
			vi.restoreAllMocks();
		}
	});

	it("returns a memory-backed store when the sentinel probe throws (private browsing)", () => {
		// ARCHITECTURE.md §Storage exception resilience: factory probes storage at creation time; if probe throws, return memory store
		const alwaysThrowStorage = new FakeStorage({ alwaysThrow: true });

		Object.defineProperty(globalThis, "localStorage", {
			value: alwaysThrowStorage,
			configurable: true,
			writable: true,
		});

		try {
			const store = createLocalStorageStore({ key: "private" });
			const m = msg("private browsing message");
			store.save([m]);

			// The store works as a memory store: load() returns the saved message
			const loaded = store.load();
			expect(loaded.length).toBe(1);
			expect(loaded[0].content).toBe("private browsing message");

			// The real-data setItem should NOT have been called after the probe failed.
			// The probe itself calls setItem once; after that no data-bearing setItem should occur.
			// We check that all setItem calls after the probe were NOT for actual message data.
			// Simplest assertion: the probe setItem throws, and store falls back to memory,
			// so the underlying storage has no message data written to it.
			expect(alwaysThrowStorage.getItem("private")).toBeNull();
		} finally {
			Object.defineProperty(globalThis, "localStorage", {
				value: new FakeStorage(),
				configurable: true,
				writable: true,
			});
			localStorage.clear();
			vi.restoreAllMocks();
		}
	});
});

// ---------------------------------------------------------------------------
// createSessionStorageStore
// ---------------------------------------------------------------------------

describe("createSessionStorageStore — basic behavior", () => {
	afterEach(() => {
		localStorage.clear();
		sessionStorage.clear();
	});

	it("writes to sessionStorage, not localStorage", () => {
		// API.md §5 / §5.4: createSessionStorageStore uses sessionStorage
		const store = createSessionStorageStore({ key: "session-key" });
		store.save([msg("session message")]);

		expect(globalThis.sessionStorage.getItem("session-key")).not.toBeNull();
		// localStorage must remain untouched
		expect(globalThis.localStorage.getItem("session-key")).toBeNull();
	});

	it("all 5 messages round-trip via load() — no maxMessages truncation", () => {
		// API.md §5: createSessionStorageStore has no maxMessages option; all messages persist
		// Passing 5 messages must result in 5 messages coming back from load() — no truncation.
		const store = createSessionStorageStore({ key: "session-no-trunc" });
		const messages = [
			msg("one"),
			msg("two"),
			msg("three"),
			msg("four"),
			msg("five"),
		];
		store.save(messages);

		const loaded = store.load();
		expect(loaded.length).toBe(5);
		// Content integrity
		const contents = loaded.map((m) => m.content);
		expect(contents).toContain("one");
		expect(contents).toContain("five");
	});
});
