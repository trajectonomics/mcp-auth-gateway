import { describe, expect, it } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createGatewayHandler } from "./gateway-handler"
import type { GatewayFetch } from "./gateway-handler-types"
import type { TokenFile } from "./token-file"
import { createTokenManager } from "./token-manager"
import { TokenRefreshError } from "./token-refresh-error"
import type { TokenRefresher } from "./token-refresher"
import { createFileTokenStore } from "./token-store"

const SECRET = "0123456789abcdef0123456789abcdef"
const NOW_MS = 1_700_000_000_000
const UPSTREAM_URL = "https://upstream.example.com/mcp"

function tokenFile(accessToken: string, expiresAt: number): TokenFile {
	return Object.freeze({
		issuer: "https://auth.example.com",
		token_endpoint: "https://auth.example.com/token",
		client_id: "client-abc",
		resource: UPSTREAM_URL,
		access_token: accessToken,
		refresh_token: `refresh-${accessToken}`,
		expires_at: expiresAt,
	})
}

async function withGateway(
	initial: TokenFile,
	refresher: TokenRefresher,
	fetchImpl: GatewayFetch,
	run: (handle: (request: Request) => Promise<Response>) => Promise<void>,
): Promise<void> {
	const directory = await mkdtemp(join(tmpdir(), "gateway-replay-"))
	try {
		const store = createFileTokenStore({ path: join(directory, "tokens.json") })
		await store.write(initial)
		const tokenManager = createTokenManager({ store, refresher })
		const handle = createGatewayHandler({
			gatewaySecret: SECRET,
			tokenManager,
			upstreamUrl: UPSTREAM_URL,
			fetchImpl,
			nowMs: () => NOW_MS,
		})
		await run(handle)
	} finally {
		await rm(directory, { recursive: true, force: true })
	}
}

function proxyRequest(id: number): Request {
	return new Request("http://gateway.test/mobbin/mcp", {
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
			return tokenFile("access-2", NOW_MS + 900_000)
		}
		const fetchImpl: GatewayFetch = async (_input, init) => {
			seen.push({
				auth: new Headers(init?.headers).get("authorization"),
				body: new TextDecoder().decode(init?.body as Uint8Array),
			})
			return seen.length === 1 ? new Response("expired", { status: 401 }) : new Response("ok")
		}
		await withGateway(
			tokenFile("access-1", NOW_MS + 900_000),
			refresher,
			fetchImpl,
			async (handle) => {
				const response = await handle(proxyRequest(7))

				expect(response.status).toBe(200)
				expect(await response.text()).toBe("ok")
				expect(refreshes).toBe(1)
				expect(seen.map((call) => call.auth)).toEqual(["Bearer access-1", "Bearer access-2"])
				expect(seen[0]?.body).toBe(seen[1]?.body)
			},
		)
	})

	it("stops after exactly one replay when upstream rejects the rotated token", async () => {
		let refreshes = 0
		const fetchImpl: GatewayFetch = async () => new Response("still expired", { status: 401 })
		const refresher: TokenRefresher = async () => {
			refreshes += 1
			return tokenFile("access-2", NOW_MS + 900_000)
		}
		await withGateway(
			tokenFile("access-1", NOW_MS + 900_000),
			refresher,
			fetchImpl,
			async (handle) => {
				const response = await handle(proxyRequest(7))

				expect(response.status).toBe(401)
				expect(refreshes).toBe(1)
			},
		)
	})

	it("returns the Runbook JSON-RPC error when the Refresh Token is revoked", async () => {
		const refresher: TokenRefresher = async () => {
			throw new TokenRefreshError("refresh_token_revoked", "revoked upstream")
		}
		const fetchImpl: GatewayFetch = async () => new Response("expired", { status: 401 })
		await withGateway(
			tokenFile("access-1", NOW_MS + 900_000),
			refresher,
			fetchImpl,
			async (handle) => {
				const response = await handle(proxyRequest(7))
				const body = (await response.json()) as {
					jsonrpc: string
					id: number
					error: { code: number; message: string; data: { runbook: string } }
				}

				expect(response.status).toBe(200)
				expect(response.headers.get("content-type")).toBe("application/json")
				expect(body.jsonrpc).toBe("2.0")
				expect(body.id).toBe(7)
				expect(body.error.code).toBe(-32001)
				expect(body.error.message).toContain("bun run login:mobbin")
				expect(body.error.data.runbook).toBe("https://github.com/trajectonomics/infra/issues/3")
			},
		)
	})
})
