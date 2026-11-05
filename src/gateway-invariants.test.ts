import { describe, expect, it } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createGatewayHandler } from "./gateway-handler"
import type { GatewayFetch } from "./gateway-handler-types"
import type { TokenFile } from "./token-file"
import { createTokenManager } from "./token-manager"
import type { TokenRefresher } from "./token-refresher"
import { createFileTokenStore, type TokenStore } from "./token-store"

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

function deferred(): { promise: Promise<void>; resolve: () => void } {
	let resolve: () => void = () => undefined
	const promise = new Promise<void>((settle) => {
		resolve = settle
	})
	return { promise, resolve }
}

interface GatewayOptions {
	readonly initial: TokenFile
	readonly refresher: TokenRefresher
	readonly fetchImpl: GatewayFetch
	readonly wrapStore?: (store: TokenStore) => TokenStore
}

async function withGateway(
	options: GatewayOptions,
	run: (handle: (request: Request) => Promise<Response>) => Promise<void>,
): Promise<void> {
	const directory = await mkdtemp(join(tmpdir(), "gateway-invariants-"))
	try {
		const fileStore = createFileTokenStore({ path: join(directory, "tokens.json") })
		await fileStore.write(options.initial)
		const store = options.wrapStore?.(fileStore) ?? fileStore
		const tokenManager = createTokenManager({ store, refresher: options.refresher })
		const handle = createGatewayHandler({
			gatewaySecret: SECRET,
			tokenManager,
			upstreamUrl: UPSTREAM_URL,
			fetchImpl: options.fetchImpl,
			nowMs: () => NOW_MS,
		})
		await run(handle)
	} finally {
		await rm(directory, { recursive: true, force: true })
	}
}

function proxyRequest(): Request {
	return new Request("http://gateway.test/mobbin/mcp", {
		headers: { authorization: `Bearer ${SECRET}` },
	})
}

describe("Gateway refresh invariants", () => {
	it("shares one refresh across concurrent requests holding an expiring token", async () => {
		const refreshStarted = deferred()
		const releaseRefresh = deferred()
		let refreshes = 0
		const seen: (string | null)[] = []
		const refresher: TokenRefresher = async () => {
			refreshes += 1
			refreshStarted.resolve()
			await releaseRefresh.promise
			return tokenFile("access-2", NOW_MS + 900_000)
		}
		const fetchImpl: GatewayFetch = async (_input, init) => {
			seen.push(new Headers(init?.headers).get("authorization"))
			return new Response("ok")
		}
		await withGateway(
			{ initial: tokenFile("access-1", NOW_MS + 1), refresher, fetchImpl },
			async (handle) => {
				try {
					const first = handle(proxyRequest())
					const second = handle(proxyRequest())
					await refreshStarted.promise
					await Bun.sleep(10)
					expect(refreshes).toBe(1)
					expect(seen).toHaveLength(0)
					releaseRefresh.resolve()
					const responses = await Promise.all([first, second])
					expect(responses.map((response) => response.status)).toEqual([200, 200])
					expect(seen).toEqual(["Bearer access-2", "Bearer access-2"])
				} finally {
					releaseRefresh.resolve()
				}
			},
		)
	})

	it("waits for persistence before forwarding a refreshed Access Token", async () => {
		const writeStarted = deferred()
		const releaseWrite = deferred()
		const seen: (string | null)[] = []
		const refresher: TokenRefresher = async () => tokenFile("access-2", NOW_MS + 900_000)
		const fetchImpl: GatewayFetch = async (_input, init) => {
			seen.push(new Headers(init?.headers).get("authorization"))
			return new Response("ok")
		}
		const wrapStore = (base: TokenStore): TokenStore =>
			Object.freeze({
				read: () => base.read(),
				async write(tokenFileToWrite: TokenFile): Promise<void> {
					writeStarted.resolve()
					await releaseWrite.promise
					await base.write(tokenFileToWrite)
				},
			})
		await withGateway(
			{ initial: tokenFile("access-1", NOW_MS + 1), refresher, fetchImpl, wrapStore },
			async (handle) => {
				try {
					const pending = handle(proxyRequest())
					await writeStarted.promise
					expect(seen).toHaveLength(0)
					releaseWrite.resolve()
					expect((await pending).status).toBe(200)
					expect(seen).toEqual(["Bearer access-2"])
				} finally {
					releaseWrite.resolve()
				}
			},
		)
	})

	it("returns a sanitized 502 JSON-RPC error when the Upstream is unreachable", async () => {
		const fetchImpl: GatewayFetch = async () => {
			throw new Error("ECONNREFUSED 10.0.0.1")
		}
		await withGateway(
			{
				initial: tokenFile("access-1", NOW_MS + 900_000),
				refresher: async () => tokenFile("access-2", NOW_MS + 900_000),
				fetchImpl,
			},
			async (handle) => {
				const response = await handle(proxyRequest())
				const body = await response.text()

				expect(response.status).toBe(502)
				expect(JSON.parse(body).error).toEqual({
					code: -32603,
					message: "Upstream MCP request failed",
				})
				expect(body).not.toContain("access-1")
				expect(body).not.toContain("ECONNREFUSED")
			},
		)
	})
})
