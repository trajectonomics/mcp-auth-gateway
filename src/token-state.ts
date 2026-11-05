import type { TokenFile } from "./token-file"

/** Lifecycle status of a Token File: active, nearing expiry, or unusable. */
export type TokenState = "valid" | "expiring_soon" | "invalid"

/** Proactive refresh lead before expiry: five minutes, in milliseconds. */
export const REFRESH_LEAD_MS = 300_000

/** Evaluates the Token File's state at an explicit instant. */
export function evaluateTokenState(tokenFile: TokenFile, nowMs: number): TokenState {
	const remainingMs = tokenFile.expires_at - nowMs
	if (remainingMs <= 0) {
		return "invalid"
	}
	if (remainingMs <= REFRESH_LEAD_MS) {
		return "expiring_soon"
	}
	return "valid"
}
