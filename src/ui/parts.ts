// Single source of truth for SPEC §7.3 ::part() names. Keeping them here
// prevents typos from becoming silent CSS-miss bugs since these tokens are
// the package's public styling surface.
export const PART = {
	fab: "fab",
	panel: "panel",
	header: "header",
	closeButton: "close-button",
	log: "log",
	message: "message",
	messageUser: "message-user",
	messageAssistant: "message-assistant",
	messageSystem: "message-system",
	messageError: "message-error",
	inputArea: "input-area",
	input: "input",
	sendButton: "send-button",
} as const;

export type PartName = (typeof PART)[keyof typeof PART];
