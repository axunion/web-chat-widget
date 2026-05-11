/**
 * SPEC §7.4 — theme="auto" must follow prefers-color-scheme in real time.
 *
 * The applyTheme() implementation reads matchMedia once at mount time but
 * never registers a change listener, so the data-theme attribute does not
 * react when the OS color scheme flips. The tests below patch window.matchMedia
 * with a controllable MediaQueryList stub.
 */

import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import {
	cleanupWidgets,
	mountWidget,
	registerChatWidget,
} from "../helpers/dom-helpers.ts";
import { stubAdapter } from "../helpers/fake-adapters.ts";

type ChangeListener = (event: { matches: boolean }) => void;

interface FakeMql {
	matches: boolean;
	media: string;
	onchange: null;
	addEventListener: (type: "change", listener: ChangeListener) => void;
	removeEventListener: (type: "change", listener: ChangeListener) => void;
	addListener: (listener: ChangeListener) => void;
	removeListener: (listener: ChangeListener) => void;
	dispatchEvent: (event: Event) => boolean;
	fire: (nextMatches: boolean) => void;
}

function createFakeMql(initialMatches: boolean): FakeMql {
	const listeners = new Set<ChangeListener>();
	const mql: FakeMql = {
		matches: initialMatches,
		media: "(prefers-color-scheme: dark)",
		onchange: null,
		addEventListener: (type, listener) => {
			if (type === "change") listeners.add(listener);
		},
		removeEventListener: (type, listener) => {
			if (type === "change") listeners.delete(listener);
		},
		addListener: (listener) => listeners.add(listener),
		removeListener: (listener) => listeners.delete(listener),
		dispatchEvent: () => true,
		fire: (nextMatches) => {
			mql.matches = nextMatches;
			for (const l of listeners) l({ matches: nextMatches });
		},
	};
	return mql;
}

let currentMql: FakeMql;

beforeAll(registerChatWidget);

beforeEach(() => {
	currentMql = createFakeMql(false);
	vi.spyOn(window, "matchMedia").mockImplementation(
		() => currentMql as unknown as MediaQueryList,
	);
});

afterEach(() => {
	cleanupWidgets();
	vi.restoreAllMocks();
});

function getDataTheme(widget: { shadowRoot: ShadowRoot | null }): string | null {
	return (
		widget.shadowRoot?.querySelector(".root")?.getAttribute("data-theme") ?? null
	);
}

describe("ChatWidget theme=auto follows prefers-color-scheme", () => {
	it("starts with data-theme=dark when matchMedia initially reports dark", () => {
		currentMql = createFakeMql(true);
		const widget = mountWidget({ adapter: stubAdapter(), theme: "auto" });
		expect(getDataTheme(widget)).toBe("dark");
	});

	it("starts with data-theme=light when matchMedia initially reports light", () => {
		currentMql = createFakeMql(false);
		const widget = mountWidget({ adapter: stubAdapter(), theme: "auto" });
		expect(getDataTheme(widget)).toBe("light");
	});

	it("switches data-theme when prefers-color-scheme changes", () => {
		currentMql = createFakeMql(false);
		const widget = mountWidget({ adapter: stubAdapter(), theme: "auto" });
		expect(getDataTheme(widget)).toBe("light");

		currentMql.fire(true);
		expect(getDataTheme(widget)).toBe("dark");

		currentMql.fire(false);
		expect(getDataTheme(widget)).toBe("light");
	});

	it("does not react to prefers-color-scheme changes when theme is fixed to light", () => {
		currentMql = createFakeMql(false);
		const widget = mountWidget({ adapter: stubAdapter(), theme: "light" });
		expect(getDataTheme(widget)).toBe("light");

		currentMql.fire(true);
		expect(getDataTheme(widget)).toBe("light");
	});

	it("removes the change listener when the widget is disconnected", () => {
		currentMql = createFakeMql(false);
		const widget = mountWidget({ adapter: stubAdapter(), theme: "auto" });
		expect(getDataTheme(widget)).toBe("light");

		widget.remove();

		currentMql.fire(true);
		// After disconnect, the detached widget should not receive updates.
		expect(getDataTheme(widget)).toBe("light");
	});
});
