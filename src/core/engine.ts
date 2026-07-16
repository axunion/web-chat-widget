import type { ChatAdapter } from "../adapters/types.ts";
import { createChatEvent } from "./events.ts";
import type { Message } from "./messages.ts";
import { createMessage } from "./messages.ts";
import type { ChatStore } from "./store.ts";

export interface ChatEngineOptions {
	adapter: ChatAdapter;
	initialMessages?: Message[];
	store?: ChatStore;
}

export class ChatEngine extends EventTarget {
	private readonly adapter: ChatAdapter;
	private readonly store: ChatStore | null;
	private messages: Message[];
	private destroyed = false;
	private controller: AbortController | null = null;
	private busyState = false;

	get busy(): boolean {
		return this.busyState;
	}

	constructor(options: ChatEngineOptions) {
		super();
		this.adapter = options.adapter;
		this.store = options.store ?? null;
		const stored = this.store?.load();
		if (stored && stored.length > 0) {
			this.messages = [...stored];
		} else {
			this.messages = options.initialMessages
				? [...options.initialMessages]
				: [];
		}
	}

	getMessages(): readonly Message[] {
		return [...this.messages];
	}

	async sendMessage(text: string): Promise<void> {
		this.ensureAlive();
		this.abortAndSettle();
		const userMsg = createMessage("user", text);
		this.messages.push(userMsg);
		this.dispatchEvent(
			createChatEvent("message", { role: "user", content: text }),
		);
		const adapterMessages = [...this.messages];
		const assistantMsg = createMessage("assistant", "", {
			status: "streaming",
		});
		this.messages.push(assistantMsg);
		await this.runAdapter(assistantMsg, adapterMessages);
	}

	async retry(): Promise<void> {
		this.ensureAlive();
		this.abortAndSettle();
		const lastUserIdx = this.findLastUserIndex();
		if (lastUserIdx === -1) return;
		this.messages.splice(lastUserIdx + 1);
		// Save before pushing the streaming placeholder, so the persisted
		// snapshot is the user-only state if streaming is interrupted.
		this.store?.save(this.messages);
		const adapterMessages = [...this.messages];
		const assistantMsg = createMessage("assistant", "", {
			status: "streaming",
		});
		this.messages.push(assistantMsg);
		await this.runAdapter(assistantMsg, adapterMessages);
	}

	stop(): void {
		this.ensureAlive();
		if (!this.busyState) return;
		this.abortAndSettle();
		this.setBusy(false);
	}

	clear(): void {
		this.ensureAlive();
		this.abortInFlight();
		this.messages = [];
		this.store?.clear();
		this.setBusy(false);
	}

	destroy(): void {
		this.destroyed = true;
		this.abortInFlight();
		this.setBusy(false);
	}

	private ensureAlive(): void {
		if (this.destroyed) throw new Error("ChatEngine is destroyed");
	}

	private abortInFlight(): void {
		if (this.controller) {
			this.controller.abort();
			this.controller = null;
		}
	}

	// Shared by stop() and by sendMessage()/retry() superseding a busy send:
	// abort the in-flight request, then settle the trailing streaming message
	// so no code path leaves it stuck at status "streaming".
	private abortAndSettle(): void {
		this.abortInFlight();
		this.settleStreaming();
	}

	private settleStreaming(): void {
		const idx = this.messages.length - 1;
		if (idx < 0) return;
		const last = this.messages[idx];
		if (last.status !== "streaming") return;
		if (last.content !== "") {
			last.status = "done";
		} else {
			this.messages.splice(idx, 1);
		}
		this.store?.save(this.messages);
	}

	private setBusy(next: boolean): void {
		if (this.busyState === next) return;
		this.busyState = next;
		this.dispatchEvent(createChatEvent("busy", { busy: next }));
	}

	private findLastUserIndex(): number {
		for (let i = this.messages.length - 1; i >= 0; i--) {
			if (this.messages[i].role === "user") return i;
		}
		return -1;
	}

	private async runAdapter(
		assistantMsg: Message,
		adapterMessages: readonly Message[],
	): Promise<void> {
		// Serialize: abort any prior in-flight send before starting a new one,
		// so concurrent sendMessage / retry calls do not orphan AbortControllers.
		this.abortInFlight();
		const controller = new AbortController();
		this.controller = controller;
		const signal = controller.signal;
		this.setBusy(true);
		try {
			const iter = this.adapter.send(adapterMessages, signal);
			for await (const chunk of iter) {
				if (signal.aborted) return;
				if (chunk.type === "text-delta") {
					assistantMsg.content += chunk.delta;
					continue;
				}
				if (chunk.type === "done") {
					assistantMsg.status = "done";
					this.store?.save(this.messages);
					this.dispatchEvent(
						createChatEvent("message", {
							role: "assistant",
							content: assistantMsg.content,
						}),
					);
					return;
				}
				assistantMsg.status = "error";
				this.store?.save(this.messages);
				this.dispatchEvent(createChatEvent("error", { error: chunk.error }));
				return;
			}
			// The generator completed without yielding `done` — an adapter
			// contract violation, but still must not leave the message stuck
			// at status "streaming". Unlike stop()'s settle, this still fires
			// the message event when content was produced, since it's a
			// natural (if malformed) completion, not a user-initiated stop.
			if (!signal.aborted) {
				this.settleStreaming();
				if (assistantMsg.status === "done") {
					this.dispatchEvent(
						createChatEvent("message", {
							role: "assistant",
							content: assistantMsg.content,
						}),
					);
				}
			}
		} catch (err) {
			if (signal.aborted) return;
			const error = err instanceof Error ? err : new Error(String(err));
			assistantMsg.status = "error";
			this.store?.save(this.messages);
			this.dispatchEvent(createChatEvent("error", { error }));
		} finally {
			if (this.controller === controller) {
				this.controller = null;
				this.setBusy(false);
			}
		}
	}
}
