import { describe, expect, it } from "bun:test"
import { createGatewayHandler } from "./gateway-handler"
import { mobbinUpstream, posthogUpstream, tokenManagerFixture } from "./testing/upstream-fixtures"
import type { TokenManager } from "./token-manager"
import type { TokenState } from "./token-state"

const SECRET = "0123456789abcdef0123456789abcdef"
const NOW_MS = 1_700_000_000_000
const FOUR_MIB = 4 * 1024 * 1024

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

function handlerWith(manager: TokenManager): {
	handle: (request: Request) => Promise<Response>
	upstreamCalls: () => number
} {
	let calls = 0
	const fetchImpl = async (): Promise<Response> => {
		calls += 1
		return new Response("ok")
	}
	const handle = createGatewayHandler({
		gatewaySecret: SECRET,
		upstreams: [mobbinUpstream(manager)],
		fetchImpl,
		nowMs: () => NOW_MS,
	})
	return { handle, upstreamCalls: () => calls }
}

function authorizedRequest(body: Uint8Array): Request {
	return new Request("http://gateway.test/mobbin/mcp", {
		method: "POST",
		headers: { authorization: `Bearer ${SECRET}` },
		body,
	})
}

describe("bounded request buffering", () => {
	it("accepts a body of exactly four mebibytes", async () => {
		const { handle, upstreamCalls } = handlerWith(tokenManager())
		const response = await handle(authorizedRequest(new Uint8Array(FOUR_MIB)))

		expect(response.status).toBe(200)
		expect(upstreamCalls()).toBe(1)
	})

	it("rejects a body over four mebibytes before calling upstream", async () => {
		const { handle, upstreamCalls } = handlerWith(tokenManager())
		const response = await handle(authorizedRequest(new Uint8Array(FOUR_MIB + 1)))

		expect(response.status).toBe(413)
		expect(upstreamCalls()).toBe(0)
	})
})

describe("Token State health", () => {
	it("reports an unreadable Token File as invalid on its own Upstream only", async () => {
		const unreadable: TokenManager = Object.freeze({
			async getAccessToken(): Promise<string> {
				return "access-token"
			},
			async getTokenState(): Promise<TokenState> {
				throw new Error("Token File is missing")
			},
		})
		const handle = createGatewayHandler({
			gatewaySecret: SECRET,
			upstreams: [
				mobbinUpstream(tokenManagerFixture({ tokenState: "valid" })),
				posthogUpstream(unreadable),
			],
			fetchImpl: async () => new Response("ok"),
			nowMs: () => NOW_MS,
		})
		const response = await handle(
			new Request("http://gateway.test/health/token", {
				headers: { authorization: `Bearer ${SECRET}` },
			}),
		)

		expect(response.status).toBe(200)
		expect(await response.json()).toEqual({
			upstreams: { mobbin: { tokenState: "valid" }, posthog: { tokenState: "invalid" } },
		})
	})
})
