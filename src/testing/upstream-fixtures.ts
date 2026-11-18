import { MOBBIN_DEFAULTS, POSTHOG_DEFAULTS, type UpstreamConfig } from "../defaults"
import type { GatewayUpstream } from "../gateway-handler-types"
import type { TokenManager } from "../token-manager"
import type { TokenState } from "../token-state"

/** Test fixture: a Token Manager that returns a fixed Access Token and Token State. */
export function tokenManagerFixture(
	options: { accessToken?: string; tokenState?: TokenState } = {},
): TokenManager {
	const accessToken = options.accessToken ?? "access-token"
	const tokenState = options.tokenState ?? "valid"
	return Object.freeze({
		async getAccessToken(): Promise<string> {
			return accessToken
		},
		async getTokenState(): Promise<TokenState> {
			return tokenState
		},
	})
}

/** Test fixture: a Token Manager that counts every call through to another one. */
export function countingTokenManager(manager: TokenManager): {
	readonly manager: TokenManager
	readonly calls: () => number
} {
	let calls = 0
	return Object.freeze({
		calls: () => calls,
		manager: Object.freeze({
			async getAccessToken(input: {
				nowMs: number
				rejectedAccessToken?: string
			}): Promise<string> {
				calls += 1
				return manager.getAccessToken(input)
			},
			async getTokenState(nowMs: number): Promise<TokenState> {
				calls += 1
				return manager.getTokenState(nowMs)
			},
		}),
	})
}

/** Test fixture: an Upstream with its settings and an injected Token Manager. */
export function upstreamFixture(
	config: UpstreamConfig,
	tokenManager: TokenManager,
): GatewayUpstream {
	return Object.freeze({ ...config, tokenManager })
}

/** Test fixture: Mobbin's documented settings with an injected Token Manager. */
export function mobbinUpstream(tokenManager: TokenManager): GatewayUpstream {
	return upstreamFixture(MOBBIN_DEFAULTS, tokenManager)
}

/** Test fixture: PostHog's documented settings with an injected Token Manager. */
export function posthogUpstream(tokenManager: TokenManager): GatewayUpstream {
	return upstreamFixture(POSTHOG_DEFAULTS, tokenManager)
}
