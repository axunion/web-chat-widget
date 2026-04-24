import type { ChatAdapter } from "../adapters/types.ts";
import { createChatEvent } from "./events.ts";
import type { Message } from "./messages.ts";
import { createMessage } from "./messages.ts";

export interface ChatEngineOptions {
	adapter: ChatAdapter;
	initialMessages?: Message[];
}

export class ChatEngine extends EventTarget {
	private readonly adapter: ChatAdapter;
	private messages: Message[];
	private destroyed = false;
	private controller: AbortController | null = null;

	constructor(options: ChatEngineOptions) {
		super();
		this.adapter = options.adapter;
		this.messages = options.initialMessages ? [...options.initialMessages] : [];
	}

	getMessages(): readonly Message[] {
		return [...this.messages];
	}

	async sendMessage(text: string): Promise<void> {
		this.ensureAlive();
		const userMsg = createMessage("user", text);
		this.messages.push(userMsg);
		const adapterMessages = [...this.messages];
		const assistantMsg = createMessage("assistant", "", {
			status: "streaming",
		});
		this.messages.push(assistantMsg);
		await this.runAdapter(assistantMsg, adapterMessages);
	}

	async retry(): Promise<void> {
		this.ensureAlive();
		const lastUserIdx = this.findLastUserIndex();
		if (lastUserIdx === -1) return;
		this.messages.splice(lastUserIdx + 1);
		const adapterMessages = [...this.messages];
		const assistantMsg = createMessage("assistant", "", {
			status: "streaming",
		});
		this.messages.push(assistantMsg);
		await this.runAdapter(assistantMsg, adapterMessages);
	}

	clear(): void {
		this.ensureAlive();
		this.abortInFlight();
		this.messages = [];
	}

	destroy(): void {
		this.destroyed = true;
		this.abortInFlight();
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
					this.dispatchEvent(
						createChatEvent("message", {
							role: "assistant",
							content: assistantMsg.content,
						}),
					);
					return;
				}
				assistantMsg.status = "error";
				this.dispatchEvent(createChatEvent("error", { error: chunk.error }));
				return;
			}
		} catch (err) {
			if (signal.aborted) return;
			const error = err instanceof Error ? err : new Error(String(err));
			assistantMsg.status = "error";
			this.dispatchEvent(createChatEvent("error", { error }));
		} finally {
			if (this.controller === controller) this.controller = null;
		}
	}
}
