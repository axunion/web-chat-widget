// Single home for error normalization so the `error` event carries the same
// shape whether the failure originated in the engine or in an adapter.
// Lives in core/ because core must not import from adapters/.
export function toError(err: unknown): Error {
	if (err instanceof Error) return err;
	return new Error(String(err));
}
