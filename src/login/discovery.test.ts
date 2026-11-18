import { describe, expect, it } from "bun:test"
import { fetchStub } from "../testing/login-fixtures"
import { authorizationServerMetadataUrls, discoverAuthorizationServer } from "./discovery"
import { BootstrapLoginError } from "./errors"

const ISSUER = "https://auth.example.com/auth/v1"
const METADATA = {
	issuer: ISSUER,
	authorization_endpoint: `${ISSUER}/oauth/authorize`,
	token_endpoint: `${ISSUER}/oauth/token`,
	registration_endpoint: `${ISSUER}/oauth/clients/register`,
}

async function discoveryError(fetchImpl: typeof fetch): Promise<BootstrapLoginError> {
	try {
		await discoverAuthorizationServer({ fetchImpl, issuer: ISSUER })
	} catch (error) {
		if (error instanceof BootstrapLoginError) return error
		throw error
	}
	throw new Error("expected discovery to fail")
}

describe("authorization server metadata locations", () => {
	it("tries the RFC 8414 §3.1 inserted form before the appended form", () => {
		expect(authorizationServerMetadataUrls(ISSUER)).toEqual([
			"https://auth.example.com/.well-known/oauth-authorization-server/auth/v1",
			`${ISSUER}/.well-known/oauth-authorization-server`,
		])
	})

	it("collapses to one location for an issuer without a path", () => {
		expect(authorizationServerMetadataUrls("https://oauth.posthog.com")).toEqual([
			"https://oauth.posthog.com/.well-known/oauth-authorization-server",
		])
	})
})

describe("authorization server discovery", () => {
	it("resolves the endpoints from the inserted form without reading the appended one", async () => {
		const requested: string[] = []
		const fetchImpl = fetchStub(async (input) => {
			requested.push(String(input))
			return Response.json(METADATA)
		})

		const metadata = await discoverAuthorizationServer({ fetchImpl, issuer: ISSUER })

		expect(metadata).toEqual({
			authorizationEndpoint: `${ISSUER}/oauth/authorize`,
			tokenEndpoint: `${ISSUER}/oauth/token`,
			registrationEndpoint: `${ISSUER}/oauth/clients/register`,
		})
		expect(Object.isFrozen(metadata)).toBe(true)
		expect(requested).toEqual([
			"https://auth.example.com/.well-known/oauth-authorization-server/auth/v1",
		])
	})

	it("falls back to the appended form when the inserted form is not found", async () => {
		const requested: string[] = []
		const fetchImpl = fetchStub(async (input) => {
			const url = String(input)
			requested.push(url)
			return url.includes("/.well-known/oauth-authorization-server/auth/v1")
				? new Response("not found", { status: 404 })
				: Response.json(METADATA)
		})

		const metadata = await discoverAuthorizationServer({ fetchImpl, issuer: ISSUER })

		expect(metadata.tokenEndpoint).toBe(`${ISSUER}/oauth/token`)
		expect(requested).toHaveLength(2)
	})

	it("refuses an issuer that is not an absolute URL", () => {
		expect(() => authorizationServerMetadataUrls("oauth.posthog.com")).toThrow(
			"is not an absolute URL",
		)
		try {
			authorizationServerMetadataUrls("oauth.posthog.com")
		} catch (error) {
			expect((error as BootstrapLoginError).code).toBe("issuer_invalid")
		}
	})

	it("refuses metadata that no location publishes", async () => {
		const error = await discoveryError(fetchStub(async () => new Response("nope", { status: 500 })))

		expect(error.code).toBe("metadata_unavailable")
	})

	it("refuses metadata when the authorization server is unreachable", async () => {
		const error = await discoveryError(
			fetchStub(async () => {
				throw new TypeError("connection refused")
			}),
		)

		expect(error.code).toBe("metadata_unavailable")
	})

	it("refuses metadata whose issuer does not echo the requested issuer", async () => {
		const error = await discoveryError(
			fetchStub(async () => Response.json({ ...METADATA, issuer: "https://other.example.com" })),
		)

		expect(error.code).toBe("metadata_issuer_mismatch")
	})

	it("refuses metadata that omits a required endpoint", async () => {
		const cases = [
			{ ...METADATA, authorization_endpoint: undefined },
			{ ...METADATA, token_endpoint: undefined },
			{ ...METADATA, registration_endpoint: undefined },
		]
		for (const document of cases) {
			const error = await discoveryError(fetchStub(async () => Response.json(document)))

			expect(error.code).toBe("metadata_endpoint_missing")
		}
	})
})
