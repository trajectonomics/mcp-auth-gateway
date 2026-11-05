import { describe, expect, it } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
	atomicWriteFile,
	createFileTokenStore,
	evaluateTokenState,
	getHealthStatus,
	type HealthStatus,
	handleRequest,
	parseTokenFile,
	TokenStoreError,
} from "./index"

describe("Service Handler", () => {
	it("returns operational health status", () => {
		const health = getHealthStatus("test-service", Date.now())
		expect(health.status).toBe("ok")
		expect(health.service).toBe("test-service")
	})

	it("handles /health route with 200 JSON", async () => {
		const res = handleRequest("/health", "test-service", Date.now())
		expect(res.status).toBe(200)
		const body = (await res.json()) as HealthStatus
		expect(body.service).toBe("test-service")
	})

	it("returns 404 for unknown route", () => {
		const res = handleRequest("/unknown", "test-service", Date.now())
		expect(res.status).toBe(404)
	})
})

describe("Public surface", () => {
	it("exposes Token File parsing and state evaluation through the package entry point", () => {
		const expiresAt = 1_700_000_000_000
		const tokenFile = parseTokenFile({
			issuer: "https://auth.example.com",
			token_endpoint: "https://auth.example.com/token",
			client_id: "client-abc",
			resource: "https://api.example.com/mcp",
			access_token: "access-token",
			refresh_token: "refresh-token",
			expires_at: expiresAt,
		})
		expect(evaluateTokenState(tokenFile, expiresAt - 300_000)).toBe("expiring_soon")
	})

	it("exposes atomic Token File storage through the package entry point", async () => {
		const directory = await mkdtemp(join(tmpdir(), "token-store-entry-"))
		try {
			const path = join(directory, "tokens.json")
			const tokenFile = parseTokenFile({
				issuer: "https://auth.example.com",
				token_endpoint: "https://auth.example.com/token",
				client_id: "client-abc",
				resource: "https://api.example.com/mcp",
				access_token: "access-token",
				refresh_token: "refresh-token",
				expires_at: 1_700_000_000_000,
			})
			await atomicWriteFile(path, JSON.stringify(tokenFile))

			expect(await createFileTokenStore({ path }).read()).toEqual(tokenFile)
			await rm(path)
			await expect(createFileTokenStore({ path }).read()).rejects.toBeInstanceOf(TokenStoreError)
		} finally {
			await rm(directory, { recursive: true, force: true })
		}
	})
})
