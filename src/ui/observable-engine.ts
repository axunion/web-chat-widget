import type { ChatEngine } from "../core/engine.ts";
import type { Message } from "../core/messages.ts";

export type UpdateListener = (messages: readonly Message[]) => void;

// rAF-batched subscribe wrapper. Compatible with React 18's
// useSyncExternalStore shape so a v2 React wrapper can reuse it.
export class ObservableEngine {
	private readonly engine: ChatEngine;
	private readonly listeners = new Set<UpdateListener>();
	private inflight = 0;
	private frameHandle: number | null = null;
	private lastSignature: string | null = null;

	constructor(engine: ChatEngine) {
		this.engine = engine;
	}

	getMessages(): readonly Message[] {
		return this.engine.getMessages();
	}

	subscribe(listener: UpdateListener): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	async sendMessage(text: string): Promise<void> {
		this.beginInflight();
		try {
			await this.engine.sendMessage(text);
		} finally {
			this.endInflight();
			this.notify();
		}
	}

	async retry(): Promise<void> {
		this.beginInflight();
		try {
			await this.engine.retry();
		} finally {
			this.endInflight();
			this.notify();
		}
	}

	clear(): void {
		this.engine.clear();
		this.notify();
	}

	destroy(): void {
		this.engine.destroy();
		this.cancelFrame();
		this.inflight = 0;
		this.listeners.clear();
		this.lastSignature = null;
	}

	private beginInflight(): void {
		if (this.inflight === 0) this.scheduleFrame();
		this.inflight += 1;
	}

	private endInflight(): void {
		this.inflight = Math.max(0, this.inflight - 1);
		if (this.inflight === 0) this.cancelFrame();
	}

	private scheduleFrame(): void {
		this.frameHandle = requestAnimationFrame(() => {
			this.frameHandle = null;
			this.notify();
			if (this.inflight > 0) this.scheduleFrame();
		});
	}

	private cancelFrame(): void {
		if (this.frameHandle !== null) {
			cancelAnimationFrame(this.frameHandle);
			this.frameHandle = null;
		}
	}

	private notify(): void {
		if (this.listeners.size === 0) return;
		const snapshot = this.engine.getMessages();
		const signature = signatureOf(snapshot);
		if (signature === this.lastSignature) return;
		this.lastSignature = signature;
		for (const listener of this.listeners) listener(snapshot);
	}
}

function signatureOf(messages: readonly Message[]): string {
	if (messages.length === 0) return "";
	const parts: string[] = [];
	for (const m of messages) {
		parts.push(`${m.id}:${m.content.length}:${m.status ?? ""}`);
	}
	return parts.join("|");
}
