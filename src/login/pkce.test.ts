import { describe, expect, it } from "bun:test"
import { createCodeChallenge, createCodeVerifier, createState, PkceError } from "./pkce"

describe("PKCE", () => {
	it("derives the RFC 7636 Appendix B S256 challenge", async () => {
		const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"

		expect(await createCodeChallenge(verifier)).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")
	})

	it("encodes caller-supplied verifier bytes as base64url without adding randomness", () => {
		const bytes = new Uint8Array(32).fill(7)

		const first = createCodeVerifier(bytes)
		const second = createCodeVerifier(bytes)

		expect(first).toBe(second)
		expect(first).toHaveLength(43)
		expect(first).toMatch(/^[A-Za-z0-9._~-]{43,128}$/)
	})

	it("encodes caller-supplied state bytes as base64url without adding randomness", () => {
		const bytes = new Uint8Array([1, 2, 3, 4])

		expect(createState(bytes)).toBe("AQIDBA")
		expect(createState(bytes)).toBe(createState(bytes))
	})

	it("rejects verifier bytes that cannot produce an RFC 7636 length", () => {
		expect(() => createCodeVerifier(new Uint8Array(16))).toThrow(PkceError)
		try {
			createCodeVerifier(new Uint8Array(16))
		} catch (error) {
			expect((error as PkceError).code).toBe("code_verifier_length_out_of_range")
		}
	})
})
