export type SseEvent = { type: "data"; data: string } | { type: "done" };

export interface SseParser {
	feed(chunk: string): SseEvent[];
	flush(): SseEvent[];
}

function parseEvent(raw: string): SseEvent | null {
	const lines = raw.split("\n");
	const dataLines: string[] = [];
	let hasData = false;
	for (const line of lines) {
		if (line.startsWith("data:")) {
			hasData = true;
			let value = line.slice(5);
			if (value.startsWith(" ")) value = value.slice(1);
			dataLines.push(value);
		}
	}
	if (!hasData) return null;
	const data = dataLines.join("\n");
	if (data === "[DONE]") return { type: "done" };
	return { type: "data", data };
}

export function createSseParser(): SseParser {
	let buffer = "";
	return {
		feed(chunk: string): SseEvent[] {
			buffer += chunk;
			const events: SseEvent[] = [];
			while (true) {
				const idx = buffer.indexOf("\n\n");
				if (idx === -1) break;
				const raw = buffer.slice(0, idx);
				buffer = buffer.slice(idx + 2);
				const event = parseEvent(raw);
				if (event) events.push(event);
			}
			return events;
		},
		flush(): SseEvent[] {
			if (buffer === "") return [];
			const raw = buffer;
			buffer = "";
			const event = parseEvent(raw);
			return event ? [event] : [];
		},
	};
}
