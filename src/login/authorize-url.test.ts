import { describe, expect, it } from "bun:test"
import { createAuthorizeUrl } from "./authorize-url"

const ISSUER = "https://auth.example.com/auth/v1"
const OPTIONS = {
	issuer: ISSUER,
	clientId: "client-abc",
	redirectUri: "http://127.0.0.1:9696/callback",
	codeChallenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
	state: "state-xyz",
	resource: "https://api.mobbin.com/mcp",
}

describe("Authorize URL", () => {
	it("carries the S256 challenge, state, redirect URI, and resource", () => {
		const url = new URL(createAuthorizeUrl(OPTIONS))

		expect(url.origin + url.pathname).toBe(`${ISSUER}/authorize`)
		expect(url.searchParams.get("response_type")).toBe("code")
		expect(url.searchParams.get("client_id")).toBe("client-abc")
		expect(url.searchParams.get("redirect_uri")).toBe(OPTIONS.redirectUri)
		expect(url.searchParams.get("code_challenge")).toBe(OPTIONS.codeChallenge)
		expect(url.searchParams.get("code_challenge_method")).toBe("S256")
		expect(url.searchParams.get("state")).toBe("state-xyz")
		expect(url.searchParams.get("resource")).toBe(OPTIONS.resource)
	})

	it("never requests the plain code challenge method", () => {
		const url = new URL(createAuthorizeUrl(OPTIONS))

		expect([...url.searchParams.values()]).not.toContain("plain")
	})

	it("tolerates an issuer with a trailing slash", () => {
		const url = new URL(createAuthorizeUrl({ ...OPTIONS, issuer: `${ISSUER}/` }))

		expect(url.origin + url.pathname).toBe(`${ISSUER}/authorize`)
	})
})
