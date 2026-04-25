import "./element.ts";
import "./style.css";
import type { ChatAdapter } from "./index.ts";
import { ChatWidget } from "./index.ts";

const sleep = (ms: number): Promise<void> =>
	new Promise((resolve) => {
		setTimeout(resolve, ms);
	});

const CANNED = [
	"こんにちは！**web-chat-widget** のデモ応答です。",
	"",
	"サポートしている Markdown の例:",
	"",
	"- 箇条書き",
	"- `inline code`",
	"- [リンク](https://example.com) は http(s) のみ許可",
	"",
	"```",
	"code block",
	"```",
	"",
	"_italic_ と **bold** も使えます。",
].join("\n");

function createDemoAdapter(): ChatAdapter {
	return {
		async *send(_messages, signal) {
			await sleep(400);
			for (const ch of CANNED) {
				if (signal.aborted) return;
				await sleep(12);
				yield { type: "text-delta", delta: ch };
			}
			yield { type: "done" };
		},
	};
}

const widget = ChatWidget.mount({
	adapter: createDemoAdapter(),
	theme: "auto",
	locale: "ja",
	position: "bottom-right",
});

function bindRadios(name: string, apply: (value: string) => void): void {
	for (const el of document.querySelectorAll<HTMLInputElement>(
		`input[name="${name}"]`,
	)) {
		el.addEventListener("change", () => {
			if (el.checked) apply(el.value);
		});
	}
}

bindRadios("theme", (v) => {
	widget.setAttribute("theme", v);
});
bindRadios("locale", (v) => {
	widget.setAttribute("locale", v);
});
bindRadios("position", (v) => {
	widget.setAttribute("position", v);
});

document.querySelector("#open")?.addEventListener("click", () => {
	widget.open();
});
document.querySelector("#close")?.addEventListener("click", () => {
	widget.close();
});
document.querySelector("#send-hello")?.addEventListener("click", () => {
	widget.open();
	void widget.sendMessage("hello");
});
