import type { GatewayUpstream } from "./gateway-handler-types"

/** Resolved route for one inbound request. */
export type GatewayRoute =
	| { readonly kind: "health" }
	| { readonly kind: "not_found" }
	| { readonly kind: "token_health" }
	| { readonly kind: "proxy"; readonly upstream: GatewayUpstream }

const HEALTH_PATHS = new Set(["/health", "/healthz"])
const TOKEN_HEALTH_PATH = "/health/token"

/** Resolves an inbound request to its route without touching a Token Manager. */
export function resolveGatewayRoute(
	request: Request,
	upstreams: readonly GatewayUpstream[],
): GatewayRoute {
	const path = new URL(request.url).pathname
	if (request.method === "GET" && HEALTH_PATHS.has(path)) return { kind: "health" }
	if (request.method === "GET" && path === TOKEN_HEALTH_PATH) return { kind: "token_health" }
	const upstream = upstreams.find((candidate) => candidate.route === path)
	return upstream === undefined ? { kind: "not_found" } : { kind: "proxy", upstream }
}
