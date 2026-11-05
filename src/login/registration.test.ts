import { describe, expect, it } from "bun:test"
import { BootstrapLoginError } from "./errors"
import { registerClient } from "./registration"

function fetchStub(
	handler: (input: string | URL | Request, init?: RequestInit) => Promise<Response>,
): typeof fetch {
	return Object.assign(handler, { preconnect: () => undefined })
}

const ISSUER = "https://auth.example.com/auth/v1"
const REDIRECT_URI = "http://127.0.0.1:9696/callback"

async function registrationError(fetchImpl: typeof fetch): Promise<BootstrapLoginError> {
	try {
		await registerClient({ fetchImpl, issuer: ISSUER, redirectUri: REDIRECT_URI })
	} catch (error) {
		if (error instanceof BootstrapLoginError) return error
		throw error
	}
	throw new Error("expected Client Registration to fail")
}

describe("Client Registration", () => {
	it("registers the gateway client metadata and returns the client_id", async () => {
		let captured: { url: string; init: RequestInit | undefined } | undefined
		const fetchImpl = fetchStub(async (input, init) => {
			captured = { url: String(input), init }
			return Response.json({ client_id: "client-abc" }, { status: 201 })
		})

		const clientId = await registerClient({ fetchImpl, issuer: ISSUER, redirectUri: REDIRECT_URI })

		expect(clientId).toBe("client-abc")
		expect(captured?.url).toBe(`${ISSUER}/oauth/clients/register`)
		expect(captured?.init?.method).toBe("POST")
		expect(new Headers(captured?.init?.headers).get("content-type")).toBe("application/json")
		expect(JSON.parse(String(captured?.init?.body))).toEqual({
			client_name: "mcp-auth-gateway",
			redirect_uris: [REDIRECT_URI],
			grant_types: ["authorization_code", "refresh_token"],
			response_types: ["code"],
			token_endpoint_auth_method: "none",
		})
	})

	it("reports an HTTP failure as client_registration_failed", async () => {
		const fetchImpl = fetchStub(async () => new Response("nope", { status: 500 }))

		const error = await registrationError(fetchImpl)

		expect(error.code).toBe("client_registration_failed")
		expect(error.message).toContain("Dynamic Client Registration")
	})

	it("reports a network failure as client_registration_failed", async () => {
		const fetchImpl = fetchStub(async () => {
			throw new TypeError("connection refused")
		})

		const error = await registrationError(fetchImpl)

		expect(error.code).toBe("client_registration_failed")
	})

	it("reports a response without client_id as missing_client_id", async () => {
		const fetchImpl = fetchStub(async () => Response.json({}))

		const error = await registrationError(fetchImpl)

		expect(error.code).toBe("missing_client_id")
		expect(error.message).toContain("client_id")
	})

	it("reports an empty client_id as missing_client_id", async () => {
		const fetchImpl = fetchStub(async () => Response.json({ client_id: "  " }))

		const error = await registrationError(fetchImpl)

		expect(error.code).toBe("missing_client_id")
	})
})
