import { describe, expect, it } from "bun:test"
import type { TokenFile } from "./token-file"
import { createTokenManager } from "./token-manager"
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
	current(): TokenFile
	reads(): number
	set(tokenFile: TokenFile): void
}

function memoryStore(
	initial: TokenFile,
	onWrite?: (tokenFile: TokenFile) => Promise<void>,
): MemoryStore {
	let current = initial
	let reads = 0
	const store: TokenStore = Object.freeze({
		async read(): Promise<TokenFile> {
			reads += 1
			return current
		},
		async write(tokenFile: TokenFile): Promise<void> {
			if (onWrite) await onWrite(tokenFile)
			current = tokenFile
		},
	})
	return {
		store,
		current: () => current,
		reads: () => reads,
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

function refresherReturning(next: TokenFile): {
	calls: { count: number }
	refresher: TokenRefresher
} {
	const calls = { count: 0 }
	const refresher: TokenRefresher = async () => {
		calls.count += 1
		return next
	}
	return { calls, refresher }
}

describe("Token Manager cache", () => {
	it("serves a valid Access Token from a lazily loaded cache without refreshing", async () => {
		const initial = tokenFile("access-1", NOW_MS + 600_000)
		const memory = memoryStore(initial)
		const { calls, refresher } = refresherReturning(tokenFile("access-2", NOW_MS + 900_000))
		const manager = createTokenManager({ store: memory.store, refresher })

		expect(memory.reads()).toBe(0)
		expect(await manager.getAccessToken({ nowMs: NOW_MS })).toBe("access-1")
		expect(memory.reads()).toBe(1)
		expect(calls.count).toBe(0)
		expect(await manager.getTokenState(NOW_MS)).toBe("valid")
	})

	it("refreshes when exactly the proactive refresh lead remains", async () => {
		const initial = tokenFile("access-1", NOW_MS + 300_000)
		const memory = memoryStore(initial)
		const next = tokenFile("access-2", NOW_MS + 900_000)
		const { calls, refresher } = refresherReturning(next)
		const manager = createTokenManager({ store: memory.store, refresher })

		expect(await manager.getAccessToken({ nowMs: NOW_MS })).toBe("access-2")
		expect(calls.count).toBe(1)
		expect(memory.current()).toEqual(next)
	})
})

describe("Token Manager refresh", () => {
	it("adopts a newer valid Token File from disk before refreshing", async () => {
		const stale = tokenFile("access-1", NOW_MS + 1)
		const operator = tokenFile("access-2", NOW_MS + 900_000)
		const memory = memoryStore(stale)
		const { calls, refresher } = refresherReturning(tokenFile("access-3", NOW_MS + 900_000))
		const manager = createTokenManager({ store: memory.store, refresher })
		await manager.getAccessToken({ nowMs: NOW_MS - 400_000 })
		memory.set(operator)

		expect(await manager.getAccessToken({ nowMs: NOW_MS })).toBe("access-2")
		expect(calls.count).toBe(0)
	})

	it("honours an operator re-login when the Access Token was rejected", async () => {
		const memory = memoryStore(tokenFile("access-1", NOW_MS + 900_000))
		const { calls, refresher } = refresherReturning(tokenFile("access-3", NOW_MS + 900_000))
		const manager = createTokenManager({ store: memory.store, refresher })
		await manager.getAccessToken({ nowMs: NOW_MS })
		memory.set(tokenFile("access-2", NOW_MS + 900_000))

		const token = await manager.getAccessToken({
			nowMs: NOW_MS,
			rejectedAccessToken: "access-1",
		})

		expect(token).toBe("access-2")
		expect(calls.count).toBe(0)
	})

	it("forces a refresh when the Access Token is rejected even while the cache is valid", async () => {
		const memory = memoryStore(tokenFile("access-1", NOW_MS + 900_000))
		const { calls, refresher } = refresherReturning(tokenFile("access-2", NOW_MS + 900_000))
		const manager = createTokenManager({ store: memory.store, refresher })

		const token = await manager.getAccessToken({
			nowMs: NOW_MS,
			rejectedAccessToken: "access-1",
		})

		expect(token).toBe("access-2")
		expect(calls.count).toBe(1)
	})

	it("persists the refreshed Token File before forwarding the new Access Token", async () => {
		const writeGate = deferred()
		const writeStarted = deferred()
		const memory = memoryStore(tokenFile("access-1", NOW_MS + 1), async () => {
			writeStarted.resolve()
			await writeGate.promise
		})
		const next = tokenFile("access-2", NOW_MS + 900_000)
		const { refresher } = refresherReturning(next)
		const manager = createTokenManager({ store: memory.store, refresher })
		let forwarded: string | undefined
		const pending = manager.getAccessToken({ nowMs: NOW_MS }).then((token) => {
			forwarded = token
			return token
		})
		await writeStarted.promise

		expect(forwarded).toBeUndefined()
		expect(await manager.getTokenState(NOW_MS)).toBe("expiring_soon")

		writeGate.resolve()
		expect(await pending).toBe("access-2")
		expect(forwarded).toBe("access-2")
		expect(memory.current()).toEqual(next)
	})

	it("rejects the refresh and keeps the old token cached when persistence fails", async () => {
		const old = tokenFile("access-1", NOW_MS + 600_000)
		const memory = memoryStore(old, async () => {
			throw new Error("disk full")
		})
		const { calls, refresher } = refresherReturning(tokenFile("access-2", NOW_MS + 900_000))
		const manager = createTokenManager({ store: memory.store, refresher })

		await expect(
			manager.getAccessToken({ nowMs: NOW_MS, rejectedAccessToken: "access-1" }),
		).rejects.toThrow("disk full")

		expect(calls.count).toBe(1)
		expect(memory.current()).toBe(old)
		expect(await manager.getTokenState(NOW_MS)).toBe("valid")
	})
})
