import type { Message, MessageRole, MessageStatus } from "./messages.ts";

export interface ChatStore {
	load(): Message[];
	save(messages: readonly Message[]): void;
	clear(): void;
}

export interface CreateLocalStorageStoreOptions {
	key?: string;
	maxMessages?: number;
}

export interface CreateSessionStorageStoreOptions {
	key?: string;
}

const STORAGE_VERSION = 1;
const DEFAULT_KEY = "web-chat-widget";
const DEFAULT_MAX_MESSAGES = 100;
const PROBE_KEY = "__cw_store_probe__";

const VALID_ROLES: ReadonlySet<MessageRole> = new Set<MessageRole>([
	"user",
	"assistant",
	"system",
]);
const VALID_STATUSES: ReadonlySet<MessageStatus> = new Set<MessageStatus>([
	"streaming",
	"done",
	"error",
]);

function isQuotaError(err: unknown): boolean {
	return err instanceof Error && err.name === "QuotaExceededError";
}

function isMessage(value: unknown): value is Message {
	if (!value || typeof value !== "object") return false;
	const v = value as Record<string, unknown>;
	if (typeof v.id !== "string") return false;
	if (typeof v.role !== "string" || !VALID_ROLES.has(v.role as MessageRole)) {
		return false;
	}
	if (typeof v.content !== "string") return false;
	if (typeof v.createdAt !== "number") return false;
	if (
		v.status !== undefined &&
		(typeof v.status !== "string" ||
			!VALID_STATUSES.has(v.status as MessageStatus))
	) {
		return false;
	}
	return true;
}

function parseStored(raw: string | null): Message[] {
	if (raw === null) return [];
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return [];
	}
	if (!parsed || typeof parsed !== "object") return [];
	const obj = parsed as { v?: unknown; messages?: unknown };
	if (obj.v !== STORAGE_VERSION) return [];
	if (!Array.isArray(obj.messages)) return [];
	for (const m of obj.messages) {
		if (!isMessage(m)) return [];
	}
	return obj.messages as Message[];
}

function serialize(messages: readonly Message[]): string {
	return JSON.stringify({ v: STORAGE_VERSION, messages });
}

function probe(storage: Storage): boolean {
	try {
		storage.setItem(PROBE_KEY, "1");
		storage.getItem(PROBE_KEY);
		storage.removeItem(PROBE_KEY);
		return true;
	} catch {
		return false;
	}
}

export function createMemoryStore(): ChatStore {
	let messages: Message[] = [];
	return {
		load() {
			return [...messages];
		},
		save(next) {
			messages = [...next];
		},
		clear() {
			messages = [];
		},
	};
}

interface WebStorageOpts {
	key: string;
	maxMessages?: number;
}

function createWebStorageStore(
	storage: Storage,
	opts: WebStorageOpts,
): ChatStore {
	const { key, maxMessages } = opts;
	let memoryFallback = false;
	let warned = false;

	const trim = (messages: readonly Message[]): readonly Message[] => {
		if (maxMessages !== undefined && messages.length > maxMessages) {
			return messages.slice(messages.length - maxMessages);
		}
		return messages;
	};

	return {
		load() {
			if (memoryFallback) return [];
			return parseStored(storage.getItem(key));
		},
		save(next) {
			if (memoryFallback) return;
			const trimmed = trim(next);
			// On a quota error, retry once with the newer half; any other
			// failure is not worth retrying and leaves the store as-is.
			const halved = trimmed.slice(Math.ceil(trimmed.length / 2));
			for (const candidate of [trimmed, halved]) {
				try {
					storage.setItem(key, serialize(candidate));
					return;
				} catch (err) {
					if (!isQuotaError(err)) return;
				}
			}
			memoryFallback = true;
			if (!warned) {
				warned = true;
				console.warn(
					"[web-chat-widget] storage quota exceeded; falling back to in-memory store",
				);
			}
		},
		clear() {
			if (memoryFallback) return;
			try {
				storage.removeItem(key);
			} catch {
				// Storage suddenly unavailable — treat clear as best-effort.
			}
		},
	};
}

export function createLocalStorageStore(
	opts: CreateLocalStorageStoreOptions = {},
): ChatStore {
	const key = opts.key ?? DEFAULT_KEY;
	const maxMessages = opts.maxMessages ?? DEFAULT_MAX_MESSAGES;
	const storage = globalThis.localStorage;
	if (!storage || !probe(storage)) return createMemoryStore();
	return createWebStorageStore(storage, { key, maxMessages });
}

export function createSessionStorageStore(
	opts: CreateSessionStorageStoreOptions = {},
): ChatStore {
	const key = opts.key ?? DEFAULT_KEY;
	const storage = globalThis.sessionStorage;
	if (!storage || !probe(storage)) return createMemoryStore();
	return createWebStorageStore(storage, { key });
}
