import type { UpstreamConfig } from "./defaults"
import type { TokenManager } from "./token-manager"

/** Fetch boundary used by the HTTP Gateway, kept callable without Bun's `preconnect` extension. */
export type GatewayFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

/** One Upstream the Gateway routes, with its own Token Manager. */
export interface GatewayUpstream extends UpstreamConfig {
	readonly tokenManager: TokenManager
}

/** Dependencies of the HTTP Gateway request handler. */
export interface GatewayHandlerDeps {
	readonly gatewaySecret: string
	readonly upstreams: readonly GatewayUpstream[]
	readonly fetchImpl?: GatewayFetch
	readonly nowMs?: () => number
	readonly maxRequestBytes?: number
}
