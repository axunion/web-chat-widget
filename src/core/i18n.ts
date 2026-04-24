export type Locale = "ja" | "en";

export interface LabelDictionary {
	fabLabel: string;
	panelTitle: string;
	closeButton: string;
	placeholder: string;
	sendButton: string;
	errorGeneric: string;
	errorRetry: string;
	emptyState: string;
	typingLabel: string;
	user: string;
	assistant: string;
	system: string;
	clearHistory: string;
	clearConfirm: string;
	poweredBy: string;
}

const JA: LabelDictionary = {
	fabLabel: "AI チャットを開く",
	panelTitle: "AI アシスタント",
	closeButton: "閉じる",
	placeholder: "メッセージを入力",
	sendButton: "送信",
	errorGeneric: "応答を取得できませんでした",
	errorRetry: "再試行",
	emptyState: "何でも聞いてください。",
	typingLabel: "応答を生成中",
	user: "あなた",
	assistant: "アシスタント",
	system: "システム",
	clearHistory: "履歴をクリア",
	clearConfirm: "履歴を削除しますか？",
	poweredBy: "",
};

const EN: LabelDictionary = {
	fabLabel: "Open AI chat",
	panelTitle: "AI Assistant",
	closeButton: "Close",
	placeholder: "Type a message",
	sendButton: "Send",
	errorGeneric: "Failed to fetch a response",
	errorRetry: "Retry",
	emptyState: "Ask me anything.",
	typingLabel: "Generating a response",
	user: "You",
	assistant: "Assistant",
	system: "System",
	clearHistory: "Clear history",
	clearConfirm: "Clear the conversation?",
	poweredBy: "",
};

function detectLocale(): Locale {
	const lang =
		typeof navigator !== "undefined" && typeof navigator.language === "string"
			? navigator.language.toLowerCase()
			: "";
	if (lang.startsWith("ja")) return "ja";
	return "en";
}

export function resolveLabels(
	locale?: Locale,
	override?: Partial<LabelDictionary>,
): LabelDictionary {
	const effective: Locale = locale ?? detectLocale();
	const base = effective === "ja" ? JA : EN;
	if (!override) return { ...base };
	return { ...base, ...override };
}
