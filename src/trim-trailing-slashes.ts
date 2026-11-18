/** Removes trailing slashes so two spellings of one URL or path compare equal. */
export function trimTrailingSlashes(value: string): string {
	return value.replace(/\/+$/, "")
}
