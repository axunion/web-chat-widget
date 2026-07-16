import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { ChatAdapter, ChatEventMap } from "../../src/index.ts";
import {
	cleanupWidgets,
	getPart,
	mountWidget,
	registerChatWidget,
} from "../helpers/dom-helpers.ts";
import { scriptedAdapter } from "../helpers/fake-adapters.ts";

beforeAll(registerChatWidget);
afterEach(cleanupWidgets);

const flushMacrotasks = (): Promise<void> =>
	new Promise((r) => setTimeout(r, 10));

// Yields one delta then hangs until its signal is aborted — for stop()-mid-stream tests.
function partialThenHangAdapter(): ChatAdapter {
	return {
		async *send(_messages, signal) {
			yield { type: "text-delta", delta: "partial" };
			while (!signal.aborted) {
				await new Promise((r) => setTimeout(r, 5));
			}
		},
	};
}

// Never yields anything until aborted — for "no content yet" stop() tests.
function hangingAdapter(): ChatAdapter {
	return {
		async *send(_messages, signal) {
			while (!signal.aborted) {
				await new Promise((r) => setTimeout(r, 5));
			}
		},
	};
}

describe("ChatWidget busy UI — send button becomes a stop button while streaming", () => {
	it("switches part/label to stop-button/stopButton while busy and reverts to send-button/sendButton after done", async () => {
		let releaseGate: () => void = () => {};
		const gate = new Promise<void>((resolve) => {
			releaseGate = resolve;
		});
		const adapter: ChatAdapter = {
			async *send() {
				yield { type: "text-delta", delta: "partial" };
				await gate;
				yield { type: "done" };
			},
		};
		const widget = mountWidget({ adapter });
		const sendPromise = widget.sendMessage("hi");
		await flushMacrotasks();

		const stopButton = getPart(widget, "stop-button") as HTMLButtonElement;
		expect(stopButton).not.toBeNull();
		expect(stopButton.textContent).toBe("Stop");
		expect(stopButton.getAttribute("aria-label")).toBe("Stop");

		releaseGate();
		await sendPromise;

		const sendButton = getPart(widget, "send-button") as HTMLButtonElement;
		expect(sendButton).not.toBeNull();
		expect(sendButton.textContent).toBe("Send");
	});
});

describe("ChatWidget busy UI — clicking the button while busy stops the stream", () => {
	it("settles the partial content to done and does not send the textarea draft", async () => {
		const widget = mountWidget({ adapter: partialThenHangAdapter() });
		const sendPromise = widget.sendMessage("hi");
		await flushMacrotasks();

		const textarea = getPart(widget, "input") as HTMLTextAreaElement;
		textarea.value = "draft-not-sent";
		const button = getPart(widget, "stop-button") as HTMLButtonElement;
		button.click();

		await sendPromise;

		const assistant = widget
			.getMessages()
			.find((m) => m.role === "assistant");
		expect(assistant?.content).toBe("partial");
		expect(assistant?.status).toBe("done");
		expect(textarea.value).toBe("draft-not-sent");
		const userMessages = widget.getMessages().filter((m) => m.role === "user");
		expect(userMessages).toHaveLength(1);
	});
});

describe("ChatWidget busy UI — Enter in the textarea is a no-op while busy", () => {
	it("neither sends nor stops, and preserves the draft text", async () => {
		const widget = mountWidget({ adapter: hangingAdapter() });
		const sendPromise = widget.sendMessage("hi");
		await flushMacrotasks();

		const textarea = getPart(widget, "input") as HTMLTextAreaElement;
		textarea.value = "draft";
		textarea.dispatchEvent(
			new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
		);

		expect(getPart(widget, "stop-button")).not.toBeNull();
		expect(textarea.value).toBe("draft");

		widget.stop();
		await sendPromise;
	});
});

describe("ChatWidget.busy — reflects engine busy state and forwards busy events", () => {
	it("is true while streaming and false after done; busy events fire on the element", async () => {
		const adapter = scriptedAdapter([
			{ type: "text-delta", delta: "hi" },
			{ type: "done" },
		]);
		const widget = mountWidget({ adapter });
		const events: boolean[] = [];
		widget.addEventListener("busy", (e) => {
			events.push((e as CustomEvent<ChatEventMap["busy"]>).detail.busy);
		});

		expect(widget.busy).toBe(false);
		const sendPromise = widget.sendMessage("hello");
		expect(widget.busy).toBe(true);
		await sendPromise;

		expect(widget.busy).toBe(false);
		expect(events).toEqual([true, false]);
	});
});

describe("ChatWidget.busy — internal button state is updated before a host busy listener runs", () => {
	it("shows the stop button synchronously inside a host busy:true listener", async () => {
		const widget = mountWidget({ adapter: partialThenHangAdapter() });
		let stopButtonVisible: boolean | null = null;
		widget.addEventListener("busy", (e) => {
			const { busy } = (e as CustomEvent<ChatEventMap["busy"]>).detail;
			if (busy) stopButtonVisible = getPart(widget, "stop-button") !== null;
		});

		const sendPromise = widget.sendMessage("hi");
		await flushMacrotasks();

		expect(stopButtonVisible).toBe(true);

		widget.stop();
		await sendPromise;
	});
});

describe("ChatWidget.stop — public method aborts the in-flight response", () => {
	it("settles a partial response without any button interaction", async () => {
		const widget = mountWidget({ adapter: partialThenHangAdapter() });
		const sendPromise = widget.sendMessage("hi");
		await flushMacrotasks();

		widget.stop();
		await sendPromise;

		const assistant = widget
			.getMessages()
			.find((m) => m.role === "assistant");
		expect(assistant?.content).toBe("partial");
		expect(assistant?.status).toBe("done");
	});
});
