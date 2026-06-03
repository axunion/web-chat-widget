import "./element.ts";
import "./style.css";
import type { ChatAdapter, ChatStore, ChatWidgetPersist } from "./index.ts";
import {
	ChatWidget,
	createLocalStorageStore,
	createSessionStorageStore,
} from "./index.ts";

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

const PERSIST_PREF_KEY = "cw-playground-persist";
const PERSIST_STORE_KEY = "cw-playground-history";

function loadPersistPref(): ChatWidgetPersist {
	const raw = localStorage.getItem(PERSIST_PREF_KEY);
	if (raw === "local" || raw === "session") return raw;
	return "none";
}

function buildStore(mode: ChatWidgetPersist): ChatStore | undefined {
	if (mode === "local") {
		return createLocalStorageStore({ key: PERSIST_STORE_KEY });
	}
	if (mode === "session") {
		return createSessionStorageStore({ key: PERSIST_STORE_KEY });
	}
	return undefined;
}

const persistMode = loadPersistPref();

const widget = ChatWidget.mount({
	adapter: createDemoAdapter(),
	theme: "auto",
	locale: "ja",
	position: "bottom-right",
	store: buildStore(persistMode),
});

for (const el of document.querySelectorAll<HTMLInputElement>(
	'input[name="persist"]',
)) {
	if (el.value === persistMode) el.checked = true;
}

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
// persist / persist-key are mount-time only (see ARCHITECTURE.md §Dynamic attribute change rules). Reload after change
// so the new selection takes effect on a fresh widget instance.
bindRadios("persist", (v) => {
	localStorage.setItem(PERSIST_PREF_KEY, v);
	location.reload();
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
document.querySelector("#clear")?.addEventListener("click", () => {
	widget.clear();
});
document.querySelector("#retry")?.addEventListener("click", () => {
	void widget.retry();
});
