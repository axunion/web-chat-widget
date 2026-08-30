import { createJsonAdapter } from "../adapters/json.ts";
import { createOpenAISseAdapter } from "../adapters/openai-sse.ts";
import type { ChatAdapter } from "../adapters/types.ts";
import { ChatEngine } from "../core/engine.ts";
import type { ChatEventMap } from "../core/events.ts";
import { createChatEvent } from "../core/events.ts";
import type { LabelDictionary, Locale } from "../core/i18n.ts";
import { resolveLabels } from "../core/i18n.ts";
import { createMessage, type Message } from "../core/messages.ts";
import type { ChatStore } from "../core/store.ts";
import {
	createLocalStorageStore,
	createSessionStorageStore,
} from "../core/store.ts";
import { buildFab, type FabHandle } from "./fab.ts";
import { ObservableEngine } from "./observable-engine.ts";
import { buildPanel, type PanelHandle } from "./panel.ts";
import { buildStyleElement, TEXTAREA_MAX_HEIGHT_PX } from "./styles.ts";

export type ChatWidgetPosition =
	| "bottom-right"
	| "bottom-left"
	| "top-right"
	| "top-left";
export type ChatWidgetTheme = "light" | "dark" | "auto";
export type ChatWidgetApiMode = "openai-sse" | "json";
export type ChatWidgetPersist = "local" | "session" | "none";

export interface ChatWidgetOptions {
	target?: HTMLElement;
	adapter?: ChatAdapter;
	position?: ChatWidgetPosition;
	theme?: ChatWidgetTheme;
	locale?: Locale;
	initialMessages?: Message[];
	messages?: Partial<LabelDictionary>;
	store?: ChatStore;
	maxInputLength?: number;
}

const DEFAULT_POSITION: ChatWidgetPosition = "bottom-right";
const DEFAULT_THEME: ChatWidgetTheme = "auto";
const DEFAULT_API_MODE: ChatWidgetApiMode = "openai-sse";

// api-url / api-mode / persist / persist-key are evaluated only at mount time
// (see ARCHITECTURE.md §Dynamic attribute change rules). Absent from observedAttributes.
const OBSERVED_ATTRIBUTES = ["open", "position", "locale", "theme"] as const;

export class ChatWidget extends HTMLElement {
	static get observedAttributes(): readonly string[] {
		return OBSERVED_ATTRIBUTES;
	}

	static mount(options: ChatWidgetOptions): ChatWidget {
		defineChatWidget();
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
	private colorSchemeQuery: MediaQueryList | null = null;

	constructor(options?: ChatWidgetOptions) {
		super();
		this.options = options ?? null;
		this.shadow = this.attachShadow({ mode: "open" });
		this.shadow.appendChild(buildStyleElement());
		this.labels = resolveLabels(options?.locale, options?.messages);
		this.fab = buildFab(this.labels);
		this.panel = buildPanel({
			labels: this.labels,
			onRetry: () => void this.retry(),
			onClear: () => this.clear(),
		});
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
		this.fab.setUnread(false);
		this.focusSafely(this.panel.inputHandle.textarea);
		this.dispatchEvent(createChatEvent("open", undefined));
	}

	close(): void {
		if (!this.isOpen) return;
		const focusWasInsidePanel = this.isFocusInsidePanel();
		this.isOpen = false;
		this.panel.setOpen(false);
		this.fab.setOpen(false);
		if (focusWasInsidePanel) this.focusSafely(this.fab.root);
		this.dispatchEvent(createChatEvent("close", undefined));
	}

	private focusSafely(el: HTMLElement): void {
		try {
			el.focus({ preventScroll: true });
		} catch {}
	}

	private isFocusInsidePanel(): boolean {
		const active = this.shadow.activeElement;
		return active !== null && this.panel.root.contains(active);
	}

	toggle(): void {
		if (this.isOpen) this.close();
		else this.open();
	}

	destroy(): void {
		this.listenerAbort?.abort();
		this.listenerAbort = null;
		this.unsubscribeColorScheme();
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
		this.panel.inputHandle.setMaxLength(resolved.maxInputLength);
		this.engine = new ChatEngine({
			adapter: resolved.adapter,
			initialMessages: resolved.initialMessages,
			store: resolved.store ?? undefined,
		});
		this.observable = new ObservableEngine(this.engine);
		this.listenerAbort = new AbortController();
		const { signal } = this.listenerAbort;
		this.fab.root.addEventListener("click", this.handleFabClick, { signal });
		this.panel.closeButton.addEventListener("click", this.handleCloseClick, {
			signal,
		});
		this.wireInputHandlers(signal);
		this.forwardEngineEvent("message", signal, (detail) => {
			if (detail.role === "assistant" && !this.isOpen) {
				this.fab.setUnread(true);
			}
		});
		this.forwardEngineEvent("error", signal);
		this.forwardEngineEvent("busy", signal, (detail) => {
			this.panel.inputHandle.setBusy(detail.busy);
		});
		const renderMessages = (messages: readonly Message[]): void => {
			this.panel.logHandle.render(messages);
			this.panel.setHistoryEmpty(messages.length === 0);
		};
		this.observable.subscribe(renderMessages);
		renderMessages(this.observable.getMessages());
		this.initialized = true;
		if (this.hasAttribute("open")) this.open();
		this.dispatchEvent(createChatEvent("ready", undefined));
	}

	// Re-dispatch engine events on the element so host pages can listen per
	// API.md §2.3. A fresh event is created to keep bubbles/composed false.
	// `before` runs the widget's own reaction first, so the internal DOM
	// (button part, unread badge) is already updated by the time a host page's
	// listener observes the same transition — an ordering the single call site
	// now enforces structurally rather than by registration order.
	private forwardEngineEvent<K extends "message" | "error" | "busy">(
		type: K,
		signal: AbortSignal,
		before?: (detail: ChatEventMap[K]) => void,
	): void {
		this.engine?.addEventListener(
			type,
			(event) => {
				const { detail } = event as CustomEvent<ChatEventMap[K]>;
				before?.(detail);
				this.dispatchEvent(createChatEvent(type, detail));
			},
			{ signal },
		);
	}

	async sendMessage(text: string): Promise<void> {
		await this.observable?.sendMessage(text);
	}

	async retry(): Promise<void> {
		await this.observable?.retry();
	}

	clear(): void {
		this.observable?.clear();
	}

	stop(): void {
		this.observable?.stop();
	}

	get busy(): boolean {
		return this.observable?.busy ?? false;
	}

	private wireInputHandlers(signal: AbortSignal): void {
		const { textarea, sendButton } = this.panel.inputHandle;
		const submit = (): void => {
			const value = textarea.value.trim();
			if (!value) return;
			textarea.value = "";
			textarea.style.height = "auto";
			void this.sendMessage(value);
		};
		textarea.addEventListener(
			"input",
			() => {
				textarea.style.height = "auto";
				textarea.style.height = `${Math.min(textarea.scrollHeight, TEXTAREA_MAX_HEIGHT_PX)}px`;
			},
			{ signal },
		);
		sendButton.addEventListener(
			"click",
			() => {
				if (this.busy) this.stop();
				else submit();
			},
			{ signal },
		);
		textarea.addEventListener(
			"keydown",
			(event) => {
				if (event.key === "Enter" && !event.shiftKey) {
					event.preventDefault();
					if (!this.busy) submit();
				}
			},
			{ signal },
		);
		this.panel.root.addEventListener(
			"keydown",
			(event) => {
				if (event.key === "Escape") {
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

	private readonly handleColorSchemeChange = (
		event: MediaQueryListEvent | { matches: boolean },
	): void => {
		if (!this.initialized) return;
		this.root.setAttribute("data-theme", event.matches ? "dark" : "light");
	};

	private resolveConfig(): {
		adapter: ChatAdapter | null;
		position: ChatWidgetPosition;
		theme: ChatWidgetTheme;
		locale: Locale | undefined;
		initialMessages: Message[] | undefined;
		store: ChatStore | null;
		maxInputLength: number | undefined;
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
		const store = opts?.store ?? this.buildStoreFromAttributes();
		return {
			adapter,
			position,
			theme,
			locale,
			initialMessages: opts?.initialMessages ?? this.buildWelcomeMessage(),
			store,
			maxInputLength:
				opts?.maxInputLength ??
				this.parsePositiveIntAttribute("max-input-length"),
		};
	}

	private buildWelcomeMessage(): Message[] | undefined {
		const text = this.getAttribute("welcome-message");
		if (!text) return undefined;
		return [createMessage("assistant", text, { status: "done" })];
	}

	private parsePositiveIntAttribute(name: string): number | undefined {
		const raw = this.getAttribute(name);
		if (raw === null) return undefined;
		const parsed = Number.parseInt(raw, 10);
		if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
		return parsed;
	}

	private buildAdapterFromAttributes(): ChatAdapter | null {
		const url = this.getAttribute("api-url");
		if (!url) return null;
		const mode =
			(this.getAttribute("api-mode") as ChatWidgetApiMode | null) ??
			DEFAULT_API_MODE;
		const timeoutMs = this.parsePositiveIntAttribute("api-timeout");
		if (mode === "json") return createJsonAdapter({ url, timeoutMs });
		return createOpenAISseAdapter({ url, timeoutMs });
	}

	private buildStoreFromAttributes(): ChatStore | null {
		const persist = this.getAttribute("persist") as ChatWidgetPersist | null;
		if (!persist || persist === "none") return null;
		const key = this.getAttribute("persist-key") ?? undefined;
		if (persist === "local") return createLocalStorageStore({ key });
		if (persist === "session") return createSessionStorageStore({ key });
		return null;
	}

	private applyTheme(theme: ChatWidgetTheme | null): void {
		const effective = theme ?? DEFAULT_THEME;
		this.unsubscribeColorScheme();
		if (effective === "auto") {
			const mql = this.matchPrefersDark();
			this.colorSchemeQuery = mql;
			if (mql) {
				try {
					mql.addEventListener("change", this.handleColorSchemeChange);
				} catch {}
			}
			this.root.setAttribute("data-theme", mql?.matches ? "dark" : "light");
			return;
		}
		this.root.setAttribute("data-theme", effective);
	}

	private matchPrefersDark(): MediaQueryList | null {
		if (typeof matchMedia === "undefined") return null;
		try {
			return matchMedia("(prefers-color-scheme: dark)");
		} catch {
			return null;
		}
	}

	private unsubscribeColorScheme(): void {
		if (!this.colorSchemeQuery) return;
		try {
			this.colorSchemeQuery.removeEventListener(
				"change",
				this.handleColorSchemeChange,
			);
		} catch {}
		this.colorSchemeQuery = null;
	}

	private applyPosition(position: ChatWidgetPosition | null): void {
		this.setAttribute("data-position", position ?? DEFAULT_POSITION);
	}

	private applyLabels(): void {
		this.fab.applyLabels(this.labels);
		this.panel.applyLabels(this.labels);
	}
}

export function defineChatWidget(): void {
	if (!customElements.get("chat-widget")) {
		customElements.define("chat-widget", ChatWidget);
	}
}
