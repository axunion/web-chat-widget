// Single source of truth for ::part() names (see API.md §3.3). Keeping them here
// prevents typos from becoming silent CSS-miss bugs since these tokens are
// the package's public styling surface.
export const PART = {
	fab: "fab",
	panel: "panel",
	header: "header",
	clearButton: "clear-button",
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
	stopButton: "stop-button",
	badge: "badge",
	copyButton: "copy-button",
} as const;
