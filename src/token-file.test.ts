import { describe, expect, it } from "bun:test"
import { parseTokenFile, TokenFileParseError } from "./token-file"

const VALID_TOKEN_FILE = {
	issuer: "https://auth.example.com",
	token_endpoint: "https://auth.example.com/token",
	client_id: "client-abc",
	resource: "https://api.example.com/mcp",
	access_token: "access-token",
	refresh_token: "refresh-token",
	expires_at: 1_700_000_000_000,
}

function rejection(value: unknown): TokenFileParseError {
	try {
		parseTokenFile(value)
	} catch (error) {
		if (error instanceof TokenFileParseError) return error
		throw error
	}
	throw new Error("expected parseTokenFile to reject the value")
}

describe("Token File parsing", () => {
	it("rejects a value that is not a JSON object", () => {
		for (const value of [null, "token", 42, true, ["issuer"]]) {
			const error = rejection(value)
			expect(error.code).toBe("not_an_object")
		}
	})

	it("rejects a Token File missing a required field", () => {
		const requiredFields = Object.keys(VALID_TOKEN_FILE)
		for (const field of requiredFields) {
			const incomplete = Object.fromEntries(
				Object.entries(VALID_TOKEN_FILE).filter(([key]) => key !== field),
			)
			const error = rejection(incomplete)
			expect(error.code).toBe("missing_field")
			expect(error.field).toBe(field)
		}
	})

	it("rejects a string field that is not a non-empty string", () => {
		const stringFields = [
			"issuer",
			"token_endpoint",
			"client_id",
			"resource",
			"access_token",
			"refresh_token",
		]
		for (const field of stringFields) {
			for (const invalid of ["", 42, null, false]) {
				const error = rejection({ ...VALID_TOKEN_FILE, [field]: invalid })
				expect(error.code).toBe("invalid_field")
				expect(error.field).toBe(field)
			}
		}
	})

	it("rejects an expires_at that is not a finite integer", () => {
		for (const invalid of [1.5, Number.NaN, Number.POSITIVE_INFINITY, "1700000000000", null]) {
			const error = rejection({ ...VALID_TOKEN_FILE, expires_at: invalid })
			expect(error.code).toBe("invalid_field")
			expect(error.field).toBe("expires_at")
		}
	})

	it("returns a frozen Token File without freezing the caller's value", () => {
		const parsed = parseTokenFile(VALID_TOKEN_FILE)
		expect(parsed).toEqual(VALID_TOKEN_FILE)
		expect(Object.isFrozen(parsed)).toBe(true)
		expect(Object.isFrozen(VALID_TOKEN_FILE)).toBe(false)
	})
})
