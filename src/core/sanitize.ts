const HTTP_SCHEME = /^https?:\/\//i;

export function isAllowedHttpUrl(href: unknown): boolean {
	if (typeof href !== "string") return false;
	return HTTP_SCHEME.test(href);
}
