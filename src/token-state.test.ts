import { describe, expect, it } from "bun:test"
import type { TokenFile } from "./token-file"
import { evaluateTokenState } from "./token-state"

const NOW_MS = 1_700_000_000_000

function tokenExpiringAt(expiresAt: number): TokenFile {
	return Object.freeze({
		issuer: "https://auth.example.com",
		token_endpoint: "https://auth.example.com/token",
		client_id: "client-abc",
		resource: "https://api.example.com/mcp",
		access_token: "access-token",
		refresh_token: "refresh-token",
		expires_at: expiresAt,
	})
}

describe("Token State", () => {
	it("reports valid while more than the proactive refresh lead remains", () => {
		expect(evaluateTokenState(tokenExpiringAt(NOW_MS + 300_001), NOW_MS)).toBe("valid")
	})

	it("reports expiring_soon once the proactive refresh lead is reached", () => {
		for (const remainingMs of [300_000, 1]) {
			expect(evaluateTokenState(tokenExpiringAt(NOW_MS + remainingMs), NOW_MS)).toBe(
				"expiring_soon",
			)
		}
	})

	it("reports invalid at the moment of expiry and afterwards", () => {
		for (const expiresAt of [NOW_MS, NOW_MS - 1, 1_600_000_000_000]) {
			expect(evaluateTokenState(tokenExpiringAt(expiresAt), NOW_MS)).toBe("invalid")
		}
	})
})
