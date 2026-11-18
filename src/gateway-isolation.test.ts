import { describe, expect, it } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MOBBIN_DEFAULTS, POSTHOG_DEFAULTS } from "./defaults"
import { createGatewayHandler } from "./gateway-handler"
import type { GatewayFetch } from "./gateway-handler-types"
import { tokenFileFixture } from "./testing/token-file-fixtures"
import { tokenManagerFixture, upstreamFixture } from "./testing/upstream-fixtures"
import type { TokenFile } from "./token-file"
import { createTokenManager } from "./token-manager"
import { TokenRefreshError } from "./token-refresh-error"
import type { TokenRefresher } from "./token-refresher"
import { createFileTokenStore } from "./token-store"
import { TokenStoreError } from "./token-store-error"

const SECRET = "0123456789abcdef0123456789abcdef"
const NOW_MS = 1_700_000_000_000

function proxyRequest(path: string): Request {
	return new Request(`http://gateway.test${path}`, {
		method: "POST",
		headers: { authorization: `Bearer ${SECRET}`, "content-type": "application/json" },
		body: JSON.stringify({ jsonrpc: "2.0", id: 7, method: "tools/list" }),
	})
}

interface ErrorBody {
	readonly id: number
	readonly error: {
		readonly code: number
		readonly message: string
		readonly data?: { readonly tokenFileCode?: string }
	}
}

const never: TokenRefresher = async () => {
	throw new Error("the Token Refresher must not be called")
}

interface IsolationOptions {
	readonly prepare: (paths: { mobbin: string; posthog: string }) => Promise<void>
	readonly posthogRefresher?: TokenRefresher
}

async function withGateway(
	options: IsolationOptions,
	run: (handle: (request: Request) => Promise<Response>) => Promise<void>,
): Promise<void> {
	const directory = await mkdtemp(join(tmpdir(), "gateway-isolation-"))
	try {
		const paths = {
			mobbin: join(directory, "tokens.json"),
			posthog: join(directory, "posthog-tokens.json"),
		}
		await options.prepare(paths)
		const managerFor = (path: string, refresher: TokenRefresher) =>
			createTokenManager({ store: createFileTokenStore({ path }), refresher })
		const fetchImpl: GatewayFetch = async (input) =>
			String(input).includes("posthog") ? new Response("posthog-ok") : new Response("mobbin-ok")
		const handle = createGatewayHandler({
			gatewaySecret: SECRET,
			upstreams: [
				upstreamFixture(MOBBIN_DEFAULTS, managerFor(paths.mobbin, never)),
				upstreamFixture(
					POSTHOG_DEFAULTS,
					managerFor(paths.posthog, options.posthogRefresher ?? never),
				),
			],
			fetchImpl,
			nowMs: () => NOW_MS,
		})
		await run(handle)
	} finally {
		await rm(directory, { recursive: true, force: true })
	}
}

async function writeTokenFile(path: string, tokenFileToWrite: TokenFile): Promise<void> {
	await writeFile(path, JSON.stringify(tokenFileToWrite), { mode: 0o600 })
}

describe("per-Upstream isolation", () => {
	it("keeps Mobbin serving while a missing PostHog Token File fails its own route", async () => {
		await withGateway(
			{
				prepare: async (paths) =>
					writeTokenFile(paths.mobbin, tokenFileFixture("mobbin", NOW_MS + 900_000)),
			},
			async (handle) => {
				const mobbin = await handle(proxyRequest("/mobbin/mcp"))
				expect(mobbin.status).toBe(200)
				expect(await mobbin.text()).toBe("mobbin-ok")

				const posthog = await handle(proxyRequest("/posthog/mcp"))
				const body = (await posthog.json()) as ErrorBody
				expect(posthog.status).toBe(502)
				expect(body.id).toBe(7)
				expect(body.error.code).toBe(-32002)
				expect(body.error.message).toContain("PostHog")
				expect(body.error.message).toContain("posthog-tokens.json")
				expect(body.error.message).toContain("bun run login:posthog")
				expect(body.error.data).toEqual({ tokenFileCode: "token_file_missing" })
			},
		)
	})

	it("reports a corrupt PostHog Token File as -32002 with its store code", async () => {
		await withGateway(
			{
				prepare: async (paths) => {
					await writeTokenFile(paths.mobbin, tokenFileFixture("mobbin", NOW_MS + 900_000))
					await writeFile(paths.posthog, "not a Token File")
				},
			},
			async (handle) => {
				expect((await handle(proxyRequest("/mobbin/mcp"))).status).toBe(200)

				const posthog = await handle(proxyRequest("/posthog/mcp"))
				const body = (await posthog.json()) as ErrorBody
				expect(posthog.status).toBe(502)
				expect(body.error.code).toBe(-32002)
				expect(body.error.data).toEqual({ tokenFileCode: "token_file_corrupt" })
			},
		)
	})

	it("keeps Mobbin serving when PostHog's Refresh Token is revoked", async () => {
		const refresher: TokenRefresher = async () => {
			throw new TokenRefreshError("refresh_token_revoked", "revoked upstream")
		}
		await withGateway(
			{
				posthogRefresher: refresher,
				prepare: async (paths) => {
					await writeTokenFile(paths.mobbin, tokenFileFixture("mobbin", NOW_MS + 900_000))
					await writeTokenFile(paths.posthog, tokenFileFixture("posthog", NOW_MS + 1))
				},
			},
			async (handle) => {
				const posthog = await handle(proxyRequest("/posthog/mcp"))
				const body = (await posthog.json()) as ErrorBody
				expect(body.error.code).toBe(-32001)
				expect(body.error.message).toContain("PostHog")
				expect(body.error.message).toContain("bun run login:posthog")

				const mobbin = await handle(proxyRequest("/mobbin/mcp"))
				expect(mobbin.status).toBe(200)
			},
		)
	})

	it("keeps -32603 for a Token File that cannot be written", async () => {
		const manager = Object.freeze({
			async getAccessToken(): Promise<string> {
				throw new TokenStoreError("token_file_unwritable", "Token File cannot be written")
			},
			async getTokenState(): Promise<"invalid"> {
				return "invalid"
			},
		})
		const handle = createGatewayHandler({
			gatewaySecret: SECRET,
			upstreams: [
				upstreamFixture(MOBBIN_DEFAULTS, tokenManagerFixture()),
				upstreamFixture(POSTHOG_DEFAULTS, manager),
			],
			fetchImpl: async () => new Response("ok"),
			nowMs: () => NOW_MS,
		})

		const posthog = await handle(proxyRequest("/posthog/mcp"))
		const body = (await posthog.json()) as ErrorBody
		expect(posthog.status).toBe(502)
		expect(body.error.code).toBe(-32603)
	})
})
