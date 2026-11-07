import type { TokenFile } from "./token-file"
import { TokenRefreshError } from "./token-refresh-error"
import type { TokenRefresher } from "./token-refresher"
import { evaluateTokenState, type TokenState } from "./token-state"
import type { TokenStore } from "./token-store"

/** Coordinates Token File caching, reactive refresh, and persistence ordering. */
export interface TokenManager {
	getAccessToken(input: { nowMs: number; rejectedAccessToken?: string }): Promise<string>
	getTokenState(nowMs: number): Promise<TokenState>
}

/** Boundaries a Token Manager depends on. */
export interface TokenManagerDeps {
	readonly store: TokenStore
	readonly refresher: TokenRefresher
}

/** Creates a single-flight Token Manager over a Token Store and a Token Refresher. */
export function createTokenManager(deps: TokenManagerDeps): TokenManager {
	const { store, refresher } = deps
	let cached: TokenFile | undefined
	let inFlight: Promise<TokenFile> | undefined
	let revokedRefreshToken: string | undefined

	async function load(): Promise<TokenFile> {
		if (cached !== undefined) return cached
		cached ??= await store.read()
		return cached
	}

	function adoptable(disk: TokenFile, nowMs: number, rejected: string | undefined): boolean {
		if (evaluateTokenState(disk, nowMs) === "invalid") return false
		return disk.access_token !== (rejected ?? cached?.access_token)
	}

	function rememberRevocation(error: unknown, base: TokenFile): void {
		if (error instanceof TokenRefreshError && error.code === "refresh_token_revoked") {
			revokedRefreshToken = base.refresh_token
		}
	}

	async function refresh(nowMs: number, rejected: string | undefined): Promise<TokenFile> {
		const disk = await store.read().catch(() => undefined)
		const base = disk ?? (await load())
		if (adoptable(base, nowMs, rejected)) {
			cached = base
			if (base.refresh_token !== revokedRefreshToken) revokedRefreshToken = undefined
			return base
		}
		try {
			const refreshed = await refresher({ tokenFile: base, nowMs })
			await store.write(refreshed)
			cached = refreshed
			revokedRefreshToken = undefined
			return refreshed
		} catch (error) {
			rememberRevocation(error, base)
			throw error
		}
	}

	function nextRefresh(nowMs: number, rejected: string | undefined): Promise<TokenFile> {
		if (inFlight !== undefined) return inFlight
		const flight = refresh(nowMs, rejected)
		inFlight = flight
		const clear = (): void => {
			if (inFlight === flight) inFlight = undefined
		}
		void flight.then(clear, clear)
		return flight
	}

	async function getAccessToken(input: {
		nowMs: number
		rejectedAccessToken?: string
	}): Promise<string> {
		const current = await load()
		const rejected = input.rejectedAccessToken
		if (rejected === undefined && evaluateTokenState(current, input.nowMs) === "valid") {
			return current.access_token
		}
		const first = (await nextRefresh(input.nowMs, rejected)).access_token
		if (rejected === undefined || first !== rejected) return first
		return (await nextRefresh(input.nowMs, rejected)).access_token
	}

	async function getTokenState(nowMs: number): Promise<TokenState> {
		const disk = await store.read()
		cached = disk
		if (disk.refresh_token !== revokedRefreshToken) revokedRefreshToken = undefined
		return revokedRefreshToken === undefined ? evaluateTokenState(disk, nowMs) : "invalid"
	}

	return Object.freeze({ getAccessToken, getTokenState })
}
