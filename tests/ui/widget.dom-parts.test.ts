import { beforeAll, describe, expect, it } from "vitest";
import type { ChatWidget } from "../../src/ui/widget.ts";
import {
	getPart,
	registerChatWidget,
} from "../helpers/dom-helpers.ts";

beforeAll(registerChatWidget);

function create(): ChatWidget {
	return document.createElement("chat-widget") as ChatWidget;
}

describe("ChatWidget — FAB part", () => {
	it("has an element with part='fab' inside the shadow root", () => {
		expect(getPart(create(), "fab")).not.toBeNull();
	});
});

describe("ChatWidget — FAB is a button", () => {
	it("the FAB element is a <button>", () => {
		const fab = getPart(create(), "fab");
		expect(fab?.tagName.toLowerCase()).toBe("button");
	});
});

describe("ChatWidget — panel part", () => {
	it("has an element with part='panel'", () => {
		expect(getPart(create(), "panel")).not.toBeNull();
	});
});

describe("ChatWidget — panel uses role='complementary' for non-modal semantics", () => {
	it("the panel carries role='complementary'", () => {
		const panel = getPart(create(), "panel");
		expect(panel?.getAttribute("role")).toBe("complementary");
	});
});

describe("ChatWidget — panel is non-modal (no aria-modal)", () => {
	it("the panel does not carry the aria-modal attribute", () => {
		const panel = getPart(create(), "panel");
		expect(panel?.hasAttribute("aria-modal")).toBe(false);
	});
});

describe("ChatWidget — header part", () => {
	it("has an element with part='header'", () => {
		expect(getPart(create(), "header")).not.toBeNull();
	});
});

describe("ChatWidget — close-button part", () => {
	it("has an element with part='close-button'", () => {
		expect(getPart(create(), "close-button")).not.toBeNull();
	});
});

describe("ChatWidget — log part with role='log'", () => {
	it("has part='log' carrying role='log'", () => {
		const log = getPart(create(), "log");
		expect(log).not.toBeNull();
		expect(log?.getAttribute("role")).toBe("log");
	});
});

describe("ChatWidget — input-area part", () => {
	it("has an element with part='input-area'", () => {
		expect(getPart(create(), "input-area")).not.toBeNull();
	});
});

describe("ChatWidget — input part is a textarea", () => {
	it("has part='input' rendered as a <textarea>", () => {
		const input = getPart(create(), "input");
		expect(input?.tagName.toLowerCase()).toBe("textarea");
	});
});

describe("ChatWidget — send-button part", () => {
	it("has an element with part='send-button'", () => {
		expect(getPart(create(), "send-button")).not.toBeNull();
	});
});
