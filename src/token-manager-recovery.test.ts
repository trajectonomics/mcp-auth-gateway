import { describe, expect, it } from "bun:test"
import type { TokenFile } from "./token-file"
import { createTokenManager } from "./token-manager"
import { TokenRefreshError } from "./token-refresh-error"
import type { TokenRefresher } from "./token-refresher"
import type { TokenStore } from "./token-store"

const NOW_MS = 1_700_000_000_000

function tokenFile(accessToken: string, expiresAt: number): TokenFile {
	return Object.freeze({
		issuer: "https://auth.example.com",
		token_endpoint: "https://auth.example.com/token",
		client_id: "client-abc",
		resource: "https://api.example.com/mcp",
		access_token: accessToken,
		refresh_token: `refresh-${accessToken}`,
		expires_at: expiresAt,
	})
}

interface MemoryStore {
	readonly store: TokenStore
	set(tokenFile: TokenFile): void
}

function memoryStore(initial: TokenFile): MemoryStore {
	let current = initial
	const store: TokenStore = Object.freeze({
		async read(): Promise<TokenFile> {
			return current
		},
		async write(tokenFile: TokenFile): Promise<void> {
			current = tokenFile
		},
	})
	return {
		store,
		set: (tokenFile) => {
			current = tokenFile
		},
	}
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
	let resolve: () => void = () => undefined
	const promise = new Promise<void>((settle) => {
		resolve = settle
	})
	return { promise, resolve }
}

function revokedError(): TokenRefreshError {
	return new TokenRefreshError("refresh_token_revoked", "Refresh Token was revoked upstream")
}

function alwaysThrowing(error: unknown): TokenRefresher {
	return async () => {
		throw error
	}
}

describe("Token Manager Token State", () => {
	it("reports invalid while the revoked Refresh Token is still current", async () => {
		const revoked = revokedError()
		const memory = memoryStore(tokenFile("access-1", NOW_MS + 900_000))
		const manager = createTokenManager({ store: memory.store, refresher: alwaysThrowing(revoked) })

		await expect(
			manager.getAccessToken({ nowMs: NOW_MS, rejectedAccessToken: "access-1" }),
		).rejects.toBe(revoked)
		expect(await manager.getTokenState(NOW_MS)).toBe("invalid")
	})

	it("clears the revoked Refresh Token when disk shows an operator re-login", async () => {
		const memory = memoryStore(tokenFile("access-1", NOW_MS + 900_000))
		const manager = createTokenManager({
			store: memory.store,
			refresher: alwaysThrowing(revokedError()),
		})
		await manager
			.getAccessToken({ nowMs: NOW_MS, rejectedAccessToken: "access-1" })
			.catch(() => undefined)

		memory.set(tokenFile("access-2", NOW_MS + 900_000))

		expect(await manager.getTokenState(NOW_MS)).toBe("valid")
	})

	it("clears the revoked Refresh Token after a successful refresh that keeps it", async () => {
		let attempts = 0
		const refresher: TokenRefresher = async ({ tokenFile: base }) => {
			attempts += 1
			if (attempts === 1) throw revokedError()
			return Object.freeze({ ...base, access_token: "access-2", expires_at: NOW_MS + 900_000 })
		}
		const memory = memoryStore(tokenFile("access-1", NOW_MS + 900_000))
		const manager = createTokenManager({ store: memory.store, refresher })
		await manager
			.getAccessToken({ nowMs: NOW_MS, rejectedAccessToken: "access-1" })
			.catch(() => undefined)
		expect(await manager.getTokenState(NOW_MS)).toBe("invalid")

		expect(await manager.getAccessToken({ nowMs: NOW_MS, rejectedAccessToken: "access-1" })).toBe(
			"access-2",
		)
		expect(await manager.getTokenState(NOW_MS)).toBe("valid")
	})

	it("reflects an operator re-login on disk after caching the old Token File", async () => {
		const memory = memoryStore(tokenFile("access-1", NOW_MS + 1))
		const refresher: TokenRefresher = async () => tokenFile("access-3", NOW_MS + 900_000)
		const manager = createTokenManager({ store: memory.store, refresher })

		expect(await manager.getAccessToken({ nowMs: NOW_MS - 400_000 })).toBe("access-1")
		memory.set(tokenFile("access-2", NOW_MS + 900_000))

		expect(await manager.getTokenState(NOW_MS)).toBe("valid")
		expect(await manager.getAccessToken({ nowMs: NOW_MS })).toBe("access-2")
	})

	it("lets a Token Store read failure reject Token State", async () => {
		const store: TokenStore = Object.freeze({
			async read(): Promise<TokenFile> {
				throw new Error("Token File is missing")
			},
			async write(): Promise<void> {},
		})
		const manager = createTokenManager({ store, refresher: alwaysThrowing(new Error("unused")) })

		await expect(manager.getTokenState(NOW_MS)).rejects.toThrow("Token File is missing")
	})
})

describe("Token Manager single-flight", () => {
	it("shares one upstream refresh across concurrent callers", async () => {
		const gate = deferred()
		let refreshes = 0
		const next = tokenFile("access-2", NOW_MS + 900_000)
		const refresher: TokenRefresher = async () => {
			refreshes += 1
			await gate.promise
			return next
		}
		const manager = createTokenManager({
			store: memoryStore(tokenFile("access-1", NOW_MS + 1)).store,
			refresher,
		})
		const callers = [1, 2, 3, 4].map(() => manager.getAccessToken({ nowMs: NOW_MS }))
		await Bun.sleep(5)

		expect(refreshes).toBe(1)
		gate.resolve()

		expect(await Promise.all(callers)).toEqual(["access-2", "access-2", "access-2", "access-2"])
	})

	it("refreshes again when a joined flight yields the rejected Access Token", async () => {
		const gate = deferred()
		let refreshes = 0
		const refresher: TokenRefresher = async () => {
			refreshes += 1
			if (refreshes === 1) {
				await gate.promise
				return tokenFile("access-1", NOW_MS + 900_000)
			}
			return tokenFile("access-2", NOW_MS + 900_000)
		}
		const manager = createTokenManager({
			store: memoryStore(tokenFile("access-1", NOW_MS + 1)).store,
			refresher,
		})

		const proactive = manager.getAccessToken({ nowMs: NOW_MS })
		await Bun.sleep(5)
		const replay = manager.getAccessToken({ nowMs: NOW_MS, rejectedAccessToken: "access-1" })
		gate.resolve()

		expect(await proactive).toBe("access-1")
		expect(await replay).toBe("access-2")
		expect(refreshes).toBe(2)
	})
})
