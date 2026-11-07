import { describe, expect, it } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
	atomicWriteFile,
	BootstrapLoginError,
	createCodeVerifier,
	createFileTokenStore,
	createGatewayHandler,
	createTokenManager,
	createTokenRefresher,
	evaluateTokenState,
	loadGatewayConfig,
	parseTokenFile,
	runBootstrapLogin,
	TokenRefreshError,
	TokenStoreError,
	validateGatewaySecret,
} from "./index"

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

	it("exposes PKCE and Bootstrap Login through the package entry point", () => {
		expect(createCodeVerifier(new Uint8Array(32))).toHaveLength(43)
		expect(typeof runBootstrapLogin).toBe("function")
		expect(BootstrapLoginError.prototype).toBeInstanceOf(Error)
	})

	it("exposes the Token Refresher and Token Manager through the package entry point", async () => {
		const tokenFile = parseTokenFile({
			issuer: "https://auth.example.com",
			token_endpoint: "https://auth.example.com/token",
			client_id: "client-abc",
			resource: "https://api.example.com/mcp",
			access_token: "access-token",
			refresh_token: "refresh-token",
			expires_at: 1_700_000_000_000,
		})
		const manager = createTokenManager({
			store: {
				async read() {
					return tokenFile
				},
				async write() {},
			},
			refresher: async () => tokenFile,
		})

		expect(typeof createTokenRefresher).toBe("function")
		expect(await manager.getAccessToken({ nowMs: 1_699_999_999_000 })).toBe("access-token")
		expect(new TokenRefreshError("refresh_failed", "failed").code).toBe("refresh_failed")
	})

	it("exposes the HTTP Gateway through the package entry point", () => {
		const config = loadGatewayConfig({
			GATEWAY_INTERNAL_SECRET: "0123456789abcdef0123456789abcdef",
		})

		expect(typeof createGatewayHandler).toBe("function")
		expect(validateGatewaySecret(`Bearer ${config.gatewaySecret}`, config.gatewaySecret)).toBe(true)
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
