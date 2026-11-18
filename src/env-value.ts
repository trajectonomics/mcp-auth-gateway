/** Reads an environment value, falling back to the default when it is absent or empty. */
export function readEnvValue(value: string | undefined, fallback: string): string {
	return value === undefined || value.length === 0 ? fallback : value
}
