import type { TokenFile } from "./token-file"
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

	async function load(): Promise<TokenFile> {
		if (cached !== undefined) return cached
		const loaded = await store.read()
		if (cached === undefined) cached = loaded
		return cached
	}

	async function readDisk(): Promise<TokenFile | undefined> {
		try {
			return await store.read()
		} catch {
			return undefined
		}
	}

	function adoptable(
		disk: TokenFile,
		nowMs: number,
		rejectedAccessToken: string | undefined,
	): boolean {
		if (evaluateTokenState(disk, nowMs) === "invalid") return false
		const previous = rejectedAccessToken ?? cached?.access_token
		return disk.access_token !== previous
	}

	async function runRefresh(
		nowMs: number,
		rejectedAccessToken: string | undefined,
	): Promise<TokenFile> {
		const disk = await readDisk()
		const base = disk ?? (await load())
		if (adoptable(base, nowMs, rejectedAccessToken)) {
			cached = base
			return base
		}
		const refreshed = await refresher({ tokenFile: base, nowMs })
		await store.write(refreshed)
		cached = refreshed
		return refreshed
	}

	function startRefresh(
		nowMs: number,
		rejectedAccessToken: string | undefined,
	): Promise<TokenFile> {
		const flight = runRefresh(nowMs, rejectedAccessToken)
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
		const pending = inFlight ?? startRefresh(input.nowMs, rejected)
		return (await pending).access_token
	}

	async function getTokenState(nowMs: number): Promise<TokenState> {
		return evaluateTokenState(await load(), nowMs)
	}

	return Object.freeze({ getAccessToken, getTokenState })
}
