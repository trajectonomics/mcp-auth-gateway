import { describe, expect, it } from "bun:test"
import { createAuthorizeUrl } from "./authorize-url"

const AUTHORIZATION_ENDPOINT = "https://oauth.posthog.com/oauth/authorize/"
const OPTIONS = {
	authorizationEndpoint: AUTHORIZATION_ENDPOINT,
	clientId: "client-abc",
	redirectUri: "http://127.0.0.1:9696/callback",
	codeChallenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
	state: "state-xyz",
	resource: "https://mcp.posthog.com/mcp",
}

describe("Authorize URL", () => {
	it("uses the discovered authorization endpoint and carries the S256 challenge", () => {
		const url = new URL(createAuthorizeUrl(OPTIONS))

		expect(url.origin + url.pathname).toBe(AUTHORIZATION_ENDPOINT)
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
})
