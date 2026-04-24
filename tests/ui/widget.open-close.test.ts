import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ChatWidget } from "../../src/ui/widget.ts";
import {
	cleanupWidgets,
	getPart,
	mountWidget,
	registerChatWidget,
} from "../helpers/dom-helpers.ts";
import { stubAdapter } from "../helpers/fake-adapters.ts";

beforeAll(registerChatWidget);
afterEach(cleanupWidgets);

describe("ChatWidget.open() — panel gains data-open", () => {
	it("the panel element carries the data-open attribute after open()", () => {
		const widget = mountWidget({ adapter: stubAdapter() });
		widget.open();
		expect(getPart(widget, "panel")?.hasAttribute("data-open")).toBe(true);
	});
});

describe("ChatWidget.close() — panel loses data-open", () => {
	it("the panel data-open attribute is removed after close()", () => {
		const widget = mountWidget({ adapter: stubAdapter() });
		widget.open();
		widget.close();
		expect(getPart(widget, "panel")?.hasAttribute("data-open")).toBe(false);
	});
});

describe("ChatWidget.toggle() — flips the open state", () => {
	it("the first toggle opens and the second closes", () => {
		const widget = mountWidget({ adapter: stubAdapter() });
		widget.toggle();
		expect(getPart(widget, "panel")?.hasAttribute("data-open")).toBe(true);
		widget.toggle();
		expect(getPart(widget, "panel")?.hasAttribute("data-open")).toBe(false);
	});
});

describe("ChatWidget — FAB click opens the panel", () => {
	it("a click on the FAB button sets data-open on the panel", () => {
		const widget = mountWidget({ adapter: stubAdapter() });
		(getPart(widget, "fab") as HTMLButtonElement).click();
		expect(getPart(widget, "panel")?.hasAttribute("data-open")).toBe(true);
	});
});

describe("ChatWidget — close button click closes the panel", () => {
	it("a click on the close button removes data-open", () => {
		const widget = mountWidget({ adapter: stubAdapter() });
		widget.open();
		(getPart(widget, "close-button") as HTMLButtonElement).click();
		expect(getPart(widget, "panel")?.hasAttribute("data-open")).toBe(false);
	});
});

describe("ChatWidget — FAB aria-expanded reflects open state", () => {
	it("aria-expanded is 'true' on the FAB when the panel is open", () => {
		const widget = mountWidget({ adapter: stubAdapter() });
		widget.open();
		expect(getPart(widget, "fab")?.getAttribute("aria-expanded")).toBe("true");
	});
});

describe("ChatWidget — FAB aria-expanded resets to false on close", () => {
	it("aria-expanded is 'false' on the FAB after close()", () => {
		const widget = mountWidget({ adapter: stubAdapter() });
		widget.open();
		widget.close();
		expect(getPart(widget, "fab")?.getAttribute("aria-expanded")).toBe("false");
	});
});

describe("ChatWidget — open CustomEvent fires on open()", () => {
	it("dispatches an 'open' event once per open() call", () => {
		const widget = mountWidget({ adapter: stubAdapter() });
		let count = 0;
		widget.addEventListener("open", () => {
			count += 1;
		});
		widget.open();
		expect(count).toBe(1);
	});
});

describe("ChatWidget — close CustomEvent fires on close()", () => {
	it("dispatches a 'close' event once per close() call", () => {
		const widget = mountWidget({ adapter: stubAdapter() });
		widget.open();
		let count = 0;
		widget.addEventListener("close", () => {
			count += 1;
		});
		widget.close();
		expect(count).toBe(1);
	});
});

describe("ChatWidget — open() is idempotent", () => {
	it("calling open() twice fires the open event only once", () => {
		const widget = mountWidget({ adapter: stubAdapter() });
		let count = 0;
		widget.addEventListener("open", () => {
			count += 1;
		});
		widget.open();
		widget.open();
		expect(count).toBe(1);
	});
});

describe("ChatWidget — ready event fires on mount", () => {
	it("dispatches the 'ready' event exactly once after connectedCallback", () => {
		const widget = new ChatWidget({ adapter: stubAdapter() });
		let count = 0;
		widget.addEventListener("ready", () => {
			count += 1;
		});
		document.body.appendChild(widget);
		expect(count).toBe(1);
	});
});

describe("ChatWidget — open attribute initializes to open state", () => {
	it("mounts in the open state when the 'open' attribute is present on connect", () => {
		const widget = new ChatWidget({ adapter: stubAdapter() });
		widget.setAttribute("open", "");
		document.body.appendChild(widget);
		expect(getPart(widget, "panel")?.hasAttribute("data-open")).toBe(true);
	});
});

describe("ChatWidget — listeners are released on disconnect", () => {
	it("clicking the FAB after remove() does not fire another open event", () => {
		const widget = mountWidget({ adapter: stubAdapter() });
		let opens = 0;
		widget.addEventListener("open", () => {
			opens += 1;
		});
		const fab = getPart(widget, "fab") as HTMLButtonElement;
		widget.remove();
		fab.click();
		expect(opens).toBe(0);
	});
});
