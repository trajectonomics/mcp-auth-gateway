import { describe, expect, it } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MOBBIN_DEFAULTS, POSTHOG_DEFAULTS } from "./defaults"
import { createGatewayHandler } from "./gateway-handler"
import type { GatewayFetch } from "./gateway-handler-types"
import { tokenFileFixture } from "./testing/token-file-fixtures"
import { countingTokenManager, upstreamFixture } from "./testing/upstream-fixtures"
import { createTokenManager } from "./token-manager"
import { TokenRefreshError } from "./token-refresh-error"
import type { TokenRefresher } from "./token-refresher"
import { createFileTokenStore } from "./token-store"

const SECRET = "0123456789abcdef0123456789abcdef"
const NOW_MS = 1_700_000_000_000

interface GatewayOptions {
	readonly refresher: TokenRefresher
	readonly fetchImpl: GatewayFetch
}

interface Handle {
	readonly handle: (request: Request) => Promise<Response>
	readonly mobbinCalls: () => number
	readonly posthogCalls: () => number
}

async function withGateway(options: GatewayOptions, run: (handle: Handle) => Promise<void>) {
	const directory = await mkdtemp(join(tmpdir(), "gateway-replay-"))
	try {
		const mobbinStore = createFileTokenStore({ path: join(directory, "tokens.json") })
		const posthogStore = createFileTokenStore({ path: join(directory, "posthog-tokens.json") })
		await mobbinStore.write(tokenFileFixture("mobbin-token", NOW_MS + 900_000))
		await posthogStore.write(tokenFileFixture("posthog-token", NOW_MS + 900_000))
		const mobbin = countingTokenManager(
			createTokenManager({ store: mobbinStore, refresher: options.refresher }),
		)
		const posthog = countingTokenManager(
			createTokenManager({ store: posthogStore, refresher: options.refresher }),
		)
		const handle = createGatewayHandler({
			gatewaySecret: SECRET,
			upstreams: [
				upstreamFixture(MOBBIN_DEFAULTS, mobbin.manager),
				upstreamFixture(POSTHOG_DEFAULTS, posthog.manager),
			],
			fetchImpl: options.fetchImpl,
			nowMs: () => NOW_MS,
		})
		await run({ handle, mobbinCalls: mobbin.calls, posthogCalls: posthog.calls })
	} finally {
		await rm(directory, { recursive: true, force: true })
	}
}

function proxyRequest(path: string, id: number): Request {
	return new Request(`http://gateway.test${path}`, {
		method: "POST",
		headers: { authorization: `Bearer ${SECRET}`, "content-type": "application/json" },
		body: JSON.stringify({ jsonrpc: "2.0", id, method: "tools/list" }),
	})
}

describe("upstream 401 replay", () => {
	it("refreshes once and replays the buffered request with the rotated Access Token", async () => {
		let refreshes = 0
		const seen: { auth: string | null; body: string }[] = []
		const refresher: TokenRefresher = async () => {
			refreshes += 1
			return tokenFileFixture("access-2", NOW_MS + 900_000)
		}
		const fetchImpl: GatewayFetch = async (_input, init) => {
			seen.push({
				auth: new Headers(init?.headers).get("authorization"),
				body: new TextDecoder().decode(init?.body as Uint8Array),
			})
			return seen.length === 1 ? new Response("expired", { status: 401 }) : new Response("ok")
		}
		await withGateway({ refresher, fetchImpl }, async ({ handle }) => {
			const response = await handle(proxyRequest("/mobbin/mcp", 7))

			expect(response.status).toBe(200)
			expect(await response.text()).toBe("ok")
			expect(refreshes).toBe(1)
			expect(seen.map((call) => call.auth)).toEqual(["Bearer mobbin-token", "Bearer access-2"])
			expect(seen[0]?.body).toBe(seen[1]?.body)
		})
	})

	it("replays only the Upstream whose token was rejected", async () => {
		const refreshed: string[] = []
		const refresher: TokenRefresher = async ({ tokenFile: base }) => {
			refreshed.push(base.access_token)
			return tokenFileFixture("posthog-token-2", NOW_MS + 900_000)
		}
		let posthogAttempts = 0
		const fetchImpl: GatewayFetch = async (input) => {
			if (!String(input).includes("posthog")) return new Response("ok")
			posthogAttempts += 1
			return posthogAttempts === 1 ? new Response("expired", { status: 401 }) : new Response("ok")
		}
		await withGateway({ refresher, fetchImpl }, async ({ handle, mobbinCalls }) => {
			const response = await handle(proxyRequest("/posthog/mcp", 7))

			expect(response.status).toBe(200)
			expect(await response.text()).toBe("ok")
			expect(refreshed).toEqual(["posthog-token"])
			expect(posthogAttempts).toBe(2)
			expect(mobbinCalls()).toBe(0)
		})
	})

	it("stops after exactly one replay when the Upstream rejects the rotated token", async () => {
		let refreshes = 0
		const fetchImpl: GatewayFetch = async () => new Response("still expired", { status: 401 })
		const refresher: TokenRefresher = async () => {
			refreshes += 1
			return tokenFileFixture("access-2", NOW_MS + 900_000)
		}
		await withGateway({ refresher, fetchImpl }, async ({ handle }) => {
			const response = await handle(proxyRequest("/mobbin/mcp", 7))

			expect(response.status).toBe(401)
			expect(refreshes).toBe(1)
		})
	})

	it("names the routed Upstream and its login command when its Refresh Token is revoked", async () => {
		const refresher: TokenRefresher = async () => {
			throw new TokenRefreshError("refresh_token_revoked", "revoked upstream")
		}
		const fetchImpl: GatewayFetch = async (input) =>
			String(input).includes("posthog")
				? new Response("expired", { status: 401 })
				: new Response("mobbin-ok")
		await withGateway({ refresher, fetchImpl }, async ({ handle }) => {
			const posthog = await handle(proxyRequest("/posthog/mcp", 7))
			const body = (await posthog.json()) as {
				jsonrpc: string
				id: number
				error: { code: number; message: string; data: { runbook: string } }
			}

			expect(posthog.status).toBe(200)
			expect(body.jsonrpc).toBe("2.0")
			expect(body.id).toBe(7)
			expect(body.error.code).toBe(-32001)
			expect(body.error.message).toContain("PostHog")
			expect(body.error.message).toContain("bun run login:posthog")
			expect(body.error.data.runbook).toBe("https://github.com/trajectonomics/infra/issues/3")

			const mobbin = await handle(proxyRequest("/mobbin/mcp", 8))
			expect(mobbin.status).toBe(200)
			expect(await mobbin.text()).toBe("mobbin-ok")
		})
	})
})
