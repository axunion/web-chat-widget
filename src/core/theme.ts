export interface ThemeToken {
	name: string;
	light: string;
	dark: string;
	description: string;
}

const SYSTEM_FONT_STACK =
	'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans JP", sans-serif';

export const THEME_TOKENS: readonly ThemeToken[] = [
	{
		name: "--cw-color-primary",
		light: "#2563eb",
		dark: "#60a5fa",
		description: "Accent color for FAB, send button, and focus rings",
	},
	{
		name: "--cw-color-on-primary",
		light: "#ffffff",
		dark: "#0b1220",
		description: "Foreground color on primary",
	},
	{
		name: "--cw-color-bg",
		light: "#ffffff",
		dark: "#0f172a",
		description: "Panel background",
	},
	{
		name: "--cw-color-surface",
		light: "#f1f5f9",
		dark: "#1e293b",
		description: "Assistant message bubble background",
	},
	{
		name: "--cw-color-user-bubble",
		light: "#2563eb",
		dark: "#3b82f6",
		description: "User message bubble",
	},
	{
		name: "--cw-color-user-text",
		light: "#ffffff",
		dark: "#ffffff",
		description: "User bubble text color",
	},
	{
		name: "--cw-color-text",
		light: "#0f172a",
		dark: "#e2e8f0",
		description: "Body text",
	},
	{
		name: "--cw-color-muted",
		light: "#64748b",
		dark: "#94a3b8",
		description: "Muted text and system role",
	},
	{
		name: "--cw-color-border",
		light: "#e2e8f0",
		dark: "#334155",
		description: "Dividers and borders",
	},
	{
		name: "--cw-color-error",
		light: "#dc2626",
		dark: "#f87171",
		description: "Error text and indicator",
	},
	{
		name: "--cw-radius",
		light: "16px",
		dark: "16px",
		description: "Panel and bubble border radius",
	},
	{
		name: "--cw-radius-sm",
		light: "8px",
		dark: "8px",
		description: "Small corner radius (input etc.)",
	},
	{
		name: "--cw-font-family",
		light: SYSTEM_FONT_STACK,
		dark: SYSTEM_FONT_STACK,
		description: "Font stack",
	},
	{
		name: "--cw-font-size",
		light: "14px",
		dark: "14px",
		description: "Body font size",
	},
	{
		name: "--cw-panel-width",
		light: "380px",
		dark: "380px",
		description: "Desktop panel width",
	},
	{
		name: "--cw-panel-height",
		light: "600px",
		dark: "600px",
		description: "Panel max height",
	},
	{
		name: "--cw-fab-size",
		light: "56px",
		dark: "56px",
		description: "FAB diameter",
	},
	{
		name: "--cw-offset",
		light: "20px",
		dark: "20px",
		description: "Viewport edge offset",
	},
	{
		name: "--cw-z-index",
		light: "2147483000",
		dark: "2147483000",
		description: "Stacking order (not max, intentionally)",
	},
	{
		name: "--cw-shadow",
		light: "0 10px 30px rgba(0,0,0,.15)",
		dark: "0 10px 30px rgba(0,0,0,.6)",
		description: "Panel shadow",
	},
];

export function renderThemeCss(
	tokens: readonly ThemeToken[] = THEME_TOKENS,
): string {
	const light = tokens.map((t) => `\t${t.name}: ${t.light};`).join("\n");
	const dark = tokens.map((t) => `\t${t.name}: ${t.dark};`).join("\n");
	return `[data-theme="light"] {\n${light}\n}\n[data-theme="dark"] {\n${dark}\n}\n`;
}
