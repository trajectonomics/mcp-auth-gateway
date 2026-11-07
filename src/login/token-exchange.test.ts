import { describe, expect, it } from "bun:test"
import { BootstrapLoginError } from "./errors"
import { exchangeCode } from "./token-exchange"

function fetchStub(
	handler: (input: string | URL | Request, init?: RequestInit) => Promise<Response>,
): typeof fetch {
	return Object.assign(handler, { preconnect: () => undefined })
}

const OPTIONS = {
	tokenEndpoint: "https://auth.example.com/auth/v1/token",
	code: "auth-code",
	redirectUri: "http://127.0.0.1:9696/callback",
	clientId: "client-abc",
	codeVerifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
	resource: "https://api.mobbin.com/mcp",
}

async function exchangeError(fetchImpl: typeof fetch): Promise<BootstrapLoginError> {
	try {
		await exchangeCode({ ...OPTIONS, fetchImpl })
	} catch (error) {
		if (error instanceof BootstrapLoginError) return error
		throw error
	}
	throw new Error("expected token exchange to fail")
}

describe("Token exchange", () => {
	it("posts the authorization code with its original code_verifier", async () => {
		let captured: { url: string; init: RequestInit | undefined } | undefined
		const fetchImpl = fetchStub(async (input, init) => {
			captured = { url: String(input), init }
			return Response.json({
				access_token: "access-token",
				refresh_token: "refresh-token",
				expires_in: 3600,
			})
		})

		const tokens = await exchangeCode({ ...OPTIONS, fetchImpl })

		expect(tokens).toEqual({
			accessToken: "access-token",
			refreshToken: "refresh-token",
			expiresInSeconds: 3600,
		})
		expect(captured?.url).toBe(OPTIONS.tokenEndpoint)
		expect(captured?.init?.method).toBe("POST")
		expect(new Headers(captured?.init?.headers).get("content-type")).toBe(
			"application/x-www-form-urlencoded",
		)
		expect(Object.fromEntries(new URLSearchParams(String(captured?.init?.body)))).toEqual({
			grant_type: "authorization_code",
			code: "auth-code",
			redirect_uri: OPTIONS.redirectUri,
			client_id: "client-abc",
			code_verifier: OPTIONS.codeVerifier,
			resource: OPTIONS.resource,
		})
	})

	it("reports an OAuth error response as token_exchange_failed", async () => {
		const fetchImpl = fetchStub(async () =>
			Response.json({ error: "invalid_grant" }, { status: 400 }),
		)

		const error = await exchangeError(fetchImpl)

		expect(error.code).toBe("token_exchange_failed")
		expect(error.message).toContain("invalid_grant")
	})

	it("reports a network failure as token_exchange_failed", async () => {
		const fetchImpl = fetchStub(async () => {
			throw new TypeError("connection refused")
		})

		const error = await exchangeError(fetchImpl)

		expect(error.code).toBe("token_exchange_failed")
	})

	it("reports a response without refresh_token as invalid_token_response", async () => {
		const fetchImpl = fetchStub(async () =>
			Response.json({ access_token: "access-token", expires_in: 3600 }),
		)

		const error = await exchangeError(fetchImpl)

		expect(error.code).toBe("invalid_token_response")
	})

	it("reports a response without expires_in as invalid_token_response", async () => {
		const fetchImpl = fetchStub(async () =>
			Response.json({ access_token: "access-token", refresh_token: "refresh-token" }),
		)

		const error = await exchangeError(fetchImpl)

		expect(error.code).toBe("invalid_token_response")
	})
})
