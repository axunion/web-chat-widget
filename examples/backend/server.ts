import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";

/**
 * Minimal reference backend for web-chat-widget.
 *
 * Why this exists: the browser must NEVER hold the LLM provider API key.
 * The widget's adapters POST to a URL you control; this server is that URL.
 * It injects the secret key server-side and relays the provider's response,
 * so the key never reaches the client.
 *
 *   browser (widget)  --POST /api/chat/sse-->  THIS SERVER  --key-->  OpenAI
 *                     <----  SSE  ------------               <-- SSE --
 *
 * This is intentionally provider-agnostic at the wire level: it speaks the
 * OpenAI-compatible SSE shape that `createOpenAISseAdapter` expects, and a
 * `{ reply }` JSON shape that `createJsonAdapter` expects. Point it at any
 * OpenAI-compatible endpoint via OPENAI_BASE_URL (Azure OpenAI, OpenRouter,
 * a local llama.cpp server, etc.).
 */

const {
	OPENAI_API_KEY,
	OPENAI_BASE_URL = "https://api.openai.com/v1",
	OPENAI_MODEL = "gpt-4o-mini",
	SYSTEM_PROMPT = "",
	ALLOWED_ORIGIN = "*",
	PORT = "8787",
} = process.env;

if (!OPENAI_API_KEY) {
	console.error("Missing OPENAI_API_KEY. Copy .env.example to .env and set it.");
	process.exit(1);
}

interface WireMessage {
	role: "system" | "user" | "assistant";
	content: string;
}

interface ChatRequestBody {
	messages: WireMessage[];
	model?: string;
	stream?: boolean;
}

const app = new Hono();

// The widget runs on the host page's origin, which differs from this server.
// Lock ALLOWED_ORIGIN down to your real site in production; "*" is dev-only.
//
// `authorization` is allowed so the browser→proxy hop can carry your own bearer
// token (createOpenAISseAdapter({ headers: { authorization: "..." } })).
// Cookie-based auth additionally needs credentials, which the CORS spec forbids
// alongside origin "*" — so credentials turn on only once ALLOWED_ORIGIN names a
// concrete site. See ARCHITECTURE.md §Authentication for the rationale.
const allowCredentials = ALLOWED_ORIGIN !== "*";
app.use(
	"/api/*",
	cors({
		origin: ALLOWED_ORIGIN,
		allowMethods: ["POST", "OPTIONS"],
		allowHeaders: ["content-type", "authorization"],
		credentials: allowCredentials,
	}),
);

app.get("/health", (c) => c.json({ ok: true }));

function isValidBody(body: unknown): body is ChatRequestBody {
	return (
		typeof body === "object" &&
		body !== null &&
		Array.isArray((body as ChatRequestBody).messages)
	);
}

// The system prompt is trusted input, so it belongs here — never in page
// markup, where any visitor could read or spoof it. When SYSTEM_PROMPT is set,
// client-supplied system messages are dropped and replaced with ours.
function withSystemPrompt(messages: WireMessage[]): WireMessage[] {
	if (!SYSTEM_PROMPT) return messages;
	return [
		{ role: "system", content: SYSTEM_PROMPT },
		...messages.filter((m) => m.role !== "system"),
	];
}

async function callProvider(
	body: ChatRequestBody,
	stream: boolean,
	signal: AbortSignal,
): Promise<Response> {
	const base = OPENAI_BASE_URL.replace(/\/+$/, "");
	return fetch(`${base}/chat/completions`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			// The secret lives here, server-side only.
			authorization: `Bearer ${OPENAI_API_KEY}`,
		},
		body: JSON.stringify({
			// Dev convenience: the client may pick a model. In production, ignore
			// body.model (or check it against an allowlist) — otherwise anyone can
			// run your most expensive model on your key.
			model: body.model ?? OPENAI_MODEL,
			messages: withSystemPrompt(body.messages),
			stream,
		}),
		signal,
	});
}

// Streaming endpoint for createOpenAISseAdapter({ url: ".../api/chat/sse" }).
// OpenAI already emits the exact SSE shape the adapter parses, so the proxy's
// only real job is to attach the key and relay the byte stream.
app.post("/api/chat/sse", async (c) => {
	const body = await c.req.json().catch(() => null);
	if (!isValidBody(body)) {
		return c.json({ error: "Expected { messages: [...] }" }, 400);
	}

	let upstream: Response;
	try {
		upstream = await callProvider(body, true, c.req.raw.signal);
	} catch (err) {
		// Client aborts (new message / close / clear) are the normal way a
		// stream ends — swallow them. Everything else is a real upstream failure.
		if (c.req.raw.signal.aborted) return new Response(null, { status: 499 });
		return c.json({ error: "Upstream request failed", detail: String(err) }, 502);
	}
	if (!upstream.ok || !upstream.body) {
		const detail = await upstream.text().catch(() => "");
		return c.json({ error: `Upstream ${upstream.status}`, detail }, 502);
	}

	return new Response(upstream.body, {
		headers: {
			"content-type": "text/event-stream; charset=utf-8",
			"cache-control": "no-cache, no-transform",
		},
	});
});

// Non-streaming endpoint for createJsonAdapter({ url: ".../api/chat/json" }).
// Collapses the provider response to the { reply } shape the default extractor
// expects.
app.post("/api/chat/json", async (c) => {
	const body = await c.req.json().catch(() => null);
	if (!isValidBody(body)) {
		return c.json({ error: "Expected { messages: [...] }" }, 400);
	}

	let upstream: Response;
	try {
		upstream = await callProvider(body, false, c.req.raw.signal);
	} catch (err) {
		if (c.req.raw.signal.aborted) return new Response(null, { status: 499 });
		return c.json({ error: "Upstream request failed", detail: String(err) }, 502);
	}
	if (!upstream.ok) {
		const detail = await upstream.text().catch(() => "");
		return c.json({ error: `Upstream ${upstream.status}`, detail }, 502);
	}

	const data = (await upstream.json()) as {
		choices?: Array<{ message?: { content?: string } }>;
	};
	const reply = data.choices?.[0]?.message?.content;
	if (typeof reply !== "string") {
		return c.json({ error: "Provider returned no message content" }, 502);
	}
	return c.json({ reply });
});

serve({ fetch: app.fetch, port: Number(PORT) }, (info) => {
	console.log(`web-chat-widget backend listening on http://localhost:${info.port}`);
	console.log(`  SSE : POST http://localhost:${info.port}/api/chat/sse`);
	console.log(`  JSON: POST http://localhost:${info.port}/api/chat/json`);
});
