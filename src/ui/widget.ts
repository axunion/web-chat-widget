import { createJsonAdapter } from "../adapters/json.ts";
import { createOpenAISseAdapter } from "../adapters/openai-sse.ts";
import type { ChatAdapter } from "../adapters/types.ts";
import { ChatEngine } from "../core/engine.ts";
import { createChatEvent } from "../core/events.ts";
import type { LabelDictionary, Locale } from "../core/i18n.ts";
import { resolveLabels } from "../core/i18n.ts";
import type { Message } from "../core/messages.ts";
import { buildFab, type FabHandle } from "./fab.ts";
import { ObservableEngine } from "./observable-engine.ts";
import { buildPanel, type PanelHandle } from "./panel.ts";
import { buildStyleElement } from "./styles.ts";

export type ChatWidgetPosition =
	| "bottom-right"
	| "bottom-left"
	| "top-right"
	| "top-left";
export type ChatWidgetTheme = "light" | "dark" | "auto";
export type ChatWidgetApiMode = "openai-sse" | "json";

export interface ChatWidgetOptions {
	target?: HTMLElement;
	adapter?: ChatAdapter;
	position?: ChatWidgetPosition;
	theme?: ChatWidgetTheme;
	locale?: Locale;
	initialMessages?: Message[];
	messages?: Partial<LabelDictionary>;
}

const DEFAULT_POSITION: ChatWidgetPosition = "bottom-right";
const DEFAULT_THEME: ChatWidgetTheme = "auto";
const DEFAULT_API_MODE: ChatWidgetApiMode = "openai-sse";

const OBSERVED_ATTRIBUTES = [
	"open",
	"position",
	"locale",
	"theme",
	"api-url",
	"api-mode",
] as const;

export class ChatWidget extends HTMLElement {
	static get observedAttributes(): readonly string[] {
		return OBSERVED_ATTRIBUTES;
	}

	static mount(options: ChatWidgetOptions): ChatWidget {
		if (!customElements.get("chat-widget")) {
			customElements.define("chat-widget", ChatWidget);
		}
		const widget = new ChatWidget(options);
		(options.target ?? document.body).appendChild(widget);
		return widget;
	}

	private readonly shadow: ShadowRoot;
	private readonly root: HTMLDivElement;
	private readonly fab: FabHandle;
	private readonly panel: PanelHandle;
	private readonly options: ChatWidgetOptions | null;
	private labels: LabelDictionary;
	private engine: ChatEngine | null = null;
	private observable: ObservableEngine | null = null;
	private listenerAbort: AbortController | null = null;
	private initialized = false;
	private isOpen = false;

	constructor(options?: ChatWidgetOptions) {
		super();
		this.options = options ?? null;
		this.shadow = this.attachShadow({ mode: "open" });
		this.shadow.appendChild(buildStyleElement());
		this.labels = resolveLabels(options?.locale, options?.messages);
		this.fab = buildFab(this.labels);
		this.panel = buildPanel(this.labels);
		// Wrapper holds data-theme so renderThemeCss()'s [data-theme="..."]
		// selector cascades CSS variables down to both the FAB and the panel.
		this.root = document.createElement("div");
		this.root.className = "root";
		this.root.appendChild(this.fab.root);
		this.root.appendChild(this.panel.root);
		this.shadow.appendChild(this.root);
	}

	connectedCallback(): void {
		if (this.initialized) return;
		this.initialize();
	}

	disconnectedCallback(): void {
		if (!this.initialized) return;
		this.destroy();
	}

	attributeChangedCallback(
		name: string,
		_old: string | null,
		next: string | null,
	): void {
		if (!this.initialized) return;
		if (name === "position") {
			this.applyPosition(next as ChatWidgetPosition | null);
		} else if (name === "theme") {
			this.applyTheme(next as ChatWidgetTheme | null);
		} else if (name === "locale") {
			this.labels = resolveLabels(
				(next as Locale | null) ?? undefined,
				this.options?.messages,
			);
			this.applyLabels();
		} else if (name === "open") {
			if (next !== null) this.open();
			else this.close();
		}
	}

	getMessages(): readonly Message[] {
		return this.engine?.getMessages() ?? [];
	}

	open(): void {
		if (this.isOpen) return;
		this.isOpen = true;
		this.panel.setOpen(true);
		this.fab.setOpen(true);
		this.dispatchEvent(createChatEvent("open", undefined));
	}

	close(): void {
		if (!this.isOpen) return;
		this.isOpen = false;
		this.panel.setOpen(false);
		this.fab.setOpen(false);
		this.dispatchEvent(createChatEvent("close", undefined));
	}

	toggle(): void {
		if (this.isOpen) this.close();
		else this.open();
	}

	destroy(): void {
		this.listenerAbort?.abort();
		this.listenerAbort = null;
		if (this.observable) {
			this.observable.destroy();
			this.observable = null;
		}
		this.engine = null;
		this.initialized = false;
	}

	private initialize(): void {
		const resolved = this.resolveConfig();
		if (!resolved.adapter) {
			throw new Error(
				"ChatWidget requires an adapter. Provide one via `new ChatWidget({ adapter })` or the `api-url` attribute.",
			);
		}
		this.labels = resolveLabels(resolved.locale, this.options?.messages);
		this.applyLabels();
		this.applyTheme(resolved.theme);
		this.applyPosition(resolved.position);
		this.engine = new ChatEngine({
			adapter: resolved.adapter,
			initialMessages: resolved.initialMessages,
		});
		this.observable = new ObservableEngine(this.engine);
		this.listenerAbort = new AbortController();
		const { signal } = this.listenerAbort;
		this.fab.root.addEventListener("click", this.handleFabClick, { signal });
		this.panel.closeButton.addEventListener("click", this.handleCloseClick, {
			signal,
		});
		this.wireInputHandlers(signal);
		this.observable.subscribe((messages) => {
			this.panel.logHandle.render(messages);
		});
		this.panel.logHandle.render(this.engine.getMessages());
		this.initialized = true;
		if (this.hasAttribute("open")) this.open();
		this.dispatchEvent(createChatEvent("ready", undefined));
	}

	async sendMessage(text: string): Promise<void> {
		if (!this.observable) return;
		await this.observable.sendMessage(text);
	}

	private wireInputHandlers(signal: AbortSignal): void {
		const { textarea, sendButton } = this.panel.inputHandle;
		const submit = (): void => {
			const value = textarea.value.trim();
			if (!value) return;
			textarea.value = "";
			void this.sendMessage(value);
		};
		sendButton.addEventListener("click", submit, { signal });
		textarea.addEventListener(
			"keydown",
			(event) => {
				const key = event.key;
				if (key === "Enter" && !event.shiftKey) {
					event.preventDefault();
					submit();
				} else if (key === "Escape") {
					event.preventDefault();
					this.close();
				}
			},
			{ signal },
		);
	}

	private readonly handleFabClick = (): void => {
		this.toggle();
	};

	private readonly handleCloseClick = (): void => {
		this.close();
	};

	private resolveConfig(): {
		adapter: ChatAdapter | null;
		position: ChatWidgetPosition;
		theme: ChatWidgetTheme;
		locale: Locale | undefined;
		initialMessages: Message[] | undefined;
	} {
		const opts = this.options;
		const adapter = opts?.adapter ?? this.buildAdapterFromAttributes();
		const position =
			opts?.position ??
			(this.getAttribute("position") as ChatWidgetPosition | null) ??
			DEFAULT_POSITION;
		const theme =
			opts?.theme ??
			(this.getAttribute("theme") as ChatWidgetTheme | null) ??
			DEFAULT_THEME;
		const locale =
			opts?.locale ??
			(this.getAttribute("locale") as Locale | null) ??
			undefined;
		return {
			adapter,
			position,
			theme,
			locale: locale ?? undefined,
			initialMessages: opts?.initialMessages,
		};
	}

	private buildAdapterFromAttributes(): ChatAdapter | null {
		const url = this.getAttribute("api-url");
		if (!url) return null;
		const mode =
			(this.getAttribute("api-mode") as ChatWidgetApiMode | null) ??
			DEFAULT_API_MODE;
		if (mode === "json") return createJsonAdapter({ url });
		return createOpenAISseAdapter({ url });
	}

	private applyTheme(theme: ChatWidgetTheme | null): void {
		const effective = theme ?? DEFAULT_THEME;
		const resolvedMode: "light" | "dark" =
			effective === "auto"
				? this.prefersDark()
					? "dark"
					: "light"
				: effective;
		this.root.setAttribute("data-theme", resolvedMode);
	}

	private prefersDark(): boolean {
		if (typeof matchMedia === "undefined") return false;
		try {
			return matchMedia("(prefers-color-scheme: dark)").matches;
		} catch {
			return false;
		}
	}

	private applyPosition(position: ChatWidgetPosition | null): void {
		this.setAttribute("data-position", position ?? DEFAULT_POSITION);
	}

	private applyLabels(): void {
		this.fab.applyLabels(this.labels);
		this.panel.applyLabels(this.labels);
	}
}
