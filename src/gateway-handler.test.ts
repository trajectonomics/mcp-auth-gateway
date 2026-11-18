import { describe, expect, it } from "bun:test"
import { createGatewayHandler } from "./gateway-handler"
import type { GatewayFetch } from "./gateway-handler-types"
import { mobbinUpstream, posthogUpstream, tokenManagerFixture } from "./testing/upstream-fixtures"

const SECRET = "0123456789abcdef0123456789abcdef"
const NOW_MS = 1_700_000_000_000

interface RecordedCall {
	readonly url: string
	readonly authorization: string | null
}

function handler(): {
	handle: (request: Request) => Promise<Response>
	calls: RecordedCall[]
} {
	const calls: RecordedCall[] = []
	const fetchImpl: GatewayFetch = async (input, init) => {
		calls.push({
			url: String(input),
			authorization: new Headers(init?.headers).get("authorization"),
		})
		return new Response("ok")
	}
	const handle = createGatewayHandler({
		gatewaySecret: SECRET,
		upstreams: [
			mobbinUpstream(tokenManagerFixture({ accessToken: "mobbin-token" })),
			posthogUpstream(tokenManagerFixture({ accessToken: "posthog-token" })),
		],
		fetchImpl,
		nowMs: () => NOW_MS,
	})
	return { handle, calls }
}

function get(path: string, authorization?: string): Request {
	return new Request(`http://gateway.test${path}`, {
		headers: authorization === undefined ? {} : { authorization },
	})
}

function post(path: string, authorization?: string): Request {
	return new Request(`http://gateway.test${path}`, {
		method: "POST",
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

	it("restricts per-Upstream Token State to authenticated requests", async () => {
		const handle = createGatewayHandler({
			gatewaySecret: SECRET,
			upstreams: [
				mobbinUpstream(tokenManagerFixture({ tokenState: "valid" })),
				posthogUpstream(tokenManagerFixture({ tokenState: "invalid" })),
			],
			fetchImpl: async () => new Response("ok"),
			nowMs: () => NOW_MS,
		})

		expect((await handle(get("/health/token"))).status).toBe(401)
		const allowed = await handle(get("/health/token", `Bearer ${SECRET}`))
		expect(allowed.status).toBe(200)
		expect(await allowed.json()).toEqual({
			upstreams: { mobbin: { tokenState: "valid" }, posthog: { tokenState: "invalid" } },
		})
	})
})

describe("Gateway routing", () => {
	it("rejects missing and wrong Gateway Secrets on every Upstream Route", async () => {
		const { handle, calls } = handler()
		for (const path of ["/mobbin/mcp", "/posthog/mcp"]) {
			expect((await handle(post(path))).status).toBe(401)
			expect((await handle(post(path, "Bearer wrong-secret"))).status).toBe(401)
		}

		expect(calls).toHaveLength(0)
	})

	it("returns 404 for an unknown path before authentication and without an Upstream", async () => {
		const { handle, calls } = handler()

		expect((await handle(post("/unknown"))).status).toBe(404)
		expect((await handle(post("/unknown", `Bearer ${SECRET}`))).status).toBe(404)
		expect(calls).toHaveLength(0)
	})

	it("relays each Upstream Route to its own Upstream URL with its own Access Token", async () => {
		const { handle, calls } = handler()

		expect((await handle(post("/posthog/mcp", `Bearer ${SECRET}`))).status).toBe(200)
		expect((await handle(post("/mobbin/mcp", `Bearer ${SECRET}`))).status).toBe(200)

		expect(calls).toEqual([
			{ url: "https://mcp.posthog.com/mcp", authorization: "Bearer posthog-token" },
			{ url: "https://api.mobbin.com/mcp", authorization: "Bearer mobbin-token" },
		])
	})
})
