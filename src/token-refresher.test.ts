import { describe, expect, it } from "bun:test"
import type { TokenFile } from "./token-file"
import { TokenRefreshError } from "./token-refresh-error"
import { createTokenRefresher } from "./token-refresher"

const NOW_MS = 1_700_000_000_000

const TOKEN_FILE: TokenFile = Object.freeze({
	issuer: "https://auth.example.com",
	token_endpoint: "https://auth.example.com/token",
	client_id: "client-abc",
	resource: "https://api.example.com/mcp",
	access_token: "old-access",
	refresh_token: "old-refresh",
	expires_at: NOW_MS + 1_000,
})

interface RecordedRequest {
	readonly url: string
	readonly init: RequestInit
}

type FetchHandler = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

function asFetch(handler: FetchHandler): typeof fetch {
	return Object.assign(handler, { preconnect: () => undefined })
}

function rawFetch(body: string, status = 200): typeof fetch {
	return asFetch(
		async () =>
			new Response(body, {
				status,
				headers: { "content-type": "application/json" },
			}),
	)
}

function failingFetch(error: Error): typeof fetch {
	return asFetch(async () => {
		throw error
	})
}

async function refreshError(
	refresher: ReturnType<typeof createTokenRefresher>,
): Promise<TokenRefreshError> {
	try {
		await refresher({ tokenFile: TOKEN_FILE, nowMs: NOW_MS })
	} catch (error) {
		if (error instanceof TokenRefreshError) return error
		throw error
	}
	throw new Error("expected the refresh to fail")
}

function recordingFetch(
	body: unknown,
	status = 200,
): { requests: RecordedRequest[]; fetchImpl: typeof fetch } {
	const requests: RecordedRequest[] = []
	const fetchImpl = asFetch(async (input, init) => {
		requests.push({ url: String(input), init: init ?? {} })
		return new Response(JSON.stringify(body), {
			status,
			headers: { "content-type": "application/json" },
		})
	})
	return { requests, fetchImpl }
}

describe("Token Refresher", () => {
	it("exchanges the Refresh Token with a form-encoded refresh_token grant", async () => {
		const { requests, fetchImpl } = recordingFetch({
			access_token: "new-access",
			expires_in: 3_600,
		})
		const refresher = createTokenRefresher({ fetchImpl })

		const result = await refresher({ tokenFile: TOKEN_FILE, nowMs: NOW_MS })

		expect(requests).toHaveLength(1)
		const request = requests[0]!
		expect(request.url).toBe(TOKEN_FILE.token_endpoint)
		expect(request.init.method).toBe("POST")
		const headers = new Headers(request.init.headers)
		expect(headers.get("content-type")).toBe("application/x-www-form-urlencoded")
		expect(headers.get("accept")).toBe("application/json")
		const body = new URLSearchParams(String(request.init.body))
		expect(body.get("grant_type")).toBe("refresh_token")
		expect(body.get("refresh_token")).toBe(TOKEN_FILE.refresh_token)
		expect(body.get("client_id")).toBe(TOKEN_FILE.client_id)
		expect(body.get("resource")).toBe(TOKEN_FILE.resource)
		expect(result).toEqual({
			...TOKEN_FILE,
			access_token: "new-access",
			expires_at: NOW_MS + 3_600_000,
		})
		expect(Object.isFrozen(result)).toBe(true)
	})

	it("rotates the Refresh Token when the response issues a new one", async () => {
		const { fetchImpl } = recordingFetch({
			access_token: "new-access",
			refresh_token: "new-refresh",
			expires_in: 60,
		})
		const refresher = createTokenRefresher({ fetchImpl })

		const result = await refresher({ tokenFile: TOKEN_FILE, nowMs: NOW_MS })

		expect(result.refresh_token).toBe("new-refresh")
	})

	it("computes expiry from a unix-seconds expires_at when expires_in is absent", async () => {
		const { fetchImpl } = recordingFetch({
			access_token: "new-access",
			expires_at: 1_700_000_500,
		})
		const refresher = createTokenRefresher({ fetchImpl })

		const result = await refresher({ tokenFile: TOKEN_FILE, nowMs: NOW_MS })

		expect(result.expires_at).toBe(1_700_000_500_000)
	})

	it("reports invalid_grant as a revoked Refresh Token", async () => {
		const { fetchImpl } = recordingFetch(
			{ error: "invalid_grant", error_description: "refresh token revoked" },
			400,
		)
		const error = await refreshError(createTokenRefresher({ fetchImpl }))

		expect(error.code).toBe("refresh_token_revoked")
		expect(error.status).toBe(400)
		expect(error.oauthError).toBe("invalid_grant")
	})

	it("reports any other non-2xx answer as refresh_failed", async () => {
		const { fetchImpl } = recordingFetch({ error: "server_error" }, 503)
		const error = await refreshError(createTokenRefresher({ fetchImpl }))

		expect(error.code).toBe("refresh_failed")
		expect(error.status).toBe(503)
		expect(error.oauthError).toBe("server_error")
	})

	it("reports a network failure as refresh_failed with its cause", async () => {
		const cause = new Error("socket closed")
		const error = await refreshError(createTokenRefresher({ fetchImpl: failingFetch(cause) }))

		expect(error.code).toBe("refresh_failed")
		expect(error.cause).toBe(cause)
	})

	it("reports a 2xx response without an Access Token as refresh_response_invalid", async () => {
		const { fetchImpl } = recordingFetch({ expires_in: 60 })
		const error = await refreshError(createTokenRefresher({ fetchImpl }))

		expect(error.code).toBe("refresh_response_invalid")
		expect(error.status).toBe(200)
	})

	it("reports a 2xx response without expiry information as refresh_response_invalid", async () => {
		const { fetchImpl } = recordingFetch({ access_token: "new-access" })
		const error = await refreshError(createTokenRefresher({ fetchImpl }))

		expect(error.code).toBe("refresh_response_invalid")
	})

	it("reports an expires_at in milliseconds as refresh_response_invalid", async () => {
		const { fetchImpl } = recordingFetch({
			access_token: "new-access",
			expires_at: 1_700_000_500_000,
		})
		const error = await refreshError(createTokenRefresher({ fetchImpl }))

		expect(error.code).toBe("refresh_response_invalid")
	})

	it("reports a 2xx response that is not JSON as refresh_response_invalid", async () => {
		const error = await refreshError(createTokenRefresher({ fetchImpl: rawFetch("{not json") }))

		expect(error.code).toBe("refresh_response_invalid")
	})
})
