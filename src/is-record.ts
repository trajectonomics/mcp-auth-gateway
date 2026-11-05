/** Narrows an unknown JSON value to a plain record, excluding null and arrays. */
export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}
