import type { TokenManager } from "./token-manager"

/** Fetch boundary used by the HTTP Gateway, kept callable without Bun's `preconnect` extension. */
export type GatewayFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

/** Dependencies of the HTTP Gateway request handler. */
export interface GatewayHandlerDeps {
	readonly gatewaySecret: string
	readonly tokenManager: TokenManager
	readonly upstreamUrl: string
	readonly fetchImpl?: GatewayFetch
	readonly nowMs?: () => number
	readonly maxRequestBytes?: number
}
