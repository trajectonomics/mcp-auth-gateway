import { describe, expect, it } from "bun:test"
import { createGatewayHandler } from "./gateway-handler"
import type { GatewayFetch } from "./gateway-handler-types"
import type { TokenManager } from "./token-manager"
import type { TokenState } from "./token-state"

const SECRET = "0123456789abcdef0123456789abcdef"
const UPSTREAM_URL = "https://upstream.example.com/mcp"

function tokenManager(state: TokenState = "valid"): TokenManager {
	return Object.freeze({
		async getAccessToken(): Promise<string> {
			return "access-token"
		},
		async getTokenState(): Promise<TokenState> {
			return state
		},
	})
}

function handler(fetchImpl: GatewayFetch = async () => new Response(null)): {
	handle: (request: Request) => Promise<Response>
	upstreamCalls: () => number
} {
	let calls = 0
	const countingFetch: GatewayFetch = async (input, init) => {
		calls += 1
		return fetchImpl(input, init)
	}
	const handle = createGatewayHandler({
		gatewaySecret: SECRET,
		tokenManager: tokenManager(),
		upstreamUrl: UPSTREAM_URL,
		fetchImpl: countingFetch,
		nowMs: () => 1_700_000_000_000,
	})
	return { handle, upstreamCalls: () => calls }
}

function get(path: string, authorization?: string): Request {
	return new Request(`http://gateway.test${path}`, {
		headers: authorization === undefined ? {} : { authorization },
	})
}

describe("Gateway health endpoints", () => {
	it("serves liveness without authentication and without Token State", async () => {
		const { handle } = handler()
		for (const path of ["/health", "/healthz"]) {
			const response = await handle(get(path))
			const body = await response.text()
			expect(response.status).toBe(200)
			expect(JSON.parse(body)).toEqual({ status: "ok" })
			expect(body).not.toContain("tokenState")
			expect(body).not.toContain(SECRET)
		}
	})

	it("restricts detailed Token State to authenticated requests", async () => {
		const { handle } = handler()
		const denied = await handle(get("/health/token"))
		expect(denied.status).toBe(401)

		const allowed = await handle(get("/health/token", `Bearer ${SECRET}`))
		expect(allowed.status).toBe(200)
		expect(await allowed.json()).toEqual({ tokenState: "valid" })
	})
})

describe("Gateway routing", () => {
	it("rejects missing and wrong Gateway Secrets before calling upstream", async () => {
		const { handle, upstreamCalls } = handler()
		const missing = await handle(get("/mobbin/mcp"))
		const wrong = await handle(get("/mobbin/mcp", "Bearer wrong-secret"))

		expect(missing.status).toBe(401)
		expect(wrong.status).toBe(401)
		expect(upstreamCalls()).toBe(0)
	})

	it("returns 404 for unknown paths even without a Gateway Secret", async () => {
		const { handle } = handler()
		const response = await handle(get("/unknown"))
		expect(response.status).toBe(404)
	})
})
